import { jest } from '@jest/globals';

const requestSectionImprovement = jest.fn(async ({ sectionName }) => `${sectionName}-improved`);
const uploadFile = jest.fn();
const requestEnhancedCV = jest.fn();
jest.unstable_mockModule('../openaiClient.js', () => ({
  requestSectionImprovement,
  uploadFile,
  requestEnhancedCV,
}));

const { improveSections } = await import('../routes/processCv.js');

beforeEach(() => {
  requestSectionImprovement.mockClear();
});

test('missing sections return empty strings and skip OpenAI call', async () => {
  const sections = {
    summary: '   ',
    experience: 'Worked hard',
    education: undefined,
    certifications: '',
  };
  const result = await improveSections(sections, 'JD');
  expect(result.summary).toBe('');
  expect(result.education).toBe('');
  expect(result.certifications).toBe('');
  expect(result.experience).toBe('experience-improved');
  expect(requestSectionImprovement).toHaveBeenCalledTimes(1);
  expect(requestSectionImprovement).toHaveBeenCalledWith({
    sectionName: 'experience',
    sectionText: 'Worked hard',
    jobDescription: 'JD',
  });
});

test('all sections empty skip OpenAI entirely', async () => {
  const sections = { summary: '', experience: '', education: '', certifications: '' };
  const result = await improveSections(sections, 'JD');
  expect(result).toEqual({
    summary: '',
    experience: '',
    education: '',
    certifications: '',
  });
  expect(requestSectionImprovement).not.toHaveBeenCalled();
});
