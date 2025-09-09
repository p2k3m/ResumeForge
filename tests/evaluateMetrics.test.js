import { jest } from '@jest/globals';
import request from 'supertest';

const pdfBuffer = Buffer.from('%PDF-1.4');

const mockFetchJobDescription = jest.fn().mockResolvedValue('<html></html>');
jest.unstable_mockModule('../services/jobFetch.js', () => ({
  fetchJobDescription: mockFetchJobDescription,
  JD_UNREADABLE: 'JD_UNREADABLE',
  LINKEDIN_AUTH_REQUIRED: 'LINKEDIN_AUTH_REQUIRED',
}));

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
}));

const { JOB_FETCH_USER_AGENT } = await import('../config/http.js');
const serverModule = await import('../server.js');
const app = serverModule.default;

  describe('/api/evaluate metrics', () => {
    test('returns individual ats metrics', async () => {
      const res = await request(app)
        .post('/api/evaluate')
        .unset('User-Agent')
        .field('jobUrl', 'https://indeed.com/job')
        .attach('file', pdfBuffer, 'resume.pdf');
      expect(res.status).toBe(200);
      expect(res.body.scores.metrics).toBeDefined();
      expect(res.body.scores.metrics).toEqual(
        expect.objectContaining({
          layoutSearchability: expect.any(Number),
          atsReadability: expect.any(Number),
          impact: expect.any(Number),
          crispness: expect.any(Number),
          keywordDensity: expect.any(Number),
          sectionHeadingClarity: expect.any(Number),
          contactInfoCompleteness: expect.any(Number),
          grammar: expect.any(Number)
        })
      );
      expect(res.body.scores.cardScores).toBeDefined();
      expect(res.body.scores.overallScore).toEqual(expect.any(Number));
      expect(res.body.selectionProbability).toEqual(expect.any(Number));
      expect(mockFetchJobDescription).toHaveBeenCalledWith(
        'https://indeed.com/job',
        expect.objectContaining({
          timeout: expect.any(Number),
          userAgent: JOB_FETCH_USER_AGENT,
        })
      );
    });
  });
