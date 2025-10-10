import { jest } from '@jest/globals';

process.env.S3_BUCKET = 'unit-bucket';
process.env.GEMINI_API_KEY = 'unit-key';
process.env.AWS_REGION = 'us-test-1';
process.env.CLOUDFRONT_ORIGINS = '';

const promptRecorder = [];

const generativeModelMock = {
  generateContent: jest.fn(async (prompt) => {
    promptRecorder.push(prompt);
    return { response: { text: () => JSON.stringify({}) } };
  })
};

const {
  collectSectionText,
  rewriteSectionsWithGemini,
  sanitizeGeneratedText,
} = await import('../server.js');

describe('rewriteSectionsWithGemini prompt construction', () => {
  beforeEach(() => {
    promptRecorder.length = 0;
    generativeModelMock.generateContent.mockClear();
  });

  test('includes resume sections and job description details in the Gemini prompt', async () => {
    const resume = [
      'Jane Doe',
      '# Summary',
      'Experienced engineer',
      '# Experience',
      '- Developer at Example (Jan 2020 - Dec 2022)',
      '  - Built resilient APIs',
      '# Skills',
      'JavaScript, AWS',
      '# Projects',
      'Project Alpha'
    ].join('\n');
    const linkedin = {
      headline: 'Senior Developer',
      experience: ['Developer at Example'],
      education: ['BSc Computer Science'],
      skills: ['Node.js'],
      certifications: []
    };
    const sections = collectSectionText(resume, linkedin, []);
    expect(sections.experience).toContain('Built resilient APIs');
    expect(Array.isArray(sections.structuredExperience)).toBe(true);
    expect(
      sections.structuredExperience.some(
        (entry) =>
          Array.isArray(entry?.responsibilities) &&
          entry.responsibilities.includes('Built resilient APIs')
      )
    ).toBe(true);

    await rewriteSectionsWithGemini(
      'Jane Doe',
      sections,
      'Exciting job description here',
      ['JavaScript', 'AWS'],
      generativeModelMock,
      { skipRequiredSections: true },
      resume
    );

    expect(generativeModelMock.generateContent).toHaveBeenCalledTimes(1);
    const prompt = promptRecorder[0];
    expect(prompt).toContain('elite resume architect');
    expect(prompt).toContain('Exciting job description here');
    expect(prompt).toContain('Never degrade CV structure');
    expect(prompt).toContain('Align work experience bullets');
    expect(prompt).toContain('OUTPUT_SCHEMA');
    expect(prompt).toContain('INPUT_CONTEXT');
    expect(prompt).toMatch(/"resumeSections"/);
    expect(prompt).toMatch(/"structuredExperience"/);
    expect(prompt).toMatch(/"summary"/);
    expect(prompt).toMatch(/"experience"/);
    expect(prompt).toMatch(/"projects"/);
    expect(prompt).toMatch(/"jobSkills"/);
  });

  test('falls back gracefully when no generative model is provided', async () => {
    const resume = 'Jane Doe\n# Summary\nExperienced engineer';
    const sections = collectSectionText(resume, {}, []);

    const result = await rewriteSectionsWithGemini(
      'Jane Doe',
      sections,
      'Job description',
      [],
      null,
      { skipRequiredSections: true },
      resume
    );

    expect(result.text).toBe(sanitizeGeneratedText(resume, { skipRequiredSections: true }));
    expect(result.project).toBe('');
    expect(result.modifiedTitle).toBe('');
    expect(result.addedSkills).toEqual([]);
  });
});
