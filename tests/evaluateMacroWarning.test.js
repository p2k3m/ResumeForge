import { jest } from '@jest/globals';
import request from 'supertest';

const pdfBuffer = Buffer.from('%PDF-1.4vbaproject');

const mockFetchJobDescription = jest.fn().mockResolvedValue('<html></html>');
jest.unstable_mockModule('../services/jobFetch.js', () => ({
  fetchJobDescription: mockFetchJobDescription,
  JD_UNREADABLE: 'JD_UNREADABLE',
  LINKEDIN_AUTH_REQUIRED: 'LINKEDIN_AUTH_REQUIRED',
}));

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) },
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest.fn().mockResolvedValue({ text: 'Experience\n- Engineer\nEducation\n- Uni' }),
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) },
}));

jest.unstable_mockModule('../services/dynamo.js', () => ({
  logEvaluation: jest.fn().mockResolvedValue(),
  logSession: jest.fn().mockResolvedValue(),
}));

const mockS3Send = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((input) => ({ input })),
  GetObjectCommand: jest.fn((input) => ({ input })),
}));

jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../openaiClient.js', () => ({
  classifyDocument: jest.fn().mockResolvedValue('resume'),
  requestAtsAnalysis: jest.fn().mockRejectedValue(new Error('no ai')),
  requestEvaluation: jest
    .fn()
    .mockResolvedValue({ seniority: 'mid', keywords: { must_have: [], nice_to_have: [] }, tips: {} }),
  uploadFile: jest.fn(),
  requestSectionImprovement: jest.fn(),
  requestEnhancedCV: jest.fn(),
  requestCoverLetter: jest.fn(),
  extractName: jest.fn(),
}));

const app = (await import('../server.js')).default;

describe('/api/evaluate macro warning', () => {
  test('includes macroWarning flag when macros detected', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .unset('User-Agent')
      .field('jobUrl', 'https://indeed.com/job')
      .attach('file', pdfBuffer, 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.macroWarning).toBe(true);
  });
});

