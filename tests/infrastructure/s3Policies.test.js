import { readFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const { Type, DEFAULT_SCHEMA } = yaml;

const scalarIntrinsic = (tag, key) =>
  new Type(tag, {
    kind: 'scalar',
    construct: (data) => ({ [key]: data }),
  });

const sequenceIntrinsic = (tag, key) =>
  new Type(tag, {
    kind: 'sequence',
    construct: (data) => ({ [key]: data }),
  });

const cloudFormationSchema = DEFAULT_SCHEMA.extend([
  scalarIntrinsic('!Ref', 'Ref'),
  scalarIntrinsic('!Condition', 'Condition'),
  scalarIntrinsic('!GetAtt', 'Fn::GetAtt'),
  sequenceIntrinsic('!GetAtt', 'Fn::GetAtt'),
  scalarIntrinsic('!Sub', 'Fn::Sub'),
  sequenceIntrinsic('!Sub', 'Fn::Sub'),
  sequenceIntrinsic('!If', 'Fn::If'),
  sequenceIntrinsic('!Equals', 'Fn::Equals'),
  sequenceIntrinsic('!Not', 'Fn::Not'),
  sequenceIntrinsic('!And', 'Fn::And'),
  sequenceIntrinsic('!Or', 'Fn::Or'),
  sequenceIntrinsic('!Select', 'Fn::Select'),
  sequenceIntrinsic('!Split', 'Fn::Split'),
  sequenceIntrinsic('!Join', 'Fn::Join'),
  scalarIntrinsic('!ImportValue', 'Fn::ImportValue'),
]);

describe('infrastructure S3 access policies', () => {
  const templatePath = path.join(process.cwd(), 'template.yaml');
  const template = yaml.load(readFileSync(templatePath, 'utf8'), {
    schema: cloudFormationSchema,
  });

  test('DataBucket policy allows Lambda role to put artifacts', () => {
    const bucketPolicy = template?.Resources?.DataBucketPolicy;
    expect(bucketPolicy).toBeDefined();

    const statements = bucketPolicy.Properties?.PolicyDocument?.Statement || [];
    const allowPutStatement = statements.find((statement) => {
      if (!statement || statement.Effect !== 'Allow') return false;
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action].filter(Boolean);
      return actions.includes('s3:PutObject');
    });

    expect(allowPutStatement).toBeDefined();
  });

  test('DataBucket policy allows public read access for client assets', () => {
    const bucketPolicy = template?.Resources?.DataBucketPolicy;
    expect(bucketPolicy).toBeDefined();

    const statements = bucketPolicy.Properties?.PolicyDocument?.Statement || [];
    const allowPublicAssetsStatement = statements.find((statement) => {
      if (!statement || statement.Effect !== 'Allow') return false;
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action].filter(Boolean);
      const principal = statement.Principal;
      const resource = statement.Resource;

      const hasAssetsResource = (() => {
        if (!resource) return false;
        if (typeof resource === 'string') {
          return resource.includes('/assets/*');
        }
        const extractStrings = (value) => {
          if (typeof value === 'string') return [value];
          if (value?.['Fn::Sub']) {
            const subValue = value['Fn::Sub'];
            if (typeof subValue === 'string') return [subValue];
            if (Array.isArray(subValue)) {
              const [template] = subValue;
              return typeof template === 'string' ? [template] : [];
            }
          }
          return [];
        };

        if (resource['Fn::If']) {
          const [, whenTrue, whenFalse] = resource['Fn::If'];
          const candidates = [...extractStrings(whenTrue), ...extractStrings(whenFalse)];
          return candidates.length > 0 && candidates.every((value) => value.includes('/assets/*'));
        }
        return false;
      })();

      return principal === '*' && actions.includes('s3:GetObject') && hasAssetsResource;
    });

    expect(allowPublicAssetsStatement).toBeDefined();
  });

  test('ResumeForge function IAM policies include s3:PutObject access', () => {
    const lambda = template?.Resources?.ResumeForgeFunction;
    expect(lambda).toBeDefined();

    const policies = lambda.Properties?.Policies || [];
    const inlineStatements = policies
      .map((policy) => policy?.Statement)
      .filter(Boolean)
      .flat();

    const hasPutObject = inlineStatements.some((statement) => {
      const actions = Array.isArray(statement?.Action)
        ? statement.Action
        : [statement?.Action].filter(Boolean);
      return actions.includes('s3:PutObject');
    });

    expect(hasPutObject).toBe(true);
  });

  test('DataBucket allows public access policies to take effect', () => {
    const dataBucket = template?.Resources?.DataBucket;
    expect(dataBucket).toBeDefined();

    const publicAccessBlock = dataBucket.Properties?.PublicAccessBlockConfiguration;
    expect(publicAccessBlock).toBeDefined();
    expect(publicAccessBlock.BlockPublicPolicy).toBe(false);
    expect(publicAccessBlock.RestrictPublicBuckets).toBe(false);
  });
});
