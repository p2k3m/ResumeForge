export function normalizeHashedIndexAssetPath(rawPath) {
  if (typeof rawPath !== 'string') {
    return '';
  }

  let normalized = rawPath.trim();
  if (!normalized) {
    return '';
  }

  while (/^(?:\.\.\/|\.\/)/.test(normalized)) {
    normalized = normalized.replace(/^(?:\.\.\/|\.\/)/, '');
  }

  normalized = normalized.replace(/^\.\/+/, '');
  normalized = normalized.replace(/[,;]+$/, '');

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized.replace(/\?.*$/, '');
}

const HASHED_INDEX_MANIFEST_ASSET_PATTERN =
  /(?:^|\/)(assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\.map)?$/i;

export function normalizeManifestHashedAssetPath(assetPath) {
  if (typeof assetPath !== 'string') {
    return '';
  }

  let candidate = assetPath.trim();
  if (!candidate) {
    return '';
  }

  candidate = candidate.replace(/\?.*$/, '').replace(/#.*$/, '');

  for (const separator of [',,', ';;']) {
    const metadataIndex = candidate.indexOf(separator);
    if (metadataIndex !== -1) {
      candidate = candidate.slice(0, metadataIndex).trim();
    }
  }

  candidate = candidate.replace(/[,;]+$/, '');

  while (/^(?:\.\.\/|\.\/)/.test(candidate)) {
    candidate = candidate.replace(/^(?:\.\.\/|\.\/)/, '');
  }

  candidate = candidate.replace(/\\/g, '/');

  const match = candidate.match(HASHED_INDEX_MANIFEST_ASSET_PATTERN);
  if (!match) {
    return '';
  }

  return `/${match[1]}`;
}
