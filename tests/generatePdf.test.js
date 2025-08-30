import { generatePdf, parseContent } from '../server.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

describe('generatePdf and parsing', () => {
  test('parseContent handles markdown', () => {
    const tokens = parseContent('# Education\n- Item 1\nText');
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading', text: 'Education' }),
        expect.objectContaining({ type: 'list', items: ['Item 1'] }),
        expect.objectContaining({ type: 'paragraph', text: 'Text' })
      ])
    );
  });

  test('parseContent handles JSON structure', () => {
    const data = { sections: [{ heading: 'Skills', items: ['JS'] }] };
    const tokens = parseContent(JSON.stringify(data));
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading', text: 'Skills' }),
        expect.objectContaining({ type: 'list', items: ['JS'] })
      ])
    );
  });

  test('generatePdf creates PDF from template', async () => {
    const buffer = await generatePdf('Jane Doe\n- Loves testing');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const data = await pdfParse(buffer);
    expect(data.text).toContain('Jane Doe');
    expect(data.text).toContain('Loves testing');
  });

  test('parseContent detects links', () => {
    const tokens = parseContent(
      'Check [OpenAI](https://openai.com) and https://example.com'
    );
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          text: 'OpenAI',
          href: 'https://openai.com'
        }),
        expect.objectContaining({
          type: 'link',
          text: 'https://example.com',
          href: 'https://example.com'
        })
      ])
    );
  });

});
