import { checkCloudfrontHealth } from './cloudfrontHealthCheck.js';
import { DEFAULT_BROWSER_USER_AGENT, verifyClientAssets } from './cloudfrontAssetCheck.js';

const CURL_USER_AGENT = 'curl/8.4.0';

const REQUEST_PROFILES = [
  {
    id: 'browser',
    label: 'browser',
    userAgent: DEFAULT_BROWSER_USER_AGENT,
    acceptHtml: true,
  },
  {
    id: 'curl',
    label: 'curl',
    userAgent: CURL_USER_AGENT,
    acceptHtml: false,
  },
];

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

  const healthChecks = [];
  for (const profile of REQUEST_PROFILES) {
    const healthOptions = { ...healthCheckOptions, userAgent: profile.userAgent };
    const result = await checkCloudfrontHealth(healthOptions);
    healthChecks.push({
      profile: profile.id,
      label: profile.label,
      userAgent: profile.userAgent,
      result,
    });
  }

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

  const assetChecks = [];
  for (const profile of REQUEST_PROFILES) {
    await verifyClientAssets({
      ...assetVerificationOptions,
      userAgent: profile.userAgent,
      acceptHtml: profile.acceptHtml,
    });
    assetChecks.push({
      profile: profile.id,
      label: profile.label,
      userAgent: profile.userAgent,
    });
  }

  const primaryHealthEntry =
    healthChecks.find((entry) => entry.profile === 'browser') || healthChecks[0] || null;

  return {
    ok: true,
    baseUrl: normalizedBaseUrl,
    health: primaryHealthEntry?.result,
    healthChecks,
    assetChecks,
  };
}

export default runPostDeploymentApiTests;
