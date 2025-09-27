import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

describe('end-to-end CV processing', () => {
  test('returns signed URLs and scoring insights', async () => {
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
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        urlExpiresInSeconds: 3600,
        urls: expect.any(Array),
        applicantName: expect.any(String),
        originalScore: expect.any(Number),
        enhancedScore: expect.any(Number),
        addedSkills: expect.any(Array),
        missingSkills: expect.any(Array),
      })
    );

    const { urls, applicantName } = response.body;
    expect(urls).toHaveLength(4);
    urls.forEach(({ url, expiresAt }) => {
      expect(url).toMatch(/https:\/\/example.com\//);
      expect(url).toMatch(/expires=3600/);
      expect(() => new Date(expiresAt)).not.toThrow();
    });

    const sanitized = applicantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toLowerCase();
    urls.forEach(({ url }) => {
      expect(url).toContain(`/first/`);
      expect(url).toContain(`/${sanitized}/`);
    });
  });
});
