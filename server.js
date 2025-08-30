import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import fs from 'fs/promises';
import { logEvent } from './logger.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

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
  const tokens = [];
  const regex =
    /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+)|\*\*([^*]+)\*\*|_([^_]+)_/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const part = text.slice(lastIndex, match.index);
      if (part) tokens.push({ type: 'paragraph', text: part, continued: true });
    }
    if (match[1] && match[2]) {
      tokens.push({
        type: 'link',
        text: match[1],
        href: match[2],
        continued: true
      });
    } else if (match[3]) {
      const domainMap = {
        'linkedin.com': 'LinkedIn',
        'github.com': 'GitHub'
      };
      let label = match[3];
      try {
        const hostname = new URL(match[3]).hostname.replace(/^www\./, '');
        label = domainMap[hostname] || match[3];
      } catch {
        label = match[3];
      }
      tokens.push({ type: 'link', text: label, href: match[3], continued: true });
    } else if (match[4]) {
      tokens.push({
        type: 'paragraph',
        text: match[4],
        style: 'bold',
        continued: true
      });
    } else if (match[5]) {
      tokens.push({
        type: 'paragraph',
        text: match[5],
        style: 'italic',
        continued: true
      });
    }
    lastIndex = regex.lastIndex;
  }
  if (tokens.length === 0) {
    return [{ type: 'paragraph', text }];
  }
  const rest = text.slice(lastIndex);
  if (rest) tokens.push({ type: 'paragraph', text: rest });
  tokens.forEach((t, i) => (t.continued = i < tokens.length - 1));
  return tokens;
}

function parseContent(text) {
  try {
    const data = JSON.parse(text);
    const sections = Array.isArray(data.sections)
      ? data.sections
      : Object.entries(data).map(([heading, content]) => ({ heading, content }));
    const tokens = [];
    for (const sec of sections) {
      if (sec.heading) tokens.push({ type: 'heading', text: String(sec.heading) });
      const items = sec.items || sec.content;
      if (Array.isArray(items)) {
        const strItems = items.map((i) => {
          const parts = parseLine(String(i));
          parts.forEach((t) => {
            if (t.type === 'link') tokens.push(t);
          });
          return parts.map((t) => t.text).join('');
        });
        tokens.push({ type: 'list', items: strItems });
      } else if (items) {
        tokens.push(...parseLine(String(items)));
      }
      tokens.push({ type: 'space' });
    }
    return tokens;
  } catch {
    const tokens = [];
    const lines = text.split(/\r?\n/);
    let list = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (list.length) {
          tokens.push({ type: 'list', items: list });
          list = [];
        }
        tokens.push({ type: 'space' });
        continue;
      }
      const headingMatch = trimmed.match(/^#{1,6}\s+(.*)/);
      if (headingMatch) {
        if (list.length) {
          tokens.push({ type: 'list', items: list });
          list = [];
        }
        tokens.push({ type: 'heading', text: headingMatch[1].trim() });
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
      if (bulletMatch) {
        const parts = parseLine(bulletMatch[1]);
        list.push(parts.map((t) => t.text).join(''));
        parts.forEach((t) => {
          if (t.type === 'link') tokens.push(t);
        });
        continue;
      }
      if (list.length) {
        tokens.push({ type: 'list', items: list });
        list = [];
      }
      tokens.push(...parseLine(trimmed));
    }
    if (list.length) tokens.push({ type: 'list', items: list });
    return tokens;
  }
}

function prepareTemplateData(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines.shift() || 'Resume';
  const items = lines.map((l) => {
    const cleaned = l.replace(/^[-*]\s*/, '');
    const tokens = parseLine(cleaned);
    return tokens
      .map((t) => {
        if (t.type === 'link') {
          return `<a href="${t.href}">${t.text}</a>`;
        }
        if (t.style === 'bold') return `<strong>${t.text}</strong>`;
        if (t.style === 'italic') return `<em>${t.text}</em>`;
        return t.text;
      })
      .join('');
  });
  return { name, sections: [{ heading: 'Summary', items }] };
}

async function generatePdf(text, templateId = 'modern') {
  const data = prepareTemplateData(text);
  const templatePath = path.resolve('templates', `${templateId}.html`);
  const templateSource = await fs.readFile(templatePath, 'utf-8');
  const html = Handlebars.compile(templateSource)(data);
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
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', (d) => buffers.push(d));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      doc.font('Helvetica-Bold').fontSize(20).text(data.name, { paragraphGap: 10 });
      data.sections.forEach((sec) => {
        doc.font('Helvetica-Bold').fontSize(14).text(sec.heading, { paragraphGap: 4 });
        doc.font('Helvetica').fontSize(12);
        (sec.items || []).forEach((item) => {
          const linkMatch = item.match(/^<a href="([^\"]+)">([^<]+)<\/a>$/);
          if (linkMatch) {
            doc.text(`• ${linkMatch[2]}`, { link: linkMatch[1], underline: true });
          } else {
            doc.text(`• ${item}`);
          }
        });
        doc.moveDown();
      });
      doc.end();
    });
  }
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
  `;

    const versionsPrompt = versionsTemplate
      .replace('{{cvText}}', text)
      .replace('{{jdText}}', jobDescription);

    let versionData = {};
    try {
      const result = await generativeModel.generateContent(versionsPrompt);
      const responseText = result.response.text();
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        versionData.version1 = parsed.version1;
        versionData.version2 = parsed.version2;
      } else {
        console.error('No JSON object found in AI response:', responseText);
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
      const match = coverText.match(/\{[\s\S]*\}/);
      if (match) {
        coverData = JSON.parse(match[0]);
      } else {
        console.error('No JSON object found in cover letter response:', coverText);
      }
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
      const pdfBuffer = await generatePdf(text);
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
export { extractText, generatePdf, parseContent, prepareTemplateData };
