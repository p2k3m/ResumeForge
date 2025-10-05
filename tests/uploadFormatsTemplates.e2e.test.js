import request from 'supertest';
import { setupTestServer, primeSuccessfulAi } from './utils/testServer.js';

const BASE_RESUME_LINES = [
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
  '# Education',
  '- B.S. Computer Science',
  '# Certifications',
  '- AWS Certified Solutions Architect',
];

const PDF_RESUME_TEXT = BASE_RESUME_LINES.join('\n');
const DOCX_RESUME_TEXT = BASE_RESUME_LINES.join('\n');
const DOC_RESUME_TEXT = BASE_RESUME_LINES.join('\n');

const JOB_DESCRIPTION = [
  'We are hiring a Lead Software Engineer to guide platform migrations and coaching.',
  'Success looks like uplifting team delivery, improving reliability, and scaling cloud services.',
].join(' ');

const TARGET_JOB_SKILLS = ['Leadership', 'Cloud Architecture', 'JavaScript'];
const LINKEDIN_URL = 'https://linkedin.com/in/example';

function extractTypes(urls = []) {
  return urls.map((entry) => entry.type).filter(Boolean);
}

function expectResumeStructure(text = '') {
  expect(typeof text).toBe('string');
  expect(text).toContain('Summary');
  expect(text).toContain('Experience');
  expect(text).toContain('Education');
  expect(text.trim().length).toBeGreaterThan(20);
}

describe('resume lifecycle coverage', () => {

  const FORMATS = [
    {
      label: 'PDF',
      fileName: 'resume.pdf',
      setupOptions: { pdfText: PDF_RESUME_TEXT },
    },
    {
      label: 'DOCX',
      fileName: 'resume.docx',
      setupOptions: { docxText: DOCX_RESUME_TEXT },
    },
    {
      label: 'DOC',
      fileName: 'resume.doc',
      setupOptions: { docText: DOC_RESUME_TEXT },
    },
  ];

  test.each(FORMATS)('processes %s resumes end-to-end', async ({ label, fileName, setupOptions }) => {
    const { app, mocks } = await setupTestServer({
      ...setupOptions,
      allowedOrigins: 'https://app.resumeforge.test',
    });

    await primeSuccessfulAi();
    const uploadResponse = await request(app)
      .post('/api/process-cv')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
      .set('X-Forwarded-For', '198.51.100.50')
      .field('manualJobDescription', JOB_DESCRIPTION)
      .field('linkedinProfileUrl', LINKEDIN_URL)
      .attach('resume', Buffer.from('dummy'), fileName);

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.success).toBe(true);
    expect(typeof uploadResponse.body.jobId).toBe('string');
    expect(uploadResponse.body.jobId.length).toBeGreaterThan(10);
    expect(typeof uploadResponse.body.originalScore).toBe('number');
    expect(typeof uploadResponse.body.enhancedScore).toBe('number');
    expect(typeof uploadResponse.body.atsScoreBefore).toBe('number');
    expect(typeof uploadResponse.body.atsScoreAfter).toBe('number');

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

    const resumeText = uploadResponse.body.resumeText || uploadResponse.body.originalResumeText;
    expectResumeStructure(resumeText);

    const jobDescriptionText = uploadResponse.body.jobDescriptionText || JOB_DESCRIPTION;
    const jobSkills =
      Array.isArray(uploadResponse.body.jobSkills) && uploadResponse.body.jobSkills.length
        ? uploadResponse.body.jobSkills
        : TARGET_JOB_SKILLS;
    const resumeSkills =
      Array.isArray(uploadResponse.body.resumeSkills) && uploadResponse.body.resumeSkills.length
        ? uploadResponse.body.resumeSkills
        : ['JavaScript'];
    const missingSkills =
      Array.isArray(uploadResponse.body.missingSkills) && uploadResponse.body.missingSkills.length
        ? uploadResponse.body.missingSkills
      : TARGET_JOB_SKILLS.filter((skill) => !resumeSkills.includes(skill));

    await primeSuccessfulAi();
    const improvementResponse = await request(app).post('/api/enhance-all').send({
      jobId: uploadResponse.body.jobId,
      linkedinProfileUrl: LINKEDIN_URL,
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
    expect(improvementResponse.body.updatedResume).not.toBe(resumeText);
    expect(improvementResponse.body.updatedResume).toContain('# Contact');
    expect(improvementResponse.body.updatedResume).toContain('Lead Software Engineer');

    mocks.mockS3Send.mockClear();

    await primeSuccessfulAi();
    const generationResponse = await request(app).post('/api/generate-enhanced-docs').send({
      jobId: uploadResponse.body.jobId,
      resumeText: improvementResponse.body.updatedResume,
      jobDescriptionText,
      jobSkills,
      resumeSkills,
      baseline: {
        originalScore:
          typeof uploadResponse.body.atsScoreBefore === 'number'
            ? uploadResponse.body.atsScoreBefore
            : uploadResponse.body.originalScore,
        missingSkills: uploadResponse.body.missingSkills || missingSkills,
        table: uploadResponse.body.table || [],
      },
      linkedinProfileUrl: LINKEDIN_URL,
      manualCertificates: uploadResponse.body.manualCertificates || [],
      templateContext: uploadResponse.body.templateContext,
    });

    expect(generationResponse.status).toBe(200);
    expect(generationResponse.body.success).toBe(true);

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
      } else if (entry.type !== 'original_upload') {
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
    expect(pdfKeys.join('\n')).toContain('/runs/');
    expect(pdfKeys.some((key) => key.includes('enhanced_'))).toBe(true);
    expect(pdfKeys.some((key) => key.includes('cover_letter_'))).toBe(true);

    // Label used to ensure each iteration runs independently
    expect(label.length).toBeGreaterThan(0);
  });

  test('generates downloads for every supported template pairing', async () => {
    const { app, mocks, serverModule } = await setupTestServer({
      pdfText: PDF_RESUME_TEXT,
      allowedOrigins: 'https://app.resumeforge.test',
    });

    await primeSuccessfulAi();
    const uploadResponse = await request(app)
      .post('/api/process-cv')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
      .set('X-Forwarded-For', '198.51.100.50')
      .field('manualJobDescription', JOB_DESCRIPTION)
      .field('linkedinProfileUrl', LINKEDIN_URL)
      .attach('resume', Buffer.from('dummy'), 'resume.pdf');

    expect(uploadResponse.status).toBe(200);
    const resumeText = uploadResponse.body.resumeText || uploadResponse.body.originalResumeText;
    const jobDescriptionText = uploadResponse.body.jobDescriptionText || JOB_DESCRIPTION;
    const jobSkills =
      Array.isArray(uploadResponse.body.jobSkills) && uploadResponse.body.jobSkills.length
        ? uploadResponse.body.jobSkills
        : TARGET_JOB_SKILLS;
    const resumeSkills =
      Array.isArray(uploadResponse.body.resumeSkills) && uploadResponse.body.resumeSkills.length
        ? uploadResponse.body.resumeSkills
        : ['JavaScript'];
    const missingSkills =
      Array.isArray(uploadResponse.body.missingSkills) && uploadResponse.body.missingSkills.length
        ? uploadResponse.body.missingSkills
      : TARGET_JOB_SKILLS.filter((skill) => !resumeSkills.includes(skill));

    await primeSuccessfulAi();
    const improvementResponse = await request(app).post('/api/enhance-all').send({
      jobId: uploadResponse.body.jobId,
      linkedinProfileUrl: LINKEDIN_URL,
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

    const { CV_TEMPLATES, CL_TEMPLATES } = serverModule;
    const seenCvTemplates = new Set();
    const seenCoverTemplates = new Set();

    mocks.mockS3Send.mockClear();

    for (const cvTemplate of CV_TEMPLATES) {
      for (const coverTemplate of CL_TEMPLATES) {
        await primeSuccessfulAi();
        const generationResponse = await request(app).post('/api/generate-enhanced-docs').send({
          jobId: uploadResponse.body.jobId,
          resumeText: improvementResponse.body.updatedResume,
          jobDescriptionText,
          jobSkills,
          resumeSkills,
          baseline: {
            originalScore:
              typeof uploadResponse.body.atsScoreBefore === 'number'
                ? uploadResponse.body.atsScoreBefore
                : uploadResponse.body.originalScore,
            missingSkills: uploadResponse.body.missingSkills || missingSkills,
            table: uploadResponse.body.table || [],
          },
          linkedinProfileUrl: LINKEDIN_URL,
          manualCertificates: uploadResponse.body.manualCertificates || [],
          templateContext: {
            template1: cvTemplate,
            templates: [cvTemplate],
            selectedTemplate: cvTemplate,
            coverTemplate1: coverTemplate,
            coverTemplates: [coverTemplate],
          },
        });

        expect(generationResponse.status).toBe(200);
        expect(generationResponse.body.success).toBe(true);

        const version1Entry = generationResponse.body.urls.find((entry) => entry.type === 'version1');
        expect(version1Entry.templateId).toBe(cvTemplate);
        seenCvTemplates.add(version1Entry.templateId);

        const coverEntry = generationResponse.body.urls.find((entry) => entry.type === 'cover_letter1');
        expect(coverEntry.templateId).toBe(coverTemplate);
        seenCoverTemplates.add(coverEntry.templateId);

        const responseTypes = extractTypes(generationResponse.body.urls);
        expect(responseTypes).toEqual(
          expect.arrayContaining([
            'original_upload',
            'version1',
            'version2',
            'cover_letter1',
            'cover_letter2',
          ])
        );
      }
    }

    CV_TEMPLATES.forEach((template) => {
      expect(seenCvTemplates.has(template)).toBe(true);
    });

    CL_TEMPLATES.forEach((template) => {
      expect(seenCoverTemplates.has(template)).toBe(true);
    });

    const pdfKeys = mocks.mockS3Send.mock.calls
      .map(([command]) => command)
      .filter((command) => command.__type === 'PutObjectCommand')
      .map((command) => command.input?.Key)
      .filter((key) => typeof key === 'string' && key.endsWith('.pdf'));

    CV_TEMPLATES.forEach((template) => {
      expect(pdfKeys.some((key) => key.includes(`enhanced_${template}`))).toBe(true);
    });

    CL_TEMPLATES.forEach((template) => {
      expect(pdfKeys.some((key) => key.includes(`cover_letter_${template}`))).toBe(true);
    });
  }, 30000);
});
