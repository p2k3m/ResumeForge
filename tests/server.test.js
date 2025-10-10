import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';

process.env.S3_BUCKET = 'test-bucket';
process.env.GEMINI_API_KEY = 'test-key';
process.env.AWS_REGION = 'us-east-1';
process.env.CLOUDFRONT_ORIGINS = 'https://test.cloudfront.net';

const mockS3Send = jest.fn().mockResolvedValue({});
const getObjectCommandMock = jest.fn((input) => ({ input }));
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((input) => ({ input, __type: 'PutObjectCommand' })),
  GetObjectCommand: getObjectCommandMock,
  ListObjectsV2Command: jest.fn((input) => ({ input, __type: 'ListObjectsV2Command' })),
  DeleteObjectsCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectsCommand' })),
  CopyObjectCommand: jest.fn((input) => ({ input, __type: 'CopyObjectCommand' })),
  DeleteObjectCommand: jest.fn((input) => ({ input, __type: 'DeleteObjectCommand' })),
}));

const defaultSignedUrlImplementation = (client, command, { expiresIn }) =>
  Promise.resolve(
    `https://example.com/${command.input.Key}?X-Amz-Signature=mock-signature&X-Amz-Expires=${expiresIn}`
  );

const getSignedUrlMock = jest.fn().mockImplementation(defaultSignedUrlImplementation);
jest.unstable_mockModule('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock
}));

jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({ BUCKET: 'test-bucket', GEMINI_API_KEY: 'test-key' })
    })
  })),
  GetSecretValueCommand: jest.fn()
}));

const mockDynamoSend = jest.fn();
jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
  CreateTableCommand: jest.fn((input) => ({ input, __type: 'CreateTableCommand' })),
  DescribeTableCommand: jest.fn((input) => ({ input, __type: 'DescribeTableCommand' })),
  GetItemCommand: jest.fn((input) => ({ input, __type: 'GetItemCommand' })),
  PutItemCommand: jest.fn((input) => ({ input, __type: 'PutItemCommand' })),
  UpdateItemCommand: jest.fn((input) => ({ input, __type: 'UpdateItemCommand' })),
  ScanCommand: jest.fn((input) => ({ input, __type: 'ScanCommand' })),
  DeleteItemCommand: jest.fn((input) => ({ input, __type: 'DeleteItemCommand' }))
}));

jest.unstable_mockModule('../logger.js', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
  logErrorTrace: jest.fn().mockResolvedValue(undefined),
}));
import { generateContentMock } from './mocks/generateContentMock.js';

const primeDefaultGeminiResponses = () => {
  generateContentMock.mockResolvedValue({
    response: {
      text: () =>
        JSON.stringify({
          cover_letter1: 'cl1',
          cover_letter2: 'cl2'
        })
    }
  });
};

primeDefaultGeminiResponses();

const setupDefaultDynamoMock = () => {
  mockDynamoSend.mockReset();
  mockDynamoSend.mockImplementation((cmd) => {
    if (cmd.__type === 'DescribeTableCommand') {
      return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
    }
    return Promise.resolve({});
  });
};
setupDefaultDynamoMock();

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: 'Job description' }) }
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest
    .fn()
    .mockResolvedValue({
      text: 'Professional Summary\nExperience\nEducation\nSkills\nProjects',
    })
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
  default: {
    extractRawText: jest.fn().mockResolvedValue({ value: 'Docx text' })
  }
}));

const serverModule = await import('../server.js');
const {
  default: app,
  extractText,
  setGeneratePdf,
  generatePdfWithFallback,
  setTemplateBackstop,
  parseContent,
  classifyDocument,
  CHANGE_LOG_FIELD_LIMITS,
  CHANGE_LOG_DYNAMO_LIMITS,
  setCoverLetterFallbackBuilder,
} = serverModule;
const { default: pdfParseMock } = await import('pdf-parse/lib/pdf-parse.js');
const mammothMock = (await import('mammoth')).default;
const axios = (await import('axios')).default;
axios.get = jest.fn();
setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));

const MANUAL_JOB_DESCRIPTION = `
We are seeking a Software Engineer to design, build, and ship scalable web services.
Collaborate with cross-functional teams, implement APIs, and improve developer workflows.
`;

beforeEach(() => {
  setupDefaultDynamoMock();
  getSignedUrlMock.mockClear();
  getObjectCommandMock.mockClear();
  wordExtractorExtractMock.mockClear();
  pdfParseMock.mockReset();
  pdfParseMock.mockResolvedValue({
    text: 'Professional Summary\nExperience\nEducation\nSkills\nProjects',
  });
  mammothMock.extractRawText.mockReset();
  mammothMock.extractRawText.mockResolvedValue({ value: 'Docx text' });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    data: '<html><title>Software Engineer</title><p>Design and build APIs.</p></html>'
  });
  setCoverLetterFallbackBuilder();
  mockS3Send.mockReset();
  mockS3Send.mockResolvedValue({});
});

describe('health check', () => {
  test('GET /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('static asset fallbacks', () => {
  test('GET /favicon.ico returns 204', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('/api/process-cv', () => {
  test('handles DynamoDB table lifecycle', async () => {
    mockDynamoSend
      .mockImplementationOnce(() =>
        Promise.reject({ name: 'ResourceNotFoundException' })
      )
      .mockImplementationOnce(() => Promise.resolve({}))
      .mockImplementationOnce(() =>
        Promise.resolve({ Table: { TableStatus: 'ACTIVE' } })
      );

    const res1 = await request(app)
      .post('/api/process-cv')
      .set('User-Agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
      )
      .set('X-Forwarded-For', '203.0.113.42')
      .set('X-Vercel-IP-City', 'Mumbai')
      .set('X-Vercel-IP-Country', 'IN')
      .set('X-Vercel-IP-Country-Region', 'MH')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(typeof res1.body.requestId).toBe('string');
    expect(typeof res1.body.jobId).toBe('string');
    let types = mockDynamoSend.mock.calls.map(([c]) => c.__type);
    expect(types).toEqual([
      'DescribeTableCommand',
      'CreateTableCommand',
      'DescribeTableCommand',
      'PutItemCommand',
      'UpdateItemCommand',
      'UpdateItemCommand'
    ]);

    setupDefaultDynamoMock();
    mockDynamoSend.mockClear();
    mockS3Send.mockClear();
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();

    const res2 = await request(app)
      .post('/api/process-cv')
      .set('User-Agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
      )
      .set('X-Forwarded-For', '203.0.113.42')
      .set('X-Vercel-IP-City', 'Mumbai')
      .set('X-Vercel-IP-Country', 'IN')
      .set('X-Vercel-IP-Country-Region', 'MH')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(typeof res2.body.requestId).toBe('string');
    expect(typeof res2.body.jobId).toBe('string');
    expect(res2.body.urlExpiresInSeconds).toBe(3600);
    expect(res2.body.urls).toHaveLength(5);
    expect(typeof res2.body.originalScore).toBe('number');
    expect(typeof res2.body.enhancedScore).toBe('number');
    expect(typeof res2.body.atsScoreBefore).toBe('number');
    expect(typeof res2.body.atsScoreAfter).toBe('number');
    expect(res2.body.atsScoreBefore).toBeGreaterThanOrEqual(0);
    expect(res2.body.atsScoreBefore).toBeLessThanOrEqual(100);
    expect(res2.body.atsScoreAfter).toBeGreaterThanOrEqual(0);
    expect(res2.body.atsScoreAfter).toBeLessThanOrEqual(100);
    expect(typeof res2.body.atsScoreBeforeExplanation).toBe('string');
    expect(typeof res2.body.atsScoreAfterExplanation).toBe('string');
    expect(res2.body.applicantName).toBeTruthy();
    const sanitized = res2.body.applicantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toLowerCase();
    expect(generateContentMock).toHaveBeenCalledTimes(4);

    const s3Commands = mockS3Send.mock.calls.map(([command]) => ({
      type: command.__type,
      key: command.input?.Key,
      copySource: command.input?.CopySource,
    }));

    const relocationCommand = s3Commands.find((cmd) => cmd.type === 'CopyObjectCommand');
    expect(relocationCommand).toBeTruthy();

    const tempDelete = s3Commands.find((cmd) => cmd.type === 'DeleteObjectCommand');
    expect(tempDelete).toBeTruthy();

    const candidatePrefix = `cv/${sanitized}/`;
    const generatedPdfKeys = s3Commands
      .filter(
        (cmd) =>
          cmd.type === 'PutObjectCommand' &&
          typeof cmd.key === 'string' &&
          cmd.key.includes(candidatePrefix)
      )
      .filter((cmd) => cmd.key.endsWith('.pdf'));
    expect(generatedPdfKeys).toHaveLength(4);
    generatedPdfKeys.forEach((cmd) => {
      const segments = cmd.key.split('/');
      expect(segments.length).toBeGreaterThanOrEqual(5);
      expect(segments[0]).toBe('cv');
      expect(segments[1]).toBe(sanitized);
      expect(segments[2]).toMatch(/[a-z0-9_-]+/);
      expect(segments[3]).toMatch(/[a-z0-9_-]+/);
      expect(segments[4]).toMatch(/[a-z0-9_-]+\.pdf$/);
    });

    const generatedJsonKeys = s3Commands
      .filter(
        (cmd) =>
          cmd.type === 'PutObjectCommand' &&
          typeof cmd.key === 'string' &&
          cmd.key.includes(candidatePrefix)
      )
      .filter(
        (cmd) => cmd.key.endsWith('.json') && !cmd.key.includes('/logs/')
      );
    expect(generatedJsonKeys).toHaveLength(4);
    generatedJsonKeys.forEach((cmd) => {
      expect(cmd.key).toContain('/artifacts/');
    });

    const putCall = mockDynamoSend.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall).toBeTruthy();
    expect(putCall[0].input.TableName).toBe('ResumeForge');
    expect(putCall[0].input.Item.linkedinProfileUrl.S).toBe(res2.body.jobId);
    expect(putCall[0].input.Item.candidateName.S).toBe(
      res2.body.applicantName.trim()
    );
    expect(putCall[0].input.Item.ipAddress.S).toBe('203.0.113.42');
    expect(putCall[0].input.Item.userAgent.S).toBe(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
    );
    expect(putCall[0].input.Item.os.S).toBe('iOS');
    expect(putCall[0].input.Item.device.S).toBe('iPhone');
    expect(putCall[0].input.Item.browser.S).toBe('Mobile Safari');
    expect(putCall[0].input.Item.location.S).toBe('Mumbai, MH, IN');
    expect(putCall[0].input.Item.locationCity.S).toBe('Mumbai');
    expect(putCall[0].input.Item.locationRegion.S).toBe('MH');
    expect(putCall[0].input.Item.locationCountry.S).toBe('IN');
    expect(putCall[0].input.Item.credlyProfileUrl.S).toBe('');
    expect(putCall[0].input.Item.s3Bucket.S).toBe('test-bucket');
    expect(putCall[0].input.Item.s3Key.S).toContain(`cv/${sanitized}/`);
    expect(putCall[0].input.Item.s3Url.S).toContain(`cv/${sanitized}/`);
    expect(putCall[0].input.Item.fileType.S).toMatch(/pdf/);
    expect(putCall[0].input.Item.status.S).toBe('uploaded');
    expect(putCall[0].input.Item.cv1Url.S).toBe('');
    expect(putCall[0].input.Item.cv2Url.S).toBe('');

    const updateCalls = mockDynamoSend.mock.calls.filter(
      ([cmd]) => cmd.__type === 'UpdateItemCommand'
    );
    expect(updateCalls.length).toBeGreaterThan(0);

    const scoringUpdate = updateCalls[0];
    expect(scoringUpdate[0].input.ConditionExpression).toBe(
      'jobId = :jobId AND (#status = :statusUploaded OR #status = :status OR attribute_not_exists(#status))'
    );
    expect(scoringUpdate[0].input.ExpressionAttributeValues[':status'].S).toBe(
      'scored'
    );
    expect(scoringUpdate[0].input.ExpressionAttributeValues[':statusUploaded'].S).toBe(
      'uploaded'
    );
    expect(scoringUpdate[0].input.ExpressionAttributeNames['#status']).toBe(
      'status'
    );
    expect(scoringUpdate[0].input.UpdateExpression).toContain('#status');
    expect(scoringUpdate[0].input.UpdateExpression).toContain('analysisCompletedAt');
    expect(scoringUpdate[0].input.UpdateExpression).not.toContain('cv1Url');

    const finalUpdate = updateCalls[updateCalls.length - 1];
    expect(finalUpdate[0].input.UpdateExpression).toContain('activityLog');
    expect(finalUpdate[0].input.ExpressionAttributeValues[':lastAction'].S).toBe(
      'artifacts_uploaded'
    );

    types = mockDynamoSend.mock.calls.map(([c]) => c.__type);
    expect(types).toEqual([
      'DescribeTableCommand',
      'PutItemCommand',
      'UpdateItemCommand',
      'UpdateItemCommand'
    ]);
  });

  test('requires manual job description input', async () => {
    const failed = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(failed.status).toBe(400);
    expect(failed.body.success).toBe(false);
    expect(failed.body.error.code).toBe('JOB_DESCRIPTION_REQUIRED');
    expect(failed.body.error.message).toBe('manualJobDescription required');
    expect(failed.body.error.details).toEqual({
      field: 'manualJobDescription'
    });

    const manual = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field('manualJobDescription', 'Manual JD text outlining requirements and responsibilities.')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(manual.status).toBe(200);
    expect(manual.body.success).toBe(true);
    expect(manual.body.jobDescriptionText).toContain('Manual JD text');
  });

  test('sanitizes manual job description input before analysis', async () => {
    const manual = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field(
        'manualJobDescription',
        'Senior Engineer<script>alert("x")</script><div onclick="steal()">Focus</div><a href="javascript:bad()">Apply</a>'
      )
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(manual.status).toBe(200);
    expect(manual.body.success).toBe(true);
    const jobText = String(manual.body.jobDescriptionText || '').toLowerCase();
    expect(jobText).toContain('senior engineer');
    expect(jobText).toContain('focus');
    expect(jobText).toContain('apply');
    expect(jobText).not.toContain('alert');
    expect(jobText).not.toContain('steal');
    expect(jobText).not.toContain('javascript');
    expect(jobText).not.toContain('onclick');

  });

  test('accepts uploads without a LinkedIn profile URL', async () => {
    const response = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.jobDescriptionText).toContain('Software Engineer');
  });

  test('malformed AI response', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => 'not json' }
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cover_letter1: 'cover 1',
              cover_letter2: 'cover 2'
            })
        }
      });

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'original_upload',
      'version1',
      'version2'
    ]);
  });

  test('handles code-fenced JSON with extra text', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          '```json\n{"cover_letter1":"cl1","cover_letter2":"cl2"}\n``` noise'
      }
    });

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'original_upload',
      'version1',
      'version2'
    ]);
  });

  test('handles JSON surrounded by text', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          'prefix {"cover_letter1":"cl1","cover_letter2":"cl2"} suffix'
      }
    });

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'original_upload',
      'version1',
      'version2'
    ]);
  });

  test('returns presigned PDF URLs with labeled asset types', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.urlExpiresInSeconds).toBe(3600);

    const assetTypes = res.body.urls.map((entry) => entry.type).sort();
    expect(assetTypes).toEqual([
      'cover_letter1',
      'cover_letter2',
      'original_upload',
      'version1',
      'version2',
    ]);

    res.body.urls.forEach((entry) => {
      expect(entry.url).toMatch(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600$/);
      expect(entry.fileUrl).toMatch(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600$/);
      expect(entry.typeUrl).toMatch(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600#.+$/);
      const fragment = entry.typeUrl.slice(entry.typeUrl.indexOf('#') + 1);
      expect(decodeURIComponent(fragment)).toBe(entry.type);
      expect(entry.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.templateName).toEqual(expect.any(String));
      expect(entry.templateName.trim().length).toBeGreaterThan(0);
      expect(entry.templateId).toEqual(expect.any(String));
      expect(entry.templateId.trim().length).toBeGreaterThan(0);
      expect(entry.storageKey).toEqual(expect.any(String));
      expect(entry.storageKey.trim().length).toBeGreaterThan(0);
      if (entry.type === 'original_upload' || entry.type === 'version1' || entry.type === 'version2') {
        expect(entry.templateType).toBe('resume');
      } else if (entry.type === 'cover_letter1' || entry.type === 'cover_letter2') {
        expect(entry.templateType).toBe('cover');
      }
    });
  });

  test('returns a structured error when download URLs cannot be generated', async () => {
    getSignedUrlMock.mockImplementation(() => Promise.resolve('   '));

    const response = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AI_RESPONSE_INVALID',
          message: 'Unable to prepare download links for the generated documents.',
          details: {},
        }),
      })
    );

    getSignedUrlMock.mockImplementation(defaultSignedUrlImplementation);
  });

  describe('download link refresh', () => {
    afterEach(() => {
      setupDefaultDynamoMock();
    });

    test('resigns an existing artifact key for the active job', async () => {
      getSignedUrlMock.mockClear();
      const storageKey = 'cv/candidate/session-1/basic/version1.pdf';

      mockDynamoSend.mockImplementation((cmd) => {
        switch (cmd.__type) {
          case 'DescribeTableCommand':
            return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
          case 'GetItemCommand':
            return Promise.resolve({
              Item: {
                jobId: { S: 'job-123' },
                s3Bucket: { S: 'test-bucket' },
                s3Key: { S: 'cv/candidate/original.pdf' },
                cv1Url: { S: storageKey },
              },
            });
          default:
            return Promise.resolve({});
        }
      });

      const response = await request(app)
        .post('/api/refresh-download-link')
        .send({ jobId: 'job-123', storageKey });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: true,
          storageKey,
          url: expect.stringContaining(storageKey),
          expiresAt: expect.any(String),
        })
      );
      expect(getSignedUrlMock).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ input: expect.objectContaining({ Key: storageKey }) }),
        expect.objectContaining({ expiresIn: 3600 })
      );
    });

    test('returns not found when the storage key does not match the job context', async () => {
      mockDynamoSend.mockImplementation((cmd) => {
        switch (cmd.__type) {
          case 'DescribeTableCommand':
            return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
          case 'GetItemCommand':
            return Promise.resolve({
              Item: {
                jobId: { S: 'job-123' },
                s3Bucket: { S: 'test-bucket' },
                s3Key: { S: 'cv/candidate/original.pdf' },
                cv1Url: { S: 'cv/candidate/session-1/basic/version1.pdf' },
              },
            });
          default:
            return Promise.resolve({});
        }
      });

      const response = await request(app)
        .post('/api/refresh-download-link')
        .send({ jobId: 'job-123', storageKey: 'cv/candidate/session-2/basic/version1.pdf' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'DOWNLOAD_NOT_FOUND' }),
        })
      );
    });
  });

  test('cover letter urls include structured metadata', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const coverLetterEntry = res.body.urls.find((entry) => entry.type === 'cover_letter1');
    expect(coverLetterEntry).toBeTruthy();
    expect(coverLetterEntry.text).toEqual(
      expect.objectContaining({
        raw: expect.any(String),
        contact: expect.objectContaining({
          email: expect.any(String),
          phone: expect.any(String),
          linkedin: expect.any(String),
          location: expect.any(String),
          lines: expect.any(Array),
        }),
        job: expect.objectContaining({
          title: expect.any(String),
          skills: expect.any(Array),
          summary: expect.any(String),
          focus: expect.any(String),
          matchedSkills: expect.any(Array),
        }),
        motivation: expect.objectContaining({
          paragraph: expect.any(String),
          keywords: expect.any(Array),
          matchedSkills: expect.any(Array),
        }),
        metadata: expect.objectContaining({
          paragraphCount: expect.any(Number),
          letterIndex: expect.any(Number),
        }),
      })
    );
  });

  test('uses provided templates in preferred order', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue({
      response: { text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' }) }
    });
    serverModule.generatePdf.mockClear();

    await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('template1', 'modern')
      .field('template2', 'professional')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const calls = serverModule.generatePdf.mock.calls;
    const resumeCalls = calls.filter(([, , opts]) => opts && opts.resumeExperience);
    expect(resumeCalls[0][1]).toBe('modern');
    expect(resumeCalls[1][1]).toBe('professional');
  });

  test('uses templates array', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue({
      response: { text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' }) }
    });
    serverModule.generatePdf.mockClear();

    await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('templates', JSON.stringify(['classic', 'ats']))
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const calls = serverModule.generatePdf.mock.calls;
    const resumeCalls = calls.filter(([, , opts]) => opts && opts.resumeExperience);
    expect(resumeCalls[0][1]).toBe('classic');
    expect(resumeCalls[1][1]).toBe('ats');
  });

  test('filters AI guidance lines', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: [
                'Line1',
                'Consolidate relevant experience into bullet points.',
              ],
              experience: [
                'Start',
                'CONSOLIDATE RELEVANT EXPERIENCE IN A SECTION',
              ],
              education: [],
              certifications: [],
              skills: ['Skill A'],
              projects: [],
              projectSnippet: '',
              latestRoleTitle: 'Lead Engineer',
              latestRoleDescription: 'Delivered impact',
              mandatorySkills: ['Skill A'],
              addedSkills: [],
            })
        }
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Led a project to modernise platforms.' }
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });
    serverModule.generatePdf.mockClear();

    try {
      const res = await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      expect(res.status).toBe(200);

      const resumeCalls = serverModule.generatePdf.mock.calls.filter(
        ([, , opts]) => opts && opts.resumeExperience
      );
      expect(resumeCalls).toHaveLength(2);
      resumeCalls.forEach(([text]) => {
        const parsed = parseContent(text);
        const all = parsed.sections
          .flatMap((s) =>
            s.items.map((tokens) => tokens.map((t) => t.text || '').join(''))
          )
          .join('\n');
        expect(all).not.toMatch(/consolidate relevant experience/i);
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('resume prompt asks for a project matching job skills', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const prompts = [];
    generateContentMock.mockReset();
    generateContentMock.mockImplementationOnce((prompt) => {
      prompts.push(prompt);
      return Promise.resolve({
        response: {
          text: () =>
            JSON.stringify({
              summary: [],
              experience: [],
              education: [],
              certifications: [],
              skills: [],
              projects: [],
              projectSnippet: '',
              latestRoleTitle: '',
              latestRoleDescription: '',
              mandatorySkills: [],
              addedSkills: [],
            })
        }
      });
    });
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => 'Led a project to automate deployment pipelines.' }
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    try {
      await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      const prompt = prompts[0];
      expect(prompt).toMatch(/projectSnippet/i);
      expect(prompt).toMatch(/jobSkills/i);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('inserts project into resume text', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Name'],
              experience: [],
              education: [],
              certifications: [],
              skills: [],
              projects: [],
              projectSnippet: '',
              latestRoleTitle: 'Name',
              latestRoleDescription: '',
              mandatorySkills: [],
              addedSkills: [],
            })
        }
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Built a portfolio site using React' }
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    const texts = [];
    setGeneratePdf(
      jest.fn((text) => {
        texts.push(text);
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    try {
      await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      expect(texts.some((t) => /Built a portfolio site using React/i.test(t))).toBe(true);
    } finally {
      setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('adds project section when job description provided', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Name'],
              experience: [],
              education: [],
              certifications: [],
              skills: [],
              projects: [],
              projectSnippet: '',
              latestRoleTitle: 'Name',
              latestRoleDescription: '',
              mandatorySkills: [],
              addedSkills: [],
            })
        }
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Built a cross-functional platform overhaul' }
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    const texts = [];
    setGeneratePdf(
      jest.fn((text) => {
        texts.push(text);
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    try {
      await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      const resumeText = texts.find((t) => /# Projects/.test(t));
      expect(resumeText).toBeTruthy();
      const parsed = parseContent(resumeText);
      const projectSection = parsed.sections.find((s) => s.heading === 'Projects');
      expect(projectSection).toBeTruthy();
      expect(projectSection.items.length).toBeGreaterThan(0);
      expect(projectSection.items.length).toBeLessThanOrEqual(2);
    } finally {
      setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('cover letters omit placeholder sections', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue({
      response: {
        text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
      }
    });

    setGeneratePdf(
      jest.fn((text, tpl, options) => {
        const data = parseContent(text, options);
        const combined = data.sections
          .flatMap((s) =>
            s.items.map((tokens) => tokens.map((t) => t.text || '').join(''))
          )
          .join('\n');
        if (options && options.skipRequiredSections) {
          const headings = data.sections.map((s) => s.heading);
          expect(headings).not.toContain('Work Experience');
          expect(combined).not.toContain('Information not provided');
        }
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const coverCalls = serverModule.generatePdf.mock.calls.filter(
      ([, , opts]) => opts && opts.skipRequiredSections
    );
    expect(coverCalls).toHaveLength(2);

    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('normalizes structured cover letter responses into text', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary'],
              experience: ['Role'],
              education: [],
              certifications: [],
              skills: ['Skill A'],
              projects: [],
              projectSnippet: 'Improved reliability.',
              latestRoleTitle: 'Lead Engineer',
              latestRoleDescription: 'Built systems.',
              mandatorySkills: ['Skill A'],
              addedSkills: [],
            })
        }
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Delivered a critical platform migration.' }
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cover_letter1: {
                paragraphs: [
                  'Hello hiring team,',
                  'Thank you for considering my application.'
                ]
              },
              cover_letter2: [
                'Greetings hiring manager,',
                { text: 'I look forward to discussing how I can help.' }
              ]
            })
        }
      });

    const pdfCalls = [];
    setGeneratePdf(
      jest.fn((text, template, options) => {
        pdfCalls.push({ text, template, options });
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    try {
      const res = await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      expect(res.status).toBe(200);

      const coverPdfCalls = pdfCalls.filter((call) => call.options?.skipRequiredSections);
      expect(coverPdfCalls).toHaveLength(2);
      expect(coverPdfCalls[0].text).toEqual(expect.any(String));
      expect(coverPdfCalls[1].text).toEqual(expect.any(String));

      const cover1Tokens =
        (coverPdfCalls[0].options && coverPdfCalls[0].options.enhancementTokenMap) || {};
      expect(Object.values(cover1Tokens)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Hello hiring team'),
          expect.stringContaining('Thank you for considering my application'),
        ])
      );

      const cover2Tokens =
        (coverPdfCalls[1].options && coverPdfCalls[1].options.enhancementTokenMap) || {};
      expect(Object.values(cover2Tokens)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Greetings hiring manager'),
          expect.stringContaining('I look forward to discussing how I can help'),
        ])
      );

      const cover1 = res.body.urls.find((entry) => entry.type === 'cover_letter1');
      expect(cover1).toBeTruthy();
      expect(cover1.rawText).toContain('Hello hiring team');
      expect(cover1.rawText).toContain('Thank you for considering my application');

      const cover2 = res.body.urls.find((entry) => entry.type === 'cover_letter2');
      expect(cover2).toBeTruthy();
      expect(cover2.rawText).toContain('Greetings hiring manager');
      expect(cover2.rawText).toContain('I look forward to discussing how I can help');
    } finally {
      setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
      process.env.NODE_ENV = originalEnv;
      generateContentMock.mockReset();
      primeDefaultGeminiResponses();
    }
  });

  test('uses sanitized resume fallback when AI returns plain text for versions', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => 'Here is your revised resume text without JSON formatting.' },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Led a project to streamline onboarding.' }
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'Cover letter A', cover_letter2: 'Cover letter B' }),
        },
      });

    const pdfCalls = [];
    const pdfMock = jest.fn((text, template, options) => {
      pdfCalls.push({ text, template, options });
      return Promise.resolve(Buffer.from('pdf'));
    });
    setGeneratePdf(pdfMock);

    try {
      const res = await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      expect(res.status).toBe(200);
      expect(generateContentMock).toHaveBeenCalledTimes(3);

      const cvCalls = pdfCalls.filter(({ options }) => !options || !options.skipRequiredSections);
      expect(cvCalls).toHaveLength(2);
      expect(cvCalls[0].text.trim().length).toBeGreaterThan(0);
      expect(cvCalls[1].text.trim().length).toBeGreaterThan(0);
      expect(res.body.modifiedTitle).toBe('');
      expect(res.body.addedSkills).toEqual([]);
    } finally {
      setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('falls back to plain PDFs when template rendering fails', async () => {
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();

    const pdfError = new Error('PDF render failed');
    setGeneratePdf(
      jest.fn(() => {
        throw pdfError;
      })
    );

    mockS3Send.mockClear();

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.urls)).toBe(true);
    const pdfEntries = res.body.urls.filter((entry) => entry.type && entry.url);
    const coverEntries = pdfEntries.filter((entry) => entry.type.startsWith('cover_letter'));
    const cvEntries = pdfEntries.filter((entry) => entry.type.startsWith('version'));
    expect(coverEntries.length).toBeGreaterThanOrEqual(2);
    expect(cvEntries.length).toBeGreaterThanOrEqual(2);

    const pdfPutCommands = mockS3Send.mock.calls
      .map(([command]) => command)
      .filter((command) => command.__type === 'PutObjectCommand')
      .filter((command) => command.input?.ContentType === 'application/pdf');
    expect(pdfPutCommands.length).toBeGreaterThanOrEqual(4);
    pdfPutCommands.forEach((command) => {
      const body = command.input?.Body;
      expect(Buffer.isBuffer(body)).toBe(true);
      if (Buffer.isBuffer(body)) {
        expect(body.subarray(0, 4).toString()).toBe('%PDF');
      }
    });

    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('final CV includes updated title, project, and skills', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Sum'],
              experience: ['Other exp'],
              education: [],
              certifications: [],
              skills: ['Skill A'],
              projects: [],
              projectSnippet: 'Project bullet.',
              latestRoleTitle: 'Revised Title',
              latestRoleDescription: 'Did stuff',
              mandatorySkills: ['Skill A', 'Skill B'],
              addedSkills: ['Skill B'],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Project bullet.' }
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' }),
        },
      });

    const pdfTexts = [];
    setGeneratePdf(
      jest.fn((text) => {
        pdfTexts.push(text);
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    try {
      const res = await request(app)
        .post('/api/process-cv')
        .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
        .attach('resume', Buffer.from('dummy'), 'resume.pdf');

      expect(res.status).toBe(200);
      const resumeText = pdfTexts.find((t) => t.includes('Revised Title')) || '';
      expect(resumeText).toContain('Revised Title');
      expect(resumeText).toContain('Project bullet.');
      expect(resumeText).toContain('Skill B');
      expect(res.body.addedSkills).toContain('Skill B');
      expect(res.body.modifiedTitle).toBe('Revised Title');
      expect(typeof res.body.scoreBreakdown).toBe('object');
      expect(res.body.scoreBreakdown).toEqual(
        expect.objectContaining({
          layoutSearchability: expect.objectContaining({
            category: 'Layout & Searchability',
            score: expect.any(Number),
            rating: expect.any(String),
            ratingLabel: expect.any(String),
            tips: expect.any(Array),
          }),
          atsReadability: expect.objectContaining({
            category: 'ATS Readability',
            score: expect.any(Number),
            rating: expect.any(String),
            ratingLabel: expect.any(String),
            tips: expect.any(Array),
          }),
          impact: expect.objectContaining({
            category: 'Impact',
            score: expect.any(Number),
            rating: expect.any(String),
            ratingLabel: expect.any(String),
            tips: expect.any(Array),
          }),
          crispness: expect.objectContaining({
            category: 'Crispness',
            score: expect.any(Number),
            rating: expect.any(String),
            ratingLabel: expect.any(String),
            tips: expect.any(Array),
          }),
          otherQuality: expect.objectContaining({
            category: 'Other Quality Metrics',
            score: expect.any(Number),
            rating: expect.any(String),
            ratingLabel: expect.any(String),
            tips: expect.any(Array),
          }),
        })
      );
      expect(res.body.atsSubScores).toEqual([
        expect.objectContaining({ category: 'Layout & Searchability', score: expect.any(Number) }),
        expect.objectContaining({ category: 'ATS Readability', score: expect.any(Number) }),
        expect.objectContaining({ category: 'Impact', score: expect.any(Number) }),
        expect.objectContaining({ category: 'Crispness', score: expect.any(Number) }),
        expect.objectContaining({ category: 'Other Quality Metrics', score: expect.any(Number) }),
      ]);
      expect(typeof res.body.selectionProbability).toBe('number');
      expect(typeof res.body.selectionProbabilityBefore).toBe('number');
      expect(res.body.selectionInsights).toEqual(
        expect.objectContaining({
          probability: expect.any(Number),
          level: expect.any(String),
          message: expect.any(String),
          rationale: expect.any(String),
          before: expect.objectContaining({
            probability: expect.any(Number),
            level: expect.any(String),
            message: expect.any(String),
            rationale: expect.any(String),
          }),
          after: expect.objectContaining({
            probability: expect.any(Number),
            level: expect.any(String),
            message: expect.any(String),
            rationale: expect.any(String),
          }),
          flags: expect.any(Array),
          jobFitAverage: expect.any(Number),
          jobFitScores: expect.arrayContaining([
            expect.objectContaining({ key: 'designation', score: expect.any(Number) }),
            expect.objectContaining({ key: 'skills', score: expect.any(Number) }),
          ]),
        })
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
    }
  });

  test('missing file', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'RESUME_FILE_REQUIRED',
        message: 'resume file required',
        requestId: expect.any(String),
        jobId: expect.any(String),
        details: { field: 'resume' },
      },
    });
  });

  test('unsupported file type', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('text'), 'resume.txt');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'UPLOAD_VALIDATION_FAILED',
        message: 'Unsupported resume format. Please upload a PDF, DOC, or DOCX file.',
        requestId: expect.any(String),
        jobId: expect.any(String),
        details: { field: 'resume' },
      },
    });
  });

  test('rejects non-resume content with descriptive feedback', async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: 'Invoice Number: 12345\nBill To: Example Corp\nPayment Terms: Net 30 days',
    });

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_RESUME_CONTENT',
        message: expect.stringContaining('You have uploaded an invoice document.'),
        requestId: expect.any(String),
        jobId: expect.any(String),
        details: expect.objectContaining({
          description: 'an invoice document',
          confidence: expect.any(Number),
          reason: expect.stringMatching(/invoice/i),
        }),
      }),
    });
    expect(res.body.error.message).toMatch(/Detected invoice/i);
    expect(res.body.error.message).toMatch(/please upload a correct CV/i);
  });

  test('missing job description text', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'JOB_DESCRIPTION_REQUIRED',
        message: 'manualJobDescription required',
        requestId: expect.any(String),
        jobId: expect.any(String),
        details: { field: 'manualJobDescription' },
      },
    });
  });

});

describe('/api/generate-enhanced-docs', () => {
  test('responds with structured details when jobId is missing', async () => {
    const response = await request(app).post('/api/generate-enhanced-docs').send({
      resumeText: 'Sample resume text',
      jobDescriptionText: 'A detailed description of the role.',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: expect.objectContaining({
        code: 'JOB_ID_REQUIRED',
        message: 'jobId is required to generate enhanced documents.',
        requestId: expect.any(String),
        details: {},
      }),
    });
  });

  test('queues message when fallback cover letters are used', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary paragraph'],
              experience: ['Delivered scalable APIs.'],
              education: [],
              certifications: [],
              skills: ['Node.js'],
              projects: [],
              projectSnippet: 'Improved deployment speed.',
              latestRoleTitle: 'Senior Engineer',
              latestRoleDescription: 'Led engineering initiatives.',
              mandatorySkills: ['Node.js'],
              addedSkills: [],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Designed observability tooling.' },
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: '', cover_letter2: '' }),
        },
      });

    const res = await request(app)
      .post('/api/generate-enhanced-docs')
      .send({
        jobId: 'job-123',
        resumeText: 'Jane Doe\nExperience\n- Built systems',
        originalResumeText: 'Jane Doe\nExperience\n- Built systems',
        jobDescriptionText: MANUAL_JOB_DESCRIPTION,
        jobSkills: ['Node.js'],
      });

    expect(res.status).toBe(200);
    expect(res.body.coverLetterStatus).toEqual({
      fallbackApplied: ['cover_letter1', 'cover_letter2'],
      unavailable: [],
    });
    expect(res.body.messages).toEqual(
      expect.arrayContaining([
        'Cover letters were generated using fallback copy because the AI response was incomplete.',
      ])
    );
    const coverUrls = res.body.urls.filter((entry) => entry.type.startsWith('cover_letter'));
    expect(coverUrls).toHaveLength(2);
    coverUrls.forEach((entry) => {
      expect(entry.rawText).toMatch(/Dear Hiring Manager/i);
    });

    process.env.NODE_ENV = originalEnv;
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();
  });

  test('replaces whitespace cover letters with fallback copy', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary paragraph'],
              experience: ['Delivered scalable APIs.'],
              education: [],
              certifications: [],
              skills: ['Node.js'],
              projects: [],
              projectSnippet: 'Improved deployment speed.',
              latestRoleTitle: 'Senior Engineer',
              latestRoleDescription: 'Led engineering initiatives.',
              mandatorySkills: ['Node.js'],
              addedSkills: [],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Designed observability tooling.' },
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cover_letter1: '   ',
              cover_letter2: '\n\n',
            }),
        },
      });

    const res = await request(app)
      .post('/api/generate-enhanced-docs')
      .send({
        jobId: 'job-789',
        resumeText: [
          'Jordan Smith',
          'Email: jordan@example.com',
          'Phone: 555-123-4567',
          'LinkedIn: https://linkedin.com/in/jordansmith',
          'Experience',
          'Senior Engineer at Stellar Tech (2021-2023)',
          '- Delivered solutions'
        ].join('\n'),
        originalResumeText: [
          'Jordan Smith',
          'Email: jordan@example.com',
          'Phone: 555-123-4567',
          'LinkedIn: https://linkedin.com/in/jordansmith',
          'Experience',
          'Senior Engineer at Stellar Tech (2021-2023)',
          '- Delivered solutions'
        ].join('\n'),
        jobDescriptionText: MANUAL_JOB_DESCRIPTION,
        jobSkills: ['Node.js'],
      });

    expect(res.status).toBe(200);
    expect(res.body.coverLetterStatus).toEqual({
      fallbackApplied: ['cover_letter1', 'cover_letter2'],
      unavailable: [],
    });
    expect(res.body.messages).toEqual(
      expect.arrayContaining([
        'Cover letters were generated using fallback copy because the AI response was incomplete.',
      ])
    );
    const coverUrls = res.body.urls.filter((entry) =>
      entry.type.startsWith('cover_letter')
    );
    expect(coverUrls).toHaveLength(2);
    coverUrls.forEach((entry) => {
      expect(entry.rawText).toMatch(/Dear Hiring Manager/i);
      expect(entry.rawText).toMatch(/Email: jordan@example.com/i);
      expect(entry.rawText).toMatch(/Node\.js/);
      expect(entry.rawText).toMatch(/As a Senior Engineer/i);
    });

    process.env.NODE_ENV = originalEnv;
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();
  });

  test('audits cover letters for placeholders and applies fallback', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary paragraph'],
              experience: ['Delivered scalable APIs.'],
              education: [],
              certifications: [],
              skills: ['Node.js'],
              projects: [],
              projectSnippet: 'Improved deployment speed.',
              latestRoleTitle: 'Senior Engineer',
              latestRoleDescription: 'Led engineering initiatives.',
              mandatorySkills: ['Node.js'],
              addedSkills: [],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Designed observability tooling.' },
      })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cover_letter1: [
                'Jordan Smith',
                'Email: jordan@example.com',
                'Dear Hiring Manager,',
                '[Insert your achievements here]',
                'Sincerely,',
                '[Your Name]',
              ].join('\n\n'),
              cover_letter2: [
                'Jordan Smith',
                'Email: jordan@example.com',
                'Dear Hiring Manager,',
                'I am ready to contribute to the team immediately.',
                'Sincerely,',
                'Jordan Smith',
              ].join('\n\n'),
            }),
        },
      });

    const res = await request(app)
      .post('/api/generate-enhanced-docs')
      .send({
        jobId: 'job-790',
        resumeText: [
          'Jordan Smith',
          'Email: jordan@example.com',
          'Phone: 555-123-4567',
          'LinkedIn: https://linkedin.com/in/jordansmith',
          'Experience',
          'Senior Engineer at Stellar Tech (2021-2023)',
          '- Delivered solutions',
        ].join('\n'),
        originalResumeText: [
          'Jordan Smith',
          'Email: jordan@example.com',
          'Phone: 555-123-4567',
          'LinkedIn: https://linkedin.com/in/jordansmith',
          'Experience',
          'Senior Engineer at Stellar Tech (2021-2023)',
          '- Delivered solutions',
        ].join('\n'),
        jobDescriptionText: MANUAL_JOB_DESCRIPTION,
        jobSkills: ['Node.js'],
      });

    expect(res.status).toBe(200);
    expect(res.body.coverLetterStatus).toEqual({
      fallbackApplied: ['cover_letter1'],
      unavailable: [],
    });

    const cover1 = res.body.urls.find((entry) => entry.type === 'cover_letter1');
    expect(cover1).toBeTruthy();
    expect(cover1.rawText).not.toContain('[Insert your achievements here]');
    expect(cover1.rawText).toMatch(/Thank you for considering my application/i);

    const cover2 = res.body.urls.find((entry) => entry.type === 'cover_letter2');
    expect(cover2).toBeTruthy();
    expect(cover2.rawText).toContain('I am ready to contribute to the team immediately.');

    process.env.NODE_ENV = originalEnv;
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();
  });

  test('surfaces message when cover letters remain unavailable', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary paragraph'],
              experience: ['Delivered scalable APIs.'],
              education: [],
              certifications: [],
              skills: ['Node.js'],
              projects: [],
              projectSnippet: 'Improved deployment speed.',
              latestRoleTitle: 'Senior Engineer',
              latestRoleDescription: 'Led engineering initiatives.',
              mandatorySkills: ['Node.js'],
              addedSkills: [],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Designed observability tooling.' },
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: '', cover_letter2: '' }),
        },
      });

    setCoverLetterFallbackBuilder(() => ({
      cover_letter1: '',
      cover_letter2: '',
    }));

    const res = await request(app)
      .post('/api/generate-enhanced-docs')
      .send({
        jobId: 'job-456',
        resumeText: 'Jamie Doe\nExperience\n- Scaled infrastructure',
        originalResumeText: 'Jamie Doe\nExperience\n- Scaled infrastructure',
        jobDescriptionText: MANUAL_JOB_DESCRIPTION,
        jobSkills: ['Node.js'],
      });

    expect(res.status).toBe(200);
    expect(res.body.coverLetterStatus).toEqual({
      fallbackApplied: [],
      unavailable: ['cover_letter1', 'cover_letter2'],
    });
    expect(res.body.messages).toEqual(
      expect.arrayContaining(['CV generated, cover letter unavailable.'])
    );
    const coverUrls = res.body.urls.filter((entry) => entry.type.startsWith('cover_letter'));
    expect(coverUrls).toHaveLength(0);

    process.env.NODE_ENV = originalEnv;
    setCoverLetterFallbackBuilder();
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();
  });

  test('persists template vs population errors in stage metadata', async () => {
    mockS3Send.mockClear();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const templateError = new Error('Renderer unavailable');
    const pdfMock = jest.fn((text, templateId) => {
      if (templateId === 'modern') {
        return Promise.reject(templateError);
      }
      return Promise.resolve(Buffer.from(`pdf-${templateId}`));
    });
    setGeneratePdf(pdfMock);

    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              summary: ['Summary paragraph'],
              experience: ['Delivered scalable APIs.'],
              education: [],
              certifications: [],
              skills: ['Node.js'],
              projects: [],
              projectSnippet: 'Improved deployment speed.',
              latestRoleTitle: 'Senior Engineer',
              latestRoleDescription: 'Led engineering initiatives.',
              mandatorySkills: ['Node.js'],
              addedSkills: [],
            }),
        },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'Designed observability tooling.' },
      })
      .mockResolvedValue({
        response: {
          text: () => JSON.stringify({ cover_letter1: '', cover_letter2: '' }),
        },
      });

    const res = await request(app)
      .post('/api/process-cv')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(200);

    const templateFallbackMessage =
      'Could not generate PDF for Modern template, retrying with Professional';
    const populationFallbackMessage =
      'Cover letters were generated using fallback copy because the AI response was incomplete.';

    expect(res.body.templateCreationMessages).toEqual(
      expect.arrayContaining([templateFallbackMessage])
    );
    expect(res.body.documentPopulationMessages).toEqual(
      expect.arrayContaining([populationFallbackMessage])
    );

    const metadataWrites = mockS3Send.mock.calls.filter(
      ([command]) =>
        command.__type === 'PutObjectCommand' &&
        typeof command.input?.Key === 'string' &&
        command.input.Key.endsWith('logs/log.json')
    );
    expect(metadataWrites.length).toBeGreaterThan(0);
    const latestMetadataCall = metadataWrites[metadataWrites.length - 1];
    const metadataBody = latestMetadataCall[0].input.Body;
    const metadataString = Buffer.isBuffer(metadataBody)
      ? metadataBody.toString()
      : metadataBody;
    const metadataPayload = JSON.parse(metadataString);
    const downloadStage = metadataPayload?.stages?.download;
    expect(downloadStage?.templateCreationErrors).toEqual(
      expect.arrayContaining([templateFallbackMessage])
    );
    expect(downloadStage?.documentPopulationErrors).toEqual(
      expect.arrayContaining([populationFallbackMessage])
    );
    expect(downloadStage?.templates).toEqual(
      expect.objectContaining({
        resume: expect.objectContaining({
          primary: expect.any(String),
          selected: expect.any(String),
        }),
        cover: expect.objectContaining({
          primary: expect.any(String),
        }),
      })
    );

    process.env.NODE_ENV = originalEnv;
    generateContentMock.mockReset();
    primeDefaultGeminiResponses();
    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });
});

describe('generatePdfWithFallback', () => {
  afterEach(() => {
    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
    setTemplateBackstop();
  });

  test('records retry message when 2025 renderer fails', async () => {
    const renderError = new Error('Renderer unavailable');
    renderError.code = 'TEMPLATE_RENDER_FAILED';
    const pdfMock = jest.fn((text, templateId) => {
      if (templateId === '2025') {
        return Promise.reject(renderError);
      }
      return Promise.resolve(Buffer.from(`pdf-${templateId}`));
    });
    setGeneratePdf(pdfMock);
    const backstopMock = jest.fn().mockResolvedValue([
      { templateId: '2025', bytes: 1024 }
    ]);
    setTemplateBackstop(backstopMock);

    const result = await generatePdfWithFallback({
      documentType: 'resume',
      templates: ['2025', 'modern'],
      buildOptionsForTemplate: () => ({}),
      inputText: 'Jane Doe',
      generativeModel: null,
      logContext: {},
      allowPlainFallback: false,
    });

    expect(pdfMock).toHaveBeenCalledTimes(2);
    expect(backstopMock).toHaveBeenCalledTimes(1);
    expect(backstopMock).toHaveBeenCalledWith({
      templates: ['2025'],
      logger: null,
    });
    expect(result.template).toBe('modern');
    expect(result.messages).toContain(
      'Could not generate PDF for Future Vision 2025 template, retrying with Modern'
    );
  });

  test('announces next template when fallback occurs for non-2025 resume', async () => {
    const pdfMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('Modern renderer unavailable'))
      .mockResolvedValueOnce(Buffer.from('pdf-professional'));
    setGeneratePdf(pdfMock);

    const result = await generatePdfWithFallback({
      documentType: 'resume',
      templates: ['modern', 'professional', 'classic'],
      buildOptionsForTemplate: () => ({}),
      inputText: 'Jane Doe',
      generativeModel: null,
      logContext: {},
      allowPlainFallback: false,
    });

    expect(pdfMock).toHaveBeenCalledTimes(2);
    expect(result.template).toBe('professional');
    expect(result.messages).toContain(
      'Could not generate PDF for Modern template, retrying with Professional'
    );
  });

  test('announces actual next template when 2025 fallback prefers contrast option', async () => {
    const renderError = new Error('Renderer unavailable');
    renderError.code = 'TEMPLATE_RENDER_FAILED';
    const pdfMock = jest.fn((text, templateId) => {
      if (templateId === '2025') {
        return Promise.reject(renderError);
      }
      if (templateId === 'professional') {
        return Promise.resolve(Buffer.from('pdf-professional'));
      }
      return Promise.resolve(Buffer.from(`pdf-${templateId}`));
    });
    setGeneratePdf(pdfMock);

    const result = await generatePdfWithFallback({
      documentType: 'resume',
      templates: ['2025', 'professional', 'modern'],
      buildOptionsForTemplate: () => ({}),
      inputText: 'Jane Doe',
      generativeModel: null,
      logContext: {},
      allowPlainFallback: false,
    });

    expect(pdfMock).toHaveBeenCalledTimes(2);
    expect(result.template).toBe('professional');
    expect(result.messages).toContain(
      'Could not generate PDF for Future Vision 2025 template, retrying with Professional'
    );
  });
});

  describe('classifyDocument', () => {
  test('identifies resumes by section structure', async () => {
    const result = await classifyDocument('PROFESSIONAL SUMMARY\nExperience\nEducation\nSkills');
    expect(result.isResume).toBe(true);
    expect(result.description).toBe('a professional resume');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('detects cover letters', async () => {
    const result = await classifyDocument('Dear Hiring Manager,\nI am excited...\nSincerely, Candidate');
    expect(result.isResume).toBe(false);
    expect(result.description).toContain('cover');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.reason).toMatch(/cover letter/i);
  });

  test('rejects job descriptions that mimic resume sections', async () => {
    const text = [
      'We are looking for a Senior Product Manager to join our team.',
      'Responsibilities:',
      '- You will define product roadmaps and partner with engineering teams.',
      'Experience',
      '- 7+ years leading cross-functional initiatives.',
      'Education',
      '- Bachelor\'s degree in Business or related field.',
      'Skills',
      '- Excellent communication and stakeholder management.',
      'Benefits',
      '- Competitive salary and comprehensive health coverage.',
      'Apply now to become part of a mission-driven company.',
    ].join('\n');

    const result = await classifyDocument(text);
    expect(result.isResume).toBe(false);
    expect(result.description).toContain('job description');
    expect(result.reason).toMatch(/job-posting/i);
  });
});

describe('extractText', () => {
  test('extracts text from pdf', async () => {
    const file = { originalname: 'file.pdf', buffer: Buffer.from('') };
    await expect(extractText(file)).resolves.toBe(
      'Professional Summary\nExperience\nEducation\nSkills\nProjects'
    );
  });

  test('extracts text from docx', async () => {
    const file = { originalname: 'file.docx', buffer: Buffer.from('docx') };
    await expect(extractText(file)).resolves.toBe('Docx text');
  });

  test('guides user when pdf parsing fails', async () => {
    pdfParseMock.mockResolvedValueOnce({ text: '   ' });
    const file = { originalname: 'file.pdf', buffer: Buffer.from('pdf') };
    await expect(extractText(file)).rejects.toThrow(
      "We couldn't read your PDF resume. Please export a new PDF (make sure it is not password protected) and upload it again."
    );
  });

  test('guides user when docx parsing fails', async () => {
    mammothMock.extractRawText.mockRejectedValueOnce(new Error('bad docx'));
    const file = { originalname: 'file.docx', buffer: Buffer.from('docx') };
    await expect(extractText(file)).rejects.toThrow(
      "We couldn't read your DOCX resume. Please download a fresh DOCX copy (or export it to PDF) from your editor and try again."
    );
  });

  test('extracts text from doc', async () => {
    const file = { originalname: 'file.doc', buffer: Buffer.from('doc') };
    await expect(extractText(file)).resolves.toBe(
      'Doc body text\n\nHeader text\n\nFooter text\n\nDoc fallback text'
    );
    expect(wordExtractorExtractMock).toHaveBeenCalled();
  });

  test('rejects plain text files', async () => {
    const file = { originalname: 'file.txt', buffer: Buffer.from('plain') };
    await expect(extractText(file)).rejects.toThrow(
      'Unsupported resume format encountered. Only PDF, DOC, or DOCX files are processed.'
    );
  });
});

describe('client download labels', () => {
  test('App displays correct labels for each file type', () => {
    const source = fs.readFileSync('./client/src/App.jsx', 'utf8');
    const mappings = {
      cover_letter1: 'Cover Letter 1',
      cover_letter2: 'Cover Letter 2',
      original_upload: 'Original CV Upload',
      version1: 'Enhanced CV Version 1',
      version2: 'Enhanced CV Version 2'
    };

    Object.entries(mappings).forEach(([type, label]) => {
      expect(source).toContain(`case '${type}':`);
      expect(source).toContain(`label: '${label}'`);
    });
  });
});

describe('change log persistence safeguards', () => {
  test('truncates oversized change log fields before persisting', async () => {
    const longResume = 'R'.repeat(CHANGE_LOG_FIELD_LIMITS.resume + 500);
    const longDetail = 'D'.repeat(CHANGE_LOG_FIELD_LIMITS.detail + 200);
    const largeHistoryContext = {
      matchBefore: {
        summary: 'M'.repeat(CHANGE_LOG_FIELD_LIMITS.history + 1000)
      }
    };

    const updateCommands = [];
    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-123' },
              changeLog: { L: [] }
            }
          });
        case 'UpdateItemCommand':
          updateCommands.push(cmd);
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const response = await request(app)
      .post('/api/change-log')
      .send({
        jobId: 'job-123',
        entry: {
          id: 'entry-1',
          detail: longDetail,
          resumeBeforeText: longResume,
          resumeAfterText: longResume,
          historyContext: largeHistoryContext
        }
      });

    expect(response.status).toBe(200);
    expect(updateCommands).toHaveLength(1);
    const updateCommand = updateCommands[0];
    const { ExpressionAttributeValues } = updateCommand.input;
    const serializedEntries = ExpressionAttributeValues[':changeLog'].L;
    expect(serializedEntries).toHaveLength(1);

    const entryMap = serializedEntries[0].M;
    expect(entryMap.detail.S.length).toBeLessThanOrEqual(CHANGE_LOG_FIELD_LIMITS.detail);
    expect(entryMap.detail.S.endsWith(CHANGE_LOG_FIELD_LIMITS.suffix)).toBe(true);
    expect(entryMap.resumeBeforeText.S.length).toBeLessThanOrEqual(CHANGE_LOG_FIELD_LIMITS.resume);
    expect(entryMap.resumeBeforeText.S.endsWith(CHANGE_LOG_FIELD_LIMITS.suffix)).toBe(true);
    expect(entryMap.resumeAfterText.S.length).toBeLessThanOrEqual(CHANGE_LOG_FIELD_LIMITS.resume);
    expect(entryMap.resumeAfterText.S.endsWith(CHANGE_LOG_FIELD_LIMITS.suffix)).toBe(true);
    expect(entryMap.historyContext).toBeUndefined();
  });

  test('removes heavy fields from older entries when exceeding Dynamo size limits', async () => {
    const largeResume = 'R'.repeat(CHANGE_LOG_FIELD_LIMITS.resume);
    const largeDetail = 'D'.repeat(CHANGE_LOG_FIELD_LIMITS.detail);
    const existingEntries = Array.from({ length: 30 }, (_, index) => ({
      M: {
        id: { S: `entry-${index}` },
        detail: { S: largeDetail },
        resumeBeforeText: { S: largeResume },
        resumeAfterText: { S: largeResume },
        acceptedAt: { S: `2024-01-01T00:00:${String(index).padStart(2, '0')}Z` },
      },
    }));

    const updateCommands = [];
    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-oversize' },
              changeLog: { L: existingEntries },
            },
          });
        case 'UpdateItemCommand':
          updateCommands.push(cmd);
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const response = await request(app)
      .post('/api/change-log')
      .send({
        jobId: 'job-oversize',
        entry: {
          id: 'new-entry',
          detail: largeDetail,
          resumeBeforeText: largeResume,
          resumeAfterText: largeResume,
        },
      });

    expect(response.status).toBe(200);
    expect(updateCommands).toHaveLength(1);

    const updateCommand = updateCommands[0];
    const { ExpressionAttributeValues } = updateCommand.input;
    const dynamoChangeLog = ExpressionAttributeValues[':changeLog'];

    const attributeSize = Buffer.byteLength(JSON.stringify(dynamoChangeLog));
    expect(attributeSize).toBeLessThanOrEqual(CHANGE_LOG_DYNAMO_LIMITS.budget);

    const [latestEntry, ...olderEntries] = dynamoChangeLog.L;
    expect(latestEntry.M.id.S).toBe('new-entry');
    expect(latestEntry.M.resumeBeforeText).toBeDefined();
    expect(latestEntry.M.resumeAfterText).toBeDefined();

    const oldestEntry = olderEntries[olderEntries.length - 1];
    expect(oldestEntry.M.resumeBeforeText).toBeUndefined();
    expect(oldestEntry.M.resumeAfterText).toBeUndefined();

    setupDefaultDynamoMock();
  });

  test('persists category changelog details for ATS, skills, and related sections', async () => {
    mockS3Send.mockClear();
    const updateCommands = [];
    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-321' },
              changeLog: { L: [] },
            },
          });
        case 'UpdateItemCommand':
          updateCommands.push(cmd);
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const entryPayload = {
      id: 'entry-category',
      title: 'Improve ATS Layout',
      detail: 'Added for better fit to JD keywords.',
      categoryChangelog: [
        {
          key: 'skills',
          label: 'Skills',
          added: ['Kubernetes'],
          reasons: ['Added for better fit to JD'],
        },
        {
          key: 'ats',
          label: 'ATS',
          reasons: ['Score impact: +4 pts versus the baseline upload.'],
        },
      ],
    };

    const response = await request(app)
      .post('/api/change-log')
      .send({
        jobId: 'job-321',
        entry: entryPayload,
      });

    expect(response.status).toBe(200);
    expect(updateCommands).toHaveLength(1);

    const updateCommand = updateCommands[0];
    const serializedEntries = updateCommand.input.ExpressionAttributeValues[':changeLog'].L;
    expect(serializedEntries).toHaveLength(1);

    const serializedCategory = serializedEntries[0].M.categoryChangelog;
    expect(serializedCategory).toBeDefined();
    expect(serializedCategory.L).toHaveLength(2);
    const [skillsEntry, atsEntry] = serializedCategory.L.map((item) => item.M);
    expect(skillsEntry.key.S).toBe('skills');
    expect(skillsEntry.added.L[0].S).toBe('Kubernetes');
    expect(skillsEntry.reasons.L[0].S).toContain('better fit to JD');
    expect(atsEntry.key.S).toBe('ats');

    const [responseEntry] = response.body.changeLog;
    expect(responseEntry.categoryChangelog).toEqual([
      {
        key: 'skills',
        label: 'Skills',
        description: '',
        added: ['Kubernetes'],
        removed: [],
        reasons: ['Added for better fit to JD'],
      },
      {
        key: 'ats',
        label: 'ATS',
        description: '',
        added: [],
        removed: [],
        reasons: ['Score impact: +4 pts versus the baseline upload.'],
      },
    ]);

    expect(response.body.changeLogSummary).toEqual(
      expect.objectContaining({
        categories: expect.arrayContaining([
          expect.objectContaining({
            key: 'skills',
            added: expect.arrayContaining(['Kubernetes']),
          }),
        ]),
        highlights: expect.arrayContaining([
          expect.objectContaining({
            key: 'skills:added',
            items: expect.arrayContaining(['Kubernetes']),
          }),
        ]),
      })
    );

    const putCommands = mockS3Send.mock.calls.filter(
      ([command]) => command.__type === 'PutObjectCommand'
    );
    const changeLogWrite = putCommands.find(([command]) => {
      try {
        const body = JSON.parse(command.input.Body);
        return Array.isArray(body.entries);
      } catch (err) {
        return false;
      }
    });
    expect(changeLogWrite).toBeDefined();
    const storedPayload = JSON.parse(changeLogWrite[0].input.Body);
    expect(storedPayload.summary).toEqual(
      expect.objectContaining({
        highlights: expect.arrayContaining([
          expect.objectContaining({
            key: 'skills:added',
            items: expect.arrayContaining(['Kubernetes']),
          }),
        ]),
      })
    );

    setupDefaultDynamoMock();
  });
});

describe('change log session visibility', () => {
  test('persists reverted entries when updating the change log', async () => {
    const putCommands = [];
    mockS3Send.mockImplementation((command) => {
      if (command.__type === 'GetObjectCommand') {
        const payload = {
          version: 1,
          entries: [
            {
              id: 'entry-1',
              title: 'Initial change',
              detail: 'Original detail',
              label: 'fixed',
              acceptedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        };
        return Promise.resolve({ Body: Buffer.from(JSON.stringify(payload)) });
      }
      if (command.__type === 'PutObjectCommand') {
        putCommands.push(command.input);
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const updateCommands = [];
    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-123' },
              changeLog: { L: [] },
              s3Bucket: { S: 'test-bucket' },
              s3Key: { S: 'cv/candidate/session/original.pdf' },
              sessionChangeLogKey: { S: 'cv/candidate/session/logs/change-log.json' },
            },
          });
        case 'UpdateItemCommand':
          updateCommands.push(cmd);
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const revertAt = '2024-05-02T12:00:00.000Z';
    const response = await request(app)
      .post('/api/change-log')
      .send({
        jobId: 'job-123',
        entry: {
          id: 'entry-1',
          reverted: true,
          revertedAt: revertAt,
        },
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.changeLog)).toBe(true);
    expect(response.body.changeLog).toHaveLength(1);
    expect(response.body.changeLog[0].reverted).toBe(true);

    const changeLogWrites = putCommands.filter((cmd) =>
      typeof cmd?.Key === 'string' && cmd.Key.endsWith('logs/change-log.json')
    );
    expect(changeLogWrites).toHaveLength(1);
    const persistedPayload = JSON.parse(changeLogWrites[0].Body);
    expect(Array.isArray(persistedPayload.entries)).toBe(true);
    expect(persistedPayload.entries[0].id).toBe('entry-1');
    expect(persistedPayload.entries[0].reverted).toBe(true);
    expect(typeof persistedPayload.entries[0].revertedAt).toBe('string');
    expect(persistedPayload.dismissedEntries || []).toHaveLength(0);

    expect(updateCommands).toHaveLength(1);
  });

  test('stores rejected entries in the session change log dismissed list', async () => {
    const putCommands = [];
    mockS3Send.mockImplementation((command) => {
      if (command.__type === 'GetObjectCommand') {
        const payload = {
          version: 1,
          entries: [
            {
              id: 'entry-1',
              title: 'Initial change',
              detail: 'Original detail',
              label: 'fixed',
              acceptedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        };
        return Promise.resolve({ Body: Buffer.from(JSON.stringify(payload)) });
      }
      if (command.__type === 'PutObjectCommand') {
        putCommands.push(command.input);
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-123' },
              changeLog: { L: [] },
              s3Bucket: { S: 'test-bucket' },
              s3Key: { S: 'cv/candidate/session/original.pdf' },
              sessionChangeLogKey: { S: 'cv/candidate/session/logs/change-log.json' },
            },
          });
        case 'UpdateItemCommand':
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const response = await request(app)
      .post('/api/change-log')
      .send({ jobId: 'job-123', remove: true, entryId: 'entry-1' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.changeLog)).toBe(true);
    expect(response.body.changeLog).toHaveLength(0);

    const changeLogWrites = putCommands.filter((cmd) =>
      typeof cmd?.Key === 'string' && cmd.Key.endsWith('logs/change-log.json')
    );
    expect(changeLogWrites).toHaveLength(1);
    const persistedPayload = JSON.parse(changeLogWrites[0].Body);
    expect(Array.isArray(persistedPayload.entries)).toBe(true);
    expect(persistedPayload.entries).toHaveLength(0);
    expect(Array.isArray(persistedPayload.dismissedEntries)).toBe(true);
    expect(persistedPayload.dismissedEntries).toHaveLength(1);
    const dismissed = persistedPayload.dismissedEntries[0];
    expect(dismissed.id).toBe('entry-1');
    expect(dismissed.rejected).toBe(true);
    expect(typeof dismissed.rejectedAt).toBe('string');
  });

  test('persists cover letter change log payloads to S3', async () => {
    const putCommands = [];
    mockS3Send.mockImplementation((command) => {
      if (command.__type === 'GetObjectCommand') {
        const payload = { version: 1, entries: [] };
        return Promise.resolve({ Body: Buffer.from(JSON.stringify(payload)) });
      }
      if (command.__type === 'PutObjectCommand') {
        putCommands.push(command.input);
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-123' },
              changeLog: { L: [] },
              s3Bucket: { S: 'test-bucket' },
              s3Key: { S: 'cv/candidate/session/original.pdf' },
              sessionChangeLogKey: { S: 'cv/candidate/session/logs/change-log.json' },
            },
          });
        case 'UpdateItemCommand':
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const response = await request(app)
      .post('/api/change-log')
      .send({
        jobId: 'job-123',
        entry: {
          id: 'entry-1',
          title: 'Placeholder',
          acceptedAt: '2024-05-01T00:00:00.000Z',
        },
        coverLetters: {
          entries: [
            {
              id: 'cover_letter1',
              originalText: 'Original letter',
              editedText: 'Edited letter',
              updatedAt: '2024-05-02T12:00:00.000Z',
            },
          ],
          dismissedEntries: [
            {
              id: 'cover_letter2',
              originalText: 'Second original',
              editedText: 'Second draft',
              rejectedAt: '2024-05-03T10:00:00.000Z',
            },
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.coverLetters).toBeTruthy();
    expect(Array.isArray(response.body.coverLetters.entries)).toBe(true);
    expect(response.body.coverLetters.entries).toHaveLength(1);
    expect(response.body.coverLetters.entries[0].id).toBe('cover_letter1');
    expect(Array.isArray(response.body.coverLetters.dismissedEntries)).toBe(true);
    expect(response.body.coverLetters.dismissedEntries).toHaveLength(1);
    expect(response.body.coverLetters.dismissedEntries[0].id).toBe('cover_letter2');

    const changeLogWrites = putCommands.filter((cmd) =>
      typeof cmd?.Key === 'string' && cmd.Key.endsWith('logs/change-log.json')
    );
    expect(changeLogWrites).toHaveLength(1);
    const persistedPayload = JSON.parse(changeLogWrites[0].Body);
    expect(persistedPayload.coverLetters).toBeTruthy();
    expect(Array.isArray(persistedPayload.coverLetters.entries)).toBe(true);
    expect(persistedPayload.coverLetters.entries).toHaveLength(1);
    expect(persistedPayload.coverLetters.entries[0].id).toBe('cover_letter1');
    expect(Array.isArray(persistedPayload.coverLetters.dismissedEntries)).toBe(true);
    expect(persistedPayload.coverLetters.dismissedEntries).toHaveLength(1);
    const dismissedCover = persistedPayload.coverLetters.dismissedEntries[0];
    expect(dismissedCover.id).toBe('cover_letter2');
    expect(dismissedCover.rejected).toBe(true);
    expect(typeof dismissedCover.rejectedAt).toBe('string');
  });

  test('removing a cover letter entry records dismissal state in S3', async () => {
    const putCommands = [];
    mockS3Send.mockImplementation((command) => {
      if (command.__type === 'GetObjectCommand') {
        const payload = {
          version: 1,
          entries: [],
          coverLetters: {
            entries: [
              {
                id: 'cover_letter1',
                originalText: 'Original letter',
                editedText: 'Edited letter',
                updatedAt: '2024-05-02T12:00:00.000Z',
              },
            ],
            dismissedEntries: [],
          },
        };
        return Promise.resolve({ Body: Buffer.from(JSON.stringify(payload)) });
      }
      if (command.__type === 'PutObjectCommand') {
        putCommands.push(command.input);
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    mockDynamoSend.mockImplementation((cmd) => {
      switch (cmd.__type) {
        case 'DescribeTableCommand':
          return Promise.resolve({ Table: { TableStatus: 'ACTIVE' } });
        case 'GetItemCommand':
          return Promise.resolve({
            Item: {
              jobId: { S: 'job-123' },
              changeLog: { L: [] },
              s3Bucket: { S: 'test-bucket' },
              s3Key: { S: 'cv/candidate/session/original.pdf' },
              sessionChangeLogKey: { S: 'cv/candidate/session/logs/change-log.json' },
            },
          });
        case 'UpdateItemCommand':
          return Promise.resolve({});
        default:
          return Promise.resolve({});
      }
    });

    const response = await request(app)
      .post('/api/change-log')
      .send({ jobId: 'job-123', remove: true, entryId: 'cover_letter1' });

    expect(response.status).toBe(200);
    expect(response.body.coverLetters).toBeTruthy();
    expect(Array.isArray(response.body.coverLetters.entries)).toBe(true);
    expect(response.body.coverLetters.entries).toHaveLength(0);
    expect(Array.isArray(response.body.coverLetters.dismissedEntries)).toBe(true);
    expect(response.body.coverLetters.dismissedEntries).toHaveLength(1);
    expect(response.body.coverLetters.dismissedEntries[0].id).toBe('cover_letter1');

    const changeLogWrites = putCommands.filter((cmd) =>
      typeof cmd?.Key === 'string' && cmd.Key.endsWith('logs/change-log.json')
    );
    expect(changeLogWrites).toHaveLength(1);
    const persistedPayload = JSON.parse(changeLogWrites[0].Body);
    expect(Array.isArray(persistedPayload.coverLetters.entries)).toBe(true);
    expect(persistedPayload.coverLetters.entries).toHaveLength(0);
    expect(Array.isArray(persistedPayload.coverLetters.dismissedEntries)).toBe(true);
    expect(persistedPayload.coverLetters.dismissedEntries).toHaveLength(1);
    expect(persistedPayload.coverLetters.dismissedEntries[0].id).toBe('cover_letter1');
    expect(persistedPayload.coverLetters.dismissedEntries[0].rejected).toBe(true);
  });
});
