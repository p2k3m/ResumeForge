import { verifyResume } from '../server.js';
import { generateContentMock } from './mocks/generateContentMock.js';

describe('verifyResume', () => {
  test('uses generative model and returns improved sanitized text', async () => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValueOnce({
      response: {
        text: () => 'Improved line\nConsolidate relevant experience\nEnd'
      }
    });
    const generativeModel = { generateContent: generateContentMock };
    const result = await verifyResume(
      'Original line',
      'Job description',
      generativeModel,
      { skipRequiredSections: true, defaultHeading: '' }
    );
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('Improved line\nEnd');
  });
});
