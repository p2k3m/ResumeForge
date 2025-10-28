import { URL } from 'url';

function normalizeHealthPath(url) {
  const trimmedPath = url.pathname ? url.pathname.replace(/\/+$/u, '') : '';
  const basePath = trimmedPath || '';
  const suffix = '/healthz';
  const normalizedPath = `${basePath}${suffix}`.replace(/\/+/, '/');
  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}

function buildHealthCheckUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('A CloudFront URL is required for verification.');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    throw new Error(`Invalid CloudFront URL provided: ${rawUrl}`);
  }
  const path = normalizeHealthPath(parsed);
  const target = new URL(parsed.toString());
  target.pathname = path;
  target.search = '';
  target.hash = '';
  return target;
}

function createTimeout(timeoutMs, controller) {
  if (timeoutMs <= 0) {
    return null;
  }
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

export async function checkCloudfrontHealth({
  url,
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
  userAgent,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required to verify the CloudFront URL.');
  }

  const target = buildHealthCheckUrl(url);
  const controller = new AbortController();
  const timer = createTimeout(timeoutMs, controller);

  let response;
  try {
    const headers = { Accept: 'application/json' };
    if (typeof userAgent === 'string' && userAgent.trim()) {
      headers['User-Agent'] = userAgent.trim();
    }

    response = await fetchImpl(target.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Failed to reach ${target.toString()}: ${err?.message || 'Unknown network error'}`
    );
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  const contentType = response.headers?.get?.('content-type') || '';
  const text = await response.text();

  if (!response.ok) {
    const snippet = text ? text.slice(0, 200).replace(/\s+/gu, ' ').trim() : '';
    const suffix = snippet ? ` Response body: ${snippet}` : '';
    throw new Error(
      `CloudFront health check returned ${response.status} ${response.statusText || ''}.${suffix}`.trim()
    );
  }

  if (!/application\/json/i.test(contentType)) {
    throw new Error(
      `CloudFront health check at ${target.toString()} did not return JSON (content-type: ${contentType || 'unknown'}).`
    );
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error('CloudFront health check returned malformed JSON.');
  }

  if (!payload || payload.status !== 'ok') {
    throw new Error(
      `CloudFront health check payload did not include status "ok": ${JSON.stringify(payload)}`
    );
  }

  return {
    ok: true,
    url: target.toString(),
    payload,
  };
}

export function resolvePublishedCloudfrontUrl(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const raw = typeof metadata.url === 'string' ? metadata.url.trim() : '';
  return raw;
}

export { buildHealthCheckUrl };
