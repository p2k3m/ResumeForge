import { jest } from '@jest/globals';
import { generatePdf, parseContent } from '../server.js';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import Handlebars from '../lib/handlebars.js';
import zlib from 'zlib';

// Helper to convert token arrays into HTML strings, mirroring server logic
function tokensToHtml(tokens) {
  return tokens
    .map((t) => {
      const text = t.text || '';
      if (t.type === 'link') return `<a href="${t.href}">${text}</a>`;
      if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
      if (t.style === 'bold') return `<strong>${text}</strong>`;
      if (t.style === 'italic') return `<em>${text}</em>`;
      if (t.type === 'newline') return '<br>';
      if (t.type === 'tab') return '<span class="tab"></span>';
      if (t.type === 'bullet') return '<span class="bullet">•</span>';
      return text;
    })
    .join('');
}

test('headings are bold in HTML and PDF outputs', async () => {
  const input = 'Jane Doe\n# Skills\n- Testing';
  const data = parseContent(input);

  // Render HTML using the modern template
  const tplSrc = await fs.readFile(path.resolve('templates', 'modern.html'), 'utf8');
  const htmlData = {
    ...data,
    sections: data.sections.map((sec) => ({
      ...sec,
      items: sec.items.map(tokensToHtml)
    }))
  };
  const html = Handlebars.compile(tplSrc)(htmlData);
  expect(html).toMatchSnapshot('html');

  // Force PDFKit fallback by failing to launch Puppeteer
  const launchSpy = jest
    .spyOn(puppeteer, 'launch')
    .mockRejectedValue(new Error('no browser'));
  const pdfBuffer = await generatePdf(input, 'modern');
  launchSpy.mockRestore();

  // Map PDF font identifiers to BaseFont names
  const pdfStr = pdfBuffer.toString('latin1');
  // Build object map from indirect object definitions
  const objects = Object.fromEntries(
    pdfStr
      .split('endobj')
      .map((chunk) => {
        const id = chunk.match(/(\d+) 0 obj/);
        const base = chunk.match(/BaseFont \/([^\s]+)/);
        return id && base ? [id[1], base[1]] : null;
      })
      .filter(Boolean)
  );
  const fontMap = {};
  const fontRefs = [...pdfStr.matchAll(/\/F(\d+) (\d+) 0 R/g)];
  for (const [, id, obj] of fontRefs) {
    const base = objects[obj];
    if (base) fontMap[`F${id}`] = base;
  }

  // Extract and decompress first content stream
  const start = pdfBuffer.indexOf(Buffer.from('stream')) + 6;
  const nl = pdfBuffer.indexOf('\n', start) + 1;
  const end = pdfBuffer.indexOf(Buffer.from('endstream'), nl);
  let content = pdfBuffer.slice(nl, end);
  try {
    content = zlib.inflateSync(content).toString();
  } catch {
    content = content.toString();
  }

  expect({ fontMap, content }).toMatchSnapshot('pdf');
});

