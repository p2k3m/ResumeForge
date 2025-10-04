import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const MANUAL_JOB_DESCRIPTION = `
We are hiring a backend engineer to build APIs, manage cloud infrastructure, and mentor teammates.
Deliver resilient services, partner with product, and drive continuous improvement.
`;

describe('end-to-end CV processing', () => {
  test('returns scoring insights without generating downloads', async () => {
    const { app } = await setupTestServer();
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      .set('X-Forwarded-For', '198.51.100.23')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.urlExpiresInSeconds).toBe(3600);
    expect(Array.isArray(response.body.urls)).toBe(true);
    expect(response.body.urls).toHaveLength(5);
    response.body.urls.forEach((entry) => {
      expect(entry).toEqual(
        expect.objectContaining({
          type: expect.any(String),
          url: expect.stringContaining('https://'),
        })
      );
    });
    expect(typeof response.body.applicantName).toBe('string');
    expect(typeof response.body.originalScore).toBe('number');
    expect(typeof response.body.enhancedScore).toBe('number');
    expect(typeof response.body.atsScoreBefore).toBe('number');
    expect(typeof response.body.atsScoreAfter).toBe('number');
    expect(response.body.atsScoreBefore).toBe(response.body.originalScore);
    expect(response.body.atsScoreAfter).toBe(response.body.enhancedScore);
    expect(Array.isArray(response.body.addedSkills)).toBe(true);
    expect(Array.isArray(response.body.missingSkills)).toBe(true);
    expect(typeof response.body.scoreBreakdown).toBe('object');
    expect(Array.isArray(response.body.atsSubScores)).toBe(true);
    expect(Array.isArray(response.body.atsSubScoresBefore)).toBe(true);
    expect(response.body.atsSubScoresBefore.length).toBeGreaterThan(0);
    expect(response.body.selectionInsights).toEqual(
      expect.objectContaining({
        flags: expect.any(Array),
        jobFitScores: expect.any(Array),
      })
    );
    expect(typeof response.body.selectionProbabilityBefore).toBe('number');
    const selectionProbabilityAfter = response.body.selectionProbabilityAfter;
    expect(
      selectionProbabilityAfter === null || typeof selectionProbabilityAfter === 'number'
    ).toBe(true);
    const probability = response.body.selectionInsights.probability;
    expect(probability === null || typeof probability === 'number').toBe(true);
    expect(response.body.selectionInsights.before).toEqual(
      expect.objectContaining({ probability: expect.any(Number), level: expect.any(String) })
    );
    expect(response.body.selectionInsights.after).toEqual(
      expect.objectContaining({ probability: expect.any(Number), level: expect.any(String) })
    );
  });

  test('rejects uploads that are classified as job descriptions', async () => {
    const { app } = await setupTestServer({
      pdfText: [
        'Senior Product Manager',
        'Responsibilities:',
        '- Define the product roadmap and lead execution.',
        'Qualifications:',
        '- 7+ years of product leadership experience.',
        'Benefits include comprehensive healthcare.',
      ].join('\n'),
    });

    const response = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15')
      .set('X-Forwarded-For', '198.51.100.24')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_RESUME_CONTENT');
    expect(response.body?.error?.details?.description).toContain('job description');
    expect(response.body?.error?.message).toMatch(/Please upload a correct CV/i);
  });

  test('reuses the last selected template for returning users', async () => {
    const { app } = await setupTestServer();

    await primeSuccessfulAi();

    const initialResponse = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .field('userId', 'user-123')
      .field('template', 'professional')
      .field('templateId', 'professional')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body?.templateContext?.selectedTemplate).toBe(
      'professional'
    );

    await primeSuccessfulAi();

    const followUpResponse = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15')
      .field('manualJobDescription', MANUAL_JOB_DESCRIPTION)
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .field('userId', 'user-123')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(followUpResponse.status).toBe(200);
    expect(followUpResponse.body?.templateContext?.selectedTemplate).toBe(
      'professional'
    );
  });
});
