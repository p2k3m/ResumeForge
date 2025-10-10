import {
  collectSectionText,
  rewriteSectionsWithGemini,
  resolveEnhancementTokens,
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
    expect(Array.isArray(sections.structuredExperience)).toBe(true);
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
    const {
      text,
      resolvedText,
      placeholders,
      modifiedTitle,
      addedSkills,
      sanitizedFallbackUsed,
    } = await rewriteSectionsWithGemini(
      'John Doe',
      sections,
      'JD text',
      ['Leadership', 'Skill C'],
      generativeModel,
      { skipRequiredSections: true },
      resumeText
    );
    expect(generativeModel.generateContent).toHaveBeenCalled();
    expect(text).toMatch(/\{\{RF_ENH_[A-Z0-9_]+\}\}/);
    expect(resolvedText).toContain('Polished summary');
    expect(resolveEnhancementTokens(text, placeholders)).toContain('Polished summary');
    const placeholderValues = Object.values(placeholders || {});
    ['Polished summary', 'Did X', 'Studied Y', 'Cert A', 'Skill B', 'Skill C', 'Proj C', 'Updated Title'].forEach(
      (expectedValue) => {
        expect(
          placeholderValues.some((value) =>
            typeof value === 'string' ? value.includes(expectedValue) : false
          )
        ).toBe(true);
      }
    );
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
