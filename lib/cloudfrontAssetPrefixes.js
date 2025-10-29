import { resolveStageName, resolveDeploymentEnvironment } from '../config/stage.js';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizePrefix(value) {
  if (!hasValue(value)) {
    return '';
  }
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizePrefixSegment(value) {
  if (!hasValue(value)) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePrefixList(rawValue) {
  if (!hasValue(rawValue)) {
    return [];
  }
  return rawValue
    .split(',')
    .map((entry) => normalizePrefix(entry))
    .filter((entry) => entry.length > 0);
}

export function resolveCloudfrontAssetPathPrefixes({ env = process.env } = {}) {
  const prefixes = new Set();

  const manualOverrides = [
    env.CLOUDFRONT_ASSET_PATH_PREFIXES,
    env.CLOUDFRONT_VERIFY_ASSET_PREFIXES,
  ];

  for (const override of manualOverrides) {
    for (const entry of parsePrefixList(override)) {
      prefixes.add(entry);
    }
  }

  const explicitStaticPrefix = normalizePrefix(env.STATIC_ASSETS_PREFIX);
  if (explicitStaticPrefix) {
    prefixes.add(explicitStaticPrefix);
  } else {
    const stageName = resolveStageName();
    const deploymentEnvironment = resolveDeploymentEnvironment({ stageName });
    const normalizedEnvironment = normalizePrefixSegment(deploymentEnvironment);
    const normalizedStage = normalizePrefixSegment(stageName);
    const base = normalizedEnvironment || normalizedStage || 'prod';
    const fallbackPrefix = normalizePrefix(`static/client/${base}/latest`);
    if (fallbackPrefix) {
      prefixes.add(fallbackPrefix);
    }
  }

  return Array.from(prefixes);
}

export default {
  resolveCloudfrontAssetPathPrefixes,
};
