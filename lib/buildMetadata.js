import process from 'node:process';

let cachedBuildMetadata = null;

function pickFirstString(candidates = []) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function toIsoTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function resolveBuildTimestamp() {
  const candidates = [process.env.BUILD_TIMESTAMP, process.env.DEPLOY_TIMESTAMP];
  for (const candidate of candidates) {
    const iso = toIsoTimestamp(candidate);
    if (iso) {
      return iso;
    }
  }

  return new Date().toISOString();
}

export function getBuildMetadata() {
  if (cachedBuildMetadata) {
    return cachedBuildMetadata;
  }

  const version = pickFirstString([
    process.env.BUILD_VERSION,
    process.env.VERSION,
    process.env.npm_package_version,
  ]);

  const sha = pickFirstString([
    process.env.BUILD_SHA,
    process.env.GIT_COMMIT,
    process.env.GIT_SHA,
    process.env.GITHUB_SHA,
  ]);

  const timestamp = resolveBuildTimestamp();

  cachedBuildMetadata = {
    version: version || null,
    sha: sha || null,
    timestamp,
  };

  return cachedBuildMetadata;
}

function normalizeMetadataValue(value, { fallback = 'unknown' } = {}) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

export function createAssetMetadataHeaders({ versionLabel } = {}) {
  const { version, sha, timestamp } = getBuildMetadata();

  const headers = {
    'build-timestamp': normalizeMetadataValue(timestamp, {
      fallback: new Date().toISOString(),
    }),
    'build-version': normalizeMetadataValue(version || versionLabel),
    'build-sha': normalizeMetadataValue(sha),
  };

  if (typeof versionLabel === 'string' && versionLabel.trim()) {
    headers['asset-version-label'] = versionLabel.trim();
  }

  return headers;
}

function createBuildTagList(options = {}) {
  const metadata = createAssetMetadataHeaders(options);
  const buildValue = typeof metadata['build-sha'] === 'string' ? metadata['build-sha'].trim() : '';
  const deployedValue =
    typeof metadata['build-timestamp'] === 'string' ? metadata['build-timestamp'].trim() : '';

  const tags = [];
  if (buildValue) {
    tags.push({ Key: 'build', Value: buildValue });
  }
  if (deployedValue) {
    tags.push({ Key: 'deployed', Value: deployedValue });
  }

  return tags;
}

function mergeTaggingString(existingTagging, tags = []) {
  const params = new URLSearchParams(existingTagging || '');
  for (const tag of tags) {
    if (!tag || typeof tag.Key !== 'string') {
      continue;
    }

    const key = tag.Key.trim();
    if (!key) {
      continue;
    }

    const value = typeof tag.Value === 'string' ? tag.Value.trim() : '';
    if (!value) {
      continue;
    }

    params.set(key, value);
  }

  return params.toString();
}

export { createBuildTagList };

export function withBuildMetadata(commandInput = {}, options = {}) {
  const metadata = createAssetMetadataHeaders(options);
  const existingMetadata =
    commandInput &&
    typeof commandInput === 'object' &&
    typeof commandInput.Metadata === 'object' &&
    commandInput.Metadata !== null &&
    !Array.isArray(commandInput.Metadata)
      ? commandInput.Metadata
      : {};

  const tagging = mergeTaggingString(commandInput?.Tagging, createBuildTagList(options));

  const nextInput = {
    ...commandInput,
    Metadata: {
      ...existingMetadata,
      ...metadata,
    },
  };

  if (tagging) {
    nextInput.Tagging = tagging;
  }

  return nextInput;
}

export default {
  getBuildMetadata,
  createAssetMetadataHeaders,
  createBuildTagList,
  withBuildMetadata,
};
