import { URL } from 'url';

export const PROXY_BLOCKED_ERROR_CODE = 'CLOUDFRONT_PROXY_BLOCKED';

const PROXY_INDICATOR_PATTERN = /proxy|envoy|squid|mitm|intercept|securewebgateway|bluecoat|netskope|zscaler/iu;

function normalizeHeaderValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function isProxyBlockResponse(response) {
  if (!response || typeof response.status !== 'number') {
    return false;
  }

  if (![403, 407].includes(response.status)) {
    return false;
  }

  const headers = response.headers;

  const knownIndicatorValues = [
    normalizeHeaderValue(headers?.get?.('server') || ''),
    normalizeHeaderValue(headers?.get?.('via') || ''),
    normalizeHeaderValue(headers?.get?.('proxy-authenticate') || ''),
    normalizeHeaderValue(headers?.get?.('x-cache') || ''),
    normalizeHeaderValue(headers?.get?.('x-proxy-id') || ''),
    normalizeHeaderValue(headers?.get?.('x-forwarded-by') || ''),
    normalizeHeaderValue(headers?.get?.('x-envoy-upstream-service-time') || ''),
  ].filter(Boolean);

  if (knownIndicatorValues.some((value) => PROXY_INDICATOR_PATTERN.test(value))) {
    return true;
  }

  if (typeof headers?.forEach === 'function') {
    let detected = false;
    headers.forEach((value, name) => {
      if (detected) {
        return;
      }

      const combined = `${String(name)} ${normalizeHeaderValue(value)}`.toLowerCase();
      if (combined && PROXY_INDICATOR_PATTERN.test(combined)) {
        detected = true;
      }
    });

    if (detected) {
      return true;
    }
  }

  return false;
}

function createProxyBlockedError(url, response) {
  const serverHeader = response?.headers?.get?.('server');
  const hint = serverHeader ? ` (server: ${serverHeader})` : '';
  const error = new Error(
    `Access to ${url.toString()} is blocked by an upstream proxy (status ${response?.status || 'unknown'})${
      hint || ''
    }.`
  );
  error.code = PROXY_BLOCKED_ERROR_CODE;
  return error;
}

function createProxyBlockedNetworkError(url, error) {
  const details = [error?.cause?.message, error?.message]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join('; ');

  const message = details
    ? `Access to ${url.toString()} is blocked by an upstream proxy or firewall: ${details}.`
    : `Access to ${url.toString()} is blocked by an upstream proxy or firewall.`;
  const blockedError = new Error(message);
  blockedError.code = PROXY_BLOCKED_ERROR_CODE;
  return blockedError;
}

const PROXY_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

function extractErrorChain(error) {
  const queue = [];
  const seen = new Set();

  if (error) {
    queue.push(error);
  }

  const chain = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    chain.push(current);

    if (Array.isArray(current.errors)) {
      for (const nested of current.errors) {
        queue.push(nested);
      }
    }

    if (current.cause) {
      queue.push(current.cause);
    }
  }

  return chain;
}

function isProxyNetworkError(error) {
  const chain = extractErrorChain(error);
  if (chain.length === 0) {
    return false;
  }

  for (const entry of chain) {
    const code = typeof entry?.code === 'string' ? entry.code.trim().toUpperCase() : '';
    if (code && PROXY_NETWORK_ERROR_CODES.has(code)) {
      return true;
    }
  }

  const combinedMessage = chain
    .map((entry) => (typeof entry?.message === 'string' ? entry.message : ''))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!combinedMessage) {
    return false;
  }

  return /proxy|tunnel|mitm|blocked|policy|firewall/.test(combinedMessage);
}

function normalizeLogger(logger = console) {
  const fallback = console;
  return {
    warn:
      typeof logger?.warn === 'function' ? logger.warn.bind(logger) : fallback.warn.bind(fallback),
  };
}

function normalizeResourcePath(resourcePath) {
  const trimmed = typeof resourcePath === 'string' ? resourcePath.trim() : '';
  if (!trimmed) {
    return { path: '/', search: '', hash: '' };
  }

  let working = trimmed;
  let hash = '';
  const hashIndex = working.indexOf('#');
  if (hashIndex >= 0) {
    hash = working.slice(hashIndex);
    working = working.slice(0, hashIndex);
  }

  let search = '';
  const queryIndex = working.indexOf('?');
  if (queryIndex >= 0) {
    search = working.slice(queryIndex);
    working = working.slice(0, queryIndex);
  }

  return { path: working || '/', search, hash };
}

function buildResourceUrl(baseUrl, resourcePath) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('A CloudFront base URL is required to resolve asset paths.');
  }

  const parsedBase = new URL(baseUrl);
  const basePath = parsedBase.pathname ? parsedBase.pathname.replace(/\/+$/u, '') : '';
  const { path, search, hash } = normalizeResourcePath(resourcePath);

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let combinedPath = `${basePath}${normalizedPath}`;
  if (!combinedPath.startsWith('/')) {
    combinedPath = `/${combinedPath}`;
  }

  const resolved = new URL(parsedBase.toString());
  resolved.pathname = combinedPath.replace(/\/{2,}/gu, '/');
  resolved.search = search;
  resolved.hash = hash;
  return resolved;
}

async function verifyAsset(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url.toString(), { method: 'HEAD' });
  } catch (error) {
    if (isProxyNetworkError(error)) {
      throw createProxyBlockedNetworkError(url, error);
    }

    throw new Error(`Failed to reach ${url.toString()}: ${error?.message || error}`);
  }

  if (isProxyBlockResponse(response)) {
    throw createProxyBlockedError(url, response);
  }

  const initialStatus = response.status;

  const fetchWithNoCache = async (targetUrl) => {
    let assetResponse;
    try {
      assetResponse = await fetchImpl(targetUrl, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
    } catch (error) {
      if (isProxyNetworkError(error)) {
        throw createProxyBlockedNetworkError(url, error);
      }

      throw new Error(`Failed to retrieve ${url.toString()}: ${error?.message || error}`);
    }

    if (isProxyBlockResponse(assetResponse)) {
      throw createProxyBlockedError(url, assetResponse);
    }

    return assetResponse;
  };

  if (initialStatus === 404) {
    response = await fetchWithNoCache(url.toString());

    if (response.status === 404) {
      const cacheBustUrl = new URL(url.toString());
      cacheBustUrl.searchParams.set(
        '__cf_verify_bust',
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      );

      response = await fetchWithNoCache(cacheBustUrl.toString());
    }
  }

  if ([403, 405, 501].includes(initialStatus)) {
    response = await fetchWithNoCache(url.toString());
  }

  if (!response.ok) {
    const error = new Error(
      `Asset request to ${url.toString()} returned ${response.status} ${response.statusText || ''}`.trim()
    );
    error.status = response.status;
    error.url = url.toString();
    throw error;
  }

  if (typeof response.body?.cancel === 'function') {
    try {
      response.body.cancel();
    } catch {
      // Ignore cancellation errors; the request already succeeded.
    }
  }
}

function normalizeAssetPathPrefix(prefix) {
  if (typeof prefix !== 'string') {
    return '';
  }
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildPrefixedAssetPath(prefix, resourcePath) {
  const normalizedPrefix = normalizeAssetPathPrefix(prefix);
  if (!normalizedPrefix) {
    return resourcePath;
  }

  const { path, search, hash } = normalizeResourcePath(resourcePath);
  const sanitizedPath = path.startsWith('/') ? path.slice(1) : path;
  const combined = `/${normalizedPrefix}/${sanitizedPath}`.replace(/\/{2,}/gu, '/');
  return `${combined}${search}${hash}`;
}

async function verifyAssetWithPrefixes({
  baseUrl,
  fetchImpl,
  resourcePath,
  assetPathPrefixes,
}) {
  const prefixes = Array.from(
    new Set(['', ...(Array.isArray(assetPathPrefixes) ? assetPathPrefixes : [])].map((value) => value || '')),
  );

  let lastError;

  for (const prefix of prefixes) {
    const candidatePath = buildPrefixedAssetPath(prefix, resourcePath);
    const assetUrl = buildResourceUrl(baseUrl, candidatePath);

    try {
      await verifyAsset(fetchImpl, assetUrl);
      return;
    } catch (error) {
      if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
        throw error;
      }

      if (![404, 403].includes(error?.status)) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function verifyOnce({ baseUrl, fetchImpl, assetPathPrefixes }) {
  const indexUrl = buildResourceUrl(baseUrl, '/index.html');
  let response;
  const cacheBustUrl = new URL(indexUrl.toString());
  cacheBustUrl.searchParams.set(
    '__cf_verify_bust',
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  try {
    response = await fetchImpl(cacheBustUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to load index.html at ${indexUrl.toString()}: ${error?.message || error}`,
    );
  }

  if (isProxyBlockResponse(response)) {
    throw createProxyBlockedError(indexUrl, response);
  }

  if (response.status === 404) {
    throw new Error(`index.html is missing at ${indexUrl.toString()}`);
  }

  if (!response.ok) {
    throw new Error(
      `Request to ${indexUrl.toString()} returned ${response.status} ${response.statusText || ''}`.trim()
    );
  }

  const html = await response.text();
  const assetPattern = /["']\/?(assets\/index-[\w.-]+\.(?:css|js))(?:\?([^"'\s>]+))?["']/g;
  const assetTargets = new Set();

  let match;
  while ((match = assetPattern.exec(html)) !== null) {
    const pathPart = match[1];
    const queryPart = match[2] ? `?${match[2]}` : '';
    assetTargets.add(`/${pathPart}${queryPart}`);
  }

  if (assetTargets.size === 0) {
    throw new Error('No hashed index assets were referenced in index.html.');
  }

  for (const target of assetTargets) {
    await verifyAssetWithPrefixes({
      baseUrl,
      fetchImpl,
      resourcePath: target,
      assetPathPrefixes,
    });
  }
}

function createDelay(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function verifyClientAssets({
  baseUrl,
  fetchImpl = globalThis.fetch,
  retries = 1,
  retryDelayMs = 15000,
  retryDelays,
  logger = console,
  assetPathPrefixes,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required to verify CloudFront assets.');
  }

  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('A CloudFront base URL is required to verify assets.');
  }

  const { warn } = normalizeLogger(logger);
  let delaySequence;
  if (Array.isArray(retryDelays) && retryDelays.length > 0) {
    delaySequence = retryDelays.map((value) => {
      const numeric = Number.parseInt(value, 10);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    });
  } else {
    const retryCount = Math.max(0, Number.isInteger(retries) ? retries : 0);
    const delayMs = Number.parseInt(retryDelayMs, 10);
    const normalizedDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    delaySequence = Array.from({ length: retryCount }, () => normalizedDelay);
  }

  const attempts = delaySequence.length + 1;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await verifyOnce({ baseUrl: baseUrl.trim(), fetchImpl, assetPathPrefixes });
      return;
    } catch (error) {
      if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
        throw error;
      }
      lastError = error;
      const remaining = attempts - attempt - 1;
      if (remaining <= 0) {
        break;
      }
      const attemptNumber = attempt + 1;
      const waitMs = delaySequence[attempt] || 0;
      const waitSeconds = Math.max(0, Math.round(waitMs / 1000));
      warn(
        `Client assets check failed on attempt ${attemptNumber}/${attempts} (${error?.message || error}). Triggering automatic roll-forward retry in ${waitSeconds}s...`
      );
      await createDelay(waitMs);
    }
  }

  const message = lastError?.message || 'Unknown asset verification error';
  const guidanceLines = [
    'Next steps:',
    '- Confirm the uploaded static assets are available from S3 (the manifest check should surface any missing files).',
    '- If the CDN recently changed, republish the CloudFront metadata: npm run publish:cloudfront-url -- <stack-name>.',
    '- Review docs/troubleshooting-cloudfront.md for recovery instructions.',
    '- Temporarily bypass the CDN check with ALLOW_CLOUDFRONT_VERIFY_FAILURE=true only if you cannot restore CloudFront immediately.',
  ];
  const guidance = guidanceLines.map((line) => `[verify-static] ${line}`).join('\n');
  throw new Error(
    `Client assets are unavailable after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${message}` +
      `\n\n${guidance}`,
  );
}

export { buildResourceUrl };
