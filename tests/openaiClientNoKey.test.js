import { jest } from '@jest/globals';

// Ensure no API key from environment
delete process.env.OPENAI_API_KEY;

// Mock secrets module to provide no key
jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({})
}));

// Import after mocks are set up
const { requestEnhancedCV } = await import('../openaiClient.js');

import { createResponse } from './mocks/openai.js';

// Basic parameters for call
const params = { cvFileId: 'cv', jobDescFileId: 'jd', instructions: 'Test' };

test('throws when OPENAI_API_KEY is missing', async () => {
  await expect(requestEnhancedCV(params)).rejects.toThrow('OPENAI_API_KEY is required');
  // Ensure mocked client was never used
  expect(createResponse).not.toHaveBeenCalled();
});
