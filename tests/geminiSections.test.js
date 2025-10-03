import {
  collectSectionText,
  rewriteSectionsWithGemini,
  sanitizeGeneratedText,
} from '../server.js';
import { generateContentMock } from './mocks/generateContentMock.js';

describe('rewriteSectionsWithGemini', () => {
  test('populates sections with Gemini bullets', async () => {
    const resumeText = 'John Doe\n# Summary\nOld summary\n# Skills\nJavaScript';
    const linkedinData = {
      headline: 'Developer',
      experience: ['Engineer at Acme (2020-2021)'],
      education: ['BS University'],
      skills: ['Node.js'],
      certifications: [],
    };
    const sections = collectSectionText(resumeText, linkedinData, []);
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            summary: ['Polished summary'],
            experience: ['Did X'],
            education: ['Studied Y'],
            certifications: ['Cert A'],
            skills: ['Skill B'],
            projects: ['Proj C'],
            projectSnippet: 'Led project.',
            latestRoleTitle: 'Updated Title',
            latestRoleDescription: 'Improved desc',
            mandatorySkills: ['Skill B', 'Skill C'],
            addedSkills: ['Skill C'],
          }),
      },
    });
    const generativeModel = { generateContent: generateContentMock };
    const { text, modifiedTitle, addedSkills, sanitizedFallbackUsed } = await rewriteSectionsWithGemini(
      'John Doe',
      sections,
      'JD text',
      ['Leadership', 'Skill C'],
      generativeModel,
      { skipRequiredSections: true },
      resumeText
    );
    expect(generativeModel.generateContent).toHaveBeenCalled();
    expect(text).toContain('Polished summary');
    expect(text).toContain('Did X');
    expect(text).toContain('Studied Y');
    expect(text).toContain('Cert A');
    expect(text).toContain('Skill B');
    expect(text).toContain('Skill C');
    expect(text).toContain('Proj C');
    expect(text).toContain('Updated Title');
    expect(modifiedTitle).toBe('Updated Title');
    expect(addedSkills).toEqual(['Skill C']);
    expect(sanitizedFallbackUsed).toBe(false);
  });

  test('falls back to sanitized resume when Gemini returns plain text', async () => {
    const resumeText = 'Jane Doe\n# Summary\nOriginal summary';
    const linkedinData = { experience: [], education: [], skills: [] };
    const sections = collectSectionText(resumeText, linkedinData, []);
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: { text: () => 'Sure, here is your improved resume text without JSON formatting.' },
    });
    const generativeModel = { generateContent: generateContentMock };
    const options = { skipRequiredSections: true };

    const result = await rewriteSectionsWithGemini(
      'Jane Doe',
      sections,
      'Job description text',
      ['Communication'],
      generativeModel,
      options,
      resumeText
    );

    expect(generativeModel.generateContent).toHaveBeenCalledTimes(1);
    expect(result.text).toBe(sanitizeGeneratedText(resumeText, options));
    expect(result.project).toBe('');
    expect(result.modifiedTitle).toBe('');
    expect(result.addedSkills).toEqual([]);
    expect(result.sanitizedFallbackUsed).toBe(true);
  });
});
