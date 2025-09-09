import { jest } from '@jest/globals';

delete process.env.OPENAI_API_KEY;

jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({ OPENAI_API_KEY: 'test-key' }),
}));

jest.unstable_mockModule('../geminiClient.js', () => ({
  generativeModel: {},
}));

const { requestEnhancedCV, requestAtsAnalysis } = await import('../openaiClient.js');
import { createResponse } from './mocks/openai.js';

afterEach(() => {
  createResponse.mockReset();
});

const ENHANCED_CV_SYSTEM = 'You are ResumeForge, a service that rewrites resumes and cover letters to better match a job description.';
const ENHANCED_CV_DEVELOPER = 'Generate two improved resume versions and two cover letters using the provided files. Respond in JSON matching the EnhancedCV schema.';
const ATS_SYSTEM = "You are ResumeForge's ATS evaluation assistant.";
const ATS_DEVELOPER = 'Score the resume for the following metrics and return a JSON object with numeric values from 0 to 100: layoutSearchability, atsReadability, impact, crispness, keywordDensity, sectionHeadingClarity, contactInfoCompleteness, grammar.';

test('requestEnhancedCV sends system, developer, and user prompts', async () => {
  await requestEnhancedCV({ cvFileId: 'cv', jobDescFileId: 'jd', instructions: 'Improve' });
  const input = createResponse.mock.calls[0][0].input;
  expect(input[0]).toEqual({
    role: 'system',
    content: [{ type: 'input_text', text: ENHANCED_CV_SYSTEM }],
  });
  expect(input[1]).toEqual({
    role: 'developer',
    content: [{ type: 'input_text', text: ENHANCED_CV_DEVELOPER }],
  });
  expect(input[2].role).toBe('user');
  expect(input[2].content).toEqual(
    expect.arrayContaining([
      { type: 'input_text', text: 'Improve' },
      { type: 'input_file', file_id: 'cv' },
      { type: 'input_file', file_id: 'jd' },
    ]),
  );
});

test('requestAtsAnalysis sends system, developer, and user prompts', async () => {
  createResponse.mockImplementationOnce(async () => ({
    output_text: JSON.stringify({
      layoutSearchability: 1,
      atsReadability: 2,
      impact: 3,
      crispness: 4,
      keywordDensity: 5,
      sectionHeadingClarity: 6,
      contactInfoCompleteness: 7,
      grammar: 8,
    }),
  }));
  await requestAtsAnalysis('resume');
  const input = createResponse.mock.calls[0][0].input;
  expect(input).toEqual([
    { role: 'system', content: [{ type: 'input_text', text: ATS_SYSTEM }] },
    { role: 'developer', content: [{ type: 'input_text', text: ATS_DEVELOPER }] },
    { role: 'user', content: [{ type: 'input_text', text: 'resume' }] },
  ]);
});

