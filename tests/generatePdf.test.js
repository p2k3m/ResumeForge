import { generatePdf, parseContent } from '../server.js';

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
});
