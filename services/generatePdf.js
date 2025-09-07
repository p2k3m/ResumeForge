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
import { getSkillIcon } from '../skillIcons.js';

const ALL_TEMPLATES = [
  'modern',
  'ucmo',
  'professional',
  'vibrant',
  '2025',
  'sleek',
  'cover_modern',
  'cover_classic',
  'cover_2025'
];

const PUPPETEER_HEADLESS =
  process.env.PUPPETEER_HEADLESS === 'false' ? false : 'new';

function proficiencyToLevel(str = '') {
  const s = String(str).toLowerCase();
  if (/native|bilingual/.test(s)) return 100;
  if (/full/.test(s)) return 80;
  if (/professional/.test(s)) return 60;
  if (/limited/.test(s)) return 40;
  if (/elementary|basic/.test(s)) return 20;
  return 50;
}

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
    const tokenHtml = (tokens, heading) =>
      tokens
        .map((t, i) => {
          const text = t.text ? escapeHtml(t.text) : '';
          if (t.type === 'link') {
            const next = tokens[i + 1];
            const space = next && next.text && !/^\s/.test(next.text)
              ? ' '
              : '';
            return `<a href="${t.href}" target="_blank" rel="noopener noreferrer">${text.trim()}</a>${space}`;
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
            if (heading?.toLowerCase() === 'education') {
              return '<span class="edu-bullet">•</span> ';
            }
            return '<span class="bullet">•</span> ';
          }
          if (t.type === 'jobsep') return '';
          return text;
        })
        .join('');

    const htmlData = {
      ...data,
      sections: data.sections.map((sec) => {
        const heading = sec.heading?.toLowerCase();
        if (heading === 'work experience' || heading === 'projects') {
          const grouped = [];
          let current = null;
          sec.items.forEach((tokens) => {
            const isResp = tokens[0]?.type === 'tab';
            let html = tokenHtml(tokens, sec.heading);
            if (isResp) {
              html = html.replace(/^<span class="tab"><\/span>/, '');
              if (current) current.bullets.push(html);
            } else {
              html = html.replace(/^<span class="bullet">•<\/span>\s*/, '');
              current = { title: html, bullets: [] };
              grouped.push(current);
            }
          });
          return { ...sec, items: grouped };
        }
        if (heading === 'education' && templateId === '2025') {
          return {
            ...sec,
            items: sec.items.map((tokens) => {
              const plain = tokens
                .map((t) => t.text || '')
                .join('')
                .trim();
              const gpaMatch = plain.match(/\bGPA[:\s]*([0-9.]+(?:\/[0-9.]+)?)\b/i);
              let gpa = null;
              let html = tokenHtml(tokens, sec.heading);
              if (gpaMatch) {
                gpa = gpaMatch[1];
                const pattern = gpaMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(pattern, 'i');
                html = html
                  .replace(regex, '')
                  .replace(/[,;\-]+\s*$/, '')
                  .trim();
              }
              return { entry: html, gpa };
            }),
          };
        }
        return {
          ...sec,
          items: sec.items.map((tokens) => tokenHtml(tokens, sec.heading)),
        };
      }),
    };

    if (templateId === '2025') {
      if (data.contactTokens) {
        htmlData.contact = tokenHtml(data.contactTokens);
        const linkedIn = data.contactTokens.find(
          (t) => t.type === 'link' && /linkedin\.com/i.test(t.href || '')
        );
        if (linkedIn?.href) {
          try {
            const { default: QRCode } = await import('qrcode').catch(() => ({ default: null }));
            if (QRCode) {
              htmlData.linkedinQr = await QRCode.toDataURL(linkedIn.href, {
                margin: 0,
              });
            }
          } catch {
            /* ignore QR generation errors */
          }
        }
      }
      const skillsIdx = data.sections.findIndex(
        (s) => s.heading?.toLowerCase() === 'skills'
      );
      if (skillsIdx !== -1) {
        const sec = data.sections[skillsIdx];
        htmlData.skillsMatrix = sec.items.map((tokens) => {
          const text = tokens.map((t) => t.text || '').join('').trim();
          const parts = text.split('|').map((p) => p.trim()).filter(Boolean);
          let name = parts[0] || text;
          let icon = null;
          let level = 100;
          let levelStr = null;
          if (parts.length === 3) {
            icon = parts[1];
            levelStr = parts[2];
          } else if (parts.length === 2) {
            if (/^\d{1,3}%?$/.test(parts[1])) levelStr = parts[1];
            else icon = parts[1];
          } else {
            const match = text.match(/^(.*?)[\s\-:]+(\d{1,3})%?$/);
            if (match) {
              name = match[1].trim();
              levelStr = match[2];
            }
          }
          if (levelStr) {
            level = parseInt(levelStr, 10);
            if (level <= 5) level = (level / 5) * 100;
            if (level > 100) level = 100;
          }
          if (!icon) {
            icon = getSkillIcon(name);
          }
          let iconHtml = '';
          if (icon) {
            if (/^(https?:|data:|\/)/i.test(icon)) {
              iconHtml = `<img src="${icon}" alt="" class="skill-icon">`;
            } else {
              iconHtml = `<i class="skill-icon ${icon}"></i>`;
            }
          }
          return { name, level, iconHtml };
        });
        htmlData.sections = htmlData.sections.filter(
          (s) => s.heading?.toLowerCase() !== 'skills'
        );
      }
      const langIdx = data.sections.findIndex(
        (s) => s.heading?.toLowerCase() === 'languages'
      );
      if (langIdx !== -1) {
        const sec = data.sections[langIdx];
        htmlData.languages = sec.items.map((tokens) => {
          const text = tokens.map((t) => t.text || '').join('').trim();
          const match = text.match(/^(.*?)[\s\-:|]+(\d{1,3})%?$/);
          let name = text;
          let level = 100;
          if (match) {
            name = match[1].trim();
            level = parseInt(match[2], 10);
            if (level <= 5) level = (level / 5) * 100;
            if (level > 100) level = 100;
          } else {
            const paren = text.match(/^(.*?)\s*\((.*?)\)$/);
            if (paren) {
              name = paren[1].trim();
              level = proficiencyToLevel(paren[2]);
            }
          }
          return { name, level };
        });
        htmlData.sections = htmlData.sections.filter(
          (s) => s.heading?.toLowerCase() !== 'languages'
        );
      }
    }
    html = Handlebars.compile(templateSource)(htmlData);
    if (css) {
      html = html.replace('</head>', `<style>${css}</style></head>`);
    }
  }  
  let browser;
  try {
    // Launch using Chromium's default sandboxing.
    browser = await puppeteer.launch({
      headless: PUPPETEER_HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    // Ensure consistent layout width for templates that use multiple columns
    await page.setViewport({ width: 1000, height: 1414 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return pdfBuffer;
  } catch (err) {
    // If Chromium fails to launch due to missing sandbox support, re-run Puppeteer
    // with `args: ['--no-sandbox', '--disable-setuid-sandbox']` or install the
    // necessary OS sandbox dependencies. As a last resort, fall back to PDFKit.
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
      },
      sleek: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#4a90e2',
        bullet: '•',
        eduBullet: '•',
        bulletColor: '#4a90e2',
        textColor: '#333',
        lineGap: 8,
        paragraphGap: 12
      }
    };
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', (d) => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      doc.on('warning', (w) => {
        console.warn('PDFKit warning:', w);
      });
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
