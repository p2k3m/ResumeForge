import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

describe('end-to-end CV processing', () => {
  test('returns scoring insights without generating downloads', async () => {
    const { app } = await setupTestServer();
    await primeSuccessfulAi();

    const response = await request(app)
      .post('/api/process-cv')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      .set('X-Forwarded-For', '198.51.100.23')
      .field('jobDescriptionUrl', 'https://example.com/job')
      .field('linkedinProfileUrl', 'https://linkedin.com/in/example')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.urlExpiresInSeconds).toBe(0);
    expect(Array.isArray(response.body.urls)).toBe(true);
    expect(response.body.urls).toHaveLength(0);
    expect(typeof response.body.applicantName).toBe('string');
    expect(typeof response.body.originalScore).toBe('number');
    expect(typeof response.body.enhancedScore).toBe('number');
    expect(Array.isArray(response.body.addedSkills)).toBe(true);
    expect(Array.isArray(response.body.missingSkills)).toBe(true);
    expect(typeof response.body.scoreBreakdown).toBe('object');
    expect(Array.isArray(response.body.atsSubScores)).toBe(true);
    expect(response.body.selectionInsights).toEqual(
      expect.objectContaining({
        flags: expect.any(Array),
        jobFitScores: expect.any(Array),
      })
    );
    expect(typeof response.body.selectionProbabilityBefore).toBe('number');
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
      .field('jobDescriptionUrl', 'https://example.com/job')
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_RESUME_CONTENT');
    expect(response.body?.error?.details?.description).toContain('job description');
    expect(response.body?.error?.message).toMatch(/Please upload a correct CV/i);
  });
});
