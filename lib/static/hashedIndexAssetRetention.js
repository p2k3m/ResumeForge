const DEFAULT_STALE_INDEX_RETENTION_MS = 72 * 60 * 60 * 1000;

function parseDurationCandidate(value, multiplier) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[-+]?\d+(?:\.\d+)?$/u.test(trimmed) === false) {
    return null;
  }

  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const resolved = numeric * multiplier;
  if (!Number.isFinite(resolved) || resolved < 0) {
    return null;
  }

  return resolved;
}

function normalizeLastModifiedMs(lastModified) {
  if (lastModified instanceof Date) {
    const time = lastModified.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof lastModified === 'number') {
    if (Number.isFinite(lastModified)) {
      return lastModified;
    }
    return null;
  }

  if (typeof lastModified === 'string') {
    const parsed = Date.parse(lastModified);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return null;
  }

  return null;
}

export function resolveHashedIndexAssetRetentionMs(env = process.env) {
  if (!env || typeof env !== 'object') {
    return DEFAULT_STALE_INDEX_RETENTION_MS;
  }

  const candidateOrder = [
    ['STATIC_VERIFY_STALE_INDEX_RETENTION_MS', 1],
    ['STATIC_VERIFY_STALE_INDEX_RETENTION_HOURS', 60 * 60 * 1000],
    ['STATIC_VERIFY_STALE_INDEX_RETENTION_DAYS', 24 * 60 * 60 * 1000],
    ['STATIC_VERIFY_STALE_INDEX_MIN_AGE_MS', 1],
    ['STATIC_VERIFY_STALE_INDEX_MIN_AGE_HOURS', 60 * 60 * 1000],
    ['STATIC_VERIFY_STALE_INDEX_MIN_AGE_DAYS', 24 * 60 * 60 * 1000],
  ];

  for (const [key, multiplier] of candidateOrder) {
    const value = env[key];
    const duration = parseDurationCandidate(value, multiplier);
    if (duration !== null) {
      return duration;
    }
  }

  return DEFAULT_STALE_INDEX_RETENTION_MS;
}

function buildCandidateKey(candidate) {
  if (!candidate) {
    return '';
  }

  if (typeof candidate === 'string') {
    return candidate.trim();
  }

  if (typeof candidate.key === 'string') {
    return candidate.key.trim();
  }

  if (typeof candidate.relativeKey === 'string') {
    return candidate.relativeKey.trim();
  }

  return '';
}

function computeAssetAgeMs({ lastModified, now }) {
  const lastModifiedMs = normalizeLastModifiedMs(lastModified);
  if (typeof lastModifiedMs !== 'number') {
    return Number.POSITIVE_INFINITY;
  }

  const age = now - lastModifiedMs;
  if (!Number.isFinite(age)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, age);
}

export function categorizeStaleHashedIndexAssets({
  hashedAssets = [],
  candidates = [],
  now = Date.now(),
  retentionMs = DEFAULT_STALE_INDEX_RETENTION_MS,
} = {}) {
  const hashedSet = new Set(
    Array.from(hashedAssets || [])
      .filter((asset) => typeof asset === 'string')
      .map((asset) => asset.trim())
      .filter(Boolean)
  );

  const eligibleForDeletion = [];
  const protectedByRetention = [];

  const normalizedRetentionMs = Number.isFinite(retentionMs) && retentionMs >= 0
    ? retentionMs
    : DEFAULT_STALE_INDEX_RETENTION_MS;

  const allowImmediateDeletion = normalizedRetentionMs === 0;

  for (const candidate of candidates || []) {
    const key = buildCandidateKey(candidate);
    if (!key) {
      continue;
    }

    if (hashedSet.has(key)) {
      continue;
    }

    const ageMs = computeAssetAgeMs({ lastModified: candidate?.lastModified, now });

    if (!allowImmediateDeletion && Number.isFinite(ageMs) && ageMs < normalizedRetentionMs) {
      protectedByRetention.push({ key, ageMs });
      continue;
    }

    eligibleForDeletion.push({ key, ageMs });
  }

  return { eligibleForDeletion, protectedByRetention, retentionMs: normalizedRetentionMs };
}

export function formatDurationForLog(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds === 0) {
    return '0s';
  }

  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0 && hours === 0 && minutes === 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (days > 0) {
    const remainingHours = Math.round((totalSeconds - days * 24 * 3600) / 3600);
    return `${days} day${days === 1 ? '' : 's'} ${remainingHours}h`;
  }

  if (hours > 0 && minutes === 0) {
    return `${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${totalSeconds}s`;
}

export function formatAssetAgeForLog(ageMs) {
  if (!Number.isFinite(ageMs)) {
    return 'age unknown';
  }

  if (ageMs <= 0) {
    return 'just uploaded';
  }

  if (ageMs < 60 * 1000) {
    return `${Math.round(ageMs / 1000)}s old`;
  }

  if (ageMs < 3600 * 1000) {
    const minutes = Math.round(ageMs / (60 * 1000));
    return `${minutes}m old`;
  }

  if (ageMs < 24 * 3600 * 1000) {
    const hours = Math.round(ageMs / (3600 * 1000));
    return `${hours}h old`;
  }

  const days = Math.round(ageMs / (24 * 3600 * 1000));
  return `${days} day${days === 1 ? '' : 's'} old`;
}

export { DEFAULT_STALE_INDEX_RETENTION_MS };
