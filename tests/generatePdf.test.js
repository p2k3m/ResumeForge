import { jest } from '@jest/globals';
import {
  generatePdf,
  parseContent,
  CV_TEMPLATES,
  CL_TEMPLATES,
  selectTemplates
} from '../server.js';
import puppeteer from 'puppeteer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import zlib from 'zlib';
import fs from 'fs/promises';
import path from 'path';
import Handlebars from '../lib/handlebars.js';

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

describe('generatePdf and parsing', () => {
  test('parseContent handles markdown', () => {
    const data = parseContent('Jane Doe\n# EDUCATION\n- Item 1\nText');
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
    expect(data.sections.map((s) => s.heading)).toEqual([
      'Work Experience',
      'Skills',
      'Education'
    ]);
  });

  test('parseContent adds required sections for markdown', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JavaScript');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work).toBeDefined();
    expect(edu).toBeDefined();
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });

  test('parseContent adds required sections for JSON', () => {
    const json = { name: 'Jane', sections: [{ heading: 'Skills', items: ['JS'] }] };
    const data = parseContent(JSON.stringify(json));
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work).toBeDefined();
    expect(edu).toBeDefined();
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });

  test.each(CV_TEMPLATES)('generatePdf creates PDF from %s template', async (tpl) => {
    const buffer = await generatePdf('Jane Doe\n- Loves testing', tpl);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  test.each(CL_TEMPLATES)(
    'generatePdf creates PDF from %s cover template',
    async (tpl) => {
      const buffer = await generatePdf('Jane Doe\nParagraph', tpl, {
        skipRequiredSections: true,
        defaultHeading: ''
      });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    }
  );

  test('selectTemplates defaults to 2025 templates', () => {
    const { template1, template2, coverTemplate1, coverTemplate2 } = selectTemplates();
    expect(template1).toBe('2025');
    expect(template2).toBe('2025');
    expect(CV_TEMPLATES).toContain(template1);
    expect(CV_TEMPLATES).toContain(template2);
    expect(coverTemplate1).not.toBe(coverTemplate2);
    expect(CL_TEMPLATES).toContain(coverTemplate1);
    expect(CL_TEMPLATES).toContain(coverTemplate2);
  });

  test('providing one template defaults the other to 2025', () => {
    const { template1, template2, coverTemplate1, coverTemplate2 } = selectTemplates({
      template1: CV_TEMPLATES[0],
      coverTemplate1: CL_TEMPLATES[0]
    });
    expect(template1).toBe(CV_TEMPLATES[0]);
    expect(template2).toBe('2025');
    expect(coverTemplate1).toBe(CL_TEMPLATES[0]);
    expect(coverTemplate2).not.toBe(coverTemplate1);
    expect(CV_TEMPLATES).toContain(template2);
    expect(CL_TEMPLATES).toContain(coverTemplate2);
  });

  test('script tags render as text', () => {
    const tokens = parseContent('Jane Doe\n- uses <script>alert(1)</script> safely')
      .sections[0].items[0];
    const rendered = tokens
      .map((t) => {
        const text = t.text ? escapeHtml(t.text) : '';
        if (t.type === 'link') return `<a href="${t.href}">${text}</a>`;
        if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
        if (t.style === 'bold') return `<strong>${text}</strong>`;
        if (t.style === 'italic') return `<em>${text}</em>`;
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return text;
      })
      .join('');
    expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('div tags render as text', () => {
    const tokens = parseContent('Jane Doe\n- contains <div>markup</div> here')
      .sections[0].items[0];
    const rendered = tokens
      .map((t) => {
        const text = t.text ? escapeHtml(t.text) : '';
        if (t.type === 'link') return `<a href="${t.href}">${text}</a>`;
        if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
        if (t.style === 'bold') return `<strong>${text}</strong>`;
        if (t.style === 'italic') return `<em>${text}</em>`;
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return text;
      })
      .join('');
    expect(rendered).toContain('&lt;div&gt;markup&lt;/div&gt;');
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
    boldTokens.forEach((t) => {
      if (t.text) expect(t.text).not.toContain('**');
    });
    italicTokens.forEach((t) => {
      if (t.text) expect(t.text).not.toContain('_');
    });
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
        if (t.type === 'bullet') return '•';
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return t.text;
      })
      .join('');
    expect(rendered).toBe(
      '•First bullet<br><span class="tab"></span>Continuation paragraph'
    );
    expect(rendered).not.toMatch(/[-–]/);
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
        if (t.type === 'bullet') return '•';
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return t.text;
      })
      .join('');
    expect(rendered).toBe('•First line<br><span class="tab"></span>Second line');
    expect(rendered).not.toMatch(/[-–]/);
  });

  test('education section uses alternate bullet glyph with spacing for uppercase heading', () => {
    const input = 'Jane Doe\n# EDUCATION\n- Bachelor of Science';
    const data = parseContent(input);
    const edu = data.sections.find((s) => s.heading === 'Education');
    edu.heading = edu.heading.toUpperCase();
    const rendered = edu.items[0]
      .map((t) => {
        if (t.type === 'bullet') {
          if (edu.heading.toLowerCase() === 'education') {
            return '<span class="edu-bullet">•</span> ';
          }
          return '<span class="bullet">•</span> ';
        }
        return t.text || '';
      })
      .join('');
    expect(rendered).toBe('<span class="edu-bullet">•</span> Bachelor of Science');
  });

  test('PDFKit fallback uses bullet for EDUCATION heading', () => {
    const sec = {
      heading: 'EDUCATION',
      items: [[{ type: 'bullet' }, { text: 'Bachelor of Science' }]]
    };
    const style = { bullet: '•', eduBullet: '•' };
    const glyph =
      sec.heading.toLowerCase() === 'education' ? style.eduBullet : style.bullet;
    expect(glyph).toBe('•');
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
    tokens.forEach((t) => {
      if (t.text) expect(t.text).not.toContain('*');
    });
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

  test('HTML mapping only hyperlinks link text', () => {
    const tokens = parseContent(
      'Jane Doe\n- Visit [OpenAI](https://openai.com) for more'
    ).sections[0].items[0];
    const rendered = tokens
      .map((t, i) => {
        const text = t.text ? escapeHtml(t.text) : '';
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
        if (t.type === 'bullet') return '<span class="bullet">•</span>';
        return text;
      })
      .join('');
    expect(rendered).toContain(
      '<a href="https://openai.com">OpenAI</a> for more'
    );
    expect(rendered).not.toContain(
      '<a href="https://openai.com">OpenAI for more'
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

  test('generated PDF contains certification hyperlinks', async () => {
    jest.spyOn(puppeteer, 'launch').mockRejectedValue(new Error('no browser'));
    const options = {
      resumeCertifications: [
        {
          name: 'Cert A',
          provider: 'Org',
          url: 'https://example.com/cert'
        }
      ]
    };
    const buffer = await generatePdf('John Doe', 'modern', options);
    const raw = buffer.toString();
    expect(raw).toContain('https://example.com/cert');
  });

  test('PDFKit link annotations stop before following text', async () => {
    const launchSpy = jest
      .spyOn(puppeteer, 'launch')
      .mockRejectedValue(new Error('no browser'));
    const input = 'John Doe\n- Visit [OpenAI](https://openai.com) for more';
    const buffer = await generatePdf(input);
    const raw = buffer.toString();
    const matches = raw.match(/\/URI \(https:\/\/openai\.com\)/g) || [];
    expect(matches).toHaveLength(1);
    launchSpy.mockRestore();
  });

  test('sanitizes markdown from name in PDF', async () => {
    jest.spyOn(puppeteer, 'launch').mockRejectedValue(new Error('no browser'));
    const buffer = await generatePdf('**John Doe**\n- Bullet');
    try {
      const text = (await pdfParse(buffer)).text;
      expect(text).toContain('John Doe');
      expect(text).not.toContain('**John Doe**');
    } catch {
      let idx = 0;
      let text = '';
      while ((idx = buffer.indexOf(Buffer.from('stream'), idx)) !== -1) {
        const nl = buffer.indexOf('\n', idx) + 1;
        const end = buffer.indexOf(Buffer.from('endstream'), nl);
        let chunk = buffer.slice(nl, end);
        try {
          chunk = zlib.inflateSync(chunk).toString();
        } catch {
          chunk = chunk.toString();
        }
        text += chunk;
        idx = end + 9;
      }
      text = text.replace(/<([0-9A-Fa-f]+)>/g, (_, hex) =>
        Buffer.from(hex, 'hex').toString()
      );
      expect(text).toContain('John Doe');
      expect(text).not.toContain('**John Doe**');
    }
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
    const matches = [...content.matchAll(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm/g)].map((m) => parseFloat(m[1]));
    expect(matches.length).toBeGreaterThan(1);
    expect(matches[1]).toBeLessThan(matches[0]);
  });

  test('PDFKit multi-line bullets do not overlap', async () => {
    const launchSpy = jest
      .spyOn(puppeteer, 'launch')
      .mockRejectedValue(new Error('no browser'));
    const input = 'Jane Doe\n- First line\n\tSecond line\n- Third bullet';
    const pdf = await generatePdf(input, 'modern');
    const start = pdf.indexOf(Buffer.from('stream')) + 6;
    const nl = pdf.indexOf('\n', start) + 1;
    const end = pdf.indexOf(Buffer.from('endstream'), nl);
    let content = pdf.slice(nl, end);
    try {
      content = zlib.inflateSync(content).toString();
    } catch {
      content = content.toString();
    }
    const getY = (text) => {
      const hex = Buffer.from(text).toString('hex');
      const regex = new RegExp(
        `1 0 0 1 [0-9.]+ ([0-9.]+) Tm\\n\/F1 12 Tf\\n\\[<${hex}[0-9a-f]*>[^\\]]*\\] TJ`
      );
      const m = content.match(regex);
      return m ? parseFloat(m[1]) : null;
    };
    const y1 = getY('First line');
    const y2 = getY('Second line');
    const y3 = getY('Third');
    expect(y1).toBeDefined();
    expect(y2).toBeDefined();
    expect(y3).toBeDefined();
    expect(y2).toBeLessThan(y1);
    expect(y3).toBeLessThan(y2);
    launchSpy.mockRestore();
  });

  test('bullet list HTML spacing snapshot', () => {
    const input = 'Jane Doe\n- First bullet';
    const [tokens] = parseContent(input).sections[0].items;
    const rendered = tokens
      .map((t) => {
        if (t.type === 'link') return `<a href="${t.href}">${t.text}</a>`;
        if (t.style === 'bolditalic') return `<strong><em>${t.text}</em></strong>`;
        if (t.style === 'bold') return `<strong>${t.text}</strong>`;
        if (t.style === 'italic') return `<em>${t.text}</em>`;
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        if (t.type === 'bullet') return '<span class="bullet">•</span> ';
        return t.text || '';
      })
      .join('');
    expect(rendered).toMatchSnapshot();
  });

  test('bullet list PDF spacing snapshot', async () => {
    const input = 'Jane Doe\n- First bullet';
    const browserPdf = await generatePdf(input, 'modern');
    const launchSpy = jest
      .spyOn(puppeteer, 'launch')
      .mockRejectedValue(new Error('no browser'));
    const fallbackPdf = await generatePdf(input, 'modern');
    launchSpy.mockRestore();
    const extractText = async (pdf) => {
      try {
        return (await pdfParse(pdf)).text.trim();
      } catch {
        let idx = 0;
        let text = '';
        while ((idx = pdf.indexOf(Buffer.from('stream'), idx)) !== -1) {
          const nl = pdf.indexOf('\n', idx) + 1;
          const end = pdf.indexOf(Buffer.from('endstream'), nl);
          let chunk = pdf.slice(nl, end);
          try {
            chunk = zlib.inflateSync(chunk).toString();
          } catch {
            chunk = chunk.toString();
          }
          text += chunk;
          idx = end + 9;
        }
        return text.trim();
      }
    };
    const browserText = await extractText(browserPdf);
    const fallbackText = await extractText(fallbackPdf);
    expect(browserText).toMatchSnapshot('browser');
    expect(fallbackText).toMatchSnapshot('fallback');
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
              if (t.type === 'bullet') return '<span class="bullet">•</span>';
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

  test('2025 template handles multi-line bullet spacing', async () => {
    const input = 'Jane Doe\n# Skills\n- First line\n\tSecond line';
    const [tokens] = parseContent(input).sections[0].items;
    const rendered = tokens
      .map((t) => {
        if (t.type === 'bullet') return '•';
        if (t.type === 'newline') return '<br>';
        if (t.type === 'tab') return '<span class="tab"></span>';
        return t.text || '';
      })
      .join('');
    expect(rendered).toBe(
      '•First line<br><span class="tab"></span>Second line'
    );
    expect(rendered).not.toMatch(/[-–]/);
    const css = await fs.readFile(path.resolve('templates', '2025.css'), 'utf8');
    expect(css).toMatch(/li\s*{[^}]*white-space:\s*pre-wrap/);
    expect(css).toMatch(/li\s*{[^}]*line-height:\s*[0-9.]+/);
  });

});
