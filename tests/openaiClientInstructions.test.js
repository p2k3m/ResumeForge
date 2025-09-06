import { requestEnhancedCV } from '../openaiClient.js';
import { createResponse } from './mocks/openai.js';

test('throws when instructions missing', async () => {
  await expect(
    requestEnhancedCV({ cvFileId: 'cv', jobDescFileId: 'jd' })
  ).rejects.toThrow('instructions must be a non-empty string');
  expect(createResponse).not.toHaveBeenCalled();
});

test('throws when cvFileId missing', async () => {
  await expect(
    requestEnhancedCV({ jobDescFileId: 'jd', instructions: 'x' })
  ).rejects.toThrow('cvFileId is required');
  expect(createResponse).not.toHaveBeenCalled();
});

test('throws when jobDescFileId missing', async () => {
  await expect(
    requestEnhancedCV({ cvFileId: 'cv', instructions: 'x' })
  ).rejects.toThrow('jobDescFileId is required');
  expect(createResponse).not.toHaveBeenCalled();
});
