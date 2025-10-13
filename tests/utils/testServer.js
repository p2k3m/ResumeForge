import { jest } from '@jest/globals';

const MOCK_STATE_KEY = Symbol.for('ResumeForgeTestServerMockState');

function getMockState() {
  if (!globalThis[MOCK_STATE_KEY]) {
    globalThis[MOCK_STATE_KEY] = { registered: false };
  }
  return globalThis[MOCK_STATE_KEY];
}

export async function primeSuccessfulAi() {
  const { generateContentMock } = await import('../mocks/generateContentMock.js');
  generateContentMock.mockReset();
  const rewritePayload = {
    summary: [
      'Seasoned platform engineer who delivers resilient infrastructure, observability, and CI/CD automation.',
    ],
    experience: [
      'Directed a multi-region rollout that improved deployment reliability by 40% and reduced incident volume.',
    ],
    education: ['B.S. Computer Science, State University'],
    certifications: ['AWS Certified Solutions Architect – Associate'],
    skills: ['Node.js and TypeScript expertise', 'Infrastructure as Code with Terraform'],
    projects: ['Designed a developer platform serving 200+ engineers with automated security guardrails.'],
    projectSnippet:
      'Led a platform automation initiative that accelerated delivery velocity while maintaining compliance.',
    latestRoleTitle: 'Senior Platform Engineer',
    latestRoleDescription:
      'Oversaw infrastructure, SRE practices, and developer enablement for cloud-native services.',
    mandatorySkills: ['Kubernetes orchestration'],
    addedSkills: ['Kubernetes'],
  };
  const coverLetterOne = [
    'LinkedIn: https://linkedin.com/in/example',
    'Dear Hiring Manager,',
    'I am excited to apply for the Senior Platform Engineer role at your organization. Partnering with product and operations teams, I have shipped reliable platforms that empower engineers to deliver quickly and safely.',
    'As a Senior Platform Engineer, I translate complex infrastructure challenges into measurable improvements by coordinating cross-functional contributors.',
    'In my recent role I guided a migration to automated Terraform pipelines, cutting deployment time by 60% while strengthening compliance.',
    'Thank you for considering my application. I look forward to discussing how I can support your platform initiatives.',
    'Sincerely,\nJohn Doe',
  ].join('\n\n');
  const coverLetterTwo = [
    'LinkedIn: https://linkedin.com/in/example',
    'Dear Hiring Manager,',
    'I am ready to contribute to the Senior Platform Engineer role and immediately add value to your organization.',
    'My background includes orchestrating Kubernetes, Terraform, and observability tooling to keep complex systems healthy and transparent.',
    'Throughout my career I have built reliable CI/CD workflows, mentored engineers, and aligned technical strategy with stakeholder goals.',
    'I welcome the opportunity to explore how my experience can accelerate your platform outcomes.',
    'Best regards,\nJohn Doe',
  ].join('\n\n');
  generateContentMock
    .mockResolvedValueOnce({
      response: { text: () => JSON.stringify(rewritePayload) },
    })
    .mockResolvedValueOnce({
      response: {
        text: () => 'Led a project using Terraform and Kubernetes to automate secure deployments.',
      },
    })
    .mockResolvedValueOnce({
      response: {
        text: () =>
          [
            'John Doe',
            'LinkedIn: https://linkedin.com/in/example',
            '',
            'Professional Summary',
            '- Senior platform engineer delivering resilient services and automation.',
            '',
            'Experience',
            '- Led a platform modernization that improved deployment reliability by 40%.',
            '',
            'Education',
            '- B.S. Computer Science, State University',
            '',
            'Skills',
            '- Node.js, TypeScript, Terraform, Kubernetes, AWS',
          ].join('\n'),
      },
    })
    .mockResolvedValue({
      response: {
        text: () => JSON.stringify({ cover_letter1: coverLetterOne, cover_letter2: coverLetterTwo }),
      },
    });
  return generateContentMock;
}

export async function setupTestServer({
  s3Impl,
  dynamoImpl,
  axiosImpl,
  pdfText =
    'John Doe\nLinkedIn: https://linkedin.com/in/example\nProfessional Summary\nExperience\nEducation\nSkills\nProjects',
  docxText = 'Doc text',
  docText,
  allowedOrigins,
} = {}) {
  jest.resetModules();
  const mockState = getMockState();
  process.env.S3_BUCKET = 'integration-bucket';
  process.env.GEMINI_API_KEY = 'integration-key';
  process.env.AWS_REGION = 'us-integration-1';
  process.env.CLOUDFRONT_ORIGINS = allowedOrigins ?? '';
  process.env.ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP = 'false';

  const s3Store = new Map();

  const defaultS3Impl = async (command = {}) => {
    const { __type, input = {} } = command;
    switch (__type) {
      case 'PutObjectCommand': {
        const key = `${input.Bucket}/${input.Key}`;
        const body =
          typeof input.Body === 'string' || Buffer.isBuffer(input.Body)
            ? Buffer.from(input.Body)
            : Buffer.from(JSON.stringify(input.Body ?? {}));
        s3Store.set(key, {
          Body: body,
          ContentType: input.ContentType,
        });
        return {};
      }
      case 'CopyObjectCommand': {
        const source = String(input.CopySource || '');
        const [sourceBucket, ...rest] = source.split('/');
        const sourceKey = decodeURIComponent(rest.join('/'));
        const entry = s3Store.get(`${sourceBucket}/${sourceKey}`);
        if (!entry) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        s3Store.set(`${input.Bucket}/${input.Key}`, {
          Body: Buffer.from(entry.Body),
          ContentType: entry.ContentType,
        });
        return {};
      }
      case 'DeleteObjectCommand': {
        s3Store.delete(`${input.Bucket}/${input.Key}`);
        return {};
      }
      case 'GetObjectCommand': {
        const entry = s3Store.get(`${input.Bucket}/${input.Key}`);
        if (!entry) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Body: entry.Body };
      }
      default:
        return {};
    }
  };

  const mockS3Send = jest.fn().mockImplementation((command) => {
    if (s3Impl) {
      return s3Impl(command, { store: s3Store });
    }
    return defaultS3Impl(command);
  });

  const dynamoStore = new Map();

  const cloneAttrMap = (value) => JSON.parse(JSON.stringify(value ?? {}));

  const readStringAttr = (attr) => {
    if (!attr) return '';
    if (typeof attr.S === 'string') return attr.S;
    if (typeof attr.N === 'string') return attr.N;
    return '';
  };

  const defaultDynamoImpl = async (command = {}) => {
    const { __type, input = {} } = command;

    switch (__type) {
      case 'DescribeTableCommand':
        return { Table: { TableStatus: 'ACTIVE' } };
      case 'CreateTableCommand':
        return { TableDescription: { TableStatus: 'ACTIVE' } };
      case 'PutItemCommand': {
        const pk = readStringAttr(input?.Item?.linkedinProfileUrl);
        if (pk) {
          dynamoStore.set(pk, cloneAttrMap(input.Item));
        }
        return {};
      }
      case 'GetItemCommand': {
        const pk = readStringAttr(input?.Key?.linkedinProfileUrl);
        const item = dynamoStore.get(pk);
        return item ? { Item: cloneAttrMap(item) } : {};
      }
      case 'UpdateItemCommand': {
        const pk = readStringAttr(input?.Key?.linkedinProfileUrl);
        const existing = cloneAttrMap(dynamoStore.get(pk));

        const attrNames = input.ExpressionAttributeNames || {};
        const attrValues = input.ExpressionAttributeValues || {};
        const resolveName = (token = '') =>
          token.startsWith('#') ? attrNames[token] || token.slice(1) : token;
        const resolveValue = (placeholder) => {
          const value = attrValues[placeholder];
          return value ? cloneAttrMap(value) : undefined;
        };
        const resolveAssignmentValue = (token) => {
          if (token.startsWith('if_not_exists(')) {
            const inner = token.slice('if_not_exists('.length, -1);
            const [, fallback = ''] = inner.split(',').map((part) => part.trim());
            return resolveValue(fallback);
          }
          if (token.startsWith('list_append(')) {
            const inner = token.slice('list_append('.length, -1);
            const [leftRaw = '', rightRaw = ''] = inner
              .split(',')
              .map((segment) => segment.trim());
            const leftValue = resolveAssignmentValue(leftRaw);
            const rightValue = resolveValue(rightRaw);
            const leftList = Array.isArray(leftValue?.L) ? leftValue.L : [];
            const rightList = Array.isArray(rightValue?.L) ? rightValue.L : [];
            return { L: [...leftList, ...rightList].map((entry) => cloneAttrMap(entry)) };
          }
          return resolveValue(token);
        };

        const ensureCondition = () => {
          const condition = input.ConditionExpression || '';
          if (!condition) return;

          const expectedJobId = readStringAttr(attrValues[':jobId']);
          if (expectedJobId && readStringAttr(existing.jobId) !== expectedJobId) {
            const err = new Error('ConditionalCheckFailedException');
            err.name = 'ConditionalCheckFailedException';
            throw err;
          }

          const status = readStringAttr(existing.status);
          if (condition.includes('#status = :statusScored OR #status = :statusCompleted')) {
            const allowed = [
              readStringAttr(attrValues[':statusScored']),
              readStringAttr(attrValues[':statusCompleted']),
            ];
            if (!allowed.includes(status)) {
              const err = new Error('ConditionalCheckFailedException');
              err.name = 'ConditionalCheckFailedException';
              throw err;
            }
          }

          if (
            condition.includes(
              '#status = :statusUploaded OR #status = :status OR attribute_not_exists(#status)'
            )
          ) {
            const allowed = [
              readStringAttr(attrValues[':statusUploaded']),
              readStringAttr(attrValues[':status']),
            ];
            const attributeMissing = !existing.status;
            if (!attributeMissing && !allowed.includes(status)) {
              const err = new Error('ConditionalCheckFailedException');
              err.name = 'ConditionalCheckFailedException';
              throw err;
            }
          }
        };

        ensureCondition();

        const updateExpression = input.UpdateExpression || '';
        const [setClauseRaw = '', removeClauseRaw = ''] = updateExpression
          .split(' REMOVE ')
          .map((section) => section.trim());

        if (setClauseRaw.startsWith('SET ')) {
          const assignments = setClauseRaw
            .slice(4)
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);

          assignments.forEach((assignment) => {
            const [left, right] = assignment.split('=').map((part) => part.trim());
            if (!left || !right) return;
            const field = resolveName(left);
            const value = resolveAssignmentValue(right);
            if (field && value !== undefined) {
              existing[field] = value;
            }
          });
        }

        if (removeClauseRaw) {
          removeClauseRaw
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach((token) => {
              const field = resolveName(token);
              delete existing[field];
            });
        }

        dynamoStore.set(pk, existing);
        return {};
      }
      case 'DeleteItemCommand': {
        const pk = readStringAttr(input?.Key?.linkedinProfileUrl);
        dynamoStore.delete(pk);
        return {};
      }
      case 'ScanCommand': {
        return {
          Items: Array.from(dynamoStore.values()).map((item) => cloneAttrMap(item)),
        };
      }
      default:
        return {};
    }
  };

  const mockDynamoSend = jest.fn().mockImplementation((command) => {
    if (dynamoImpl) {
      return dynamoImpl(command, { store: dynamoStore });
    }
    return defaultDynamoImpl(command);
  });

  const axiosGet = jest
    .fn()
    .mockResolvedValue({ data: '<html><h1>Engineer</h1><p>Build systems</p></html>' });
  if (axiosImpl) {
    axiosGet.mockImplementation(axiosImpl);
  }

  const logEventMock = jest.fn().mockResolvedValue(undefined);
  const logErrorTraceMock = jest.fn().mockResolvedValue(undefined);
  const pdfParseMock = jest.fn().mockResolvedValue({ text: pdfText });
  const resolvedDocText =
    typeof docText === 'string' && docText.trim()
      ? docText
      : 'Doc body text';
  const wordExtractorExtractMock = jest.fn().mockResolvedValue(
    docText
      ? {
          getBody: () => resolvedDocText,
          getHeaders: () => [],
          getFooters: () => [],
          getText: () => '',
        }
      : {
          getBody: () => 'Doc body text',
          getHeaders: () => ['Header text'],
          getFooters: () => ['Footer text'],
          getText: () => 'Doc fallback text',
        }
  );
  const mammothExtractRawText = jest
    .fn()
    .mockResolvedValue({ value: docxText });

  if (!mockState.registered) {
    jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
      S3Client: jest.fn(() => ({ send: mockState.mockS3Send })),
      PutObjectCommand: jest.fn((input) => ({ input, __type: 'PutObjectCommand' })),
      GetObjectCommand: jest.fn((input) => ({ input, __type: 'GetObjectCommand' })),
      ListObjectsV2Command: jest.fn((input) => ({ input, __type: 'ListObjectsV2Command' })),
      DeleteObjectsCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectsCommand' })),
      CopyObjectCommand: jest.fn((input) => ({ input, __type: 'CopyObjectCommand' })),
      DeleteObjectCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectCommand' })),
    }));

    jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: jest.fn((client, command, { expiresIn }) =>
        Promise.resolve(
          `https://example.com/${command.input.Key}?X-Amz-Signature=mock-signature&X-Amz-Expires=${expiresIn}`
        )
      ),
    }));

    jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn(() => ({ send: mockState.mockDynamoSend })),
      CreateTableCommand: jest.fn((input) => ({ input, __type: 'CreateTableCommand' })),
      DescribeTableCommand: jest.fn((input) => ({ input, __type: 'DescribeTableCommand' })),
      GetItemCommand: jest.fn((input) => ({ input, __type: 'GetItemCommand' })),
      PutItemCommand: jest.fn((input) => ({ input, __type: 'PutItemCommand' })),
      UpdateItemCommand: jest.fn((input) => ({ input, __type: 'UpdateItemCommand' })),
      ScanCommand: jest.fn((input) => ({ input, __type: 'ScanCommand' })),
      DeleteItemCommand: jest.fn((input) => ({ input, __type: 'DeleteItemCommand' })),
    }));

    const loggerModulePath = new URL('../../logger.js', import.meta.url).pathname;
    jest.unstable_mockModule(loggerModulePath, () => ({
      logEvent: (...args) => mockState.logEventMock(...args),
      logErrorTrace: (...args) => mockState.logErrorTraceMock(...args),
    }));

    jest.unstable_mockModule('axios', () => ({
      default: { get: mockState.axiosGet },
    }));

    jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
      default: mockState.pdfParseMock,
    }));

    jest.unstable_mockModule('word-extractor', () => ({
      default: class WordExtractorMock {
        extract(filePath) {
          return mockState.wordExtractorExtractMock(filePath);
        }
      },
    }));

    jest.unstable_mockModule('mammoth', () => ({
      default: {
        extractRawText: mockState.mammothExtractRawText,
      },
    }));

    mockState.registered = true;
  }

  Object.assign(mockState, {
    mockS3Send,
    mockDynamoSend,
    axiosGet,
    logEventMock,
    logErrorTraceMock,
    pdfParseMock,
    wordExtractorExtractMock,
    mammothExtractRawText,
  });

  const serverModule = await import('../../server.js');
  if (typeof serverModule.setChromiumLauncher === 'function') {
    serverModule.setChromiumLauncher(() => null);
  }
  serverModule.setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));

  return {
    app: serverModule.default,
    mocks: {
      mockS3Send,
      mockDynamoSend,
      logEventMock,
      logErrorTraceMock,
    },
    serverModule,
  };
}
