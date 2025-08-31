import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import fs from 'fs/promises';
import fsSync from 'fs';
import { logEvent } from './logger.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import JSON5 from 'json5';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .pdf, .doc, .docx files are allowed'));
    }
    if (ext === '.doc') {
      return cb(new Error('Legacy .doc files are not supported. Please upload a .pdf or .docx file.'));
    }
    cb(null, true);
  }
});

const uploadResume = upload.single('resume');

const DEFAULT_SECRET_ID = 'ResumeForge';
const DEFAULT_AWS_REGION = 'ap-south-1';

const TEMPLATE_IDS = ['modern', 'ucmo', 'professional', 'vibrant', '2025'];

process.env.SECRET_ID = process.env.SECRET_ID || DEFAULT_SECRET_ID;
process.env.AWS_REGION = process.env.AWS_REGION || DEFAULT_AWS_REGION;

const region = process.env.AWS_REGION || 'ap-south-1';
const secretsClient = new SecretsManagerClient({ region });

let secretCache;
async function getSecrets() {
  if (secretCache) return secretCache;
  const secretId = process.env.SECRET_ID;
  if (!secretId) {
    try {
      const data = await fs.readFile(path.resolve('local-secrets.json'), 'utf-8');
      secretCache = JSON.parse(data);
      return secretCache;
    } catch (err) {
      throw new Error('SECRET_ID environment variable is required');
    }
  }
  const { SecretString } = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  secretCache = JSON.parse(SecretString ?? '{}');
  return secretCache;
}

function parseLine(text) {
  text = text.replace(/^\*\s+/, '');
  const tokens = [];
  const parts = text.split(/(\n|\t)/);
  for (const part of parts) {
    if (part === '\n') {
      tokens.push({ type: 'newline' });
      continue;
    }
    if (part === '\t') {
      tokens.push({ type: 'tab' });
      continue;
    }
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+)/g;
    let lastIndex = 0;
    let match;

    function flushSegment(segment) {
      if (!segment) return;
      tokens.push(...parseEmphasis(segment));
    }

    while ((match = linkRegex.exec(part)) !== null) {
      if (match.index > lastIndex) {
        flushSegment(part.slice(lastIndex, match.index));
      }
      if (match[1] && match[2]) {
        tokens.push({
          type: 'link',
          text: match[1].replace(/[*_]/g, ''),
          href: match[2],
          continued: true
        });
      } else if (match[3]) {
        const domainMap = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub' };
        let label = match[3];
        try {
          const hostname = new URL(match[3]).hostname.replace(/^www\./, '');
          label = domainMap[hostname] || match[3];
        } catch {
          label = match[3];
        }
        tokens.push({
          type: 'link',
          text: label.replace(/[*_]/g, ''),
          href: match[3],
          continued: true
        });
      }
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < part.length) {
      flushSegment(part.slice(lastIndex));
    }
  }
  if (tokens.length === 0) {
    return [{ type: 'paragraph', text: text.replace(/[*_]/g, '') }];
  }
  const filtered = tokens.filter((t) => t.type !== 'paragraph' || t.text);
  filtered.forEach((t, i) => {
    if (t.type === 'newline' || t.type === 'tab') return;
    t.continued = i < filtered.length - 1;
  });
  return filtered;
}

function parseEmphasis(segment) {
  const tokens = [];
  let i = 0;
  let buffer = '';
  const stack = [];

  const pushBuffer = () => {
    if (!buffer) return;
    tokens.push({ type: 'paragraph', text: buffer, style: styleFromStack(), continued: true });
    buffer = '';
  };

  const styleFromStack = () => {
    const hasBold = stack.some((s) => s.type === 'bold' || s.type === 'bolditalic');
    const hasItalic = stack.some((s) => s.type === 'italic' || s.type === 'bolditalic');
    if (hasBold && hasItalic) return 'bolditalic';
    if (hasBold) return 'bold';
    if (hasItalic) return 'italic';
    return undefined;
  };

  while (i < segment.length) {
    const ch = segment[i];
    if (ch === '*' || ch === '_') {
      let count = 1;
      while (segment[i + count] === ch) count++;
      let remaining = count;
      while (remaining > 0) {
        const markerLen = remaining >= 3 ? 3 : remaining >= 2 ? 2 : 1;
        const type = markerLen === 3 ? 'bolditalic' : markerLen === 2 ? 'bold' : 'italic';
        const ahead = segment.indexOf(ch.repeat(markerLen), i + markerLen);
        if (
          stack.length &&
          stack[stack.length - 1].char === ch &&
          stack[stack.length - 1].type === type
        ) {
          pushBuffer();
          stack.pop();
        } else if (ahead !== -1) {
          pushBuffer();
          stack.push({ char: ch, type });
        }
        i += markerLen;
        remaining -= markerLen;
      }
    } else {
      buffer += ch;
      i++;
    }
  }

  pushBuffer();
  if (stack.length) {
    tokens.forEach((t) => {
      t.style = undefined;
    });
  }
  tokens.forEach((t) => {
    if (t.text) t.text = t.text.replace(/[*_]/g, '');
  });
  return tokens.filter((t) => t.text);
}


function ensureRequiredSections(data) {
  const required = ['Work Experience', 'Education'];
  required.forEach((heading) => {
    if (!data.sections.some((s) => s.heading.toLowerCase() === heading.toLowerCase())) {
      data.sections.push({ heading, items: [] });
    }
  });
  return data;
}


function parseContent(text) {
  try {
    const data = JSON.parse(text);
    const name = data.name || 'Resume';
    const rawSections = Array.isArray(data.sections)
      ? data.sections
      : Object.entries(data).map(([heading, content]) => ({ heading, content }));
    const sections = rawSections.map((sec) => {
      const heading = sec.heading || '';
      const items = [];
      const src = sec.items || sec.content;
      if (Array.isArray(src)) {
        src.forEach((i) => items.push(parseLine(String(i))));
      } else if (src) {
        items.push(parseLine(String(src)));
      }
      return {
        heading,
        items: items.map((tokens) =>
          tokens.reduce((acc, t, i) => {
            acc.push(t);
            const next = tokens[i + 1];
            if (
              next &&
              t.text &&
              next.text &&
              !/\s$/.test(t.text) &&
              !/^\s/.test(next.text)
            ) {
              acc.push({ type: 'paragraph', text: ' ' });
            }
            return acc;
          }, [])
        )
      };
    });
    return ensureRequiredSections({ name, sections });
  } catch {
    const lines = text.split(/\r?\n/);
    const name = (lines.shift() || 'Resume').trim();
    const sections = [];
    let currentSection = { heading: 'Summary', items: [] };
    sections.push(currentSection);
    let current = [];
    for (const raw of lines) {
      const line = raw.replace(/\t/g, '\u0009');
      if (!line.trim()) {
        if (current.length) current.push({ type: 'newline' });
        continue;
      }
      const headingMatch = line.trim().match(/^#{1,6}\s+(.*)/);
      if (headingMatch) {
        if (current.length) {
          currentSection.items.push(current);
          current = [];
        }
        if (
          currentSection.items.length === 0 &&
          currentSection.heading === 'Summary'
        ) {
          sections.pop();
        }
        currentSection = { heading: headingMatch[1].trim(), items: [] };
        sections.push(currentSection);
        continue;
      }
      const bulletMatch = line.match(/^[-*]\s*(.*)/);
      if (bulletMatch) {
        if (current.length) currentSection.items.push(current);
        current = parseLine(bulletMatch[1]);
        continue;
      }
      const indentMatch = line.match(/^\s+(.*)/);
      if (indentMatch && current.length) {
        current.push({ type: 'newline' });
        const tabs = (line.match(/^\s+/) || [''])[0];
        for (const ch of tabs) {
          if (ch === '\u0009') current.push({ type: 'tab' });
        }
        // Preserve internal spacing on continuation lines
        current.push(...parseLine(indentMatch[1]));
        continue;
      }
      if (current.length) currentSection.items.push(current);
      current = parseLine(line.trim());
    }
    if (current.length) currentSection.items.push(current);
    if (sections.length && sections[0].heading === 'Summary' && sections[0].items.length === 0) {
      sections.shift();
    }
    sections.forEach((sec, sIdx) => {
      sec.items = sec.items.map((tokens) =>
        tokens.reduce((acc, t, i) => {
          acc.push(t);
          const next = tokens[i + 1];
          if (
            next &&
            t.text &&
            next.text &&
            !/\s$/.test(t.text) &&
            !/^\s/.test(next.text)
          ) {
            acc.push({ type: 'paragraph', text: ' ' });
          }
          return acc;
        }, [])
      );
    });
    return ensureRequiredSections({ name, sections });
  }
}

let generatePdf = async function (text, templateId = 'modern') {
  if (!TEMPLATE_IDS.includes(templateId)) templateId = 'modern';
  const data = parseContent(text);
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
          .map((t) => {
            if (t.type === 'link') {
              return `<a href="${t.href}">${t.text}</a>`;
            }
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
  let html = Handlebars.compile(templateSource)(htmlData);
  if (css) {
    html = html.replace('</head>', `<style>${css}</style></head>`);
  }
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return pdfBuffer;
  } catch (err) {
    // Fallback for environments without Chromium dependencies
    const { default: PDFDocument } = await import('pdfkit');
    const styleMap = {
      modern: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#2a9d8f',
        bullet: '•',
        bulletColor: '#2a9d8f',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      professional: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#1d3557',
        bullet: '▹',
        bulletColor: '#1d3557',
        textColor: '#222',
        lineGap: 6,
        paragraphGap: 10
      },
      ucmo: {
        font: 'Times-Roman',
        bold: 'Times-Bold',
        italic: 'Times-Italic',
        headingColor: '#990000',
        bullet: '–',
        bulletColor: '#990000',
        textColor: '#222',
        lineGap: 6,
        paragraphGap: 10
      },
      vibrant: {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#ff6b6b',
        bullet: '✱',
        bulletColor: '#4ecdc4',
        textColor: '#333',
        lineGap: 6,
        paragraphGap: 10
      },
      '2025': {
        font: 'Helvetica',
        bold: 'Helvetica-Bold',
        italic: 'Helvetica-Oblique',
        headingColor: '#3f51b5',
        bullet: '•',
        bulletColor: '#3f51b5',
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
      let robotoAvailable = false;
      try {
        const fontsDir = path.resolve('fonts');
        const reg = path.join(fontsDir, 'Roboto-Regular.ttf');
        const bold = path.join(fontsDir, 'Roboto-Bold.ttf');
        const italic = path.join(fontsDir, 'Roboto-Italic.ttf');
        if (fsSync.existsSync(reg)) {
          doc.registerFont('Roboto', reg);
          robotoAvailable = true;
        }
        if (fsSync.existsSync(bold)) doc.registerFont('Roboto-Bold', bold);
        if (fsSync.existsSync(italic)) doc.registerFont('Roboto-Italic', italic);
        const hReg = path.join(fontsDir, 'Helvetica.ttf');
        const hBold = path.join(fontsDir, 'Helvetica-Bold.ttf');
        const hItalic = path.join(fontsDir, 'Helvetica-Oblique.ttf');
        if (fsSync.existsSync(hReg)) doc.registerFont('Helvetica', hReg);
        if (fsSync.existsSync(hBold)) doc.registerFont('Helvetica-Bold', hBold);
        if (fsSync.existsSync(hItalic)) doc.registerFont('Helvetica-Oblique', hItalic);
      } catch {}
      if (robotoAvailable) {
        ['modern', 'vibrant'].forEach((tpl) => {
          styleMap[tpl].font = 'Roboto';
          styleMap[tpl].bold = 'Roboto-Bold';
          styleMap[tpl].italic = 'Roboto-Italic';
        });
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
          doc
            .font(style.font)
            .fontSize(12)
            .fillColor(style.bulletColor)
            .text(`${style.bullet} `, { continued: true, lineGap: style.lineGap, paragraphGap: style.paragraphGap })
            .fillColor(style.textColor);
          tokens.forEach((t, idx) => {
            if (t.type === 'newline') {
              doc.text('', { continued: false, lineGap: style.lineGap, paragraphGap: style.paragraphGap });
              doc.text('   ', { continued: true, lineGap: style.lineGap, paragraphGap: style.paragraphGap });
              return;
            }
            const opts = { continued: idx < tokens.length - 1, lineGap: style.lineGap, paragraphGap: style.paragraphGap };
            if (t.type === 'tab') {
              doc.text('    ', opts);
              return;
            }
            if (t.type === 'link') {
              doc.fillColor('blue');
              doc.text(t.text, { ...opts, link: t.href, underline: true });
              doc.fillColor(style.textColor);
            } else {
              if (t.style === 'bold' || t.style === 'bolditalic') doc.font(style.bold);
              else if (t.style === 'italic') doc.font(style.italic);
              else doc.font(style.font);
              doc.text(t.text, opts);
              doc.font(style.font);
            }
          });
        });
        doc.moveDown();
      });
      doc.end();
    });
  }
};

function setGeneratePdf(fn) {
  generatePdf = fn;
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }
  return file.buffer.toString();
}

function isResume(text) {
  const indicators = ['education', 'experience', 'skills'];
  const lower = text.toLowerCase();
  return indicators.some((i) => lower.includes(i));
}

function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
}

function sanitizeName(name) {
  return name.trim().split(/\s+/).slice(0, 2).join('_').toLowerCase();
}

function extractJsonBlock(text) {
  const fenced = text.match(/```json[\s\S]*?```/i);
  if (fenced) {
    text = fenced[0].replace(/```json|```/gi, '');
  }
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAiJson(text) {
  const block = extractJsonBlock(text);
  if (!block) {
    console.error('No JSON object found in AI response:', text);
    return null;
  }
  try {
    return JSON5.parse(block);
  } catch (e) {
    console.error('Failed to parse AI JSON:', text);
    return null;
  }
}

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/process-cv', (req, res, next) => {
  uploadResume(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const jobId = Date.now().toString();
  const date = new Date().toISOString().slice(0, 10);
  const s3 = new S3Client({ region });
  let bucket;
  let secrets;
  try {
    secrets = await getSecrets();
    bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
  } catch (err) {
    console.error('failed to load configuration', err);
    return res.status(500).json({ error: 'failed to load configuration' });
  }

  const { jobDescriptionUrl } = req.body;
  const defaultTemplate = req.body.template || req.query.template || 'modern';
  let template1 = req.body.template1 || req.query.template1;
  let template2 = req.body.template2 || req.query.template2;
  let templates = req.body.templates || req.query.templates;
  if (typeof templates === 'string') {
    try {
      templates = JSON.parse(templates);
    } catch {
      templates = templates.split(',');
    }
  }
  if (Array.isArray(templates)) {
    if (!template1 && templates[0]) template1 = templates[0];
    if (!template2 && templates[1]) template2 = templates[1];
  }
  template1 = template1 || defaultTemplate;
  template2 = template2 || defaultTemplate;
  if (!req.file) {
    return res.status(400).json({ error: 'resume file required' });
  }
  if (!jobDescriptionUrl) {
    return res.status(400).json({ error: 'jobDescriptionUrl required' });
  }

  const text = await extractText(req.file);
  if (!isResume(text)) {
    return res
      .status(400)
      .json({ error: 'It does not look like your CV, please upload a CV' });
  }
  const applicantName = extractName(text);
  const sanitizedName = sanitizeName(applicantName);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const prefix = `first/${date}/${sanitizedName}/`;
  const logKey = `${prefix}logs/processing.jsonl`;

  // Store raw file to configured bucket
  const initialS3 = new S3Client({ region });
  try {
    await initialS3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}${sanitizedName}${ext}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );
  } catch (e) {
    console.error(`initial upload to bucket ${bucket} failed`, e);
    const message = e.message || 'initial S3 upload failed';
    try {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'initial_upload_failed',
        level: 'error',
        message: `Failed to upload to bucket ${bucket}: ${message}`
      });
    } catch (logErr) {
      console.error('failed to log initial upload error', logErr);
    }
    return res
      .status(500)
      .json({ error: `Initial S3 upload to bucket ${bucket} failed: ${message}` });
  }

  try {
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'request_received' });

    const { data: jobDescription } = await axios.get(jobDescriptionUrl);
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'fetched_job_description' });

    // Use GEMINI_API_KEY from environment or secrets
    const geminiApiKey = process.env.GEMINI_API_KEY || secrets.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const versionsTemplate = `
  You are an expert resume writer and career coach. Your task is to analyze a candidate's CV and a job description to generate two distinct, highly optimized resumes.

  **Goal:** Maximize the candidate's chances of passing ATS screenings and impressing hiring managers.

  **Input Data:**
  - **Raw CV Text:** {{cvText}}
  - **Job Description Text:** {{jdText}}

  **Instructions:**
  Return ONLY a valid JSON object with two keys: \`version1\` and \`version2\`. Each value must be a full resume string.

  **For each version, ensure you perform the following enhancements:**
  1. Rewrite the candidate's most recent job title to exactly match the job description's title.
  2. Recast responsibilities to mirror those in the job description.
  3. Incorporate relevant projects and required technical terminology from the job description.
  4. Enhance content clarity and impact while preserving factual accuracy.
  5. Maintain an ATS-friendly format with appropriate keywords.
  6. Keep any URLs from the original CV unchanged.
  7. Include "Work Experience" and "Education" sections in every resume, adding empty sections if necessary.
  `;

    const versionsPrompt = versionsTemplate
      .replace('{{cvText}}', text)
      .replace('{{jdText}}', jobDescription);

    let versionData = {};
    try {
      const result = await generativeModel.generateContent(versionsPrompt);
      const responseText = result.response.text();
      const parsed = parseAiJson(responseText);
      if (parsed) {
        versionData.version1 = parsed.version1;
        versionData.version2 = parsed.version2;
      }
    } catch (e) {
      console.error('Failed to generate resume versions:', e);
    }

    if (!versionData.version1 || !versionData.version2) {
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'invalid_ai_response', level: 'error', message: 'AI response invalid' });
      return res.status(500).json({ error: 'AI response invalid' });
    }

    const coverTemplate = `Using the resume and job description below, craft exactly two tailored cover letters. Return a JSON object with keys "cover_letter1" and "cover_letter2". Ensure any URLs from the resume are preserved.\n\nResume:\n{{cvText}}\n\nJob Description:\n{{jdText}}`;

    const coverPrompt = coverTemplate
      .replace('{{cvText}}', text)
      .replace('{{jdText}}', jobDescription);

    let coverData = {};
    try {
      const coverResult = await generativeModel.generateContent(coverPrompt);
      const coverText = coverResult.response.text();
      const parsed = parseAiJson(coverText);
      if (parsed) coverData = parsed;
    } catch (e) {
      console.error('Failed to generate cover letters:', e);
    }

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'generated_outputs' });

    const generatedPrefix = `${prefix}generated/`;
    const outputs = {
      cover_letter1: coverData.cover_letter1,
      cover_letter2: coverData.cover_letter2,
      version1: versionData.version1,
      version2: versionData.version2
    };
    const urls = [];
    for (const [name, text] of Object.entries(outputs)) {
      if (!text) continue;
      let fileName;
      if (name === 'version1') {
        fileName = sanitizedName;
      } else if (name === 'version2') {
        fileName = `${sanitizedName}_2`;
      } else {
        fileName = name;
      }
      const subdir =
        name === 'version1' || name === 'version2'
          ? 'cv/'
          : name === 'cover_letter1' || name === 'cover_letter2'
          ? 'cover_letter/'
          : '';
      const key = `${generatedPrefix}${subdir}${fileName}.pdf`;
      const tpl =
        name === 'version1'
          ? template1
          : name === 'version2'
          ? template2
          : defaultTemplate;
      const pdfBuffer = await generatePdf(text, tpl);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf'
        })
      );
      await logEvent({ s3, bucket, key: logKey, jobId, event: `uploaded_${name}_pdf` });
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      urls.push({ type: name, url });
    }

    if (urls.length === 0) {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'invalid_ai_response',
        level: 'error',
        message: 'AI response invalid'
      });
      return res.status(500).json({ error: 'AI response invalid' });
    }

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}log.json`,
      Body: JSON.stringify({ jobDescriptionUrl, applicantName }),
      ContentType: 'application/json'
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_metadata' });

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'completed' });
    res.json({ urls, applicantName });
  } catch (err) {
    console.error('processing failed', err);
    if (bucket) {
      try {
        await logEvent({ s3, bucket, key: logKey, jobId, event: 'error', level: 'error', message: err.message });
      } catch (e) {
        console.error('failed to log error', e);
      }
    }
    res.status(500).json({ error: 'processing failed' });
  }
});

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
export { extractText, generatePdf, setGeneratePdf, parseContent, parseLine, TEMPLATE_IDS };
