import { jest } from '@jest/globals';
import request from 'supertest';

const pdfBuffer = Buffer.from('%PDF-1.4');

const mockS3Send = jest.fn().mockResolvedValue({});
const PutObjectCommand = jest.fn((input) => ({ input }));
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand,
  GetObjectCommand: jest.fn((input) => ({ input })),
}));

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) },
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest
    .fn()
    .mockResolvedValue({ text: 'John Doe\nExperience\n- Engineer at Company\nEducation\n- Uni' }),
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) },
}));

jest.unstable_mockModule('../services/dynamo.js', () => ({
  logEvaluation: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../openaiClient.js', () => ({
  classifyDocument: jest.fn().mockResolvedValue('resume'),
  requestAtsAnalysis: jest.fn().mockRejectedValue(new Error('no ai')),
}));

const serverModule = await import('../server.js');
const app = serverModule.default;
describe('/api/evaluate S3 upload', () => {
  test('uploads resume to S3 with expected key', async () => {
    PutObjectCommand.mockClear();
    const res = await request(app)
      .post('/api/evaluate')
      .unset('User-Agent')
      .field('jobUrl', 'https://example.com/job')
      .field('applicantName', 'John Doe')
      .attach('file', pdfBuffer, 'resume.pdf');
    expect(res.status).toBe(200);
    expect(PutObjectCommand).toHaveBeenCalled();
    const key = PutObjectCommand.mock.calls[0][0].Key;
    expect(key).toMatch(/^john_doe\/\d{4}-\d{2}-\d{2}\/[^/]+\/original\/\d+-john_doe\.pdf$/);
  });
});
