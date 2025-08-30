import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { encoding_for_model } from 'tiktoken';
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
  const prefix = `sessions/${jobId}/`;
  const logKey = `${prefix}logs/processing.jsonl`;
  const s3 = new S3Client({ region });
  let bucket;

  // Store raw file to initial bucket
  if (req.file) {
    const initialS3 = new S3Client({ region });
    try {
      await initialS3.send(
        new PutObjectCommand({
          Bucket: 'resume-forge-data',
          Key: `first/${req.file.originalname}`,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        })
      );
    } catch (e) {
      console.error('initial upload failed', e);
      const message = e.message || 'initial S3 upload failed';
      try {
        const secrets = await getSecrets();
        bucket = secrets.S3_BUCKET;
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'initial_upload_failed',
          level: 'error',
          message
        });
      } catch (logErr) {
        console.error('failed to log initial upload error', logErr);
      }
      return res
        .status(500)
        .json({ error: `Initial S3 upload failed: ${message}` });
    }
  }

  try {
    const secrets = await getSecrets();
    bucket = secrets.S3_BUCKET;
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'request_received' });

    const { jobDescriptionUrl } = req.body;
    if (!req.file) {
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'missing_resume', level: 'error', message: 'resume file required' });
      return res.status(400).json({ error: 'resume file required' });
    }
    if (!jobDescriptionUrl) {
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'missing_jobDescriptionUrl', level: 'error', message: 'jobDescriptionUrl required' });
      return res.status(400).json({ error: 'jobDescriptionUrl required' });
    }

    const text = await extractText(req.file);
    if (!isResume(text)) {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'invalid_resume',
        level: 'error',
        message: 'It does not look like your CV, please upload a CV'
      });
      return res
        .status(400)
        .json({ error: 'It does not look like your CV, please upload a CV' });
    }
    const applicantName = extractName(text);

    const { data: jobDescription } = await axios.get(jobDescriptionUrl);
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'fetched_job_description' });

    const openaiApiKey =
      process.env.ALLOW_DEV_PLAINTEXT === '1' && process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY
        : secrets.OPENAI_API_KEY;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const prompt = `Using the resume below and job description, craft four cover letters in different styles. Return a JSON object with keys \"ats\", \"concise\", \"narrative\", and \"gov_plain\" containing the respective cover letters.\nResume:\n${text}\nJob Description:\n${jobDescription}`;

    const MODEL_LIMITS = {
      'gpt-4-turbo': 128000
    };
    const model = 'gpt-4-turbo';

    const enc = encoding_for_model(model);
    const tokenCount = enc.encode(prompt).length;
    enc.free();

    const limit = MODEL_LIMITS[model];
    if (tokenCount > limit) {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'input_too_long',
        level: 'error',
        message: `The resume and job description are too long for ${model}`
      });
      return res.status(400).json({
        error: `The resume and job description are too long for ${model}. Please shorten them and try again.`
      });
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }]
    });
    let letters;
    try {
      letters = JSON.parse(completion.choices[0].message?.content ?? '{}');
    } catch (e) {
      letters = {};
    }
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'generated_cover_letters' });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}${req.file.originalname}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_resume' });

    const generatedPrefix = `${prefix}generated/`;
    const outputs = {
      ats: letters.ats,
      concise: letters.concise,
      narrative: letters.narrative,
      gov_plain: letters.gov_plain
    };
    const urls = [];
    for (const [name, text] of Object.entries(outputs)) {
      if (!text) continue;
      const key = `${generatedPrefix}${name}.pdf`;
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
        event: 'no_outputs',
        level: 'error',
        message: 'No cover letters generated'
      });
      return res.status(500).json({ error: 'No cover letters generated' });
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
