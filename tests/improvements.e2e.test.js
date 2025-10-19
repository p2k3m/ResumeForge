import request from 'supertest';
import { setupTestServer } from './utils/testServer.js';

const baseResume = [
  'Alex Candidate',
  'Senior Software Engineer',
  '# Summary',
  'Original summary line focused on delivery.',
  '# Skills',
  '- JavaScript',
  '# Projects',
  '- Delivered analytics dashboard for leadership.',
  '# Highlights',
  '- Recognised for 20% adoption growth.',
  '# Experience',
  '- Built scalable services.',
  '# Certifications',
  '- AWS Certified Solutions Architect',
].join('\n');

const jobDescription = [
  'Looking for a Lead Software Engineer to guide teams and scale cloud systems.',
  'Must demonstrate leadership and communication skills.',
].join(' ');

const basePayload = {
  jobId: 'job-test-1',
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
        section: 'Summary',
        beforeExcerpt: 'Original summary line focused on delivery.',
        afterExcerpt: 'Refined summary spotlighting leadership wins.',
        explanation: 'Refined summary spotlighting leadership wins.',
        mutations: [
          {
            target: 'Original summary line focused on delivery.',
            value: 'Refined summary spotlighting leadership wins.',
          },
        ],
        changeDetails: [
          {
            section: 'Summary',
            before: '- Original summary line focused on delivery.',
            after: '- Refined summary spotlighting leadership wins.',
            reasons: ['Refined summary spotlighting leadership wins.'],
          },
        ],
      },
      {
        route: '/api/add-missing-skills',
        type: 'add-missing-skills',
        section: 'Skills',
        beforeExcerpt: '- JavaScript',
        afterExcerpt: '- JavaScript\n- Leadership',
        explanation: 'Added targeted skills including leadership and cloud.',
        mutations: [
          {
            target: '- JavaScript',
            value: '- JavaScript\n- Leadership',
          },
        ],
        changeDetails: [
          {
            section: 'Skills',
            before: '- JavaScript',
            after: '- JavaScript\n- Leadership',
            reasons: ['Added targeted skills including leadership and cloud.'],
          },
        ],
      },
      {
        route: '/api/improve-skills',
        type: 'add-missing-skills',
        section: 'Skills',
        beforeExcerpt: '- JavaScript',
        afterExcerpt: '- JavaScript\n- Leadership',
        explanation: 'Added targeted skills including leadership and cloud.',
        mutations: [
          {
            target: '- JavaScript',
            value: '- JavaScript\n- Leadership',
          },
        ],
        changeDetails: [
          {
            section: 'Skills',
            before: '- JavaScript',
            after: '- JavaScript\n- Leadership',
            reasons: ['Added targeted skills including leadership and cloud.'],
          },
        ],
      },
      {
        route: '/api/change-designation',
        type: 'change-designation',
        section: 'Designation',
        beforeExcerpt: 'Senior Software Engineer',
        afterExcerpt: 'Lead Software Engineer',
        explanation: 'Aligned title with target role.',
        mutations: [
          {
            target: 'Senior Software Engineer',
            value: 'Lead Software Engineer',
          },
        ],
        changeDetails: [
          {
            section: 'Designation',
            before: 'Senior Software Engineer',
            after: 'Lead Software Engineer',
            reasons: ['Aligned title with target role.'],
          },
        ],
      },
      {
        route: '/api/improve-designation',
        type: 'change-designation',
        section: 'Designation',
        beforeExcerpt: 'Senior Software Engineer',
        afterExcerpt: 'Lead Software Engineer',
        explanation: 'Aligned title with target role.',
        mutations: [
          {
            target: 'Senior Software Engineer',
            value: 'Lead Software Engineer',
          },
        ],
        changeDetails: [
          {
            section: 'Designation',
            before: 'Senior Software Engineer',
            after: 'Lead Software Engineer',
            reasons: ['Aligned title with target role.'],
          },
        ],
      },
      {
        route: '/api/align-experience',
        type: 'align-experience',
        section: 'Experience',
        beforeExcerpt: '- Built scalable services.',
        afterExcerpt: '- Built scalable services.\n- Expanded leadership initiatives.',
        explanation: 'Expanded experience bullets for leadership initiatives.',
        mutations: [
          {
            target: '- Built scalable services.',
            value: '- Built scalable services.\n- Expanded leadership initiatives.',
          },
        ],
        changeDetails: [
          {
            section: 'Experience',
            before: '- Built scalable services.',
            after: '- Built scalable services.\n- Expanded leadership initiatives.',
            reasons: ['Expanded experience bullets for leadership initiatives.'],
          },
        ],
      },
      {
        route: '/api/improve-experience',
        type: 'align-experience',
        section: 'Experience',
        beforeExcerpt: '- Built scalable services.',
        afterExcerpt: '- Built scalable services.\n- Expanded leadership initiatives.',
        explanation: 'Expanded experience bullets for leadership initiatives.',
        mutations: [
          {
            target: '- Built scalable services.',
            value: '- Built scalable services.\n- Expanded leadership initiatives.',
          },
        ],
        changeDetails: [
          {
            section: 'Experience',
            before: '- Built scalable services.',
            after: '- Built scalable services.\n- Expanded leadership initiatives.',
            reasons: ['Expanded experience bullets for leadership initiatives.'],
          },
        ],
      },
      {
        route: '/api/improve-certifications',
        type: 'improve-certifications',
        section: 'Certifications',
        beforeExcerpt: '- AWS Certified Solutions Architect',
        afterExcerpt: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
        explanation: 'Elevated certifications for cloud leadership.',
        mutations: [
          {
            target: '- AWS Certified Solutions Architect',
            value: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
          },
        ],
        changeDetails: [
          {
            section: 'Certifications',
            before: '- AWS Certified Solutions Architect',
            after: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
            reasons: ['Elevated certifications for cloud leadership.'],
          },
        ],
      },
      {
        route: '/api/improve-projects',
        type: 'improve-projects',
        section: 'Projects',
        beforeExcerpt: '- Delivered analytics dashboard for leadership.',
        afterExcerpt: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
        explanation: 'Spotlighted projects that match role priorities.',
        mutations: [
          {
            target: '- Delivered analytics dashboard for leadership.',
            value: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
          },
        ],
        changeDetails: [
          {
            section: 'Projects',
            before: '- Delivered analytics dashboard for leadership.',
            after: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
            reasons: ['Spotlighted projects that match role priorities.'],
          },
        ],
      },
      {
        route: '/api/improve-highlights',
        type: 'improve-highlights',
        section: 'Highlights',
        beforeExcerpt: '- Recognised for 20% adoption growth.',
        afterExcerpt: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
        explanation: 'Reinforced highlights with quantified wins tied to the JD success metrics.',
        mutations: [
          {
            target: '- Recognised for 20% adoption growth.',
            value: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
          },
        ],
        changeDetails: [
          {
            section: 'Highlights',
            before: '- Recognised for 20% adoption growth.',
            after: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
            reasons: ['Reinforced highlights with quantified wins tied to the JD success metrics.'],
          },
        ],
      },
      {
        route: '/api/enhance-all',
        type: 'enhance-all',
        section: '',
        beforeExcerpt: 'Original summary line focused on delivery.',
        afterExcerpt: 'Applied holistic improvements across resume sections.',
        explanation: 'Applied holistic improvements across resume sections.',
        mutations: [
          {
            target: 'Original summary line focused on delivery.',
            value: 'Applied holistic improvements across resume sections.',
          },
          {
            target: '- JavaScript',
            value: '- JavaScript\n- Leadership',
          },
          {
            target: '- Delivered analytics dashboard for leadership.',
            value: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
          },
          {
            target: '- Recognised for 20% adoption growth.',
            value: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
          },
          {
            target: '- Built scalable services.',
            value: '- Built scalable services.\n- Expanded leadership initiatives.',
          },
          {
            target: '- AWS Certified Solutions Architect',
            value: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
          },
        ],
        changeDetails: [
          {
            section: 'Summary',
            before: '- Original summary line focused on delivery.',
            after: '- Applied holistic improvements across resume sections.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Skills',
            before: '- JavaScript',
            after: '- JavaScript\n- Leadership',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Projects',
            before: '- Delivered analytics dashboard for leadership.',
            after: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Highlights',
            before: '- Recognised for 20% adoption growth.',
            after: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Work Experience',
            before: '- Built scalable services.',
            after: '- Built scalable services.\n- Expanded leadership initiatives.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Certifications',
            before: '- AWS Certified Solutions Architect',
            after: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
        ],
      },
      {
        route: '/api/improve-ats',
        type: 'enhance-all',
        section: '',
        beforeExcerpt: 'Original summary line focused on delivery.',
        afterExcerpt: 'Applied holistic improvements across resume sections.',
        explanation: 'Applied holistic improvements across resume sections.',
        mutations: [
          {
            target: 'Original summary line focused on delivery.',
            value: 'Applied holistic improvements across resume sections.',
          },
          {
            target: '- JavaScript',
            value: '- JavaScript\n- Leadership',
          },
          {
            target: '- Delivered analytics dashboard for leadership.',
            value: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
          },
          {
            target: '- Recognised for 20% adoption growth.',
            value: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
          },
          {
            target: '- Built scalable services.',
            value: '- Built scalable services.\n- Expanded leadership initiatives.',
          },
          {
            target: '- AWS Certified Solutions Architect',
            value: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
          },
        ],
        changeDetails: [
          {
            section: 'Summary',
            before: '- Original summary line focused on delivery.',
            after: '- Applied holistic improvements across resume sections.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Skills',
            before: '- JavaScript',
            after: '- JavaScript\n- Leadership',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Projects',
            before: '- Delivered analytics dashboard for leadership.',
            after: '- Delivered analytics dashboard for leadership.\n- Added cloud migration case study.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Highlights',
            before: '- Recognised for 20% adoption growth.',
            after: '- Recognised for 20% adoption growth.\n- Spotlighted quantified wins for JD success metrics.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Work Experience',
            before: '- Built scalable services.',
            after: '- Built scalable services.\n- Expanded leadership initiatives.',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
          {
            section: 'Certifications',
            before: '- AWS Certified Solutions Architect',
            after: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
            reasons: ['Applied holistic improvements across resume sections.'],
          },
        ],
      },
    ];

    aiResponses.forEach(({ mutations = [], beforeExcerpt, afterExcerpt, explanation, changeDetails }) => {
      const replacements = mutations.length
        ? mutations
        : [{ target: beforeExcerpt, value: afterExcerpt }];
      const updated = replacements.reduce((text, mutation) => text.replace(mutation.target, mutation.value), baseResume);
      generateContentMock.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              updatedResume: updated,
              beforeExcerpt,
              afterExcerpt,
              explanation,
              confidence: 0.74,
              changeDetails,
            }),
        },
      });
    });

    for (const { route, type, section, explanation } of aiResponses) {
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
      expect(typeof response.body.originalTitle).toBe('string');
      expect(typeof response.body.modifiedTitle).toBe('string');
      expect(response.body.originalTitle).toBe(basePayload.currentTitle);
      if (type === 'change-designation' || type === 'enhance-all') {
        expect(response.body.modifiedTitle).toBe(basePayload.jobTitle);
      } else {
        expect(response.body.modifiedTitle).toBe(response.body.originalTitle);
      }
      expect(typeof response.body.confidence).toBe('number');
      expect(Array.isArray(response.body.missingSkills)).toBe(true);
      expect(Array.isArray(response.body.improvementSummary)).toBe(true);
      expect(response.body.improvementSummary.length).toBeGreaterThan(0);
      const summaryEntry = response.body.improvementSummary[0];
      if (section) {
        expect(summaryEntry.section).toMatch(new RegExp(section, 'i'));
      }
      if (explanation) {
        expect(summaryEntry.reason.join(' ')).toContain(explanation.split(' ')[0]);
      }
      expect(response.body.rescore).toEqual(
        expect.objectContaining({
          section: expect.objectContaining({
            key: expect.any(String),
            label: expect.any(String),
            before: expect.objectContaining({ score: expect.any(Number) }),
            after: expect.objectContaining({ score: expect.any(Number) }),
            delta: expect.objectContaining({ score: expect.any(Number) }),
          }),
          overall: expect.objectContaining({
            before: expect.objectContaining({
              score: expect.any(Number),
              atsSubScores: expect.any(Array),
            }),
            after: expect.objectContaining({
              score: expect.any(Number),
              atsSubScores: expect.any(Array),
            }),
            delta: expect.objectContaining({ score: expect.any(Number) }),
          }),
          selectionProbability: expect.objectContaining({
            before: expect.any(Number),
            after: expect.any(Number),
            delta: expect.any(Number),
          }),
        })
      );
      expect(response.body.scores).toEqual(
        expect.objectContaining({
          recordedAt: expect.any(String),
          match: expect.objectContaining({
            before: expect.objectContaining({ score: expect.any(Number) }),
            after: expect.objectContaining({ score: expect.any(Number) }),
            delta: expect.objectContaining({ score: expect.any(Number) }),
          }),
          ats: expect.objectContaining({
            before: expect.objectContaining({ score: expect.any(Number) }),
            after: expect.objectContaining({ score: expect.any(Number) }),
            delta: expect.objectContaining({ score: expect.any(Number) }),
          }),
        })
      );
      expect(typeof response.body.scores.selectionProbabilityBefore).toBe('number');
      expect(typeof response.body.scores.selectionProbabilityAfter).toBe('number');
      expect(typeof response.body.scores.selectionProbabilityDelta).toBe('number');
      expect(typeof response.body.selectionProbabilityBefore).toBe('number');
      expect(typeof response.body.selectionProbabilityAfter).toBe('number');
      expect(typeof response.body.selectionProbabilityDelta).toBe('number');
      expect(response.body.urlExpiresInSeconds).toBe(3600);
      expect(Array.isArray(response.body.urls)).toBe(true);
      const assetTypes = response.body.urls.map((entry) => entry.type).sort();
      expect(assetTypes).toEqual([
        'cover_letter1',
        'cover_letter2',
        'original_upload',
        'version1',
        'version2',
      ]);
      response.body.urls.forEach((entry) => {
        expect(entry).toEqual(
          expect.objectContaining({
            type: expect.any(String),
            url: expect.stringMatching(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600$/),
            fileUrl: expect.stringMatching(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600$/),
            typeUrl: expect.stringMatching(/\.pdf\?X-Amz-Signature=[^&]+&X-Amz-Expires=3600#.+$/),
          })
        );
        const fragment = entry.typeUrl.slice(entry.typeUrl.indexOf('#') + 1);
        expect(decodeURIComponent(fragment)).toBe(entry.type);
      });
    }

    expect(generateContentMock).toHaveBeenCalledTimes(aiResponses.length);
  });

  test('improve-highlights fallback references JD-specified LLM vendors', async () => {
    const { app } = await setupTestServer();
    const { generateContentMock } = await import('./mocks/generateContentMock.js');

    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({ response: { text: () => 'not-json' } });

    const llmJobDescription = [
      'Drive enterprise LLM adoption with measurable outcomes.',
      'Experience orchestrating OpenAI and Gemini platforms is mandatory.',
    ].join(' ');

    const response = await request(app)
      .post('/api/improve-highlights')
      .send({
        ...basePayload,
        resumeText: baseResume,
        jobDescription: llmJobDescription,
        jobSkills: ['LLM integration', 'OpenAI', 'Gemini'],
        missingSkills: ['LLM integration'],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.afterExcerpt).toContain('Quantified OpenAI and Gemini LLMs impact hitting');
    expect(response.body.explanation).toContain('OpenAI and Gemini LLMs');
    expect(response.body.updatedResume).toContain('Quantified OpenAI and Gemini LLMs impact hitting');
  });
});

