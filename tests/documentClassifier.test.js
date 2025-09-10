import { jest } from '@jest/globals';

describe('documentClassifier', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('falls back to OpenAI when Gemini is unavailable', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    const classifyDocument = jest.fn().mockResolvedValue('essay');
    jest.unstable_mockModule('../openaiClient.js', () => ({ classifyDocument }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('sample text');
    expect(classifyDocument).toHaveBeenCalled();
    expect(result).toBe('essay');
  });

  test('uses keyword heuristic when both Gemini and OpenAI are unavailable', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('This is my Resume for the job');
    expect(result).toBe('resume');
  });

  test('classifies resumes by common section headings', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const sample = `Experience:\nWorked as engineer.\nEducation:\nUniversity.\nSkills:\nJavaScript and Python.`;
    const result = await describeDocument(sample);
    expect(result).toBe('resume');
  });

  test('returns unknown when no fallback succeeds', async () => {
    jest.unstable_mockModule('../geminiClient.js', () => ({ generativeModel: null }));
    jest.unstable_mockModule('../openaiClient.js', () => ({
      classifyDocument: jest.fn().mockRejectedValue(new Error('openai down'))
    }));
    const { describeDocument } = await import('../services/documentClassifier.js');
    const result = await describeDocument('unclassifiable text');
    expect(result).toBe('unknown');
  });
});

