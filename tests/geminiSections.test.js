import {
  collectSectionText,
  rewriteSectionsWithGemini,
} from '../server.js';
import { generateContentMock } from './mocks/generateContentMock.js';

describe('rewriteSectionsWithGemini', () => {
  test('populates sections with Gemini bullets', async () => {
    const resumeText = 'John Doe\n# Summary\nOld summary\n# Skills\nJavaScript';
    const sections = collectSectionText(resumeText, []);
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () =>
          JSON.stringify({
            summary: ['Polished summary'],
            experience: [
              { title: 'Engineer at Acme', responsibilities: ['Did X'] },
            ],
            education: ['Studied Y'],
            certifications: ['Cert A - Org'],
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
    const { text, modifiedTitle, addedSkills } = await rewriteSectionsWithGemini(
      'John Doe',
      sections,
      'JD text',
      generativeModel,
      { skipRequiredSections: true }
    );
    expect(generativeModel.generateContent).toHaveBeenCalled();
    expect(text).toContain('Polished summary');
    expect(text).toContain('Engineer at Acme');
    expect(text).toContain('Did X');
    expect(text).toContain('Studied Y');
    expect(text).toContain('[Cert A - Org](https://example.com/cert)');
    expect(text).toContain('Applied Skill B');
    expect(text).toContain('Applied Skill C');
    expect(text).toContain('Skill B');
    expect(text).toContain('Skill C');
    expect(text).toContain('Proj C');
    expect(modifiedTitle).toBe('Updated Title');
    expect(addedSkills).toEqual(['Skill C']);
  });
});
