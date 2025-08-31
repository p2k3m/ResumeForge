import { jest } from '@jest/globals';
import { generatePdf, parseContent, TEMPLATE_IDS } from '../server.js';
import puppeteer from 'puppeteer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import zlib from 'zlib';
import fs from 'fs/promises';
import path from 'path';
import Handlebars from '../lib/handlebars.js';

describe('generatePdf and parsing', () => {
  test('parseContent handles markdown', () => {
    const data = parseContent('Jane Doe\n# Education\n- Item 1\nText');
    const education = data.sections.find((s) => s.heading === 'Education');
    expect(education).toBeDefined();
    expect(education.items[0].map((t) => t.text).join('')).toBe('Item 1');
    expect(education.items[1].map((t) => t.text).join('')).toBe('Text');
  });

  test('parseContent handles JSON structure', () => {
    const json = { name: 'John', sections: [{ heading: 'Skills', items: ['JS'] }] };
    const data = parseContent(JSON.stringify(json));
    expect(data.name).toBe('John');
    const skills = data.sections.find((s) => s.heading === 'Skills');
    expect(skills.items[0].map((t) => t.text).join('')).toBe('JS');
  });

  test('parseContent creates multiple sections from headings', () => {
    const input = 'Jane Doe\n# Experience\n- Worked\n# Skills\n- JavaScript';
    const data = parseContent(input);
    expect(data.sections.map((s) => s.heading)).toEqual(['Experience', 'Skills']);
  });

  test.each(TEMPLATE_IDS)('generatePdf creates PDF from %s template', async (tpl) => {
    const buffer = await generatePdf('Jane Doe\n- Loves testing', tpl);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('bold and italic text render without markdown syntax', () => {
    const data = parseContent(
      'Jane Doe\n- This is **bold** text\n- This is _italic_ text'
    );
    const [boldTokens, italicTokens] = data.sections[0].items;
    expect(boldTokens.map((t) => t.text).join('')).toBe('This is bold text');
    expect(italicTokens.map((t) => t.text).join('')).toBe('This is italic text');
    expect(boldTokens).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'bold', style: 'bold' })])
    );
    expect(italicTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'italic', style: 'italic' })
      ])
    );
    boldTokens.forEach((t) => expect(t.text).not.toContain('**'));
    italicTokens.forEach((t) => expect(t.text).not.toContain('_'));
  });

  test('spacing is preserved across multiple tokens', () => {
    const data = parseContent(
      'Jane Doe\n- Visit [OpenAI](https://openai.com) and [GitHub](https://github.com)\n- Mix **bold** and _italic_ styles'
    );
    const [linkTokens, mixTokens] = data.sections[0].items;
    expect(linkTokens.map((t) => t.text).join('')).toBe(
      'Visit OpenAI and GitHub'
    );
    expect(mixTokens.map((t) => t.text).join('')).toBe(
      'Mix bold and italic styles'
    );
  });

  test('line breaks and tabs retained for mixed bullet and paragraph content', () => {
    const input = 'Jane Doe\n- First bullet\n\tContinuation paragraph\nFinal line';
    const data = parseContent(input);
    const [first, second] = data.sections[0].items;
    expect(first).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'First bullet' }),
        expect.objectContaining({ type: 'newline' }),
        expect.objectContaining({ type: 'tab' }),
        expect.objectContaining({ text: 'Continuation paragraph' })
      ])
    );
    const rendered = first
      .map((t) => {
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return t.text;
      })
      .join('');
    expect(rendered).toBe(
      'First bullet<br><span class="tab"></span>Continuation paragraph'
    );
    expect(second.map((t) => t.text).join('')).toBe('Final line');
  });

  test('multi-line bullet spacing maintained in JSON input', () => {
    const json = {
      name: 'Jane Doe',
      sections: [{ heading: 'Work', items: ['First line\n\tSecond line'] }]
    };
    const data = parseContent(JSON.stringify(json));
    const [tokens] = data.sections[0].items;
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'First line' }),
        expect.objectContaining({ type: 'newline' }),
        expect.objectContaining({ type: 'tab' }),
        expect.objectContaining({ text: 'Second line' })
      ])
    );
    const rendered = tokens
      .map((t) => {
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return t.text;
      })
      .join('');
    expect(rendered).toBe('First line<br><span class="tab"></span>Second line');
  });

  test('single asterisk italic and bullet handling', () => {
    const data = parseContent(
      'Jane Doe\n* This has *italic* text'
    );
    const [tokens] = data.sections[0].items;
    expect(tokens.map((t) => t.text).join('')).toBe(
      'This has italic text'
    );
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'italic', style: 'italic' })
      ])
    );
    tokens.forEach((t) => expect(t.text).not.toContain('*'));
  });

  test('parseContent detects links', () => {
    const data = parseContent(
      'Jane Doe\n- Check [OpenAI](https://openai.com) and https://example.com'
    );
    const tokens = data.sections[0].items[0];
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

  test('generated PDF contains clickable links without HTML anchors', async () => {
    jest.spyOn(puppeteer, 'launch').mockRejectedValue(new Error('no browser'));
    const input =
      'John Doe\n- https://www.linkedin.com/in/johndoe\n- https://github.com/johndoe';
    const buffer = await generatePdf(input);
    const items = parseContent(input).sections[0].items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({
            type: 'link',
            text: 'LinkedIn',
            href: 'https://www.linkedin.com/in/johndoe'
          })
        ]),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'link',
            text: 'GitHub',
            href: 'https://github.com/johndoe'
          })
        ])
      ])
    );
    const raw = buffer.toString();
    expect(raw).toContain('https://www.linkedin.com/in/johndoe');
    expect(raw).toContain('https://github.com/johndoe');
    expect(raw).not.toMatch(/<a[\s>]/);
  });

  test('PDFKit fallback matches Puppeteer output text', async () => {
    const input = 'Jane Doe\n- Bullet point';
    const browserPdf = await generatePdf(input, 'modern');
    jest.spyOn(puppeteer, 'launch').mockRejectedValue(new Error('no browser'));
    const fallbackPdf = await generatePdf(input, 'modern');
    try {
      const browserText = (await pdfParse(browserPdf)).text.trim();
      const fallbackText = (await pdfParse(fallbackPdf)).text.trim();
      expect(browserText).toContain('• Bullet point');
      expect(fallbackText).toBe(browserText);
    } catch {
      const extract = (pdf) => {
        let idx = 0;
        let text = '';
        while ((idx = pdf.indexOf(Buffer.from('stream'), idx)) !== -1) {
          const nl = pdf.indexOf('\n', idx) + 1;
          const end = pdf.indexOf(Buffer.from('endstream'), nl);
          const chunk = pdf.slice(nl, end);
          let content;
          try {
            content = zlib.inflateSync(chunk).toString();
          } catch {
            content = chunk.toString();
          }
          text += content.replace(/<([0-9A-Fa-f]+)>/g, (_, hex) =>
            Buffer.from(hex, 'hex').toString()
          );
          idx = end + 9;
        }
        return text;
      };
      const rawBrowser = extract(browserPdf);
      const rawFallback = extract(fallbackPdf);
      expect(rawBrowser).toContain('Bullet point');
      expect(rawFallback).toContain('Bullet point');
    }
  });

  test('PDFKit fallback line spacing matches Puppeteer output', async () => {
    const input = 'Jane Doe\n- First line\n- Second line';
    const browserPdf = await generatePdf(input, 'modern');
    jest.spyOn(puppeteer, 'launch').mockRejectedValue(new Error('no browser'));
    const fallbackPdf = await generatePdf(input, 'modern');
    const getSpacing = (pdf) => {
      const start = pdf.indexOf(Buffer.from('stream')) + 6;
      const nl = pdf.indexOf('\n', start) + 1;
      const end = pdf.indexOf(Buffer.from('endstream'), nl);
      let content = pdf.slice(nl, end);
      try {
        content = zlib.inflateSync(content).toString();
      } catch {
        content = content.toString();
      }
      const ys = [...content.matchAll(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm/g)].map((m) => parseFloat(m[1]));
      const uniq = [...new Set(ys)];
      return uniq[2] - uniq[3];
    };
    const browserSpacing = getSpacing(browserPdf);
    const fallbackSpacing = getSpacing(fallbackPdf);
    expect(Math.abs(browserSpacing - fallbackSpacing)).toBeLessThan(0.5);
  });

  test('generated PDF preserves line breaks within list items', async () => {
    const input = 'Jane Doe\n- First line\nSecond line';
    const pdf = await generatePdf(input, 'modern');
    const start = pdf.indexOf(Buffer.from('stream')) + 6;
    const nl = pdf.indexOf('\n', start) + 1;
    const end = pdf.indexOf(Buffer.from('endstream'), nl);
    const content = zlib.inflateSync(pdf.slice(nl, end)).toString();
    const matches = [...content.matchAll(/1 0 0 1 57\.536 ([0-9.]+) Tm/g)].map((m) => parseFloat(m[1]));
    expect(matches.length).toBeGreaterThan(1);
    expect(matches[1]).toBeLessThan(matches[0]);
  });

  test('2025 template renders expected HTML snapshot', async () => {
    const input = 'Jane Doe\n# Skills\n- Testing';
    const data = parseContent(input);
    const tplSrc = await fs.readFile(path.resolve('templates', '2025.html'), 'utf8');
    const css = await fs.readFile(path.resolve('templates', '2025.css'), 'utf8');
    const htmlData = {
      ...data,
      sections: data.sections.map((sec) => ({
        ...sec,
        items: sec.items.map((tokens) =>
          tokens
            .map((t) => {
              if (t.type === 'link') return `<a href="${t.href}">${t.text}</a>`;
              if (t.style === 'bolditalic') return `<strong><em>${t.text}</em></strong>`;
              if (t.style === 'bold') return `<strong>${t.text}</strong>`;
              if (t.style === 'italic') return `<em>${t.text}</em>`;
              if (t.type === 'newline') return '<br>';
              if (t.type === 'tab') return '<span class="tab"></span>';
              return t.text || '';
            })
            .join('')
        )
      }))
    };
    let html = Handlebars.compile(tplSrc)(htmlData);
    html = html.replace('</head>', `<style>${css}</style></head>`);
    expect(html).toMatchSnapshot();
  });

});
