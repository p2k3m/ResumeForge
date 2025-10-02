import request from 'supertest';
import { setupTestServer } from './utils/testServer.js';

describe('rescore improvement integration', () => {
  test('calculates enhanced score, sub scores, and coverage details', async () => {
    const { app } = await setupTestServer();

    const response = await request(app)
      .post('/api/rescore-improvement')
      .send({
        resumeText: [
          'Summary',
          'Leader in automation and cloud migrations.',
          'Skills',
          '- JavaScript',
          '- AWS',
          'Experience',
          '- Built CI/CD pipelines and automated deployments.',
        ].join('\n'),
        jobDescriptionText:
          'Looking for an engineer with JavaScript, AWS, and testing automation experience.',
        jobSkills: ['JavaScript', 'AWS', 'Automation Testing'],
        previousMissingSkills: ['JavaScript', 'AWS', 'Automation Testing'],
        baselineScore: 45,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.enhancedScore).toBe('number');
    expect(Array.isArray(response.body.atsSubScores)).toBe(true);
    expect(response.body.atsSubScores.length).toBeGreaterThan(0);
    expect(Array.isArray(response.body.table)).toBe(true);
    expect(Array.isArray(response.body.coveredSkills)).toBe(true);
    expect(response.body.coveredSkills).toEqual(expect.arrayContaining(['JavaScript', 'AWS']));
    expect(response.body.missingSkills).toEqual(
      expect.arrayContaining(['Automation Testing'])
    );
    expect(typeof response.body.scoreDelta).toBe('number');
  });
});

