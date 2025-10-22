import { checkCloudfrontHealth } from './cloudfrontHealthCheck.js';
import { verifyClientAssets } from './cloudfrontAssetCheck.js';

export async function runPostDeploymentApiTests({
  baseUrl,
  fetchImpl = globalThis.fetch,
  healthCheckTimeoutMs,
  retries,
  retryDelayMs,
  retryDelays,
  logger = console,
  assetPathPrefixes,
} = {}) {
  const normalizedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!normalizedBaseUrl) {
    throw new Error('A base URL is required to run post-deployment API tests.');
  }

  const healthCheckOptions = { url: normalizedBaseUrl };
  if (typeof healthCheckTimeoutMs === 'number' && Number.isFinite(healthCheckTimeoutMs)) {
    healthCheckOptions.timeoutMs = healthCheckTimeoutMs;
  }
  if (typeof fetchImpl === 'function') {
    healthCheckOptions.fetchImpl = fetchImpl;
  }

  const health = await checkCloudfrontHealth(healthCheckOptions);

  const assetVerificationOptions = {
    baseUrl: normalizedBaseUrl,
    logger,
  };
  if (typeof fetchImpl === 'function') {
    assetVerificationOptions.fetchImpl = fetchImpl;
  }
  if (typeof retries === 'number' && Number.isFinite(retries)) {
    assetVerificationOptions.retries = retries;
  }
  if (typeof retryDelayMs === 'number' && Number.isFinite(retryDelayMs)) {
    assetVerificationOptions.retryDelayMs = retryDelayMs;
  }
  if (Array.isArray(retryDelays)) {
    assetVerificationOptions.retryDelays = retryDelays;
  }
  if (Array.isArray(assetPathPrefixes) && assetPathPrefixes.length > 0) {
    assetVerificationOptions.assetPathPrefixes = assetPathPrefixes;
  }

  await verifyClientAssets(assetVerificationOptions);

  return {
    ok: true,
    baseUrl: normalizedBaseUrl,
    health,
  };
}

export default runPostDeploymentApiTests;
