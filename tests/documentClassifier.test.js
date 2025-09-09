import { jest } from '@jest/globals';

jest.unstable_mockModule('../geminiClient.js', () => ({
  generativeModel: {}
}));

const { describeDocument } = await import('../services/documentClassifier.js');

describe('documentClassifier', () => {
  test('returns unknown when generative model is unavailable', async () => {
    const result = await describeDocument('sample text');
    expect(result).toBe('unknown');
  });
});
