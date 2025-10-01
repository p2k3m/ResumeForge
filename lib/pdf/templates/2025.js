import QRCode from 'qrcode';
import {
  buildSectionMap,
  extractEntries,
  uniqueByLowercase
} from '../utils.js';

class PdfLibUnavailableError extends Error {
  constructor(cause) {
    super(
      'pdf-lib dependency is not available. Install pdf-lib to enable the 2025 template.'
    );
    this.name = 'PdfLibUnavailableError';
    this.code = 'PDF_LIB_MISSING';
    if (cause) {
      this.cause = cause;
    }
  }
}

let pdfLibPromise;

async function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = (async () => {
      try {
        return await import('pdf-lib');
      } catch (error) {
        const message = error?.message || '';
        if (
          error?.code === 'ERR_MODULE_NOT_FOUND' ||
          error?.code === 'MODULE_NOT_FOUND' ||
          /Cannot find (?:package|module) 'pdf-lib'/i.test(message)
        ) {
          throw new PdfLibUnavailableError(error);
        }
        throw error;
      }
    })();
  }
  return pdfLibPromise;
}

const PROFICIENCY_MAP = {
  beginner: 0.35,
  novice: 0.35,
  junior: 0.45,
  intermediate: 0.65,
  proficient: 0.78,
  advanced: 0.88,
  senior: 0.9,
  expert: 0.95,
  master: 1
};

const DEFAULT_VARIANT = 'slate';

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function findEmail(rawText) {
  if (!rawText) return '';
  const match = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return match ? match[0] : '';
}

function findPhone(rawText) {
  if (!rawText) return '';
  const match = rawText.match(/(\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0] : '';
}

function findLinkedIn(rawText) {
  if (!rawText) return '';
  const match = rawText.match(/https?:\/\/[^\s]*linkedin\.com[^\s]*/i);
  return match ? match[0].replace(/[).,]+$/, '') : '';
}

function sanitizeTel(value) {
  if (!value) return '';
  const digits = value.replace(/[^+\d]/g, '');
  return digits.startsWith('+') ? digits : digits.replace(/^0+/, '');
}

function collectContactDetails(sectionEntries, rawText, options = {}) {
  const details = [];
  const seen = new Set();

  function pushDetail(label, value, href) {
    if (!value) return;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const key = `${label || 'value'}:${normalized}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    details.push({ label, value: normalized, href });
  }

  for (const entry of sectionEntries) {
    if (!entry || !entry.text) continue;
    if (entry.links && entry.links.length) {
      const link = entry.links[0];
      const label = entry.text.includes(':')
        ? entry.text.split(':')[0].trim()
        : link.text;
      pushDetail(label || link.text, link.text || entry.text, link.href);
      continue;
    }
    if (entry.text.includes(':')) {
      const [label, rest] = entry.text.split(/:/, 2);
      pushDetail(label.trim(), rest.trim(), undefined);
    } else {
      pushDetail(undefined, entry.text, undefined);
    }
  }

  const email = options.email || findEmail(rawText);
  if (email) {
    pushDetail('Email', email, `mailto:${email}`);
  }

  const phone = options.phone || findPhone(rawText);
  if (phone) {
    const tel = sanitizeTel(phone);
    pushDetail('Phone', phone, tel ? `tel:${tel}` : undefined);
  }

  const linkedin =
    options.linkedinProfileUrl || options.linkedinUrl || findLinkedIn(rawText);
  if (linkedin) {
    pushDetail('LinkedIn', linkedin, linkedin);
  }

  return details;
}

function parseDelimitedList(text) {
  if (!text) return [];
  return text
    .split(/[,;\u2022\u2023\u25e6\u2043\u2219\|]/)
    .map((item) => item.replace(/^[\s*-]+/, '').trim())
    .filter(Boolean);
}

function computeSkillMatrix(skillEntries, jobSkills = []) {
  const skills = [];
  const seen = new Set();
  const normalizedJobSkills = (jobSkills || []).map((s) => s.toLowerCase());

  for (const entry of skillEntries) {
    if (!entry || !entry.text) continue;
    const levelMatch = entry.text.match(/(beginner|novice|junior|intermediate|proficient|advanced|senior|expert|master)/i);
    const numericMatch = entry.text.match(/(\d{1,3})%/);
    let level;
    if (numericMatch) {
      const value = Math.min(100, Number(numericMatch[1]));
      level = Math.max(0.3, value / 100);
    } else if (levelMatch) {
      level = PROFICIENCY_MAP[levelMatch[1].toLowerCase()] || 0.7;
    }
    const names = parseDelimitedList(entry.text.replace(/\(.*?\)/g, ' '));
    if (!names.length) {
      const normalized = entry.text.replace(/^[\u2022\-\*]+\s*/, '').trim();
      if (normalized) names.push(normalized);
    }
    for (const name of names) {
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const jobIdx = normalizedJobSkills.indexOf(lower);
      const score = level || (jobIdx !== -1 ? 0.92 : 0.7);
      skills.push({ name, level: Math.max(0.3, Math.min(1, score)) });
    }
  }

  for (const jobSkill of normalizedJobSkills) {
    if (!jobSkill) continue;
    if (seen.has(jobSkill)) continue;
    seen.add(jobSkill);
    skills.push({
      name: jobSkill
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      level: 0.9
    });
  }

  return skills;
}

function extractLanguages(languageEntries) {
  const collected = [];
  for (const entry of languageEntries) {
    if (!entry || !entry.text) continue;
    const cleaned = entry.text.replace(/^[\u2022\-*]+\s*/, '');
    const items = parseDelimitedList(cleaned);
    if (items.length) collected.push(...items);
    else collected.push(cleaned.trim());
  }
  return uniqueByLowercase(collected);
}

function addLinkAnnotation(pdfDoc, page, x, y, width, height, url, primitives) {
  if (!url) return;
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  if (!safeWidth || !safeHeight) return;
  const { context } = pdfDoc;
  const { PDFName, PDFString, PDFArray } = primitives;
  const annotation = context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: context.obj([x, y, x + safeWidth, y + safeHeight]),
    Border: context.obj([0, 0, 0]),
    A: context.obj({
      Type: PDFName.of('Action'),
      S: PDFName.of('URI'),
      URI: PDFString.of(url)
    })
  });
  const annotationRef = context.register(annotation);
  const annotationsArray = page.node.lookup(PDFName.of('Annots'), PDFArray);
  if (annotationsArray) {
    annotationsArray.push(annotationRef);
  } else {
    page.node.set(PDFName.of('Annots'), context.obj([annotationRef]));
  }
}

function wrapText(font, text, size, maxWidth) {
  if (!text) return [''];
  const tokens = text.match(/(\s+|\S+)/g) || [];
  const lines = [];
  let current = '';
  let currentWidth = 0;

  const measure = (value) => font.widthOfTextAtSize(value, size);

  for (const token of tokens) {
    if (!token) continue;
    const tokenWidth = measure(token);
    const isWhitespace = /^\s+$/.test(token);
    if (!current) {
      current = token;
      currentWidth = tokenWidth;
      continue;
    }
    if (!isWhitespace && currentWidth + tokenWidth > maxWidth) {
      lines.push(current);
      current = token;
      currentWidth = tokenWidth;
      continue;
    }
    current += token;
    currentWidth += tokenWidth;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function selectFont(fonts, style) {
  if (style === 'bold' || style === 'bolditalic') return fonts.bold;
  if (style === 'italic') return fonts.italic;
  return fonts.regular;
}

function paragraphSlices(text) {
  const slices = [];
  if (!text) return slices;
  let index = 0;
  const length = text.length;
  while (index < length) {
    while (index < length && text[index] === '\n') index += 1;
    if (index >= length) break;
    let end = index;
    while (end < length && text[end] !== '\n') end += 1;
    const chunk = text.slice(index, end);
    if (/[^\s]/.test(chunk)) {
      slices.push({ text: chunk, start: index, end });
    }
    index = end + 1;
  }
  return slices;
}

function segmentLine(line, absoluteStart, styleRanges = [], linkRanges = []) {
  const boundaries = new Set([0, line.length]);
  for (const range of styleRanges) {
    if (range.start > absoluteStart && range.start < absoluteStart + line.length) {
      boundaries.add(range.start - absoluteStart);
    }
    if (range.end > absoluteStart && range.end < absoluteStart + line.length) {
      boundaries.add(range.end - absoluteStart);
    }
  }
  for (const range of linkRanges) {
    if (range.start > absoluteStart && range.start < absoluteStart + line.length) {
      boundaries.add(range.start - absoluteStart);
    }
    if (range.end > absoluteStart && range.end < absoluteStart + line.length) {
      boundaries.add(range.end - absoluteStart);
    }
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd <= segStart) continue;
    const text = line.slice(segStart, segEnd);
    if (!text) continue;
    const absoluteSegStart = absoluteStart + segStart;
    const absoluteSegEnd = absoluteStart + segEnd;
    const styleRange = styleRanges.find(
      (range) => range.start < absoluteSegEnd && range.end > absoluteSegStart
    );
    const linkRange = linkRanges.find(
      (range) => range.start < absoluteSegEnd && range.end > absoluteSegStart
    );
    segments.push({
      text,
      style: styleRange?.style,
      href: linkRange?.href
    });
  }
  return segments;
}

function normalizeEntry(entryOrText) {
  if (entryOrText && typeof entryOrText === 'object' && entryOrText.text !== undefined) {
    return {
      text: entryOrText.text || '',
      bullet: Boolean(entryOrText.bullet),
      links: Array.isArray(entryOrText.links) ? entryOrText.links : [],
      styleRanges: entryOrText.styleRanges || [],
      linkRanges: entryOrText.linkRanges || []
    };
  }
  const text = typeof entryOrText === 'string' ? entryOrText : '';
  return {
    text,
    bullet: false,
    links: [],
    styleRanges: [],
    linkRanges: []
  };
}

function drawSidebarHeading(ctx, text) {
  const { page, fonts, palette } = ctx;
  const size = ctx.sidebarHeadingSize;
  const y = ctx.y;
  page.drawText(text.toUpperCase(), {
    x: ctx.x,
    y,
    size,
    font: fonts.bold,
    color: palette.sidebarMuted
  });
  ctx.y = y - size - ctx.sidebarLineGap;
}

function drawSidebarText(ctx, item) {
  const { page, fonts, palette, pdfDoc, pdfPrimitives } = ctx;
  const lines = (item.value || item.text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return;
  for (const line of lines) {
    if (ctx.y < ctx.marginBottom + ctx.sidebarBodySize + 2) break;
    const y = ctx.y;
    page.drawText(line, {
      x: ctx.x,
      y,
      size: ctx.sidebarBodySize,
      font: fonts.regular,
      color: palette.sidebarText
    });
    if (item.href) {
      const width = fonts.regular.widthOfTextAtSize(line, ctx.sidebarBodySize);
      addLinkAnnotation(
        pdfDoc,
        page,
        ctx.x,
        y - 2,
        width,
        ctx.sidebarBodySize + 4,
        item.href,
        pdfPrimitives
      );
    }
    ctx.y = y - ctx.sidebarBodySize - ctx.sidebarLineGap;
  }
}

function drawSkillBars(ctx, skills) {
  const { page, fonts, palette } = ctx;
  const barHeight = ctx.skillBarHeight;
  const gap = ctx.sidebarLineGap;
  const size = ctx.sidebarBodySize;
  const availableWidth = ctx.width;
  for (const skill of skills) {
    if (ctx.y < ctx.marginBottom + size + barHeight + gap) break;
    const labelY = ctx.y;
    page.drawText(skill.name, {
      x: ctx.x,
      y: labelY,
      size,
      font: fonts.bold,
      color: palette.sidebarText
    });
    const barY = labelY - size - 2;
    page.drawRectangle({
      x: ctx.x,
      y: barY,
      width: availableWidth,
      height: barHeight,
      color: palette.sidebarBarBackground
    });
    page.drawRectangle({
      x: ctx.x,
      y: barY,
      width: availableWidth * Math.max(0.1, Math.min(1, skill.level)),
      height: barHeight,
      color: palette.accentHighlight
    });
    ctx.y = barY - gap - barHeight;
  }
}

function ensureRightSpace(ctx, amount) {
  if (ctx.y - amount <= ctx.marginBottom) {
    ctx.addPage();
  }
}

function drawRightHeading(ctx, text) {
  ensureRightSpace(ctx, ctx.headingSize + ctx.lineGap + 2);
  const { page, fonts, palette } = ctx;
  const y = ctx.y;
  page.drawText(text.toUpperCase(), {
    x: ctx.x,
    y,
    size: ctx.headingSize,
    font: fonts.bold,
    color: palette.accent
  });
  const lineY = y - ctx.headingSize - 2;
  page.drawLine({
    start: { x: ctx.x, y: lineY },
    end: { x: ctx.x + ctx.width, y: lineY },
    thickness: 1,
    color: palette.divider
  });
  ctx.y = lineY - ctx.sectionGap / 2;
}

function drawParagraph(ctx, entryInput, { bullet = false, font, color } = {}) {
  const entry = normalizeEntry(entryInput);
  if (!entry.text) return;
  const { page, fonts, palette, pdfDoc, pdfPrimitives } = ctx;
  const baseFont = font || fonts.regular;
  const size = ctx.bodySize;
  const lineGap = ctx.lineGap;
  const bulletIndent = bullet ? ctx.bulletIndent : 0;
  const segments = paragraphSlices(entry.text);
  if (!segments.length) return;

  let firstLine = true;
  const defaultColor = color || palette.text;

  for (const paragraph of segments) {
    const lines = wrapText(baseFont, paragraph.text, size, ctx.width - bulletIndent);
    if (!lines.length) continue;
    let consumed = 0;
    for (const line of lines) {
      ensureRightSpace(ctx, size + lineGap + 1);
      const y = ctx.y;
      if (bullet && firstLine) {
        page.drawText('•', {
          x: ctx.x,
          y,
          size,
          font: fonts.bold,
          color: defaultColor
        });
      }
      const lineStart = paragraph.start + consumed;
      consumed += line.length;
      const textX = ctx.x + bulletIndent;
      let cursorX = textX;
      const lineSegments = segmentLine(
        line,
        lineStart,
        entry.styleRanges,
        entry.linkRanges
      );
      const renderSegments = lineSegments.length ? lineSegments : [{ text: line }];
      for (const segment of renderSegments) {
        const segText = segment.text;
        if (!segText) continue;
        const segmentFont = segment.style ? selectFont(fonts, segment.style) : baseFont;
        const segIsWhitespace = /^\s+$/.test(segText);
        const width = segmentFont.widthOfTextAtSize(segText, size);
        if (segIsWhitespace && !segment.href) {
          cursorX += width;
          continue;
        }
        const segColor = segment.href ? palette.accent : defaultColor;
        page.drawText(segText, {
          x: cursorX,
          y,
          size,
          font: segmentFont,
          color: segColor
        });
        if (segment.href) {
          addLinkAnnotation(
            pdfDoc,
            page,
            cursorX,
            y - 2,
            width,
            size + 4,
            segment.href,
            pdfPrimitives
          );
        }
        cursorX += width;
      }
      ctx.y = y - size - lineGap;
      firstLine = false;
    }
  }
}

function drawRightEntries(ctx, entries, { allowBullets = true, placeholder } = {}) {
  const items = entries && entries.length ? entries : placeholder ? [{ text: placeholder }] : [];
  for (const entry of items) {
    if (!entry || !entry.text) continue;
    const bullet = allowBullets && entry.bullet;
    drawParagraph(ctx, entry, { bullet });
    ctx.y -= ctx.paragraphGap;
  }
}

function drawProjectSection(ctx, entries, fallback) {
  const items = entries && entries.length ? entries : fallback ? [{ text: fallback }] : [];
  for (const entry of items) {
    if (!entry || !entry.text) continue;
    drawParagraph(ctx, entry, { bullet: true });
    ctx.y -= ctx.paragraphGap;
  }
}

function drawHeader(page, fonts, palette, layout, options, pageNumber) {
  let y = page.getHeight() - layout.marginTop;
  const name = options.name || 'Resume';
  page.drawText(name, {
    x: layout.marginLeft,
    y,
    size: layout.nameSize,
    font: fonts.bold,
    color: palette.accent
  });
  y -= layout.nameSize + 4;
  if (options.jobTitle) {
    page.drawText(options.jobTitle, {
      x: layout.marginLeft,
      y,
      size: layout.subtitleSize,
      font: fonts.italic,
      color: palette.muted
    });
    y -= layout.subtitleSize + 8;
  } else {
    y -= 6;
  }
  page.drawLine({
    start: { x: layout.marginLeft, y },
    end: { x: page.getWidth() - layout.marginRight, y },
    thickness: 1,
    color: palette.divider
  });
  if (pageNumber > 1) {
    page.drawText(`Page ${pageNumber}`, {
      x: page.getWidth() - layout.marginRight - 60,
      y: y + 4,
      size: 8,
      font: fonts.regular,
      color: palette.muted
    });
  }
  return y - layout.headerGap;
}

export async function render2025Template({
  data = {},
  rawText = '',
  options = {},
  templateParams = {}
}) {
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    PDFName,
    PDFString,
    PDFArray
  } = await loadPdfLib();

  const COLOR_VARIANTS = {
    slate: {
      accent: rgb(46 / 255, 84 / 255, 140 / 255),
      accentHighlight: rgb(96 / 255, 140 / 255, 220 / 255),
      sidebar: rgb(32 / 255, 43 / 255, 64 / 255),
      sidebarText: rgb(1, 1, 1),
      sidebarMuted: rgb(208 / 255, 217 / 255, 234 / 255),
      sidebarBarBackground: rgb(56 / 255, 70 / 255, 98 / 255),
      text: rgb(36 / 255, 36 / 255, 40 / 255),
      muted: rgb(108 / 255, 112 / 255, 122 / 255),
      divider: rgb(200 / 255, 205 / 255, 215 / 255)
    },
    midnight: {
      accent: rgb(38 / 255, 72 / 255, 128 / 255),
      accentHighlight: rgb(80 / 255, 120 / 255, 210 / 255),
      sidebar: rgb(18 / 255, 26 / 255, 46 / 255),
      sidebarText: rgb(233 / 255, 238 / 255, 255 / 255),
      sidebarMuted: rgb(190 / 255, 198 / 255, 218 / 255),
      sidebarBarBackground: rgb(42 / 255, 60 / 255, 96 / 255),
      text: rgb(32 / 255, 32 / 255, 36 / 255),
      muted: rgb(102 / 255, 106 / 255, 118 / 255),
      divider: rgb(198 / 255, 205 / 255, 220 / 255)
    },
    sunrise: {
      accent: rgb(198 / 255, 92 / 255, 56 / 255),
      accentHighlight: rgb(228 / 255, 132 / 255, 92 / 255),
      sidebar: rgb(78 / 255, 40 / 255, 32 / 255),
      sidebarText: rgb(255 / 255, 239 / 255, 224 / 255),
      sidebarMuted: rgb(250 / 255, 210 / 255, 190 / 255),
      sidebarBarBackground: rgb(112 / 255, 64 / 255, 50 / 255),
      text: rgb(44 / 255, 36 / 255, 32 / 255),
      muted: rgb(122 / 255, 88 / 255, 76 / 255),
      divider: rgb(222 / 255, 196 / 255, 184 / 255)
    },
    emerald: {
      accent: rgb(40 / 255, 132 / 255, 102 / 255),
      accentHighlight: rgb(84 / 255, 180 / 255, 150 / 255),
      sidebar: rgb(20 / 255, 70 / 255, 62 / 255),
      sidebarText: rgb(224 / 255, 246 / 255, 240 / 255),
      sidebarMuted: rgb(188 / 255, 226 / 255, 216 / 255),
      sidebarBarBackground: rgb(46 / 255, 108 / 255, 94 / 255),
      text: rgb(34 / 255, 46 / 255, 40 / 255),
      muted: rgb(94 / 255, 116 / 255, 104 / 255),
      divider: rgb(190 / 255, 210 / 255, 204 / 255)
    }
  };

  function pickPalette(variant) {
    if (!variant) return COLOR_VARIANTS[DEFAULT_VARIANT];
    const key = variant.toLowerCase();
    return COLOR_VARIANTS[key] || COLOR_VARIANTS[DEFAULT_VARIANT];
  }

  const pdfPrimitives = { PDFName, PDFString, PDFArray };

  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
  };

  const variant = templateParams.variant || DEFAULT_VARIANT;
  const palette = pickPalette(variant);

  const pageWidth = parseNumber(templateParams.pageWidth, 612);
  const pageHeight = parseNumber(templateParams.pageHeight, 792);
  const margin = parseNumber(templateParams.margin, 44);
  const marginTop = parseNumber(templateParams.marginTop, margin);
  const marginBottom = parseNumber(templateParams.marginBottom, margin);
  const marginLeft = parseNumber(templateParams.marginLeft, margin);
  const marginRight = parseNumber(templateParams.marginRight, margin);
  const leftColumnWidth = parseNumber(templateParams.leftColumnWidth, 190);
  const gutter = parseNumber(templateParams.gutter, 28);
  const sidebarPadding = parseNumber(templateParams.sidebarPadding, 16);

  const nameSize = parseNumber(templateParams.nameSize, 26);
  const subtitleSize = parseNumber(templateParams.subtitleSize, 12);
  const headerGap = parseNumber(templateParams.headerGap, 14);
  const headingSize = parseNumber(templateParams.headingSize, 13);
  const bodySize = parseNumber(templateParams.bodySize, 10.5);
  const lineGap = parseNumber(templateParams.lineGap, 4);
  const paragraphGap = parseNumber(templateParams.paragraphGap, 4);
  const sectionGap = parseNumber(templateParams.sectionGap, 16);
  const bulletIndent = parseNumber(templateParams.bulletIndent, 14);
  const sidebarBodySize = parseNumber(templateParams.sidebarBodySize, 10);
  const sidebarHeadingSize = parseNumber(templateParams.sidebarHeadingSize, 11);
  const sidebarLineGap = parseNumber(templateParams.sidebarLineGap, 6);
  const skillBarHeight = parseNumber(templateParams.skillBarHeight, 6);
  const qrSize = parseNumber(templateParams.qrSize, 72);

  const layout = {
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    nameSize,
    subtitleSize,
    headerGap
  };

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const sectionMap = buildSectionMap(sections);
  const summaryEntries = extractEntries(
    sectionMap.get('summary') || sectionMap.get('professional summary')
  );
  const experienceEntries = extractEntries(
    sectionMap.get('experience') ||
      sectionMap.get('work experience') ||
      sectionMap.get('professional experience')
  );
  const educationEntries = extractEntries(sectionMap.get('education'));
  const projectEntries = extractEntries(sectionMap.get('projects'));
  const skillsEntries = extractEntries(sectionMap.get('skills'));
  const languageEntries = extractEntries(sectionMap.get('languages'));
  const contactEntries = extractEntries(sectionMap.get('contact'));
  const certificationEntries = extractEntries(
    sectionMap.get('certification') || sectionMap.get('certifications')
  );

  if (options.project && (!projectEntries || !projectEntries.length)) {
    projectEntries.push({ text: options.project, bullet: true });
  }

  const contactDetails = collectContactDetails(contactEntries, rawText, {
    linkedinProfileUrl: options.linkedinProfileUrl,
    email: options.email,
    phone: options.phone
  });

  const skillMatrix = computeSkillMatrix(skillsEntries, options.jobSkills || []);
  const maxSkills = parseNumber(templateParams.maxSkills, 12);
  const displayedSkills = maxSkills ? skillMatrix.slice(0, maxSkills) : skillMatrix;

  const languages = extractLanguages(languageEntries);

  let pageCount = 0;
  function createPage({ includeSidebar = false } = {}) {
    pageCount += 1;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    if (includeSidebar || templateParams.sidebarOnExtraPages) {
      page.drawRectangle({
        x: marginLeft - sidebarPadding,
        y: marginBottom,
        width: leftColumnWidth + sidebarPadding * 2,
        height: pageHeight - marginTop - marginBottom,
        color: palette.sidebar
      });
    }
    const headerBottom = drawHeader(
      page,
      fonts,
      palette,
      layout,
      {
        name: data.name || options.applicantName || 'Resume',
        jobTitle: options.jobTitle
      },
      pageCount
    );
    return { page, headerBottom };
  }

  const firstPage = createPage({ includeSidebar: true });
  const columnStartY = firstPage.headerBottom - 6;

  const sidebarContext = {
    pdfDoc,
    pdfPrimitives,
    page: firstPage.page,
    x: marginLeft - sidebarPadding + sidebarPadding,
    y: columnStartY,
    width: leftColumnWidth,
    fonts,
    palette,
    marginBottom,
    sidebarBodySize,
    sidebarHeadingSize,
    sidebarLineGap,
    skillBarHeight
  };

  const rightColumnX = marginLeft + leftColumnWidth + gutter;
  const rightColumnWidth = pageWidth - rightColumnX - marginRight;

  const rightContext = {
    pdfDoc,
    pdfPrimitives,
    page: firstPage.page,
    x: rightColumnX,
    y: columnStartY,
    width: rightColumnWidth,
    fonts,
    palette,
    marginBottom,
    headingSize,
    bodySize,
    lineGap,
    paragraphGap,
    sectionGap,
    bulletIndent,
    addPage: () => {
      const nextPage = createPage({ includeSidebar: false });
      rightContext.page = nextPage.page;
      rightContext.y = nextPage.headerBottom - 6;
    }
  };

  sidebarContext.marginBottom = marginBottom;

  drawSidebarHeading(sidebarContext, 'Contact');

  if (options.linkedinProfileUrl) {
    if (sidebarContext.y - qrSize - sidebarLineGap > marginBottom) {
      const qrDataUrl = await QRCode.toDataURL(options.linkedinProfileUrl, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 256
      });
      const base64 = qrDataUrl.split(',')[1];
      const qrImage = await pdfDoc.embedPng(Buffer.from(base64, 'base64'));
      const qrX = sidebarContext.x + sidebarContext.width - qrSize;
      const qrY = sidebarContext.y - qrSize;
      sidebarContext.page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize
      });
      sidebarContext.y = qrY - sidebarLineGap;
      sidebarContext.page.drawText('LinkedIn QR', {
        x: sidebarContext.x,
        y: sidebarContext.y,
        size: sidebarBodySize - 1,
        font: fonts.regular,
        color: palette.sidebarMuted
      });
      sidebarContext.y -= sidebarBodySize + sidebarLineGap;
    }
  }

  const contactPlaceholder = contactDetails.length
    ? contactDetails
    : [{ label: 'Email', value: options.email || 'Provided upon request' }];

  for (const detail of contactPlaceholder) {
    if (sidebarContext.y < marginBottom + sidebarBodySize + 2) break;
    const label = detail.label ? `${detail.label}: ` : '';
    if (label) {
      sidebarContext.page.drawText(label, {
        x: sidebarContext.x,
        y: sidebarContext.y,
        size: sidebarBodySize,
        font: fonts.bold,
        color: palette.sidebarMuted
      });
      const labelWidth = fonts.bold.widthOfTextAtSize(label, sidebarBodySize);
      sidebarContext.page.drawText(detail.value || detail.text || '', {
        x: sidebarContext.x + labelWidth,
        y: sidebarContext.y,
        size: sidebarBodySize,
        font: fonts.regular,
        color: palette.sidebarText
      });
      if (detail.href) {
        const width = fonts.regular.widthOfTextAtSize(
          detail.value || detail.text || '',
          sidebarBodySize
        );
        addLinkAnnotation(
          pdfDoc,
          sidebarContext.page,
          sidebarContext.x + labelWidth,
          sidebarContext.y - 2,
          width,
          sidebarBodySize + 4,
          detail.href,
          pdfPrimitives
        );
      }
      sidebarContext.y -= sidebarBodySize + sidebarLineGap;
    } else {
      drawSidebarText(sidebarContext, detail);
    }
  }

  sidebarContext.y -= sidebarLineGap;
  drawSidebarHeading(sidebarContext, 'Skills');
  if (displayedSkills.length) {
    drawSkillBars(sidebarContext, displayedSkills);
  } else {
    drawSidebarText(sidebarContext, { text: 'Skills available upon request.' });
  }

  if (certificationEntries.length) {
    sidebarContext.y -= sidebarLineGap;
    drawSidebarHeading(sidebarContext, 'Certifications');
    for (const cert of certificationEntries) {
      if (!cert.text) continue;
      const href = cert.links && cert.links.length ? cert.links[0].href : undefined;
      drawSidebarText(sidebarContext, { text: cert.text, href });
    }
  }

  sidebarContext.y -= sidebarLineGap;
  drawSidebarHeading(sidebarContext, 'Languages');
  if (languages.length) {
    for (const language of languages) {
      drawSidebarText(sidebarContext, { text: language });
    }
  } else {
    drawSidebarText(sidebarContext, { text: 'English (fluent)' });
  }

  const summaryPlaceholder =
    summaryEntries.length > 0
      ? summaryEntries
      : [{ text: 'Experienced professional with a focus on delivering measurable business value.' }];

  rightContext.headingSize = headingSize;
  rightContext.bodySize = bodySize;
  rightContext.lineGap = lineGap;
  rightContext.paragraphGap = paragraphGap;
  rightContext.sectionGap = sectionGap;
  rightContext.bulletIndent = bulletIndent;

  drawRightHeading(rightContext, 'Summary');
  drawRightEntries(rightContext, summaryPlaceholder, { allowBullets: false });
  rightContext.y -= sectionGap / 2;

  drawRightHeading(rightContext, 'Experience');
  drawRightEntries(rightContext, experienceEntries, {
    placeholder: 'Professional experience details forthcoming.'
  });
  rightContext.y -= sectionGap / 2;

  drawRightHeading(rightContext, 'Projects');
  drawProjectSection(
    rightContext,
    projectEntries,
    options.project || 'Highlighted project details forthcoming.'
  );
  rightContext.y -= sectionGap / 2;

  drawRightHeading(rightContext, 'Education');
  drawRightEntries(rightContext, educationEntries, {
    placeholder: 'Education history available upon request.'
  });
  rightContext.y -= sectionGap / 2;

  const skillTextEntries = displayedSkills.map((skill) => ({
    text: `${skill.name} – proficiency ${(skill.level * 100).toFixed(0)}%`
  }));
  drawRightHeading(rightContext, 'Skills');
  drawRightEntries(rightContext, skillTextEntries, { allowBullets: false });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
