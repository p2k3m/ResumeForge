import { jest } from '@jest/globals';

export async function primeSuccessfulAi() {
  const { generateContentMock } = await import('../mocks/generateContentMock.js');
  generateContentMock.mockReset();
  generateContentMock
    .mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({ version1: 'v1', version2: 'v2', project: 'Project summary' }),
      },
    })
    .mockResolvedValueOnce({ response: { text: () => '' } })
    .mockResolvedValueOnce({ response: { text: () => '' } })
    .mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({ cover_letter1: 'Cover 1', cover_letter2: 'Cover 2' }),
      },
    });
  return generateContentMock;
}

export async function setupTestServer({
  s3Impl,
  dynamoImpl,
  axiosImpl,
  pdfText = 'John Doe\nProfessional Summary\nExperience\nEducation\nSkills\nProjects',
  allowedOrigins,
} = {}) {
  jest.resetModules();
  process.env.S3_BUCKET = 'integration-bucket';
  process.env.GEMINI_API_KEY = 'integration-key';
  process.env.AWS_REGION = 'us-integration-1';
  process.env.CLOUDFRONT_ORIGINS = allowedOrigins ?? '';

  const mockS3Send = jest.fn().mockImplementation(() => Promise.resolve({}));
  if (s3Impl) {
    mockS3Send.mockImplementation(s3Impl);
  }

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

  jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({ send: mockS3Send })),
    PutObjectCommand: jest.fn((input) => ({ input, __type: 'PutObjectCommand' })),
    GetObjectCommand: jest.fn((input) => ({ input, __type: 'GetObjectCommand' })),
    ListObjectsV2Command: jest.fn((input) => ({ input, __type: 'ListObjectsV2Command' })),
    DeleteObjectsCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectsCommand' })),
    CopyObjectCommand: jest.fn((input) => ({ input, __type: 'CopyObjectCommand' })),
    DeleteObjectCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectCommand' })),
  }));

  jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn((client, command, { expiresIn }) =>
      Promise.resolve(`https://example.com/${command.input.Key}?expires=${expiresIn}`)
    ),
  }));

  jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
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
    logEvent: logEventMock,
    logErrorTrace: logErrorTraceMock,
  }));

  jest.unstable_mockModule('axios', () => ({
    default: { get: axiosGet },
  }));

  jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
    default: jest.fn().mockResolvedValue({ text: pdfText }),
  }));

  const wordExtractorExtractMock = jest.fn().mockResolvedValue({
    getBody: () => 'Doc body text',
    getHeaders: () => ['Header text'],
    getFooters: () => ['Footer text'],
    getText: () => 'Doc fallback text',
  });

  jest.unstable_mockModule('word-extractor', () => ({
    default: class WordExtractorMock {
      extract(filePath) {
        return wordExtractorExtractMock(filePath);
      }
    }
  }));

  jest.unstable_mockModule('mammoth', () => ({
    default: { extractRawText: jest.fn().mockResolvedValue({ value: 'Doc text' }) },
  }));

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
