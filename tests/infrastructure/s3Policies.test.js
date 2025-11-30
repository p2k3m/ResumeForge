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

  test('DataBucket blocks public access policies', () => {
    const dataBucket = template?.Resources?.DataBucket;
    expect(dataBucket).toBeDefined();

    const publicAccessBlock = dataBucket.Properties?.PublicAccessBlockConfiguration;
    expect(publicAccessBlock).toBeDefined();
    expect(publicAccessBlock.BlockPublicPolicy).toBe(true);
    expect(publicAccessBlock.RestrictPublicBuckets).toBe(true);
  });
});
