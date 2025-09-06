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

const app = (await import('../server.js')).default;

describe('/api/evaluate non-resume', () => {
  test('rejects cover letters', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .attach('resume', Buffer.from('dummy'), 'file.pdf');
    expect(res.status).toBe(400);
    expect(res.text).toBe(
      'You seem to have uploaded cover letter and not a CV – please upload the correct CV'
    );
    const { logEvaluation } = await import('../services/dynamo.js');
    expect(logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        docType: 'cover letter',
        linkedinProfileUrl: undefined,
      })
    );
  });
});
