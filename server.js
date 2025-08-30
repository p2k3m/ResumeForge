import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import fs from 'fs/promises';
import { logEvent } from './logger.js';
import PDFDocument from 'pdfkit';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

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

function generatePdf(text) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', (d) => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.text(text);
    doc.end();
  });
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
  const sanitizedName = applicantName.replace(/\s+/g, '_');
  const prefix = `${date}/${sanitizedName}/`;
  const logKey = `${prefix}logs/processing.jsonl`;

  // Store raw file to configured bucket
  const initialS3 = new S3Client({ region });
  try {
    await initialS3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `first/${prefix}${sanitizedName}${path.extname(req.file.originalname)}`,
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

    // Use OPENAI_API_KEY from environment or secrets
    const openaiApiKey = process.env.OPENAI_API_KEY || secrets.OPENAI_API_KEY;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const prompt = `Using the resume and job description below, craft two tailored cover letters and two resume versions. Return a JSON object with keys \"cover_letter1\", \"cover_letter2\", \"version1\", and \"version2\".\nResume:\n${text}\nJob Description:\n${jobDescription}`;

    let outputsData = {};
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }]
      });
      const responseText = completion.choices[0]?.message?.content;
      if (responseText) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          outputsData = JSON.parse(match[0]);
        } else {
          console.error('No JSON object found in AI response:', responseText);
        }
      } else {
        console.error('No text returned from AI completion');
      }
    } catch (e) {
      console.error('Failed to generate content:', e);
    }
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'generated_outputs' });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}${sanitizedName}${path.extname(req.file.originalname)}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_resume' });

    const generatedPrefix = `${prefix}generated/`;
    const outputs = {
      cover_letter1: outputsData.cover_letter1,
      cover_letter2: outputsData.cover_letter2,
      version1: outputsData.version1,
      version2: outputsData.version2
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
      const key = `${generatedPrefix}${fileName}.pdf`;
      const pdfBuffer = await generatePdf(text);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
      }));
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
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
export { extractText };
