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
} = {}) {
  jest.resetModules();
  process.env.S3_BUCKET = 'integration-bucket';
  process.env.GEMINI_API_KEY = 'integration-key';
  process.env.AWS_REGION = 'us-integration-1';
  process.env.CLOUDFRONT_ORIGINS = '';

  const mockS3Send = jest.fn().mockImplementation(() => Promise.resolve({}));
  if (s3Impl) {
    mockS3Send.mockImplementation(s3Impl);
  }

  const mockDynamoSend = jest.fn().mockImplementation(() =>
    Promise.resolve({ Table: { TableStatus: 'ACTIVE' } })
  );
  if (dynamoImpl) {
    mockDynamoSend.mockImplementation(dynamoImpl);
  }

  const axiosGet = jest
    .fn()
    .mockResolvedValue({ data: '<html><h1>Engineer</h1><p>Build systems</p></html>' });
  if (axiosImpl) {
    axiosGet.mockImplementation(axiosImpl);
  }

  const logEventMock = jest.fn().mockResolvedValue(undefined);

  jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({ send: mockS3Send })),
    PutObjectCommand: jest.fn((input) => ({ input, __type: 'PutObjectCommand' })),
    GetObjectCommand: jest.fn((input) => ({ input, __type: 'GetObjectCommand' })),
    ListObjectsV2Command: jest.fn((input) => ({ input, __type: 'ListObjectsV2Command' })),
    DeleteObjectsCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectsCommand' })),
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
    PutItemCommand: jest.fn((input) => ({ input, __type: 'PutItemCommand' })),
  }));

  const loggerModulePath = new URL('../../logger.js', import.meta.url).pathname;
  jest.unstable_mockModule(loggerModulePath, () => ({
    logEvent: logEventMock,
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
    },
    serverModule,
  };
}
