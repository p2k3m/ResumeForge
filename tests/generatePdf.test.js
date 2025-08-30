import { generatePdf, parseContent, prepareTemplateData } from '../server.js';

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
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('bold and italic text render without markdown syntax', () => {
    const data = prepareTemplateData(
      'Jane Doe\n- This is **bold** text\n- This is _italic_ text'
    );
    const [boldLine, italicLine] = data.sections[0].items;
    expect(boldLine).toBe('This is <strong>bold</strong> text');
    expect(italicLine).toBe('This is <em>italic</em> text');
    expect(boldLine).not.toContain('**');
    expect(italicLine).not.toContain('_');
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
