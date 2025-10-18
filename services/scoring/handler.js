import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseEventBody } from '../../lib/http/parseEventBody.js';
import {
  scoreResumeAgainstJob,
  scoreResumeHttpResponse,
} from '../../lib/resume/scoring.js';

const scoringS3Client = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
});

function sanitizeSegment(value, { fallback = 'session', maxLength = 96 } = {}) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
  if (normalized) {
    return normalized;
  }
  return sanitizeSegment(fallback, { fallback: 'session', maxLength });
}

function resolveScoringKey({ sessionId, jobId }) {
  const sessionSegment = sanitizeSegment(sessionId || jobId || 'session');
  const jobSegment = sanitizeSegment(jobId || 'job');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `sessions/${sessionSegment}/jobs/${jobSegment}/scoring/${timestamp}.json`;
}

async function persistScoringAudit({ payload, result }) {
  const bucket = typeof process.env.S3_BUCKET === 'string' ? process.env.S3_BUCKET.trim() : '';
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is required to store scoring audits.');
  }

  const key = resolveScoringKey({
    sessionId: result.sessionId || payload.sessionId || payload.sessionSegment,
    jobId: result.jobId,
  });
  const body = JSON.stringify(
    {
      jobId: result.jobId,
      sessionId: result.sessionId || payload.sessionId || payload.sessionSegment || null,
      createdAt: new Date().toISOString(),
      result,
    },
    null,
    2
  );

  await scoringS3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    })
  );

  return { bucket, key };
}

export async function handler(event, context) {
  void context;
  const payload = parseEventBody(event);
  const outcome = scoreResumeAgainstJob(payload);

  if (outcome.ok) {
    try {
      const auditLocation = await persistScoringAudit({ payload, result: outcome.result });
      outcome.result.audit = auditLocation;
    } catch (err) {
      outcome.result.audit = {
        error: {
          message: err?.message || 'Unable to persist scoring audit to S3.',
        },
      };
    }
  }

  return scoreResumeHttpResponse(outcome);
}

export default handler;

