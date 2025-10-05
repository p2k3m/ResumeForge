import request from 'supertest';
import app, { setS3Client } from '../server.js';
import { generateContentMock } from './mocks/generateContentMock.js';

function primePdfGeneration() {
  generateContentMock.mockResolvedValueOnce({
    response: {
      text: () =>
        JSON.stringify({
          version1: 'Version 1 content',
          version2: 'Version 2 content',
          project: 'Project summary',
        }),
    },
  });
  generateContentMock.mockResolvedValueOnce({ response: { text: () => '' } });
  generateContentMock.mockResolvedValueOnce({ response: { text: () => '' } });
  generateContentMock.mockResolvedValueOnce({
    response: {
      text: () =>
        JSON.stringify({
          cover_letter1: 'Cover letter one',
          cover_letter2: 'Cover letter two',
        }),
    },
  });
}

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
  'We need a Lead Software Engineer to drive leadership and product execution.',
  'Ideal candidates mentor teams and expand cloud expertise.',
].join(' ');

describe('targeted improvement routes', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    setS3Client({
      send: async (command) => {
        const commandName = command?.constructor?.name || '';
        if (commandName === 'GetObjectCommand') {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return {};
      },
    });
  });

  afterAll(() => {
    setS3Client(null);
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
    primePdfGeneration();

    const response = await request(app).post('/api/improve-summary').send({
      jobId: 'job-123',
      linkedinProfileUrl: 'https://linkedin.com/in/example',
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
    expect(typeof response.body.selectionProbabilityBefore).toBe('number');
    expect(typeof response.body.selectionProbabilityAfter).toBe('number');
    expect(typeof response.body.selectionProbabilityDelta).toBe('number');
    expect(response.body.urlExpiresInSeconds).toBe(3600);
    expect(response.body.urls).toHaveLength(5);
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
        })
      );
    });
  });

  it('returns a structured improvement summary for improve-certifications', async () => {
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            updatedResume: baseResume.replace(
              '- AWS Certified Solutions Architect',
              '- AWS Certified Solutions Architect\n- Azure Administrator Associate'
            ),
            beforeExcerpt: '- AWS Certified Solutions Architect',
            afterExcerpt: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
            explanation: 'Elevated certifications for cloud leadership.',
            confidence: 0.77,
            changeDetails: [
              {
                section: 'Certifications',
                before: '- AWS Certified Solutions Architect',
                after: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
                reasons: ['Elevated certifications for cloud leadership.'],
              },
            ],
          }),
      },
    });
    primePdfGeneration();

    const response = await request(app).post('/api/improve-certifications').send({
      jobId: 'job-789',
      linkedinProfileUrl: 'https://linkedin.com/in/example',
      resumeText: baseResume,
      jobDescription,
      knownCertificates: [{ name: 'AWS Certified Solutions Architect' }],
      manualCertificates: [{ name: 'Azure Administrator Associate' }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        type: 'improve-certifications',
        beforeExcerpt: '- AWS Certified Solutions Architect',
        afterExcerpt: '- AWS Certified Solutions Architect\n- Azure Administrator Associate',
        confidence: expect.any(Number),
      })
    );
    expect(Array.isArray(response.body.improvementSummary)).toBe(true);
    expect(response.body.improvementSummary[0]).toEqual(
      expect.objectContaining({
        section: 'Certifications',
        added: expect.arrayContaining(['Azure Administrator Associate']),
        removed: expect.arrayContaining([]),
        reason: ['Elevated certifications for cloud leadership.'],
      })
    );
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
    expect(response.body.urlExpiresInSeconds).toBe(3600);
    expect(response.body.urls).toHaveLength(5);
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
        })
      );
    });
  });

  it('falls back to deterministic align-experience rewrite when AI generation fails', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('Model unavailable'));
    primePdfGeneration();

    const response = await request(app).post('/api/align-experience').send({
      jobId: 'job-123',
      linkedinProfileUrl: 'https://linkedin.com/in/example',
      resumeText: baseResume,
      jobDescription,
      jobSkills: ['Leadership', 'Cloud Architecture', 'JavaScript'],
      resumeSkills: ['JavaScript'],
      missingSkills: ['Leadership', 'Cloud Architecture'],
      jobTitle: 'Lead Software Engineer',
      currentTitle: 'Senior Software Engineer',
    });

    expect(response.status).toBe(200);
    expect(response.body.updatedResume).toContain(
      'Built scalable services — emphasised ownership of Lead Software Engineer priorities across Leadership and Cloud Architecture.'
    );
    expect(response.body.updatedResume).toContain(
      'Partnered with stakeholders to deliver on Lead Software Engineer priorities across Leadership and Cloud Architecture, showcasing measurable outcomes.'
    );
    expect(response.body.explanation).toBe(
      'Rewrote experience bullets to highlight ownership of Lead Software Engineer priorities across Leadership and Cloud Architecture.'
    );
    expect(Array.isArray(response.body.improvementSummary)).toBe(true);
    expect(response.body.improvementSummary[0]).toEqual(
      expect.objectContaining({
        section: 'Work Experience',
        added: expect.arrayContaining([
          'Built scalable services — emphasised ownership of Lead Software Engineer priorities across Leadership and Cloud Architecture.',
          'Partnered with stakeholders to deliver on Lead Software Engineer priorities across Leadership and Cloud Architecture, showcasing measurable outcomes.'
        ]),
        removed: expect.arrayContaining(['Built scalable services.']),
        reason: expect.arrayContaining([
          'Rewrote experience bullets to highlight ownership of Lead Software Engineer priorities across Leadership and Cloud Architecture.'
        ]),
      })
    );
  });

  it('validates required fields for improvement requests', async () => {
    const response = await request(app)
      .post('/api/add-missing-skills')
      .send({ jobDescription, jobId: 'job-456', linkedinProfileUrl: 'https://linkedin.com/in/example' });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('IMPROVEMENT_INPUT_REQUIRED');
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});

