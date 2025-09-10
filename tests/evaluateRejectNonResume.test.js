import { jest } from '@jest/globals';
import request from 'supertest';

const pdfBuffer = Buffer.from('%PDF-1.4');

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) }
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest.fn().mockResolvedValue({ text: 'Dear team,\nThis is my application.\nSincerely,\nJohn' })
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) }
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
  uploadFile: jest.fn(),
  requestSectionImprovement: jest.fn(),
  requestEnhancedCV: jest.fn(),
  requestCoverLetter: jest.fn(),
  requestAtsAnalysis: jest.fn(),
  requestEvaluation: jest
    .fn()
    .mockResolvedValue({ seniority: 'mid', keywords: { must_have: [], nice_to_have: [] }, tips: {} }),
  extractName: jest.fn(),
  classifyDocument: jest.fn(),
}));

jest.unstable_mockModule('../services/documentClassifier.js', () => ({
  describeDocument: jest.fn(),
}));

const app = (await import('../server.js')).default;
const { classifyDocument } = await import('../openaiClient.js');
const { describeDocument } = await import('../services/documentClassifier.js');

describe('/api/evaluate non-resume', () => {
  test.each(['cover letter', 'essay'])('rejects %s', async (docType) => {
    classifyDocument.mockResolvedValueOnce(docType);
    const res = await request(app)
      .post('/api/evaluate')
      .unset('User-Agent')
      .field('jobUrl', 'https://example.com/job')
      .attach('file', pdfBuffer, 'file.pdf');
    expect(res.status).toBe(400);
    expect(res.text).toBe(
      `You have uploaded a ${docType}. Please upload a CV only.`
    );
    const { logEvaluation } = await import('../services/dynamo.js');
    expect(logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        docType,
        cvKey: expect.any(String),
      })
    );
  });

  test.each(['unknown', ''])('rejects %s document type', async (docType) => {
    classifyDocument.mockResolvedValueOnce(docType);
    describeDocument.mockResolvedValueOnce('essay');
    const res = await request(app)
      .post('/api/evaluate')
      .unset('User-Agent')
      .field('jobUrl', 'https://example.com/job')
      .attach('file', pdfBuffer, 'file.pdf');
    expect(res.status).toBe(400);
    expect(res.text).toBe(
      'This document looks like an essay. Please upload a CV.'
    );
    const { logEvaluation } = await import('../services/dynamo.js');
    expect(logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        docType,
        cvKey: expect.any(String),
      })
    );
  });
});
