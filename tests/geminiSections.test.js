import {
  collectSectionText,
  rewriteSectionsWithGemini,
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
          }),
      },
    });
    const generativeModel = { generateContent: generateContentMock };
    const { text } = await rewriteSectionsWithGemini(
      'John Doe',
      sections,
      'JD text',
      generativeModel,
      { skipRequiredSections: true }
    );
    expect(generativeModel.generateContent).toHaveBeenCalled();
    expect(text).toContain('Polished summary');
    expect(text).toContain('Did X');
    expect(text).toContain('Studied Y');
    expect(text).toContain('Cert A');
    expect(text).toContain('Skill B');
    expect(text).toContain('Proj C');
  });
});
