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
        scoreBreakdown: expect.any(Object),
        selectionProbability: expect.any(Number),
        selectionInsights: expect.objectContaining({
          probability: expect.any(Number),
          flags: expect.any(Array),
        }),
      })
    );

    const { urls, applicantName } = response.body;
    expect(urls).toHaveLength(5);
    expect(urls.map((item) => item.type).sort()).toEqual([
      'cover_letter1',
      'cover_letter2',
      'original_upload',
      'version1',
      'version2'
    ]);
    urls.forEach(({ type, url, expiresAt }) => {
      expect(url).toMatch(/https:\/\/example.com\//);
      expect(url).toMatch(/expires=3600/);
      expect(() => new Date(expiresAt)).not.toThrow();
      if (type === 'original_upload') {
        expect(url).not.toContain('/generated/');
      }
    });

    const sanitized = applicantName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('_')
      .toLowerCase();
    urls.forEach(({ url, type }) => {
      expect(url).toContain(`/${sanitized}/cv/`);
      if (type !== 'original_upload') {
        expect(url).toContain('/generated/');
      }
    });
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
    expect(response.body?.message).toMatch(/Please upload a correct CV/i);
  });
});
