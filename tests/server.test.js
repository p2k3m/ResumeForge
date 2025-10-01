import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';
import crypto from 'crypto';

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
}));

const getSignedUrlMock = jest
  .fn()
  .mockImplementation((client, command, { expiresIn }) =>
    Promise.resolve(`https://example.com/${command.input.Key}?expires=${expiresIn}`)
  );
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
  PutItemCommand: jest.fn((input) => ({ input, __type: 'PutItemCommand' }))
}));

jest.unstable_mockModule('../logger.js', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined)
}));
import { generateContentMock } from './mocks/generateContentMock.js';

generateContentMock
  .mockResolvedValueOnce({
    response: {
      text: () =>
        JSON.stringify({
          version1: 'v1',
          version2: 'v2',
          project: 'Example project'
        })
    }
  })
  .mockResolvedValueOnce({ response: { text: () => '' } })
  .mockResolvedValueOnce({ response: { text: () => '' } })
  .mockResolvedValue({
    response: {
      text: () =>
        JSON.stringify({
          cover_letter1: 'cl1',
          cover_letter2: 'cl2'
        })
    }
  });

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
const { default: app, extractText, setGeneratePdf, parseContent, classifyDocument } = serverModule;
const { default: pdfParseMock } = await import('pdf-parse/lib/pdf-parse.js');
const axios = (await import('axios')).default;
setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

beforeEach(() => {
  setupDefaultDynamoMock();
  getSignedUrlMock.mockClear();
  getObjectCommandMock.mockClear();
  wordExtractorExtractMock.mockClear();
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
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
      'PutItemCommand'
    ]);

    setupDefaultDynamoMock();
    mockDynamoSend.mockClear();
    mockS3Send.mockClear();
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              version1: 'v1',
              version2: 'v2',
              project: 'Example project'
            })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              cover_letter1: 'cl1',
              cover_letter2: 'cl2'
            })
        }
      });

    const res2 = await request(app)
      .post('/api/process-cv')
      .set('User-Agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
      )
      .set('X-Forwarded-For', '203.0.113.42')
      .set('X-Vercel-IP-City', 'Mumbai')
      .set('X-Vercel-IP-Country', 'IN')
      .set('X-Vercel-IP-Country-Region', 'MH')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(typeof res2.body.requestId).toBe('string');
    expect(typeof res2.body.jobId).toBe('string');
    expect(res2.body.urlExpiresInSeconds).toBe(3600);
    expect(res2.body.urls).toHaveLength(4);
    expect(res2.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
    expect(typeof res2.body.originalScore).toBe('number');
    expect(typeof res2.body.enhancedScore).toBe('number');
    expect(res2.body.applicantName).toBeTruthy();

    const sanitized = res2.body.applicantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toLowerCase();

    res2.body.urls.forEach(({ type, url, expiresAt }) => {
      expect(url).toContain(`/${sanitized}/cv/`);
      expect(url).toContain('expires=3600');
      expect(() => new Date(expiresAt)).not.toThrow();
      expect(new Date(expiresAt).toString()).not.toBe('Invalid Date');
      if (type.startsWith('cover_letter')) {
        expect(url).toContain('/generated/cover_letter/');
      } else {
        expect(url).toContain('/generated/cv/');
      }
    });

    const pdfKeys = mockS3Send.mock.calls
      .map((c) => c[0]?.input?.Key)
      .filter((k) => k && k.endsWith('.pdf'));
    expect(pdfKeys).toHaveLength(5);
    pdfKeys.forEach((k) => {
      expect(k).toContain(`${sanitized}/cv/`);
    });

    const putCall = mockDynamoSend.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall).toBeTruthy();
    expect(putCall[0].input.TableName).toBe('ResumeForge');
    expect(putCall[0].input.Item.linkedinProfileUrl.S).toBe(
      hash('http://linkedin.com/in/example')
    );
    expect(putCall[0].input.Item.candidateName.S).toBe(hash(res2.body.applicantName));
    expect(putCall[0].input.Item.ipAddress.S).toBe(hash('203.0.113.42'));
    expect(putCall[0].input.Item.userAgent.S).toBe(
      hash(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
      )
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
    expect(putCall[0].input.Item.s3Key.S).toContain(`${sanitized}/cv/`);
    expect(putCall[0].input.Item.s3Url.S).toContain(`${sanitized}/cv/`);
    expect(putCall[0].input.Item.fileType.S).toMatch(/pdf/);
    types = mockDynamoSend.mock.calls.map(([c]) => c.__type);
    expect(types).toEqual(['DescribeTableCommand', 'PutItemCommand']);
  });

  test('prompts for manual job description when scraping fails', async () => {
    axios.get.mockImplementation(() => Promise.reject(new Error('blocked')));

    const failed = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field('jobDescriptionUrl', 'http://example.com/protected')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(failed.status).toBe(400);
    expect(failed.body.success).toBe(false);
    expect(failed.body.error.code).toBe('JOB_DESCRIPTION_FETCH_FAILED');
    expect(failed.body.error.details.manualInputRequired).toBe(true);
    expect(failed.body.error.message).toContain('Unable to fetch JD');

    axios.get.mockImplementation(() => {
      throw new Error('should not fetch when manual description supplied');
    });

    const manual = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field('jobDescriptionUrl', 'http://example.com/protected')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .field('manualJobDescription', 'Manual JD text outlining requirements and responsibilities.')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(manual.status).toBe(200);
    expect(manual.body.success).toBe(true);
    expect(manual.body.jobDescriptionText).toContain('Manual JD text');

    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: 'Job description' });
  });

  test('sanitizes manual job description input before analysis', async () => {
    axios.get.mockImplementation(() => {
      throw new Error('should not fetch when manual description supplied');
    });

    const manual = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      .set('X-Forwarded-For', '198.51.100.5')
      .field('jobDescriptionUrl', 'http://example.com/protected')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
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

    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: 'Job description' });
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
  });

  test('handles code-fenced JSON with extra text', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            '```json\n{"version1":"v1","version2":"v2"}\n``` trailing'
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            '```json\n{"cover_letter1":"cl1","cover_letter2":"cl2"}\n``` noise'
        }
      });

    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
  });

  test('handles JSON surrounded by text', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            'start {"version1":"v1","version2":"v2"} end'
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            'prefix {"cover_letter1":"cl1","cover_letter2":"cl2"} suffix'
        }
      });

    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
  });

  test('uses provided template and ucmo', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ version1: 'v1', version2: 'v2', project: 'Example project' })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: { text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' }) }
      });
    serverModule.generatePdf.mockClear();

    await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .field('template1', 'modern')
      .field('template2', 'professional')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const calls = serverModule.generatePdf.mock.calls;
    const resumeCalls = calls.filter(([, , opts]) => opts && opts.resumeExperience);
    expect(resumeCalls[0][1]).toBe('ucmo');
    expect(resumeCalls[1][1]).toBe('modern');
  });

  test('uses templates array', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ version1: 'v1', version2: 'v2', project: 'Example project' })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: { text: () => JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' }) }
      });
    serverModule.generatePdf.mockClear();

    await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .field('templates', JSON.stringify(['ucmo', 'vibrant']))
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const calls = serverModule.generatePdf.mock.calls;
    const resumeCalls = calls.filter(([, , opts]) => opts && opts.resumeExperience);
    expect(resumeCalls[0][1]).toBe('ucmo');
    expect(resumeCalls[1][1]).toBe('vibrant');
  });

  test('filters AI guidance lines', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              version1:
                'Line1\nConsolidate relevant experience into bullet points.\nLine2',
              version2:
                'Start\nCONSOLIDATE RELEVANT EXPERIENCE IN A SECTION\nEnd'
            })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });
    serverModule.generatePdf.mockClear();

    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
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
  });

  test('resume prompt asks for a project matching job skills', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ version1: 'v1', version2: 'v2', project: 'Example project' })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const prompt = generateContentMock.mock.calls[0][0];
    expect(prompt).toMatch(/fabricate or emphasize one project/i);
  });

  test('inserts project into resume text', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              version1: 'Name',
              version2: 'Name',
              project: 'Built a portfolio site using React'
            })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    const texts = [];
    setGeneratePdf(
      jest.fn((text) => {
        texts.push(text);
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(texts.some((t) => /Built a portfolio site using React/.test(t))).toBe(
      true
    );

    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('adds project section when job description provided', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ version1: 'Name', version2: 'Name' })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
        }
      });

    const texts = [];
    setGeneratePdf(
      jest.fn((text) => {
        texts.push(text);
        return Promise.resolve(Buffer.from('pdf'));
      })
    );

    await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const resumeText = texts.find((t) => /# Projects/.test(t));
    expect(resumeText).toBeTruthy();
    const parsed = parseContent(resumeText);
    const projectSection = parsed.sections.find(
      (s) => s.heading === 'Projects'
    );
    expect(projectSection).toBeTruthy();
    expect(projectSection.items.length).toBeGreaterThan(0);
    expect(projectSection.items.length).toBeLessThanOrEqual(2);

    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('cover letters omit placeholder sections', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ version1: 'v1', version2: 'v2', project: 'Example project' })
        }
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({ cover_letter1: 'cl1', cover_letter2: 'cl2' })
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    const coverCalls = serverModule.generatePdf.mock.calls.filter(
      ([, , opts]) => opts && opts.skipRequiredSections
    );
    expect(coverCalls).toHaveLength(2);

    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('final CV includes updated title, project, and skills', async () => {
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
        response: {
          text: () =>
            JSON.stringify({
              version1:
                'Revised Title\n# Projects\n- Project bullet.\n# Skills\n- Skill A\n- Skill B',
              version2: 'v2',
              project: 'Project bullet.',
            }),
        },
      })
      .mockResolvedValueOnce({ response: { text: () => '' } })
      .mockResolvedValueOnce({ response: { text: () => '' } })
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

    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
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
    expect(typeof res.body.selectionProbability).toBe('number');
    expect(res.body.selectionInsights).toEqual(
      expect.objectContaining({
        probability: expect.any(Number),
        level: expect.any(String),
        message: expect.any(String),
        flags: expect.any(Array),
      })
    );
    process.env.NODE_ENV = 'test';
    setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));
  });

  test('missing file', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example');
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_RESUME_CONTENT',
        message: expect.stringContaining('please upload a correct CV'),
        requestId: expect.any(String),
        jobId: expect.any(String),
        details: expect.objectContaining({
          description: 'an invoice document',
          confidence: expect.any(Number),
        }),
      }),
    });
  });

  test('missing job description URL', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'JOB_DESCRIPTION_URL_REQUIRED',
        message: 'jobDescriptionUrl required',
        requestId: expect.any(String),
        jobId: expect.any(String),
      },
    });
  });

  test('missing linkedin profile URL', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'LINKEDIN_PROFILE_URL_REQUIRED',
        message: 'linkedinProfileUrl required',
        requestId: expect.any(String),
        jobId: expect.any(String),
      },
    });
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
      cover_letter1: 'Cover Letter 1 (PDF)',
      cover_letter2: 'Cover Letter 2 (PDF)',
      version1: 'CV Version 1 (PDF)',
      version2: 'CV Version 2 (PDF)'
    };

    Object.entries(mappings).forEach(([type, label]) => {
      expect(source).toContain(`case '${type}':`);
      expect(source).toContain(`label = '${label}'`);
    });
  });
});
