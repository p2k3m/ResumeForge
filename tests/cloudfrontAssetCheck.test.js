import { jest } from '@jest/globals';
import { PROXY_BLOCKED_ERROR_CODE, verifyClientAssets } from '../lib/cloudfrontAssetCheck.js';

function extractHashedIndexAssets(html) {
  const assetPattern =
    /["']((?:\/?|(?:\.{1,2}\/)+)?(?:[\w.-]+\/)*assets\/index-[\w.-]+\.(?:css|js))(?:\?([^"'\s>]+))?["']/g;
  const normalizedPaths = new Set();

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

    normalizedPaths.add(`${normalizedPath}${queryPart}`);
  }

  const allAssets = Array.from(normalizedPaths);
  const jsAssets = [];
  const cssAssets = [];

  for (const asset of allAssets) {
    const basePath = asset.split('?')[0];
    if (basePath.endsWith('.js')) {
      jsAssets.push(asset);
    } else if (basePath.endsWith('.css')) {
      cssAssets.push(asset);
    }
  }

  return { all: allAssets, js: jsAssets, css: cssAssets };
}

function maybeRespondToAlias(target, method, overrides = {}) {
  const { jsStatus = 200, cssStatus = 200 } = overrides;

  if (target.pathname.endsWith('/assets/index-latest.js')) {
    return new Response('', { status: jsStatus });
  }

  if (target.pathname.endsWith('/assets/index-latest.css')) {
    return new Response('', { status: cssStatus });
  }

  return null;
}

describe('verifyClientAssets', () => {
  test('adds a cache-busting query parameter when an asset initially returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }

        if (method === 'GET' && target.searchParams.has('__cf_verify_bust')) {
          return new Response('', { status: 200 });
        }

        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetGetCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'GET';
    });

    expect(assetGetCalls.some(([url]) => url.includes('__cf_verify_bust='))).toBe(true);
  });

  test('adds a cache-busting query parameter when an asset keeps returning 403', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 403, statusText: 'Forbidden' });
        }

        if (method === 'GET' && target.searchParams.has('__cf_verify_bust')) {
          return new Response('', { status: 200 });
        }

        if (method === 'GET') {
          return new Response(null, { status: 403, statusText: 'Forbidden' });
        }
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetGetCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'GET';
    });

    expect(assetGetCalls).toHaveLength(2);
    expect(assetGetCalls.some(([url]) => url.includes('__cf_verify_bust='))).toBe(true);
  });

  test('adds a cache-busting query parameter when an asset keeps returning 500 errors', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 500, statusText: 'Internal Server Error' });
        }

        if (method === 'GET' && target.searchParams.has('__cf_verify_bust')) {
          return new Response('', { status: 200 });
        }

        if (method === 'GET') {
          return new Response(null, { status: 500, statusText: 'Internal Server Error' });
        }
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetGetCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'GET';
    });

    expect(assetGetCalls).toHaveLength(2);
    expect(assetGetCalls.some(([url]) => url.includes('__cf_verify_bust='))).toBe(true);
  });

  test('falls back to a normal GET request before cache-busting when a HEAD request returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }

        if (method === 'GET' && !target.searchParams.has('__cf_verify_bust')) {
          return new Response('', { status: 200 });
        }

        throw new Error('Cache-busting request should not be required when normal GET succeeds.');
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetGetCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'GET';
    });

    expect(assetGetCalls).toHaveLength(1);
    expect(new URL(assetGetCalls[0][0]).searchParams.has('__cf_verify_bust')).toBe(false);
  });

  test('falls back to a normal GET request when a HEAD request returns a server error', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 500, statusText: 'Internal Server Error' });
        }

        if (method === 'GET' && !target.searchParams.has('__cf_verify_bust')) {
          return new Response('', { status: 200 });
        }

        throw new Error('Cache-busting request should not be required when normal GET succeeds.');
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetGetCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'GET';
    });

    expect(assetGetCalls).toHaveLength(1);
    expect(new URL(assetGetCalls[0][0]).searchParams.has('__cf_verify_bust')).toBe(false);
  });

  test('detects hashed index assets referenced with relative paths', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="./assets/index-d438c9c1.js"></script>
          <link rel="stylesheet" href="./assets/index-ac104019.css" />
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;
    const [cssAssetPath] = assetPaths.css;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if ([jsAssetPath, cssAssetPath].includes(target.pathname)) {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetRequests = fetchImpl.mock.calls.filter(([url]) =>
      new URL(url).pathname.startsWith('/assets/index-'),
    );

    const requestedPaths = assetRequests.map(([url, init]) => ({
      path: new URL(url).pathname,
      method: (init?.method || 'GET').toUpperCase(),
    }));

    expect(requestedPaths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: jsAssetPath, method: 'HEAD' }),
        expect.objectContaining({ path: cssAssetPath, method: 'HEAD' }),
      ]),
    );
  });

  test('retries with a normal GET request when a HEAD request returns 403', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD') {
          return new Response(null, { status: 403, statusText: 'Forbidden' });
        }

        if (method === 'GET') {
          return new Response('', { status: 200 });
        }
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const assetRequests = fetchImpl.mock.calls.filter(([url]) => url.includes(jsAssetPath));
    expect(assetRequests).toHaveLength(2);
    const [, headOptions] = assetRequests[0];
    expect((headOptions?.method || 'GET').toUpperCase()).toBe('HEAD');
    const [, getOptions] = assetRequests[1];
    expect((getOptions?.method || 'GET').toUpperCase()).toBe('GET');
    expect(new URL(assetRequests[1][0]).searchParams.has('__cf_verify_bust')).toBe(false);
  });

  test('requests the application root with cache-busting parameters to avoid stale content', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const indexRequest = fetchImpl.mock.calls.find(([url]) => new URL(url).pathname === '/');
    expect(indexRequest).toBeDefined();
    const [, options] = indexRequest;
    expect(options?.headers?.['Cache-Control']).toBe('no-cache');
    expect(options?.headers?.Pragma).toBe('no-cache');
    expect(new URL(indexRequest[0]).searchParams.has('__cf_verify_bust')).toBe(true);
  });

  test('honors an explicit retry delay schedule when provided', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    let shouldFail = true;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        if (method === 'HEAD' && shouldFail) {
          shouldFail = false;
          return new Response(null, { status: 500, statusText: 'Upstream Error' });
        }

        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    const warn = jest.fn();

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retryDelays: [0],
        logger: { warn },
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Client assets check failed on attempt 1/2'),
    );

    const headCalls = fetchImpl.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      return new URL(url).pathname === jsAssetPath && method === 'HEAD';
    });

    expect(headCalls).toHaveLength(2);
  });

  test('surfaces remediation guidance when CDN assets remain unavailable', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).rejects.toThrow(/docs\/troubleshooting-cloudfront\.md[\s\S]*ALLOW_CLOUDFRONT_VERIFY_FAILURE=true/);
  });

  test('retries asset verification with manifest prefixes when root path returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    expect(attemptedPaths).toContain(jsAssetPath);
    expect(attemptedPaths).toContain(`/static/client/prod/latest${jsAssetPath}`);
  });

  test('retries asset verification with manifest prefixes when root path returns 403', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 403, statusText: 'Access Denied' });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    expect(attemptedPaths).toContain(jsAssetPath);
    expect(attemptedPaths).toContain(`/static/client/prod/latest${jsAssetPath}`);
  });

  test('retries asset verification with manifest prefixes when root path returns a server error', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 500, statusText: 'Internal Server Error' });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    expect(attemptedPaths).toContain(jsAssetPath);
    expect(attemptedPaths).toContain(`/static/client/prod/latest${jsAssetPath}`);
  });

  test('backs off manifest prefixes by trimming trailing segments when needed', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
      }

      if (target.pathname === `/static/client/prod${jsAssetPath}`) {
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    expect(attemptedPaths).toContain(`/static/client/prod/latest${jsAssetPath}`);
    expect(attemptedPaths).toContain(`/static/client/prod${jsAssetPath}`);
  });

  test('attempts suffix variations of manifest prefixes when CDN origin strips leading segments', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
      }

      if (target.pathname === `/client/prod/latest${jsAssetPath}`) {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    expect(attemptedPaths).toContain(`/client/prod/latest${jsAssetPath}`);
  });

  test('continues to fallback prefixes when CloudFront responds with AccessDenied', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-3a4b5c6d.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response('', {
          status: 403,
          headers: {
            'x-amz-error-code': 'AccessDenied',
            'x-cache': 'Error from cloudfront',
          },
        });
      }

      if (target.pathname === `/static/client/prod/latest${jsAssetPath}`) {
        return new Response('', {
          status: 403,
          headers: {
            'x-amz-error-code': 'AccessDenied',
            'x-cache': 'Error from cloudfront',
          },
        });
      }

      if (target.pathname === `/client/prod/latest${jsAssetPath}`) {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    const attemptedPaths = fetchImpl.mock.calls
      .map(([url]) => new URL(url).pathname)
      .filter((pathname) => pathname.endsWith(jsAssetPath));

    const uniqueAttemptedPaths = Array.from(new Set(attemptedPaths));

    expect(uniqueAttemptedPaths).toEqual([
      '/assets/index-3a4b5c6d.js',
      '/static/client/prod/latest/assets/index-3a4b5c6d.js',
      '/client/prod/latest/assets/index-3a4b5c6d.js',
    ]);
  });

  test('includes attempted asset path details when all CDN prefixes fail', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname.endsWith(jsAssetPath)) {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    const expectedPaths = [
      jsAssetPath,
      `/static/client/prod/latest${jsAssetPath}`,
      `/client/prod/latest${jsAssetPath}`,
      `/prod/latest${jsAssetPath}`,
      `/latest${jsAssetPath}`,
      `/static/client/prod${jsAssetPath}`,
      `/static/client${jsAssetPath}`,
      `/static${jsAssetPath}`,
      `/client/prod${jsAssetPath}`,
      `/client${jsAssetPath}`,
      `/prod${jsAssetPath}`,
    ];

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        assetPathPrefixes: ['static/client/prod/latest'],
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).rejects.toMatchObject({
      attemptedAssetPaths: expectedPaths,
      message: expect.stringContaining(`attempted asset paths: ${jsAssetPath}`),
    });
  });

  test('fails when CloudFront index alias bundles are unavailable', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-ac104019.css" />
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;
    const [cssAssetPath] = assetPaths.css;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname.endsWith('/assets/index-latest.js')) {
        return new Response('', { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname.endsWith('/assets/index-latest.css')) {
        return new Response('', { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === jsAssetPath || target.pathname === cssAssetPath) {
        return new Response('', { status: 200 });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).rejects.toThrow(/index-latest\.(css|js)/);
  });

  test('sends an Origin header when probing hashed asset routes', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
          <link rel="stylesheet" href="/assets/index-ac104019.css" />
        </head>
        <body></body>
      </html>`;

    const observedOrigins = [];

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;
    const [cssAssetPath] = assetPaths.css;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if ([jsAssetPath, cssAssetPath].some((assetPath) => target.pathname === assetPath)) {
        observedOrigins.push(options?.headers?.Origin ?? null);

        if (method === 'HEAD') {
          return new Response(null, { status: 405, statusText: 'Method Not Allowed' });
        }

        const contentType = target.pathname.endsWith('.css')
          ? 'text/css'
          : 'application/javascript';

        return new Response('', {
          status: 200,
          headers: { 'Content-Type': contentType },
        });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).resolves.toBeUndefined();

    expect(observedOrigins).not.toHaveLength(0);
    expect(observedOrigins.every((value) => value === 'https://example.cloudfront.net')).toBe(true);
  });

  test('throws a proxy blocked error when responses indicate an upstream proxy', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath) {
        return new Response(null, {
          status: 403,
          statusText: 'Forbidden',
          headers: { Server: 'envoy', Via: 'proxy.example.test' },
        });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).rejects.toMatchObject({ code: PROXY_BLOCKED_ERROR_CODE });
  });

  test('throws a proxy blocked error when network connectivity is filtered', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const createNetworkError = () => {
      const cause = new Error('connect ENETUNREACH 0.0.0.0:443');
      cause.code = 'ENETUNREACH';
      const error = new TypeError('fetch failed');
      error.cause = cause;
      return error;
    };

    const assetPaths = extractHashedIndexAssets(html);
    const [jsAssetPath] = assetPaths.js;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const aliasResponse = maybeRespondToAlias(target, method);
      if (aliasResponse) {
        return aliasResponse;
      }

      if (target.pathname === jsAssetPath && method === 'HEAD') {
        throw createNetworkError();
      }

      if (target.pathname === jsAssetPath && method === 'GET') {
        throw createNetworkError();
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    await expect(
      verifyClientAssets({
        baseUrl: 'https://example.cloudfront.net',
        fetchImpl,
        retries: 0,
        retryDelayMs: 0,
        logger: { warn: jest.fn() },
      }),
    ).rejects.toMatchObject({ code: PROXY_BLOCKED_ERROR_CODE });
  });
});
