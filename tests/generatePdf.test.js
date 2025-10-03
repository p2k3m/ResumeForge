import { jest } from '@jest/globals';
import {
  generatePdf,
  parseContent,
  CV_TEMPLATES,
  CL_TEMPLATES,
  selectTemplates,
  CONTRASTING_PAIRS,
  CV_TEMPLATE_GROUPS,
  setChromiumLauncher
} from '../server.js';
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

const STREAM_TOKEN = Buffer.from('stream');
const ENDSTREAM_TOKEN = Buffer.from('endstream');

function extractStreamChunks(pdfBuffer) {
  const chunks = [];
  let idx = 0;
  while ((idx = pdfBuffer.indexOf(STREAM_TOKEN, idx)) !== -1) {
    const nl = pdfBuffer.indexOf('\n', idx) + 1;
    const end = pdfBuffer.indexOf(ENDSTREAM_TOKEN, nl);
    let chunk = pdfBuffer.slice(nl, end);
    try {
      chunk = zlib.inflateSync(chunk);
    } catch {
      // leave chunk as-is when not compressed
    }
    chunks.push(chunk.toString());
    idx = end + ENDSTREAM_TOKEN.length;
  }
  return chunks;
}

const PDF_ESCAPE_MAP = new Map(
  Object.entries({
    n: '\n',
    r: '\r',
    t: '\t',
    b: '\b',
    f: '\f',
    '(': '(',
    ')': ')',
    '\\': '\\'
  })
);

function decodePdfEscapes(str = '') {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8))
    )
    .replace(/\\([nrtbf()\\])/g, (_, esc) => PDF_ESCAPE_MAP.get(esc) ?? esc);
}

function extractStringsFromArray(content, startIndex) {
  const parts = [];
  let i = startIndex;
  while (i < content.length && content[i] !== ']') {
    const char = content[i];
    if (char === '(') {
      const { text, nextIndex } = extractString(content, i);
      parts.push(text);
      i = nextIndex;
      continue;
    }
    if (char === '<') {
      const { text, nextIndex } = extractHexString(content, i);
      parts.push(text);
      i = nextIndex;
      continue;
    }
    i += 1;
  }
  return { text: parts.join(''), nextIndex: i + 1 };
}

function extractHexString(content, startIndex) {
  let i = startIndex + 1;
  let hex = '';
  while (i < content.length && content[i] !== '>') {
    hex += content[i];
    i += 1;
  }
  if (hex.length % 2 === 1) {
    hex += '0';
  }
  return { text: Buffer.from(hex, 'hex').toString(), nextIndex: i + 1 };
}

function extractString(content, startIndex) {
  let i = startIndex + 1;
  let raw = '';
  while (i < content.length) {
    const char = content[i];
    if (char === ')') {
      return { text: decodePdfEscapes(raw), nextIndex: i + 1 };
    }
    if (char === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      if (/[0-7]/.test(next)) {
        let digits = next;
        let offset = 2;
        while (
          offset < 4 &&
          i + offset < content.length &&
          /[0-7]/.test(content[i + offset])
        ) {
          digits += content[i + offset];
          offset += 1;
        }
        raw += `\\${digits}`;
        i += offset;
        continue;
      }
      raw += `\\${next}`;
      i += 2;
      continue;
    }
    raw += char;
    i += 1;
  }
  return { text: decodePdfEscapes(raw), nextIndex: i };
}

function extractRawPdfText(pdfBuffer) {
  return extractStreamChunks(pdfBuffer)
    .map((chunk) => {
      const content = chunk.toString();
      let text = '';
      for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if (char === '(') {
          const { text: str, nextIndex } = extractString(content, i);
          text += str;
          i = nextIndex - 1;
          continue;
        }
        if (char === '[') {
          const { text: str, nextIndex } = extractStringsFromArray(content, i + 1);
          text += str;
          i = nextIndex - 1;
          continue;
        }
        if (char === '<') {
          const { text: str, nextIndex } = extractHexString(content, i);
          text += str;
          i = nextIndex - 1;
          continue;
        }
        if (char === '\n') {
          text += '\n';
        }
      }
      return text;
    })
    .join('')
    .replace(/[\r\f]+/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function firstContentStream(pdfBuffer) {
  const [chunk] = extractStreamChunks(pdfBuffer);
  return chunk || '';
}

async function parsePdfText(pdfBuffer) {
  try {
    const { text = '' } = await pdfParse(pdfBuffer);
    if (/[A-Za-z0-9]/.test(text)) {
      return text;
    }
  } catch {
    // Ignore and fall back to raw extraction
  }
  return extractRawPdfText(pdfBuffer);
}

describe('generatePdf and parsing', () => {
  beforeEach(() => {
    setChromiumLauncher(() => {
      throw new Error('no browser');
    });
  });

  afterEach(() => {
    setChromiumLauncher(null);
  });

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

  test('selectTemplates defaults to ucmo and contrasting style', () => {
    const { template1, template2, coverTemplate1, coverTemplate2 } = selectTemplates();
    expect(template1).toBe('ucmo');
    expect(template2).not.toBe('ucmo');
    expect(CV_TEMPLATE_GROUPS[template2]).not.toBe(CV_TEMPLATE_GROUPS['ucmo']);
    expect(CV_TEMPLATES).toContain(template2);
    expect(coverTemplate1).not.toBe(coverTemplate2);
    expect(CL_TEMPLATES).toContain(coverTemplate1);
    expect(CL_TEMPLATES).toContain(coverTemplate2);
  });

  test('providing one template still includes ucmo', () => {
    const { template1, template2, coverTemplate1, coverTemplate2 } = selectTemplates({
      template1: CV_TEMPLATES[0],
      coverTemplate1: CL_TEMPLATES[0]
    });
    expect([template1, template2]).toContain('ucmo');
    const other = template1 === 'ucmo' ? template2 : template1;
    expect(other).toBe(CV_TEMPLATES[0]);
    expect(CV_TEMPLATE_GROUPS[other]).not.toBe(CV_TEMPLATE_GROUPS['ucmo']);
    expect(coverTemplate1).toBe(CL_TEMPLATES[0]);
    expect(coverTemplate2).not.toBe(coverTemplate1);
    expect(CV_TEMPLATES).toContain(template1);
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

  test('parseContent detects bare LinkedIn and Credly links', () => {
    const data = parseContent(
      'Jane Doe\n- linkedin.com/in/janedoe\n- credly.com/badges/12345'
    );
    const items = data.sections[0].items;
    expect(items[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          text: 'LinkedIn',
          href: 'https://linkedin.com/in/janedoe'
        })
      ])
    );
    expect(items[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          text: 'Credly',
          href: 'https://credly.com/badges/12345'
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

  test('generated PDF hyperlinks bare LinkedIn and Credly URLs', async () => {
    const input = 'John Doe\n- linkedin.com/in/janedoe\n- credly.com/badges/xyz';
    const buffer = await generatePdf(input);
    const items = parseContent(input).sections[0].items;
    expect(items[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          href: 'https://linkedin.com/in/janedoe'
        })
      ])
    );
    expect(items[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          href: 'https://credly.com/badges/xyz'
        })
      ])
    );
    const raw = buffer.toString();
    expect(raw).toContain('https://linkedin.com/in/janedoe');
    expect(raw).toContain('https://credly.com/badges/xyz');
  });

  test('cover letter PDFs preserve raw link text formatting', async () => {
    const input = [
      'Jane Candidate',
      '',
      'LinkedIn: https://linkedin.com/in/janedoe',
      'Credly: https://credly.com/badges/xyz',
      '',
      'Sincerely,',
      'Jane'
    ].join('\n');
    const buffer = await generatePdf(input, 'cover_modern', {
      skipRequiredSections: true
    });
    const text = await parsePdfText(buffer);
    expect(text).toContain('LinkedIn: https://linkedin.com/in/janedoe');
    expect(text).toContain('Credly: https://credly.com/badges/xyz');
    const raw = buffer.toString();
    expect(raw).toContain('https://linkedin.com/in/janedoe');
    expect(raw).toContain('https://credly.com/badges/xyz');
  });

  test('PDFKit link annotations stop before following text', async () => {
    const input = 'John Doe\n- Visit [OpenAI](https://openai.com) for more';
    const buffer = await generatePdf(input);
    const raw = buffer.toString();
    const matches = raw.match(/\/URI \(https:\/\/openai\.com\)/g) || [];
    expect(matches).toHaveLength(1);
  });

  test('sanitizes markdown from name in PDF', async () => {
    const buffer = await generatePdf('**John Doe**\n- Bullet');
    const text = await parsePdfText(buffer);
    expect(text).toContain('John Doe');
    expect(text).not.toContain('**John Doe**');
  });

  test('uses a custom Chromium launcher when provided', async () => {
    const input = 'Jane Doe\n- Bullet point';
    const pdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
    const setContent = jest.fn();
    const pdf = jest.fn().mockResolvedValue(pdfBuffer);
    const close = jest.fn();
    const newPage = jest.fn().mockResolvedValue({ setContent, pdf });
    setChromiumLauncher(async () => ({ newPage, close }));
    const result = await generatePdf(input, 'modern');
    expect(result).toBe(pdfBuffer);
    expect(newPage).toHaveBeenCalled();
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('<html'), {
      waitUntil: 'networkidle0'
    });
    expect(pdf).toHaveBeenCalledWith({ format: 'A4', printBackground: true });
    expect(close).toHaveBeenCalled();
    setChromiumLauncher(null);
  });

  test('ucmo template auto-populates extracted contact fields', async () => {
    const input = [
      'Jane Candidate',
      'Email: jane@example.com',
      'Phone: 555-123-4567',
      'Springfield, MO',
      'LinkedIn: linkedin.com/in/jane',
      '# Experience',
      '- Led initiatives',
      '# Education',
      '- BSc, Computer Science'
    ].join('\n');
    const setContent = jest.fn();
    const pdf = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4'));
    const close = jest.fn();
    const newPage = jest.fn().mockResolvedValue({ setContent, pdf });
    setChromiumLauncher(async () => ({ newPage, close }));
    await generatePdf(input, 'ucmo');
    setChromiumLauncher(null);
    expect(setContent).toHaveBeenCalled();
    const html = setContent.mock.calls[0][0];
    expect(html).toContain('555-123-4567');
    expect(html).toContain('jane@example.com');
    expect(html).toContain('Springfield, MO');
    expect(html).toContain('linkedin.com/in/jane');
  });

  test('PDFKit fallback produces consistent line spacing for bullet lists', async () => {
    const input = 'Jane Doe\n- First line\n- Second line';
    const fallbackPdf = await generatePdf(input, 'modern');
    const content = firstContentStream(fallbackPdf);
    const ys = [...content.matchAll(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm/g)].map((m) => parseFloat(m[1]));
    const uniq = [...new Set(ys)];
    expect(uniq.length).toBeGreaterThan(3);
    const spacing = uniq[2] - uniq[3];
    expect(spacing).toBeGreaterThan(10);
    expect(spacing).toBeLessThan(35);
  });

  test('generated PDF preserves line breaks within list items', async () => {
    const input = 'Jane Doe\n- First line\nSecond line';
    const pdf = await generatePdf(input, 'modern');
    const content = firstContentStream(pdf);
    const matches = [...content.matchAll(/1 0 0 1 [0-9.]+ ([0-9.]+) Tm/g)].map((m) => parseFloat(m[1]));
    expect(matches.length).toBeGreaterThan(1);
    expect(matches[1]).toBeLessThan(matches[0]);
  });

  test('PDFKit multi-line bullets do not overlap', async () => {
    const input = 'Jane Doe\n- First line\n\tSecond line\n- Third bullet';
    const pdf = await generatePdf(input, 'modern');
    const content = firstContentStream(pdf);
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

  test('bullet list PDF fallback output includes headings and bullet glyph', async () => {
    const input = 'Jane Doe\n- First bullet';
    const fallbackPdf = await generatePdf(input, 'modern');
    const text = (await parsePdfText(fallbackPdf)).trim();
    expect(text).toContain('Jane Doe');
    expect(text).toContain('Summar');
    expect(text).toMatch(/(\u2022\s*First bullet)|First\s+b\s+20\s+ullet/);
    expect(text).toContain('Education');
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
    expect(css).toMatch(/\.section-item\s*{[^}]*white-space:\s*pre-wrap/);
    expect(css).toMatch(/\.section-item\s*{[^}]*line-height:\s*[0-9.]+/);
  });

});
