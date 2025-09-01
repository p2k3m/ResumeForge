import { jest } from '@jest/globals';
import request from 'supertest';
import fs from 'fs';

const mockS3Send = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((input) => ({ input })),
  GetObjectCommand: jest.fn()
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
          version2: 'v2'
        })
    }
  })
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
  default: jest.fn().mockResolvedValue({ text: 'Education\nExperience\nSkills' })
}));

jest.unstable_mockModule('mammoth', () => ({
  default: {
    extractRawText: jest.fn().mockResolvedValue({ value: 'Docx text' })
  }
}));

const serverModule = await import('../server.js');
const { default: app, extractText, setGeneratePdf, parseContent } = serverModule;
setGeneratePdf(jest.fn().mockResolvedValue(Buffer.from('pdf')));

beforeEach(() => {
  setupDefaultDynamoMock();
});

describe('health check', () => {
  test('GET /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res1.status).toBe(200);
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
              version2: 'v2'
            })
        }
      })
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
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res2.status).toBe(200);
    expect(res2.body.urls).toHaveLength(4);
    expect(res2.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
    expect(res2.body.applicantName).toBeTruthy();

    const sanitized = res2.body.applicantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toLowerCase();

    res2.body.urls.forEach(({ type, url }) => {
      expect(url).toContain('/first/');
      expect(url).toContain(`/${sanitized}/`);
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
      expect(k).toContain('first/');
      expect(k).toContain(`/${sanitized}/`);
    });

    const putCall = mockDynamoSend.mock.calls.find(
      ([cmd]) => cmd.__type === 'PutItemCommand'
    );
    expect(putCall).toBeTruthy();
    expect(putCall[0].input.TableName).toBe('ResumeForge');
    expect(putCall[0].input.Item.linkedinProfileUrl.S).toBe(
      'http://linkedin.com/in/example'
    );
    expect(putCall[0].input.Item.candidateName.S).toBe(res2.body.applicantName);
    expect(putCall[0].input.Item.ipAddress.S).toBe('203.0.113.42');
    expect(putCall[0].input.Item.userAgent.S).toContain('iPhone');
    expect(putCall[0].input.Item.os.S).toBe('iOS');
    expect(putCall[0].input.Item.device.S).toBe('iPhone');
    expect(putCall[0].input.Item.browser.S).toBe('Safari');
    types = mockDynamoSend.mock.calls.map(([c]) => c.__type);
    expect(types).toEqual(['DescribeTableCommand', 'PutItemCommand']);
  });

  test('malformed AI response', async () => {
    generateContentMock.mockResolvedValueOnce({
      response: { text: () => 'not json' }
    });
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AI response invalid');
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

  test('uses template1 and template2', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ version1: 'v1', version2: 'v2' }) }
      })
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
    expect(resumeCalls[0][1]).toBe('modern');
    expect(resumeCalls[1][1]).toBe('professional');
  });

  test('uses templates array', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ version1: 'v1', version2: 'v2' }) }
      })
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
          text: () => JSON.stringify({ version1: 'v1', version2: 'v2' })
        }
      })
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

  test('cover letters omit placeholder sections', async () => {
    generateContentMock.mockReset();
    generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ version1: 'v1', version2: 'v2' }) }
      })
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

  test('missing file', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('resume file required');
  });

  test('unsupported file type', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('text'), 'resume.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only .pdf, .doc, .docx files are allowed');
  });

  test('missing job description URL', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('linkedinProfileUrl', 'http://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('jobDescriptionUrl required');
  });

  test('missing linkedin profile URL', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('linkedinProfileUrl required');
  });
});

describe('extractText', () => {
  test('extracts text from pdf', async () => {
    const file = { originalname: 'file.pdf', buffer: Buffer.from('') };
    await expect(extractText(file)).resolves.toBe('Education\nExperience\nSkills');
  });

  test('extracts text from docx', async () => {
    const file = { originalname: 'file.docx', buffer: Buffer.from('') };
    await expect(extractText(file)).resolves.toBe('Docx text');
  });

  test('extracts text from txt', async () => {
    const file = { originalname: 'file.txt', buffer: Buffer.from('plain') };
    await expect(extractText(file)).resolves.toBe('plain');
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
