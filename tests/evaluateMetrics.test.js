import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn().mockResolvedValue({ data: '' }) }
}));

jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest.fn().mockResolvedValue({ text: 'Experience\n- Engineer at Company\nEducation\n- Uni' })
}));

jest.unstable_mockModule('mammoth', () => ({
  default: { extractRawText: jest.fn().mockResolvedValue({ value: '' }) }
}));

jest.unstable_mockModule('../services/dynamo.js', () => ({
  logEvaluation: jest.fn().mockResolvedValue()
}));

const serverModule = await import('../server.js');
const app = serverModule.default;

describe('/api/evaluate metrics', () => {
  test('returns individual ats metrics', async () => {
    const res = await request(app)
      .post('/api/evaluate')
      .field('jobDescriptionUrl', 'https://indeed.com/job')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');
    expect(res.status).toBe(200);
    expect(res.body.atsMetrics).toBeDefined();
    expect(res.body.atsMetrics).toEqual(
      expect.objectContaining({
        layoutSearchability: expect.any(Number),
        atsReadability: expect.any(Number),
        impact: expect.any(Number),
        crispness: expect.any(Number),
        keywordDensity: expect.any(Number),
        sectionHeadingClarity: expect.any(Number),
        contactInfoCompleteness: expect.any(Number)
      })
    );
  });
});
