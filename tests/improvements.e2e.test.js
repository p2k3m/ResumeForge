import request from 'supertest';
import { setupTestServer } from './utils/testServer.js';

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
  'Looking for a Lead Software Engineer to guide teams and scale cloud systems.',
  'Must demonstrate leadership and communication skills.',
].join(' ');

const basePayload = {
  resumeText: baseResume,
  jobDescription,
  jobSkills: ['Leadership', 'Cloud Architecture', 'JavaScript'],
  resumeSkills: ['JavaScript'],
  missingSkills: ['Leadership', 'Cloud Architecture'],
  jobTitle: 'Lead Software Engineer',
  currentTitle: 'Senior Software Engineer',
};

describe('targeted improvement endpoints (integration)', () => {
  test('each improvement route returns structured updates and scoring context', async () => {
    const { app } = await setupTestServer();
    const { generateContentMock } = await import('./mocks/generateContentMock.js');

    generateContentMock.mockReset();
    const aiResponses = [
      {
        route: '/api/improve-summary',
        type: 'improve-summary',
        expectation: {
          summary: 'Refined summary spotlighting leadership wins.',
          section: 'Summary',
        },
      },
      {
        route: '/api/add-missing-skills',
        type: 'add-missing-skills',
        expectation: {
          summary: 'Added targeted skills including leadership and cloud.',
          section: 'Skills',
        },
      },
      {
        route: '/api/change-designation',
        type: 'change-designation',
        expectation: {
          summary: 'Aligned title with target role.',
          section: 'Designation',
        },
      },
      {
        route: '/api/align-experience',
        type: 'align-experience',
        expectation: {
          summary: 'Expanded experience bullets for leadership initiatives.',
          section: 'Experience',
        },
      },
      {
        route: '/api/enhance-all',
        type: 'enhance-all',
        expectation: {
          summary: 'Applied holistic improvements across resume sections.',
          section: '',
        },
      },
    ];

    aiResponses.forEach(({ expectation }) => {
      const updated = baseResume
        .replace('Original summary line focused on delivery.', expectation.summary)
        .replace('Senior Software Engineer', 'Lead Software Engineer');
      generateContentMock.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              updatedResume: updated,
              beforeExcerpt: 'Original summary line focused on delivery.',
              afterExcerpt: expectation.summary,
              explanation: expectation.summary,
              confidence: 0.74,
              changeDetails: [
                {
                  section: expectation.section || 'Summary',
                  before: '- Original summary line focused on delivery.',
                  after: `- ${expectation.summary}`,
                  reasons: [expectation.summary],
                },
              ],
            }),
        },
      });
    });

    for (const { route, type, expectation } of aiResponses) {
      const response = await request(app)
        .post(route)
        .send({
          ...basePayload,
          jobTitle: basePayload.jobTitle,
          currentTitle: basePayload.currentTitle,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.type).toBe(type);
      expect(typeof response.body.confidence).toBe('number');
      expect(Array.isArray(response.body.missingSkills)).toBe(true);
      expect(Array.isArray(response.body.improvementSummary)).toBe(true);
      expect(response.body.improvementSummary.length).toBeGreaterThan(0);
      const summaryEntry = response.body.improvementSummary[0];
      if (expectation.section) {
        expect(summaryEntry.section).toMatch(new RegExp(expectation.section, 'i'));
      }
      expect(summaryEntry.reason.join(' ')).toContain(expectation.summary.split(' ')[0]);
    }

    expect(generateContentMock).toHaveBeenCalledTimes(aiResponses.length);
  });
});

