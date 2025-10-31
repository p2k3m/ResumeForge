import { URL } from 'url';

export const PROXY_BLOCKED_ERROR_CODE = 'CLOUDFRONT_PROXY_BLOCKED';
export const CLOUDFRONT_FORBIDDEN_ERROR_CODE = 'CLOUDFRONT_FORBIDDEN';

const PROXY_INDICATOR_PATTERN = /proxy|envoy|squid|mitm|intercept|securewebgateway|bluecoat|netskope|zscaler/iu;

const RECOVERABLE_HEAD_STATUS_CODES = new Set([403, 404, 405, 429, 500, 501, 502, 503, 504]);
const CACHE_BUST_STATUS_CODES = new Set([403, 404, 500, 502, 503, 504]);

function normalizeHeaderValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function isCloudfrontForbiddenResponse(response) {
  if (!response || response.status !== 403) {
    return false;
  }

  const headers = response.headers;
  const errorCode = normalizeHeaderValue(headers?.get?.('x-amz-error-code') || '');
  if (errorCode && errorCode.toLowerCase() === 'accessdenied') {
    return true;
  }

  const errorMessage = normalizeHeaderValue(headers?.get?.('x-amz-error-message') || '');
  if (errorMessage && /accessdenied/i.test(errorMessage)) {
    return true;
  }

  const cacheHeader = normalizeHeaderValue(headers?.get?.('x-cache') || '');
  if (cacheHeader && /error from cloudfront/i.test(cacheHeader)) {
    return true;
  }

  const cfId = normalizeHeaderValue(headers?.get?.('x-amz-cf-id') || '');
  if (cfId) {
    return true;
  }

  return false;
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

export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ResumeForgeStaticVerifier/1.0 Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_USER_AGENT = DEFAULT_BROWSER_USER_AGENT;

function normalizeOriginHeader(originCandidate) {
  if (typeof originCandidate !== 'string') {
    return '';
  }

  const trimmed = originCandidate.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    // If the value is not a valid URL, fall back to the raw string. Some
    // legacy stacks may still provide bare hostnames via configuration.
    return trimmed;
  }
}

function resolveOriginHeader(url) {
  const overrideCandidate =
    (typeof process.env.CLOUDFRONT_VERIFY_ORIGIN === 'string' &&
      process.env.CLOUDFRONT_VERIFY_ORIGIN.trim()) ||
    (typeof process.env.CLOUDFRONT_VERIFY_ORIGIN_HEADER === 'string' &&
      process.env.CLOUDFRONT_VERIFY_ORIGIN_HEADER.trim()) ||
    '';

  const override = normalizeOriginHeader(overrideCandidate);
  if (override) {
    return override;
  }

  if (url instanceof URL) {
    return normalizeOriginHeader(url.origin);
  }

  try {
    return normalizeOriginHeader(new URL(String(url)).origin);
  } catch {
    return '';
  }
}

function buildRequestHeaders({
  method = 'GET',
  noCache = false,
  acceptHtml = false,
  origin,
  userAgent,
} = {}) {
  const resolvedUserAgent =
    (typeof userAgent === 'string' && userAgent.trim()) ||
    (typeof process.env.CLOUDFRONT_VERIFY_USER_AGENT === 'string' &&
      process.env.CLOUDFRONT_VERIFY_USER_AGENT.trim()) ||
    DEFAULT_USER_AGENT;

  const headers = {
    'User-Agent': resolvedUserAgent,
    Accept: acceptHtml
      ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      : '*/*',
    'Accept-Encoding': 'identity',
  };

  if (noCache) {
    headers['Cache-Control'] = 'no-cache';
    headers.Pragma = 'no-cache';
  }

  if (origin) {
    headers.Origin = origin;
  }

  return headers;
}

async function verifyAsset(fetchImpl, url, { userAgent } = {}) {
  let response;
  const originHeader = resolveOriginHeader(url);
  const recoverableIssues = [];
  try {
    response = await fetchImpl(url.toString(), {
      method: 'HEAD',
      headers: buildRequestHeaders({
        method: 'HEAD',
        noCache: true,
        origin: originHeader,
        userAgent,
      }),
    });
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
        headers: buildRequestHeaders({
          method: 'GET',
          noCache: true,
          origin: originHeader,
          userAgent,
        }),
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

  let finalResponse = response;

  const isRecoverableHeadError = RECOVERABLE_HEAD_STATUS_CODES.has(initialStatus);

  if (isRecoverableHeadError) {
    recoverableIssues.push(
      `HEAD request to ${url.toString()} returned ${initialStatus} ${response.statusText || ''}`.trim(),
    );
    finalResponse = await fetchWithNoCache(url.toString());
  }

  if (CACHE_BUST_STATUS_CODES.has(finalResponse.status) && !isCloudfrontForbiddenResponse(finalResponse)) {
    const cacheBustUrl = new URL(url.toString());
    cacheBustUrl.searchParams.set(
      '__cf_verify_bust',
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    );

    recoverableIssues.push(
      `GET request to ${url.toString()} returned ${finalResponse.status} ${
        finalResponse.statusText || ''
      } requiring a cache-busting retry`.trim(),
    );
    finalResponse = await fetchWithNoCache(cacheBustUrl.toString());
  }

  if (!finalResponse.ok) {
    const error = new Error(
      `Asset request to ${url.toString()} returned ${finalResponse.status} ${
        finalResponse.statusText || ''
      }`.trim()
    );
    error.status = finalResponse.status;
    error.url = url.toString();

    if (isCloudfrontForbiddenResponse(finalResponse)) {
      error.code = CLOUDFRONT_FORBIDDEN_ERROR_CODE;
    }

    throw error;
  }

  if (typeof finalResponse.body?.cancel === 'function') {
    try {
      finalResponse.body.cancel();
    } catch {
      // Ignore cancellation errors; the request already succeeded.
    }
  }

  return { recoverableIssues };
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

function expandAssetPathPrefixes(prefixes) {
  const results = [];
  const seen = new Set();

  const addPrefix = (value) => {
    if (seen.has(value)) {
      return;
    }
    results.push(value);
    seen.add(value);
  };

  // Always attempt the asset without a prefix before falling back to manifest
  // prefixes to ensure we probe the path referenced in the HTML first.
  addPrefix('');

  if (Array.isArray(prefixes)) {
    for (const candidate of prefixes) {
      const normalized = normalizeAssetPathPrefix(candidate);
      if (!normalized) {
        continue;
      }

      addPrefix(normalized);

      const segments = normalized.split('/').filter(Boolean);
      const suffixes = [];

      for (let index = 1; index < segments.length; index += 1) {
        const suffix = segments.slice(index).join('/');
        if (suffix) {
          suffixes.push(suffix);
          addPrefix(suffix);
        }
      }

      for (let length = segments.length - 1; length > 0; length -= 1) {
        const trimmed = segments.slice(0, length).join('/');
        if (trimmed) {
          addPrefix(trimmed);
        }
      }

      for (const suffix of suffixes) {
        const suffixSegments = suffix.split('/').filter(Boolean);
        for (let length = suffixSegments.length - 1; length > 0; length -= 1) {
          const partial = suffixSegments.slice(0, length).join('/');
          if (partial) {
            addPrefix(partial);
          }
        }
      }
    }
  }

  return results;
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

const RECOVERABLE_PREFIX_ERROR_STATUSES = new Set([403, 404, 500, 502, 503, 504]);

async function attemptTrimmedPrefixFallback({
  baseUrl,
  fetchImpl,
  resourcePath,
  prefix,
  userAgent,
  attemptedPaths,
}) {
  const normalized = normalizeAssetPathPrefix(prefix);
  if (!normalized) {
    return {};
  }

  const segments = normalized.split('/').filter(Boolean);
  let lastError;

  for (let index = segments.length - 1; index > 0; index -= 1) {
    const trimmedPrefix = segments.slice(0, index).join('/');
    if (!trimmedPrefix) {
      continue;
    }

    const candidatePath = buildPrefixedAssetPath(trimmedPrefix, resourcePath);
    const assetUrl = buildResourceUrl(baseUrl, candidatePath);
    attemptedPaths.push(candidatePath);

    try {
      const result = await verifyAsset(fetchImpl, assetUrl, { userAgent });
      return { result };
    } catch (error) {
      if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
        throw error;
      }

      const status = typeof error?.status === 'number' ? error.status : undefined;
      const isForbidden = error?.code === CLOUDFRONT_FORBIDDEN_ERROR_CODE;
      const isRecoverableStatus = RECOVERABLE_PREFIX_ERROR_STATUSES.has(status);

      if (!isRecoverableStatus && !isForbidden) {
        throw error;
      }

      lastError = error;
    }
  }

  return { error: lastError };
}

async function verifyAssetWithPrefixes({
  baseUrl,
  fetchImpl,
  resourcePath,
  assetPathPrefixes,
  userAgent,
}) {
  const manifestPrefixes = Array.isArray(assetPathPrefixes)
    ? assetPathPrefixes.map((prefix) => normalizeAssetPathPrefix(prefix)).filter(Boolean)
    : [];

  const prefixes = expandAssetPathPrefixes(manifestPrefixes);

  let lastError;
  const attemptedPaths = [];
  let rootAssetNotFound = false;

  for (const prefix of prefixes) {
    const candidatePath = buildPrefixedAssetPath(prefix, resourcePath);
    const assetUrl = buildResourceUrl(baseUrl, candidatePath);

    attemptedPaths.push(candidatePath);

    try {
      const result = await verifyAsset(fetchImpl, assetUrl, { userAgent });
      return result;
    } catch (error) {
      if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
        throw error;
      }

      const status = typeof error?.status === 'number' ? error.status : undefined;
      const isForbidden = error?.code === CLOUDFRONT_FORBIDDEN_ERROR_CODE;
      const isRecoverableStatus = RECOVERABLE_PREFIX_ERROR_STATUSES.has(status);

      if (!prefix && status === 404) {
        rootAssetNotFound = true;
      }

      const hasStatus = Number.isFinite(status);

      if (!isRecoverableStatus && !isForbidden && hasStatus) {
        throw error;
      }

      lastError = error;
    }
  }

  if (rootAssetNotFound && manifestPrefixes.length > 0) {
    for (const prefix of manifestPrefixes) {
      const fallbackResult = await attemptTrimmedPrefixFallback({
        baseUrl,
        fetchImpl,
        resourcePath,
        prefix,
        userAgent,
        attemptedPaths,
      });

      if (fallbackResult?.result) {
        return fallbackResult.result;
      }

      if (fallbackResult?.error) {
        lastError = fallbackResult.error;
        continue;
      }
    }
  }

  if (lastError) {
    if (attemptedPaths.length > 0) {
      const uniquePaths = Array.from(new Set(attemptedPaths));
      const detail = uniquePaths.join(', ');

      if (typeof lastError === 'object' && lastError) {
        lastError.attemptedAssetPaths = uniquePaths;

        if (typeof lastError.message === 'string' && detail) {
          const message = lastError.message;
          const suffix = ` (attempted asset paths: ${detail})`;

          if (!message.includes('attempted asset paths:')) {
            lastError.message = `${message}${suffix}`;
          }
        }
      }
    }

    throw lastError;
  }
}

async function verifyOnce({
  baseUrl,
  fetchImpl,
  assetPathPrefixes,
  userAgent,
  acceptHtml = true,
}) {
  const indexUrl = buildResourceUrl(baseUrl, '/');
  let response;
  const cacheBustUrl = new URL(indexUrl.toString());
  cacheBustUrl.searchParams.set(
    '__cf_verify_bust',
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  try {
    response = await fetchImpl(cacheBustUrl.toString(), {
      method: 'GET',
      headers: buildRequestHeaders({
        method: 'GET',
        noCache: true,
        acceptHtml,
        userAgent,
      }),
    });
  } catch (error) {
    throw new Error(
      `Failed to load application root (/) at ${indexUrl.toString()}: ${error?.message || error}`,
    );
  }

  if (isProxyBlockResponse(response)) {
    throw createProxyBlockedError(indexUrl, response);
  }

  if (response.status === 404) {
    throw new Error(`Application root (/) is missing at ${indexUrl.toString()}`);
  }

  if (!response.ok) {
    throw new Error(
      `Request to ${indexUrl.toString()} returned ${response.status} ${response.statusText || ''}`.trim()
    );
  }

  const html = await response.text();
  const assetPattern =
    /["']((?:\/?|(?:\.{1,2}\/)+)?(?:[\w.-]+\/)*assets\/index-[\w.-]+\.(?:css|js))(?:\?([^"'\s>]+))?["']/g;
  const assetTargets = new Set();

  let match;
  while ((match = assetPattern.exec(html)) !== null) {
    const pathPart = typeof match[1] === 'string' ? match[1].trim() : '';
    if (!pathPart) {
      continue;
    }

    const queryPart = match[2] ? `?${match[2]}` : '';
    let normalizedPath = pathPart;
    while (/^(?:\.\.\/|\.\/)/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/^(?:\.\.\/|\.\/)/, '');
    }
    normalizedPath = normalizedPath.replace(/^\.\/+/, '');
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = `/${normalizedPath}`;
    }

    assetTargets.add(`${normalizedPath}${queryPart}`);
  }

  if (assetTargets.size === 0) {
    throw new Error('No hashed index assets were referenced in the application root HTML.');
  }

  const hasCssAsset = Array.from(assetTargets).some((target) => {
    const pathname = target.split('?')[0] || target;
    return pathname.toLowerCase().endsWith('.css');
  });

  assetTargets.add('/assets/index-latest.js');
  if (hasCssAsset) {
    assetTargets.add('/assets/index-latest.css');
  }

  const recoverableIssues = [];

  for (const target of assetTargets) {
    const result = await verifyAssetWithPrefixes({
      baseUrl,
      fetchImpl,
      resourcePath: target,
      assetPathPrefixes,
      userAgent,
    });
    if (Array.isArray(result?.recoverableIssues) && result.recoverableIssues.length > 0) {
      recoverableIssues.push(...result.recoverableIssues);
    }
  }

  return { recoverableIssues };
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
  userAgent,
  acceptHtml = true,
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
      const { recoverableIssues } = await verifyOnce({
        baseUrl: baseUrl.trim(),
        fetchImpl,
        assetPathPrefixes,
        userAgent,
        acceptHtml,
      });

      if (!Array.isArray(recoverableIssues) || recoverableIssues.length === 0) {
        return;
      }

      const remaining = attempts - attempt - 1;
      if (remaining <= 0) {
        return;
      }

      const issueSummary =
        recoverableIssues.length === 1
          ? recoverableIssues[0]
          : `Recoverable asset verification issues detected: ${recoverableIssues.join('; ')}`;

      const recoverableError = new Error(issueSummary);
      recoverableError.recoverable = true;
      throw recoverableError;
    } catch (error) {
      if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
        throw error;
      }
      if (error?.code === CLOUDFRONT_FORBIDDEN_ERROR_CODE) {
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
  const finalMessage =
    `Client assets are unavailable after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${message}` +
    `\n\n${guidance}`;

  if (lastError && typeof lastError === 'object') {
    try {
      lastError.message = finalMessage;
    } catch {
      // Ignore failures to redefine the message property and fall back to a new error.
    }

    if (lastError.message === finalMessage) {
      throw lastError;
    }
  }

  const finalError = new Error(finalMessage);

  if (lastError && typeof lastError === 'object') {
    for (const [key, value] of Object.entries(lastError)) {
      if (key === 'message' || key === 'stack') {
        continue;
      }

      try {
        finalError[key] = value;
      } catch {
        // Ignore assignment failures for read-only properties.
      }
    }
  }

  throw finalError;
}

export { buildResourceUrl };
