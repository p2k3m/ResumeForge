import { jest } from '@jest/globals';
import request from 'supertest';

const pdfBuffer = Buffer.from('%PDF-1.4');

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) }
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest
    .fn()
    .mockResolvedValue({ text: 'Experience\n- Engineer at Company\nEducation\n- Uni\nCertifications\n- CertA - OrgA' })
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) }
}));

jest.unstable_mockModule('../services/dynamo.js', () => ({
  logEvaluation: jest.fn().mockResolvedValue()
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
}));

const serverModule = await import('../server.js');
const app = serverModule.default;
jest
  .spyOn(serverModule, 'fetchCredlyProfile')
  .mockResolvedValue([
    { name: 'CertA', provider: 'OrgA' },
    { name: 'CertB', provider: 'OrgB' }
  ]);
describe('/api/evaluate Credly diff', () => {
  test('returns missing Credly certifications', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .unset('User-Agent')
      .field('jobUrl', 'https://example.com/job')
      .field('credlyUrl', 'https://credly.com/u/example')
      .attach('file', pdfBuffer, 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.issues.certifications).toEqual([
      { name: 'CertB', provider: 'OrgB' }
    ]);
    const { logEvaluation } = await import('../services/dynamo.js');
    expect(logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        docType: 'resume',
        cvKey: expect.any(String),
      })
    );
  });
});
