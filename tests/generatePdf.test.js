import { generatePdf, parseContent } from '../server.js';
import { inflateSync } from 'zlib';

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

  test('generatePdf creates buffer output', async () => {
    const buffer = await generatePdf('# Test\n- Bullet');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100); // ensure content written
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

  test('generatePdf embeds hyperlinks', async () => {
    const buffer = await generatePdf('Visit [OpenAI](https://openai.com)');
    const pdfText = buffer.toString('utf8');
    expect(pdfText).toContain('https://openai.com');
  });

  test('generatePdf renders bold text without markers', async () => {
    const buffer = await generatePdf('This is **bold** text');
    const start = buffer.indexOf('\n', buffer.indexOf('stream')) + 1;
    const end = buffer.indexOf('endstream', start);
    const slice = buffer.slice(start, end);
    const uncompressed = inflateSync(slice);
    const decoded = [...uncompressed.toString().matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map((m) => Buffer.from(m[1], 'hex').toString('utf8'))
      .join('');
    expect(decoded).toContain('bold');
    expect(decoded).not.toContain('**');
  });
});
