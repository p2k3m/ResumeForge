import { jest } from '@jest/globals';

const generateContentMock = jest.fn();
const openaiExtractNameMock = jest.fn();

jest.unstable_mockModule('../geminiClient.js', () => ({
  generativeModel: { generateContent: generateContentMock }
}));

jest.unstable_mockModule('../openaiClient.js', () => ({
  uploadFile: jest.fn(),
  requestEnhancedCV: jest.fn(),
  classifyDocument: jest.fn(),
  extractName: openaiExtractNameMock
}));

const { extractName } = await import('../server.js');

afterEach(() => {
  generateContentMock.mockReset();
  openaiExtractNameMock.mockReset();
});

test('uses Gemini name when available', async () => {
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => 'Jane Doe' }
  });
  const name = await extractName('resume text');
  expect(name).toBe('Jane Doe');
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  expect(openaiExtractNameMock).not.toHaveBeenCalled();
});

test('falls back to OpenAI when Gemini fails', async () => {
  generateContentMock.mockRejectedValueOnce(new Error('fail'));
  openaiExtractNameMock.mockResolvedValueOnce('John Doe');
  const name = await extractName('resume text');
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  expect(openaiExtractNameMock).toHaveBeenCalledTimes(1);
  expect(name).toBe('John Doe');
});

test('falls back to OpenAI when Gemini returns unknown', async () => {
  generateContentMock.mockResolvedValueOnce({
    response: { text: () => 'unknown' }
  });
  openaiExtractNameMock.mockResolvedValueOnce('John Doe');
  const name = await extractName('resume text');
  expect(generateContentMock).toHaveBeenCalledTimes(1);
  expect(openaiExtractNameMock).toHaveBeenCalledTimes(1);
  expect(name).toBe('John Doe');
});
