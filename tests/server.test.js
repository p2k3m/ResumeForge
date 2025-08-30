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

const { default: app, extractText } = await import('../server.js');

describe('health check', () => {
  test('GET /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('/api/process-cv', () => {
  test('successful processing', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.urls).toHaveLength(4);
    expect(res.body.urls.map((u) => u.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'version1',
      'version2'
    ]);
    expect(res.body.applicantName).toBeTruthy();

    const sanitized = res.body.applicantName.replace(/\s+/g, '_');

    // Returned URLs should contain applicant-specific and type-based paths
    res.body.urls.forEach(({ type, url }) => {
      expect(url).toContain(`/${sanitized}/`);
      expect(url).not.toContain('/first/');
      if (type.startsWith('cover_letter')) {
        expect(url).toContain('/generated/cover_letter/');
      } else {
        expect(url).toContain('/generated/cv/');
      }
    });

    // All uploaded PDFs should use applicant-specific S3 keys
    const pdfKeys = mockS3Send.mock.calls
      .map((c) => c[0]?.input?.Key)
      .filter((k) => k && k.endsWith('.pdf'));
    expect(pdfKeys).toHaveLength(5);
    pdfKeys.forEach((k) => {
      expect(k).toContain(`/${sanitized}/`);
      expect(k).not.toContain('/first/');
    });
  });

  test('malformed AI response', async () => {
    generateContentMock.mockResolvedValueOnce({
      response: { text: () => 'not json' }
    });
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AI response invalid');
  });

  test('missing file', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('resume file required');
  });

  test('unsupported file type', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .field('jobDescriptionUrl', 'http://example.com')
      .attach('resume', Buffer.from('text'), 'resume.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only .pdf, .doc, .docx files are allowed');
  });

  test('missing job description URL', async () => {
    const res = await request(app)
      .post('/api/process-cv')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('jobDescriptionUrl required');
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
