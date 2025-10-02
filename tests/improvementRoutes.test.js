import request from 'supertest';
import app from '../server.js';
import { generateContentMock } from './mocks/generateContentMock.js';

const baseResume = [
  'Alex Candidate',
  'Senior Software Engineer',
  '# Summary',
  'Original summary line focused on delivery.',
  '# Skills',
  '- JavaScript',
  '# Experience',
  '- Built scalable services.',
].join('\n');

const jobDescription = [
  'We need a Lead Software Engineer to drive leadership and product execution.',
  'Ideal candidates mentor teams and expand cloud expertise.',
].join(' ');

describe('targeted improvement routes', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it('returns a structured improvement summary for improve-summary', async () => {
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            updatedResume: baseResume.replace(
              'Original summary line focused on delivery.',
              'Refined summary that highlights leadership impact.'
            ),
            beforeExcerpt: 'Original summary line focused on delivery.',
            afterExcerpt: 'Refined summary that highlights leadership impact.',
            explanation: 'Clarified the summary to emphasize leadership.',
            confidence: 0.82,
            changeDetails: [
              {
                section: 'Summary',
                before: '- Original summary line focused on delivery.',
                after: '- Refined summary that highlights leadership impact.',
                reasons: ['Highlights leadership accomplishments.'],
              },
            ],
          }),
      },
    });

    const response = await request(app).post('/api/improve-summary').send({
      resumeText: baseResume,
      jobDescription,
      jobSkills: ['Leadership', 'JavaScript'],
      resumeSkills: ['JavaScript'],
      missingSkills: ['Leadership'],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        type: 'improve-summary',
        title: expect.any(String),
        beforeExcerpt: 'Original summary line focused on delivery.',
        afterExcerpt: 'Refined summary that highlights leadership impact.',
        confidence: expect.any(Number),
        updatedResume: expect.stringContaining('Refined summary'),
        missingSkills: ['Leadership'],
      })
    );

    expect(Array.isArray(response.body.improvementSummary)).toBe(true);
    expect(response.body.improvementSummary[0]).toEqual(
      expect.objectContaining({
        section: 'Summary',
        added: ['Refined summary that highlights leadership impact.'],
        removed: ['Original summary line focused on delivery.'],
        reason: ['Highlights leadership accomplishments.'],
      })
    );
  });

  it('validates required fields for improvement requests', async () => {
    const response = await request(app)
      .post('/api/add-missing-skills')
      .send({ jobDescription });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('IMPROVEMENT_INPUT_REQUIRED');
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});

