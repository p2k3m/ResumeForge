import { parseContent } from '../../services/parseContent.js';
import Handlebars from '../../lib/handlebars.js';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import zlib from 'zlib';

function tokensToHtml(tokens) {
  return tokens
    .map((t, i) => {
      const text = t.text || '';
      if (t.type === 'link') {
        const next = tokens[i + 1];
        const space = next && next.text && !/^\s/.test(next.text) ? ' ' : '';
        return `<a href="${t.href}">${text.trim()}</a>${space}`;
      }
      if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
      if (t.style === 'bold') return `<strong>${text}</strong>`;
      if (t.style === 'italic') return `<em>${text}</em>`;
      if (t.type === 'newline') return '<br>';
      if (t.type === 'tab') return '<span class="tab"></span>';
      if (t.type === 'bullet') return '<span class="bullet">•</span> ';
      return text;
    })
    .join('');
}

test('ucmo template renders with contact bar and logo', async () => {
  const input = 'Jane Doe\n# Experience\n- Built things\n# Education\n- BSc Stuff';
  const data = parseContent(input);
  const tplSrc = await fs.readFile(path.resolve('templates', 'ucmo.html'), 'utf8');
  const htmlData = {
    ...data,
    phone: '555-555-5555',
    email: 'jane@example.com',
    cityState: 'Warrensburg, MO',
    linkedin: 'linkedin.com/in/jane',
    sections: data.sections.map((sec) => ({
      ...sec,
      items: sec.items.map(tokensToHtml)
    }))
  };
  const html = Handlebars.compile(tplSrc)(htmlData);
  expect(html).toMatchSnapshot('html');
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  } catch (err) {
    console.warn('Puppeteer launch failed, skipping PDF snapshot:', err.message);
    return;
  }
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();

  const pdfStr = pdfBuffer.toString('latin1');
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
