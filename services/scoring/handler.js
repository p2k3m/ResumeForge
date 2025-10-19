import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseEventBody } from '../../lib/http/parseEventBody.js';
import {
  scoreResumeAgainstJob,
  scoreResumeHttpResponse,
} from '../../lib/resume/scoring.js';

function createScoringS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  });
}

let scoringS3Client = createScoringS3Client();

export function setScoringS3Client(client) {
  if (client && typeof client.send === 'function') {
    scoringS3Client = client;
  } else {
    scoringS3Client = createScoringS3Client();
  }
  return scoringS3Client;
}

function sanitizeS3KeyComponent(value, { fallback = '', maxLength = 96 } = {}) {
  if (typeof value === 'number') {
    return sanitizeS3KeyComponent(String(value), { fallback, maxLength });
  }
  if (typeof value !== 'string') {
    const normalizedFallback =
      typeof fallback === 'string'
        ? fallback
        : typeof fallback === 'number'
          ? String(fallback)
          : '';
    if (normalizedFallback) {
      return sanitizeS3KeyComponent(normalizedFallback, { fallback: '', maxLength });
    }
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    const normalizedFallback =
      typeof fallback === 'string'
        ? fallback.trim()
        : typeof fallback === 'number'
          ? String(fallback)
          : '';
    if (normalizedFallback) {
      return sanitizeS3KeyComponent(normalizedFallback, { fallback: '', maxLength });
    }
    return '';
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  if (normalized) {
    return normalized;
  }
  if (fallback) {
    return sanitizeS3KeyComponent(fallback, { fallback: '', maxLength });
  }
  return '';
}

function ensureTrailingSlash(prefix = '') {
  if (!prefix) {
    return '';
  }
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function extractSessionScopedPrefixFromKey(key) {
  if (typeof key !== 'string') {
    return '';
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return '';
  }
  const withoutFile = trimmed.replace(/[^/]+$/, '');
  const segments = ensureTrailingSlash(withoutFile)
    .split('/')
    .filter(Boolean);
  if (segments.length < 3) {
    return '';
  }
  const sessionCandidate = segments[2];
  if (!sessionCandidate) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sessionCandidate)) {
    return '';
  }
  if (sessionCandidate === 'incoming') {
    return '';
  }
  return `${segments.slice(0, 3).join('/')}/`;
}

function buildDocumentSessionPrefix({
  ownerSegment,
  dateSegment,
  jobSegment,
  sessionSegment,
} = {}) {
  const safeOwner =
    sanitizeS3KeyComponent(ownerSegment, { fallback: 'candidate' }) || 'candidate';
  const safeSession = sanitizeS3KeyComponent(sessionSegment);
  const safeDate = sanitizeS3KeyComponent(dateSegment);
  const safeJob = sanitizeS3KeyComponent(jobSegment);
  const segments = ['cv', safeOwner];
  if (safeSession) {
    segments.push(safeSession);
  } else {
    if (safeDate) {
      segments.push(safeDate);
    }
    if (safeJob) {
      segments.push(safeJob);
    }
  }
  return `${segments.join('/')}/`;
}

function sanitizeJobSegment(jobId) {
  if (typeof jobId !== 'string') return '';
  const normalized = jobId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, 48);
}

function resolveSessionContext({ payload = {}, result = {} } = {}) {
  const pointer =
    payload && typeof payload.sessionPointer === 'object' && payload.sessionPointer
      ? payload.sessionPointer
      : {};
  const pointerPrefix =
    typeof pointer.prefix === 'string' && pointer.prefix.trim() ? pointer.prefix.trim() : '';
  const pointerChangeLogKey =
    typeof pointer.changeLogKey === 'string' && pointer.changeLogKey.trim()
      ? pointer.changeLogKey.trim()
      : '';
  const payloadChangeLogKey =
    typeof payload.sessionChangeLogKey === 'string' && payload.sessionChangeLogKey.trim()
      ? payload.sessionChangeLogKey.trim()
      : '';

  let resolvedChangeLogKey = pointerChangeLogKey || payloadChangeLogKey;
  let sessionPrefix = pointerPrefix ? ensureTrailingSlash(pointerPrefix) : '';

  if (!sessionPrefix && resolvedChangeLogKey) {
    sessionPrefix = extractSessionScopedPrefixFromKey(resolvedChangeLogKey);
  }

  if (!sessionPrefix) {
    const payloadSessionPrefix =
      typeof payload.sessionPrefix === 'string' && payload.sessionPrefix.trim()
        ? payload.sessionPrefix.trim()
        : '';
    if (payloadSessionPrefix) {
      sessionPrefix = ensureTrailingSlash(payloadSessionPrefix);
    }
  }

  if (!sessionPrefix) {
    const originalUploadKey =
      typeof payload.originalUploadKey === 'string' && payload.originalUploadKey.trim()
        ? payload.originalUploadKey.trim()
        : '';
    if (originalUploadKey) {
      sessionPrefix = extractSessionScopedPrefixFromKey(originalUploadKey);
    }
  }

  const normalizedPrefix = sessionPrefix ? ensureTrailingSlash(sessionPrefix) : '';

  return {
    sessionPrefix: normalizedPrefix,
    changeLogKey: resolvedChangeLogKey,
  };
}

function resolveScoringKey({ payload = {}, result = {} } = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { sessionPrefix, changeLogKey } = resolveSessionContext({ payload, result });

  if (sessionPrefix) {
    return {
      key: `${ensureTrailingSlash(sessionPrefix)}logs/scoring/${timestamp}.json`,
      context: {
        sessionPrefix: ensureTrailingSlash(sessionPrefix),
        ...(changeLogKey ? { changeLogKey } : {}),
      },
    };
  }

  const pointer =
    payload && typeof payload.sessionPointer === 'object' && payload.sessionPointer
      ? payload.sessionPointer
      : {};

  const ownerSegment =
    sanitizeS3KeyComponent(
      payload.ownerSegment ??
        pointer.ownerSegment ??
        payload.userId ??
        pointer.userId ??
        ''
    ) || 'candidate';
  const sessionSegment = sanitizeS3KeyComponent(
    result.sessionId ??
      payload.sessionId ??
      payload.sessionSegment ??
      pointer.sessionId ??
      pointer.sessionSegment ??
      ''
  );
  const dateSegment = sanitizeS3KeyComponent(
    payload.dateSegment ?? pointer.dateSegment ?? ''
  );
  const jobSegment = sanitizeJobSegment(
    result.jobId ?? payload.jobId ?? pointer.jobId ?? ''
  );

  const derivedPrefix = buildDocumentSessionPrefix({
    ownerSegment,
    sessionSegment,
    dateSegment,
    jobSegment,
  });

  return {
    key: `${ensureTrailingSlash(derivedPrefix)}logs/scoring/${timestamp}.json`,
    context: {
      sessionPrefix: ensureTrailingSlash(derivedPrefix),
    },
  };
}

async function persistScoringAudit({ payload, result }) {
  const bucket = typeof process.env.S3_BUCKET === 'string' ? process.env.S3_BUCKET.trim() : '';
  if (!bucket) {
    throw new Error('S3_BUCKET environment variable is required to store scoring audits.');
  }

  const { key, context } = resolveScoringKey({ payload, result });
  const auditContext = {};
  if (context?.sessionPrefix) {
    auditContext.sessionPrefix = ensureTrailingSlash(context.sessionPrefix);
  }
  if (context?.changeLogKey) {
    auditContext.changeLogKey = context.changeLogKey;
  }
  const body = JSON.stringify(
    {
      jobId: result.jobId,
      sessionId: result.sessionId || payload.sessionId || payload.sessionSegment || null,
      createdAt: new Date().toISOString(),
      ...(Object.keys(auditContext).length ? { context: auditContext } : {}),
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

  return {
    bucket,
    key,
    ...(Object.keys(auditContext).length ? { context: auditContext } : {}),
  };
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

