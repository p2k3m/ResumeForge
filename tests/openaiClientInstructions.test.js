import { requestEnhancedCV } from '../openaiClient.js';
import { createResponse } from './mocks/openai.js';

test('throws when instructions missing', async () => {
  await expect(
    requestEnhancedCV({ cvFileId: 'cv', jobDescFileId: 'jd' })
  ).rejects.toThrow('instructions must be a non-empty string');
  expect(createResponse).not.toHaveBeenCalled();
});
