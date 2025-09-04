import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import Handlebars from '../lib/handlebars.js';
import {
  parseContent,
  mergeDuplicateSections,
  normalizeHeading
} from './parseContent.js';

const ALL_TEMPLATES = [
  'modern',
  'ucmo',
  'professional',
  'vibrant',
  '2025',
  'cover_modern',
  'cover_classic'
];

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generatePdf(
  text,
  templateId = 'modern',
  options = {},
  generativeModel
) {
  if (!ALL_TEMPLATES.includes(templateId)) templateId = 'modern';
  const data = parseContent(text, options);
  data.sections.forEach((sec) => {
    sec.heading = normalizeHeading(sec.heading);
  });
  data.sections = mergeDuplicateSections(data.sections);
  let html;
  if (templateId === 'ucmo' && generativeModel?.generateContent) {
    try {
      const prompt =
        `Using the resume text below, output complete HTML with inline CSS ` +
        `that matches the University of Central Missouri sample layout, ` +
        `including a contact info table at the top with the UCMO logo on the ` +
        `right, Times New Roman fonts, and similar spacing. Return only ` +
        `the HTML and CSS.\n\nResume Text:\n${text}`;
      const result = await generativeModel.generateContent(prompt);
      const generated = result?.response?.text?.();
      if (generated) html = generated;
    } catch {
      /* ignore */
    }
  }
  if (!html) {
    const templatePath = path.resolve('templates', `${templateId}.html`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    let css = '';
    try {
      css = await fs.readFile(path.resolve('templates', `${templateId}.css`), 'utf-8');
    } catch {}
    // Convert token-based data to HTML for Handlebars templates
    const htmlData = {
      ...data,
      sections: data.sections.map((sec) => ({
        ...sec,
        items: sec.items.map((tokens) =>
          tokens
            .map((t, i) => {
              const text = t.text ? escapeHtml(t.text) : '';
              if (t.type === 'link') {
                const next = tokens[i + 1];
                const space = next && next.text && !/^\s/.test(next.text)
                  ? ' '
                  : '';
                return `<a href="${t.href}">${text.trim()}</a>${space}`;
              }
              if (t.type === 'heading') {
                return `<strong>${text}</strong>`;
              }
              if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
              if (t.style === 'bold') return `<strong>${text}</strong>`;
              if (t.style === 'italic') return `<em>${text}</em>`;
              if (t.type === 'newline') return '<br>';
              if (t.type === 'tab') return '<span class="tab"></span>';
              if (t.type === 'bullet') {
                if (sec.heading?.toLowerCase() === 'education') {
                  return '<span class="edu-bullet">•</span> ';
                }
                return '<span class="bullet">•</span> ';
              }
              if (t.type === 'jobsep') return '';
              return text;
            })
            .join('')
        )
      }))
    };
    html = Handlebars.compile(templateSource)(htmlData);
    if (css) {
      html = html.replace('</head>', `<style>${css}</style></head>`);
    }
  }
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return pdfBuffer;
  } catch (err) {
    // Fallback for environments without Chromium dependencies
    const { default: PDFDocument } = await import('pdfkit');
    const styleMap = {
      modern: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#1f3c5d',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a5568',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      professional: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#1f3c5d',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a5568',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      ucmo: {
        font: 'Times-Roman',
        bold: 'Times-Bold',
        italic: 'Times-Italic',
        headingColor: '#1f3c5d',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a5568',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      vibrant: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#1f3c5d',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a5568',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      '2025': {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#1f3c5d',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a5568',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 8
      }
    };
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', (d) => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      // Optional font embedding for Roboto/Helvetica families if available
      try {
        const fontsDir = path.resolve('fonts');
        const rReg = path.join(fontsDir, 'Roboto-Regular.ttf');
        const rBold = path.join(fontsDir, 'Roboto-Bold.ttf');
        const rItalic = path.join(fontsDir, 'Roboto-Italic.ttf');
        const haveRoboto = [rReg, rBold, rItalic].every((p) => fsSync.existsSync(p));
        if (haveRoboto) {
          doc.registerFont('Roboto', rReg);
          doc.registerFont('Roboto-Bold', rBold);
          doc.registerFont('Roboto-Italic', rItalic);
          ['modern', 'vibrant'].forEach((tpl) => {
            styleMap[tpl].font = 'Roboto';
            styleMap[tpl].bold = 'Roboto-Bold';
            styleMap[tpl].italic = 'Roboto-Italic';
          });
        } else {
          const missing = [rReg, rBold, rItalic].filter((p) => !fsSync.existsSync(p));
          if (missing.length) console.warn('Roboto fonts missing:', missing.map((m) => path.basename(m)));
        }

        const hReg = path.join(fontsDir, 'Helvetica.ttf');
        const hBold = path.join(fontsDir, 'Helvetica-Bold.ttf');
        const hItalic = path.join(fontsDir, 'Helvetica-Oblique.ttf');
        [
          [hReg, 'Helvetica'],
          [hBold, 'Helvetica-Bold'],
          [hItalic, 'Helvetica-Oblique']
        ].forEach(([p, name]) => {
          if (fsSync.existsSync(p)) doc.registerFont(name, p);
        });
      } catch (err) {
        console.warn('Font registration error', err);
      }
      const style = styleMap[templateId] || styleMap.modern;

      doc.font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(20)
        .text(data.name, { paragraphGap: style.paragraphGap, align: 'left', lineGap: style.lineGap })
        .fillColor(style.textColor);

      data.sections.forEach((sec) => {
        doc
          .font(style.bold)
          .fillColor(style.headingColor)
          .fontSize(14)
          .text(sec.heading, { paragraphGap: style.paragraphGap, lineGap: style.lineGap });
        (sec.items || []).forEach((tokens) => {
          const startY = doc.y;
          doc.font(style.font).fontSize(12);
          tokens.forEach((t, idx) => {
            if (t.type === 'bullet') {
              const glyph =
                sec.heading?.toLowerCase() === 'education'
                  ? style.eduBullet || style.bullet
                  : style.bullet;
              doc
                .fillColor(style.bulletColor)
                .text(`${glyph} `, { continued: true, lineGap: style.lineGap })
                .text('', { continued: true })
                .fillColor(style.textColor);
              return;
            }
            if (t.type === 'jobsep') {
              return;
            }
            if (t.type === 'newline') {
              const before = doc.y;
              doc.text('', { continued: false, lineGap: style.lineGap });
              if (doc.y === before) doc.moveDown();
              doc.text('   ', { continued: true, lineGap: style.lineGap });
              return;
            }
            const opts = { continued: idx < tokens.length - 1, lineGap: style.lineGap };
            if (t.type === 'tab') {
              doc.text('    ', opts);
              return;
            }
            if (t.type === 'link') {
              doc.fillColor('blue');
              doc.text(t.text, {
                lineGap: style.lineGap,
                link: t.href,
                underline: true,
                continued: false
              });
              if (idx < tokens.length - 1)
                doc.text('', { continued: true, lineGap: style.lineGap });
              doc.fillColor(style.textColor);
              return;
            }
            if (t.type === 'heading') {
              // Render heading tokens using the bold font
              doc.font(style.bold);
              doc.text(t.text, opts);
              doc.font(style.font);
              return;
            }
            if (t.style === 'bold' || t.style === 'bolditalic') doc.font(style.bold);
            else if (t.style === 'italic') doc.font(style.italic);
            else doc.font(style.font);
            doc.text(t.text, opts);
            doc.font(style.font);
          });
          if (doc.y === startY) doc.moveDown();
          const extra = style.paragraphGap / doc.currentLineHeight(true);
          if (extra) doc.moveDown(extra);
        });
        doc.moveDown();
      });
      doc.end();
    });
  } finally {
    if (browser) await browser.close();
  }
}

export default generatePdf;
