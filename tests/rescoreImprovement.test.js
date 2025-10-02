import request from 'supertest';
import app from '../server.js';

describe('POST /api/rescore-improvement', () => {
  it('recalculates scores and returns score delta', async () => {
    const response = await request(app)
      .post('/api/rescore-improvement')
      .send({
        resumeText: 'Summary\nSkills\n- JavaScript\n- Testing\nExperience\nBuilt applications with automation.\n',
        jobDescriptionText:
          'Looking for an engineer with JavaScript expertise and automation testing experience.',
        jobSkills: ['JavaScript', 'Automation Testing'],
        previousMissingSkills: ['JavaScript', 'Automation Testing'],
        baselineScore: 20
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.enhancedScore).toBe('number');
    expect(Array.isArray(response.body.table)).toBe(true);
    expect(Array.isArray(response.body.missingSkills)).toBe(true);
    expect(Array.isArray(response.body.coveredSkills)).toBe(true);
    expect(Array.isArray(response.body.atsSubScores)).toBe(true);
    expect(response.body.scoreDelta).not.toBeUndefined();
  });

  it('normalizes baseline scores and marks previously missing skills as covered', async () => {
    const response = await request(app)
      .post('/api/rescore-improvement')
      .send({
        resumeText:
          'Summary\nFocused on JavaScript delivery.\nSkills\n- JavaScript\nExperience\nBuilt JS apps.\n',
        jobDescriptionText: 'Seeking engineer with JavaScript and leadership experience.',
        jobSkills: ['JavaScript', 'Leadership'],
        previousMissingSkills: ['JavaScript', 'Leadership'],
        baselineScore: '0'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.enhancedScore).toBe('number');
    expect(Array.isArray(response.body.coveredSkills)).toBe(true);
    expect(response.body.coveredSkills).toContain('JavaScript');
    expect(Array.isArray(response.body.missingSkills)).toBe(true);
    expect(response.body.missingSkills.map((skill) => skill.toLowerCase())).toContain(
      'leadership'
    );
    expect(typeof response.body.scoreDelta).toBe('number');
    expect(response.body.scoreDelta).toBeCloseTo(response.body.enhancedScore, 5);
  });

  it('requires resume text input', async () => {
    const response = await request(app)
      .post('/api/rescore-improvement')
      .send({ jobDescriptionText: 'Example JD' });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('RESCORE_INPUT_REQUIRED');
  });
});
