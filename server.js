import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logEvent } from './logger.js';
import { Document, Packer, Paragraph } from 'docx';
import PDFDocument from 'pdfkit';

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

const region = process.env.AWS_REGION || 'us-east-1';
const secretsClient = new SecretsManagerClient({ region });

let secretCache;
async function getSecrets() {
  if (secretCache) return secretCache;
  const secretId = process.env.SECRET_ID;
  const { SecretString } = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  secretCache = JSON.parse(SecretString ?? '{}');
  return secretCache;
}

async function generateDocx(text) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: text.split('\n').map((line) => new Paragraph(line))
      }
    ]
  });
  return Packer.toBuffer(doc);
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

    const { data: jobDescription } = await axios.get(jobDescriptionUrl);
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'fetched_job_description' });

    const openaiApiKey =
      process.env.ALLOW_DEV_PLAINTEXT === '1' && process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY
        : secrets.OPENAI_API_KEY;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const prompt = `Using the resume below and job description, craft four cover letters in different styles. Return a JSON object with keys \"ats\", \"concise\", \"narrative\", and \"gov_plain\" containing the respective cover letters.\nResume:\n${req.file.buffer.toString()}\nJob Description:\n${jobDescription}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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
    for (const [name, text] of Object.entries(outputs)) {
      if (!text) continue;
      const docxBuffer = await generateDocx(text);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${generatedPrefix}${name}.docx`,
        Body: docxBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }));
      await logEvent({ s3, bucket, key: logKey, jobId, event: `uploaded_${name}_docx` });
      const pdfBuffer = await generatePdf(text);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${generatedPrefix}${name}.pdf`,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
      }));
      await logEvent({ s3, bucket, key: logKey, jobId, event: `uploaded_${name}_pdf` });
    }

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}log.json`,
      Body: JSON.stringify({ jobDescriptionUrl }),
      ContentType: 'application/json'
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_metadata' });

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'completed' });
    res.json({ letters });
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
