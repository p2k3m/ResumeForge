import { jest } from '@jest/globals';

// Ensure tests don't depend on a real environment key
delete process.env.OPENAI_API_KEY;

// Mock getSecrets to avoid loading full server and external services
jest.unstable_mockModule('../config/secrets.js', () => ({
  getSecrets: jest.fn().mockResolvedValue({ OPENAI_API_KEY: 'test-key' }),
}));

// Import the module under test after mocks are in place
const { requestEnhancedCV, uploadFile } = await import('../openaiClient.js');
import { createResponse, uploadFile as openaiUpload } from './mocks/openai.js';

test('uses supported model without model_not_found warnings', async () => {
  const warnSpy = jest.spyOn(console, 'warn');

  const result = await requestEnhancedCV({
    cvFileId: 'cv',
    jobDescFileId: 'jd',
    instructions: 'Test instructions',
  });

  expect(createResponse).toHaveBeenCalledTimes(1);
  const options = createResponse.mock.calls[0][0];
  expect(options.model).toBe('gpt-4.1');
  expect(options.text.format).toMatchObject({
    type: 'json_schema',
    name: 'EnhancedCV',
    schema: expect.any(Object),
    strict: true,
  });
  expect(options.text.format.schema).toHaveProperty('additionalProperties', false);
  expect(options.text.format.schema.properties).toHaveProperty('metrics');
  expect(
    options.text.format.schema.properties.metrics.items.properties.metric.enum
  ).toEqual([
    'layoutSearchability',
    'atsReadability',
    'impact',
    'crispness',
    'keywordDensity',
    'sectionHeadingClarity',
    'contactInfoCompleteness',
    'grammar',
  ]);
  expect(options.text.format.schema.required).toEqual(
    expect.arrayContaining(['metrics'])
  );
  expect(JSON.parse(result)).toHaveProperty('metrics');
  expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Model not found/));
});

test('uploadFile passes pdf metadata to OpenAI', async () => {
  openaiUpload.mockReset();
  await uploadFile(Buffer.from('test'), 'test.pdf');
  expect(openaiUpload).toHaveBeenCalledTimes(1);
  const args = openaiUpload.mock.calls[0][0];
  expect(args.file.type).toBe('application/pdf');
});

test('uploadFile rejects non-pdf filenames', async () => {
  await expect(uploadFile(Buffer.from('x'), 'bad.txt')).rejects.toThrow('Only .pdf files are allowed');
});
