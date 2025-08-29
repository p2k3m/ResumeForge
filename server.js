import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logEvent } from './logger.js';

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer();

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

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/process-cv', upload.single('resume'), async (req, res) => {
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

    const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY });

    const prompt = `Using the resume below and job description, craft a tailored cover letter.\nResume:\n${req.file.buffer.toString()}\nJob Description:\n${jobDescription}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    });
    const coverLetter = completion.choices[0].message?.content ?? '';
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'generated_cover_letter' });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}${req.file.originalname}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_resume' });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}coverLetter.txt`,
      Body: coverLetter,
      ContentType: 'text/plain'
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_cover_letter' });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}log.json`,
      Body: JSON.stringify({ jobDescriptionUrl }),
      ContentType: 'application/json'
    }));
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_metadata' });

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'completed' });
    res.json({ coverLetter });
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
