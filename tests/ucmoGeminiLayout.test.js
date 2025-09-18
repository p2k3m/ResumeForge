import { jest } from '@jest/globals';

const { generatePdf, setChromiumLauncher } = await import('../server.js');

test('ucmo template uses Gemini layout markup', async () => {
  const markup = '<html><body><table id="top"><tr><td>contact</td><td><img src="logo.png"/></td></tr></table></body></html>';
  const generativeModel = {
    generateContent: jest
      .fn()
      .mockResolvedValue({ response: { text: () => markup } })
  };
  const setContent = jest.fn();
  const pdf = jest.fn().mockResolvedValue(Buffer.from('PDF'));
  const close = jest.fn();
  const newPage = jest.fn().mockResolvedValue({ setContent, pdf });
  setChromiumLauncher(async () => ({ newPage, close }));
  await generatePdf('Jane Doe\nExperience', 'ucmo', {}, generativeModel);
  expect(generativeModel.generateContent).toHaveBeenCalled();
  const prompt = generativeModel.generateContent.mock.calls[0][0];
  expect(prompt).toMatch(/University of Central Missouri/);
  expect(setContent).toHaveBeenCalledWith(markup, { waitUntil: 'networkidle0' });
  expect(setContent.mock.calls[0][0]).toMatchSnapshot();
  setChromiumLauncher(null);
});
