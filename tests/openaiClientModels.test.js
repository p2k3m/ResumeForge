import { jest } from '@jest/globals';

// Mock getSecrets to avoid loading full server and external services
jest.unstable_mockModule('../server.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({ OPENAI_API_KEY: 'test-key' }),
}));

// Import the module under test after mocks are in place
const { requestEnhancedCV } = await import('../openaiClient.js');
import { createResponse } from './mocks/openai.js';

test('uses supported model without model_not_found warnings', async () => {
  const warnSpy = jest.spyOn(console, 'warn');

  await requestEnhancedCV({
    cvFileId: 'cv',
    jobDescFileId: 'jd',
    instructions: 'Test instructions',
  });

  expect(createResponse).toHaveBeenCalledTimes(1);
  expect(createResponse.mock.calls[0][0].model).toBe('gpt-4.1');
  expect(createResponse.mock.calls[0][0].text.format.type).toBe('json_schema');
  expect(createResponse.mock.calls[0][0].text.format.name).toBe('EnhancedCV');
  expect(createResponse.mock.calls[0][0].text.format.json_schema).toMatchObject({
    schema: expect.any(Object),
    strict: true,
  });
  expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Model not found/));
});
