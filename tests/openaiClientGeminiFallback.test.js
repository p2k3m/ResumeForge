import { jest } from '@jest/globals';

delete process.env.OPENAI_API_KEY;

jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({ OPENAI_API_KEY: 'test-key' })
}));

const generateContentMock = jest.fn();
jest.unstable_mockModule('../geminiClient.js', () => ({
  generativeModel: { generateContent: generateContentMock }
}));

const {
  requestEnhancedCV,
  requestCoverLetter,
  requestAtsAnalysis
} = await import('../openaiClient.js');

import { createResponse } from './mocks/openai.js';

afterEach(() => {
  createResponse.mockReset();
  generateContentMock.mockReset();
});

test('requestEnhancedCV falls back to Gemini on failure', async () => {
  createResponse.mockRejectedValueOnce(new Error('openai fail'));
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => '{"cvVersion1":"a","coverLetter1":"b"}' }
  });
  const result = await requestEnhancedCV({
    cvFileId: 'cv',
    jobDescFileId: 'jd',
    instructions: 'instr'
  });
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  const parsed = JSON.parse(result);
  expect(parsed).toHaveProperty('cv_version1', 'a');
  expect(parsed).toHaveProperty('cover_letter1', 'b');
});

test('requestCoverLetter falls back to Gemini on failure', async () => {
  createResponse.mockRejectedValueOnce(new Error('openai fail'));
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => 'gemini cover' }
  });
  const result = await requestCoverLetter({ cvFileId: 'cv', jobDescFileId: 'jd' });
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  expect(result).toBe('gemini cover');
});

test('requestAtsAnalysis falls back to Gemini on failure', async () => {
  createResponse.mockRejectedValueOnce(new Error('openai fail'));
  const json = {
    layoutSearchability: 1,
    atsReadability: 2,
    impact: 3,
    crispness: 4,
    keywordDensity: 5,
    sectionHeadingClarity: 6,
    contactInfoCompleteness: 7,
    grammar: 8
  };
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => JSON.stringify(json) }
  });
  const result = await requestAtsAnalysis('resume text');
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  expect(result).toEqual(json);
});
