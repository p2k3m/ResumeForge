import request from 'supertest';
import { setupTestServer } from './utils/testServer.js';
import { generateContentMock } from './mocks/generateContentMock.js';

const PDF_RESUME_TEXT = [
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

const JOB_DESCRIPTION = [
  'We are hiring a Lead Software Engineer to guide platform migrations and coaching.',
  'Success looks like uplifting team delivery, improving reliability, and scaling cloud services.',
].join(' ');

const TARGET_JOB_SKILLS = ['Leadership', 'Cloud Architecture', 'JavaScript'];


function extractTypes(urls = []) {
  return urls.map((entry) => entry.type).filter(Boolean);
}

describe.skip('upload to download flow (e2e)', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    generateContentMock.mockImplementation(() =>
      Promise.resolve({ response: { text: () => '' } })
    );
  });

  test('enables upload, scoring, improvement, generation, and download steps', async () => {
    const { app, mocks } = await setupTestServer({
      pdfText: PDF_RESUME_TEXT,
      allowedOrigins: 'https://app.resumeforge.test',
    });

    const uploadResponse = await request(app)
      .post('/api/process-cv')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
      .set('X-Forwarded-For', '198.51.100.50')
      .field('manualJobDescription', JOB_DESCRIPTION)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.success).toBe(true);
    expect(typeof uploadResponse.body.jobId).toBe('string');
    expect(uploadResponse.body.jobId.length).toBeGreaterThan(10);
    expect(typeof uploadResponse.body.originalScore).toBe('number');
    expect(typeof uploadResponse.body.enhancedScore).toBe('number');
    expect(typeof uploadResponse.body.atsScoreBefore).toBe('number');
    expect(typeof uploadResponse.body.atsScoreAfter).toBe('number');
    expect(uploadResponse.body.atsScoreBefore).toBeGreaterThanOrEqual(0);
    expect(uploadResponse.body.atsScoreBefore).toBeLessThanOrEqual(100);
    expect(uploadResponse.body.atsScoreAfter).toBeGreaterThanOrEqual(0);
    expect(uploadResponse.body.atsScoreAfter).toBeLessThanOrEqual(100);
    expect(typeof uploadResponse.body.atsScoreBeforeExplanation).toBe('string');
    expect(typeof uploadResponse.body.atsScoreAfterExplanation).toBe('string');

    const uploadTypes = extractTypes(uploadResponse.body.urls);
    expect(uploadTypes).toEqual(
      expect.arrayContaining([
        'original_upload',
        'version1',
        'version2',
        'cover_letter1',
        'cover_letter2',
      ])
    );

    const jobId = uploadResponse.body.jobId;
    const resumeText = uploadResponse.body.resumeText || uploadResponse.body.originalResumeText;
    const jobDescriptionText =
      uploadResponse.body.jobDescriptionText || JOB_DESCRIPTION;
    const jobSkills =
      uploadResponse.body.jobSkills && uploadResponse.body.jobSkills.length
        ? uploadResponse.body.jobSkills
        : TARGET_JOB_SKILLS;
    const resumeSkills =
      uploadResponse.body.resumeSkills && uploadResponse.body.resumeSkills.length
        ? uploadResponse.body.resumeSkills
        : ['JavaScript'];
    const missingSkills =
      uploadResponse.body.missingSkills && uploadResponse.body.missingSkills.length
        ? uploadResponse.body.missingSkills
        : TARGET_JOB_SKILLS.filter((skill) => !resumeSkills.includes(skill));

    const improvementResponse = await request(app).post('/api/enhance-all').send({
      jobId,
      resumeText,
      jobDescription: jobDescriptionText,
      jobSkills,
      resumeSkills,
      missingSkills,
      jobTitle: 'Lead Software Engineer',
      currentTitle: uploadResponse.body.originalTitle || 'Senior Software Engineer',
      originalTitle: uploadResponse.body.originalTitle || 'Senior Software Engineer',
      manualCertificates: uploadResponse.body.manualCertificates || [],
    });

    expect(improvementResponse.status).toBe(200);
    expect(improvementResponse.body.success).toBe(true);
    expect(improvementResponse.body.type).toBe('enhance-all');
    expect(typeof improvementResponse.body.updatedResume).toBe('string');
    expect(improvementResponse.body.updatedResume).toContain('Forward-looking Lead Software Engineer');
    expect(improvementResponse.body.updatedResume).toContain('Spotlighted quantified wins');
    expect(improvementResponse.body.scores).toEqual(
      expect.objectContaining({
        match: expect.objectContaining({
          before: expect.objectContaining({ score: expect.any(Number) }),
          after: expect.objectContaining({ score: expect.any(Number) }),
        }),
        ats: expect.objectContaining({
          before: expect.objectContaining({ score: expect.any(Number) }),
          after: expect.objectContaining({ score: expect.any(Number) }),
        }),
      })
    );

    mocks.mockS3Send.mockClear();

    const generationResponse = await request(app).post('/api/generate-enhanced-docs').send({
      jobId,
      resumeText: improvementResponse.body.updatedResume,
      jobDescriptionText,
      jobSkills,
      resumeSkills,
      baseline: {
        originalScore:
          typeof uploadResponse.body.originalScore === 'number'
            ? uploadResponse.body.originalScore
            : null,
        missingSkills: uploadResponse.body.missingSkills || missingSkills,
        table: uploadResponse.body.table || [],
      },
      manualCertificates: uploadResponse.body.manualCertificates || [],
      templateContext: uploadResponse.body.templateContext,
    });

    expect(generationResponse.status).toBe(200);
    expect(generationResponse.body.success).toBe(true);
    expect(typeof generationResponse.body.atsScoreBeforeExplanation).toBe('string');
    expect(typeof generationResponse.body.atsScoreAfterExplanation).toBe('string');
    expect(generationResponse.body.scores).toEqual(
      expect.objectContaining({
        match: expect.objectContaining({
          before: expect.objectContaining({ score: expect.any(Number) }),
          after: expect.objectContaining({ score: expect.any(Number) }),
        }),
        ats: expect.objectContaining({
          before: expect.objectContaining({ score: expect.any(Number) }),
          after: expect.objectContaining({ score: expect.any(Number) }),
        }),
      })
    );

    const generationTypes = extractTypes(generationResponse.body.urls);
    expect(generationTypes).toEqual(
      expect.arrayContaining([
        'original_upload',
        'version1',
        'version2',
        'cover_letter1',
        'cover_letter2',
      ])
    );

    generationResponse.body.urls.forEach((entry) => {
      expect(entry.url).toContain('https://example.com/');
      expect(entry.fileUrl).toContain('https://example.com/');
      expect(entry.typeUrl).toContain('https://example.com/');
      expect(entry.typeUrl).toContain('#');
      const fragment = entry.typeUrl.slice(entry.typeUrl.indexOf('#') + 1);
      expect(decodeURIComponent(fragment)).toBe(entry.type);
      if (entry.type === 'cover_letter1' || entry.type === 'cover_letter2') {
        expect(entry.text).toEqual(
          expect.objectContaining({
            raw: expect.any(String),
            contact: expect.any(Object),
            job: expect.any(Object),
          })
        );
        expect(entry.text.raw.length).toBeGreaterThan(0);
      } else if (!['original_upload', 'original_upload_pdf'].includes(entry.type)) {
        expect(typeof entry.text).toBe('string');
        expect(entry.text.length).toBeGreaterThan(0);
      }
    });

    const pdfKeys = mocks.mockS3Send.mock.calls
      .map(([command]) => command)
      .filter((command) => command.__type === 'PutObjectCommand')
      .map((command) => command.input?.Key)
      .filter((key) => typeof key === 'string' && key.endsWith('.pdf'));

    expect(pdfKeys.length).toBeGreaterThanOrEqual(4);
    expect(pdfKeys.join('\n')).toContain('cv/');
    pdfKeys.forEach((key) => {
      const segments = key.split('/');
      expect(segments.length).toBeGreaterThanOrEqual(5);
    });
    expect(pdfKeys.some((key) => key.endsWith('/cover_letter1.pdf'))).toBe(true);
    expect(pdfKeys.some((key) => key.endsWith('/cover_letter2.pdf'))).toBe(true);
  });
});
