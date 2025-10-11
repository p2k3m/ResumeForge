import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  executeWithRetry,
  getErrorStatus,
  shouldRetryS3Error,
} from './lib/retry.js';
import { randomBytes, randomUUID } from 'crypto';

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

export async function logEvent({
  s3,
  bucket,
  key,
  jobId,
  event,
  level = 'info',
  message,
  metadata,
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    jobId,
    event,
    level
  };
  if (message) entry.message = message;
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
    entry.metadata = metadata;
  }

  let existing = '';
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    existing = await streamToString(res.Body);
  } catch (err) {
    if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }

  const body = existing + JSON.stringify(entry) + '\n';
  await executeWithRetry(
    () =>
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
        })
      ),
    {
      maxAttempts: 4,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitterMs: 300,
      shouldRetry: (err) => shouldRetryS3Error(err),
      onRetry: (err, attempt, delayMs) => {
        console.warn('Retrying S3 log upload', {
          bucket,
          key,
          attempt,
          delayMs,
          status: getErrorStatus(err),
          code: err?.code,
        });
      },
    }
  );
}

function makeRandomId() {
  if (typeof randomUUID === 'function') {
    try {
      return randomUUID();
    } catch {
      // fall back to randomBytes
    }
  }
  return randomBytes(16).toString('hex');
}

function sanitizeKeySegment(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalisePrefix(prefix = '') {
  if (!prefix) return '';
  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+/g, '/');
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export async function logErrorTrace({
  s3,
  bucket,
  entry,
  prefix = 'logs/errors/'
}) {
  if (!s3 || !bucket || !entry) {
    return;
  }

  const timestamp = new Date().toISOString();
  const dateSegment = timestamp.slice(0, 10);
  const requestSegment = sanitizeKeySegment(entry.requestId) || makeRandomId();
  const tsSegment = sanitizeKeySegment(timestamp) || makeRandomId();
  const safePrefix = normalisePrefix(prefix);
  const key = `${safePrefix}${dateSegment}/${tsSegment}-${requestSegment}.json`;

  const payload = {
    ...entry,
    timestamp
  };

  await executeWithRetry(
    () =>
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(payload),
          ContentType: 'application/json'
        })
      ),
    {
      maxAttempts: 4,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitterMs: 300,
      shouldRetry: (err) => shouldRetryS3Error(err),
      onRetry: (err, attempt, delayMs) => {
        console.warn('Retrying S3 trace upload', {
          bucket,
          key,
          attempt,
          delayMs,
          status: getErrorStatus(err),
          code: err?.code,
        });
      },
    }
  );
}
