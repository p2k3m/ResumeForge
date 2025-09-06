import { jest } from '@jest/globals';
import request from 'supertest';

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
  logEvaluation: jest.fn().mockResolvedValue()
}));

jest.unstable_mockModule('../openaiClient.js', () => ({
  uploadFile: jest.fn(),
  requestSectionImprovement: jest.fn(),
  requestEnhancedCV: jest.fn(),
  requestCoverLetter: jest.fn(),
  classifyDocument: jest.fn(),
}));

const app = (await import('../server.js')).default;
const { classifyDocument } = await import('../openaiClient.js');

describe('/api/evaluate non-resume', () => {
  test.each(['cover letter', 'essay'])('rejects %s', async (docType) => {
    classifyDocument.mockResolvedValueOnce(docType);
    const res = await request(app)
      .post('/api/evaluate')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .attach('resume', Buffer.from('dummy'), 'file.pdf');
    expect(res.status).toBe(400);
    expect(res.text).toBe(
      `You have uploaded a ${docType} and not a CV – please upload the correct CV`
    );
    const { logEvaluation } = await import('../services/dynamo.js');
    expect(logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ docType, linkedinProfileUrl: undefined })
    );
  });
});
