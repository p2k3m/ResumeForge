import { jest } from '@jest/globals';
import {
  buildTemplateSectionContext,
  generatePdf,
  parseContent,
  setChromiumLauncher
} from '../server.js';
import fs from 'fs/promises';
import path from 'path';
import Handlebars from '../lib/handlebars.js';
import zlib from 'zlib';

test('all headings including Skills are bold in HTML and PDF outputs', async () => {
  const input = 'Jane Doe\n# Skills\n- Testing';
  const data = parseContent(input);

  // Render HTML using the modern template
  const tplSrc = await fs.readFile(path.resolve('templates', 'modern.html'), 'utf8');
  const sectionContext = buildTemplateSectionContext(data.sections);
  const toRenderableSection = (entry = {}) => ({
    heading: entry.heading,
    key: entry.key,
    items: entry.htmlItems,
    tokens: entry.tokens,
    presentation: entry.presentation,
    sectionClass: entry.sectionClass,
    headingClass: entry.headingClass,
    listClass: entry.listClass,
    itemClass: entry.itemClass,
    textClass: entry.textClass,
    markerClass: entry.markerClass,
    showMarkers: entry.showMarkers,
    originalIndex: entry.originalIndex
  });
  const htmlData = {
    ...data,
    sections: sectionContext.sections.map(toRenderableSection)
  };
  const html = Handlebars.compile(tplSrc)(htmlData);
  expect(html).toMatchSnapshot('html');

  // Force PDFKit fallback by failing to launch Puppeteer
  setChromiumLauncher(() => {
    throw new Error('no browser');
  });
  const pdfBuffer = await generatePdf(input, 'modern');
  setChromiumLauncher(null);

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

