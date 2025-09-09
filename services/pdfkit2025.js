import PDFDocument from 'pdfkit';
import path from 'path';
import { getSkillIcon } from '../skillIcons.js';

function proficiencyToLevel(str = '') {
  const s = String(str).toLowerCase();
  if (/native|bilingual/.test(s)) return 100;
  if (/full/.test(s)) return 80;
  if (/professional/.test(s)) return 60;
  if (/limited/.test(s)) return 40;
  if (/elementary|basic/.test(s)) return 20;
  return 50;
}

export async function render2025Pdf(data, options = {}, style) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const buffers = [];
    doc.on('data', (d) => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.on('warning', (w) => console.warn('PDFKit warning:', w));

    let contact = '';
    if (data.contactTokens) {
      contact = data.contactTokens
        .map((t) => (t.text ? t.text : t.href ? t.href : ''))
        .join('');
    }
    const sections = [...data.sections];
    const skillsIdx = sections.findIndex(
      (s) => s.heading?.toLowerCase() === 'skills'
    );
    let skillsMatrix = [];
    if (skillsIdx !== -1) {
      const sec = sections.splice(skillsIdx, 1)[0];
      skillsMatrix = sec.items.map((tokens) => {
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
        if (!icon) icon = getSkillIcon(name);
        return { name, level, icon };
      });
    }

    const langIdx = sections.findIndex(
      (s) => s.heading?.toLowerCase() === 'languages'
    );
    let languages = [];
    if (langIdx !== -1) {
      const sec = sections.splice(langIdx, 1)[0];
      languages = sec.items.map((tokens) => {
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
    }

    doc
      .font(style.bold)
      .fillColor(style.headingColor)
      .fontSize(24)
      .text(data.name, { align: 'left' })
      .fillColor(style.textColor)
      .fontSize(10)
      .text(contact);

    doc.moveDown(2);
    const contentWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    if (skillsMatrix.length) {
      doc
        .font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(16)
        .text('Skills');
      doc.moveDown(0.5);
      let y = doc.y;
      const barHeight = 8;
      skillsMatrix.forEach((s) => {
        let x = doc.page.margins.left;
        if (s.icon) {
          if (/^(https?:|data:|\\/)/i.test(s.icon)) {
            try {
              doc.image(s.icon, x, y - 2, { width: 12, height: 12 });
            } catch {
              /* ignore */
            }
          } else {
            try {
              const faPath = path.resolve(
                'assets',
                'fontawesome',
                'webfonts',
                'fa-solid-900.ttf'
              );
              if (!doc._fontFamilies.FASolid)
                doc.registerFont('FASolid', faPath);
              doc.font('FASolid').fontSize(12).text('\uf111', x, y - 2);
              doc.font(style.font);
            } catch {
              doc.save();
              doc.circle(x + 4, y + 4, 4).fill(style.headingColor);
              doc.restore();
            }
          }
          x += 16;
        }
        doc
          .font(style.font)
          .fontSize(12)
          .fillColor(style.textColor)
          .text(s.name, x, y);
        y = doc.y + 2;
        doc.save();
        doc
          .rect(doc.page.margins.left, y, contentWidth, barHeight)
          .fill('#e5e5e5');
        doc
          .rect(
            doc.page.margins.left,
            y,
            (contentWidth * s.level) / 100,
            barHeight
          )
          .fill(style.headingColor);
        doc.restore();
        y += barHeight + 6;
        doc.y = y;
      });
      doc.moveDown();
    }

    if (languages.length) {
      doc
        .font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(16)
        .text('Languages');
      doc.moveDown(0.5);
      let y = doc.y;
      const barHeight = 8;
      languages.forEach((l) => {
        doc
          .font(style.font)
          .fontSize(12)
          .fillColor(style.textColor)
          .text(l.name, doc.page.margins.left, y);
        y = doc.y + 2;
        doc.save();
        doc
          .rect(doc.page.margins.left, y, contentWidth, barHeight)
          .fill('#e5e5e5');
        doc
          .rect(
            doc.page.margins.left,
            y,
            (contentWidth * l.level) / 100,
            barHeight
          )
          .fill(style.headingColor);
        doc.restore();
        y += barHeight + 6;
        doc.y = y;
      });
      doc.moveDown();
    }

    const colGap = 20;
    const colWidth = (contentWidth - colGap) / 2;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const xPositions = [
      doc.page.margins.left,
      doc.page.margins.left + colWidth + colGap
    ];
    let yPos = [doc.y, doc.y];

    const tokensToPlain = (tokens) =>
      tokens
        .map((t) => {
          if (t.type === 'bullet') return `${style.bullet} `;
          if (t.type === 'newline') return '\n';
          if (t.type === 'tab') return '    ';
          return t.text || '';
        })
        .join('');

    const sectionHeight = (sec) => {
      const text =
        (sec.heading ? sec.heading + '\n' : '') +
        sec.items.map(tokensToPlain).join('\n');
      return doc.heightOfString(text, { width: colWidth });
    };

    sections.forEach((sec) => {
      const h = sectionHeight(sec);
      let col = 0;
      if (yPos[col] + h > bottom) col = 1;
      if (yPos[col] + h > bottom) {
        doc.addPage();
        yPos = [doc.page.margins.top, doc.page.margins.top];
        col = 0;
      }
      doc.x = xPositions[col];
      doc.y = yPos[col];
      doc
        .font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(14)
        .text(sec.heading, { width: colWidth });
      (sec.items || []).forEach((tokens) => {
        const startY = doc.y;
        doc.font(style.font).fontSize(12).fillColor(style.textColor);
        tokens.forEach((t, idx) => {
          if (t.type === 'bullet') {
            const glyph =
              sec.heading?.toLowerCase() === 'education'
                ? style.eduBullet || style.bullet
                : style.bullet;
            doc
              .fillColor(style.bulletColor)
              .text(`${glyph} `, { continued: true });
            doc.fillColor(style.textColor);
            return;
          }
          if (t.type === 'jobsep') return;
          if (t.type === 'newline') {
            doc.text('', { continued: false });
            doc.text('   ', { continued: true });
            return;
          }
          const opts = { continued: idx < tokens.length - 1 };
          if (t.type === 'tab') {
            doc.text('    ', opts);
            return;
          }
          if (t.type === 'link') {
            doc.fillColor('blue');
            doc.text(t.text, {
              link: t.href,
              underline: true,
              continued: false
            });
            if (idx < tokens.length - 1) doc.text('', { continued: true });
            doc.fillColor(style.textColor);
            return;
          }
          if (t.type === 'heading') {
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
      });
      yPos[col] = doc.y + style.paragraphGap;
    });

    doc.end();
  });
}

export default render2025Pdf;
