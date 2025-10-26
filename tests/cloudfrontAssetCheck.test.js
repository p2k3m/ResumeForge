import { jest } from '@jest/globals';
import { PROXY_BLOCKED_ERROR_CODE, verifyClientAssets } from '../lib/cloudfrontAssetCheck.js';

describe('verifyClientAssets', () => {
  test('adds a cache-busting query parameter when an asset initially returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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
      return new URL(url).pathname === '/assets/index-d438c9c1.js' && method === 'GET';
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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
      return new URL(url).pathname === '/assets/index-d438c9c1.js' && method === 'GET';
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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
      return new URL(url).pathname === '/assets/index-d438c9c1.js' && method === 'GET';
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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
      return new URL(url).pathname === '/assets/index-d438c9c1.js' && method === 'GET';
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (['/assets/index-d438c9c1.js', '/assets/index-ac104019.css'].includes(target.pathname)) {
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
        expect.objectContaining({ path: '/assets/index-d438c9c1.js', method: 'HEAD' }),
        expect.objectContaining({ path: '/assets/index-ac104019.css', method: 'HEAD' }),
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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

    const assetRequests = fetchImpl.mock.calls.filter(([url]) =>
      url.includes('/assets/index-d438c9c1.js'),
    );
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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
      return new URL(url).pathname === '/assets/index-d438c9c1.js' && method === 'HEAD';
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === '/static/client/prod/latest/assets/index-d438c9c1.js') {
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
      .filter((pathname) => pathname.includes('index-d438c9c1.js'));

    expect(attemptedPaths).toContain('/assets/index-d438c9c1.js');
    expect(attemptedPaths).toContain('/static/client/prod/latest/assets/index-d438c9c1.js');
  });

  test('retries asset verification with manifest prefixes when root path returns 403', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
        return new Response(null, { status: 403, statusText: 'Access Denied' });
      }

      if (target.pathname === '/static/client/prod/latest/assets/index-d438c9c1.js') {
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
      .filter((pathname) => pathname.includes('index-d438c9c1.js'));

    expect(attemptedPaths).toContain('/assets/index-d438c9c1.js');
    expect(attemptedPaths).toContain('/static/client/prod/latest/assets/index-d438c9c1.js');
  });

  test('retries asset verification with manifest prefixes when root path returns a server error', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
        return new Response(null, { status: 500, statusText: 'Internal Server Error' });
      }

      if (target.pathname === '/static/client/prod/latest/assets/index-d438c9c1.js') {
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
      .filter((pathname) => pathname.includes('index-d438c9c1.js'));

    expect(attemptedPaths).toContain('/assets/index-d438c9c1.js');
    expect(attemptedPaths).toContain('/static/client/prod/latest/assets/index-d438c9c1.js');
  });

  test('attempts suffix variations of manifest prefixes when CDN origin strips leading segments', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
        return new Response(null, { status: 404, statusText: 'Not Found' });
      }

      if (target.pathname === '/static/client/prod/latest/assets/index-d438c9c1.js') {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
      }

      if (target.pathname === '/client/prod/latest/assets/index-d438c9c1.js') {
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
      .filter((pathname) => pathname.includes('index-d438c9c1.js'));

    expect(attemptedPaths).toContain('/client/prod/latest/assets/index-d438c9c1.js');
  });

  test('includes attempted asset path details when all CDN prefixes fail', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-d438c9c1.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname.includes('index-d438c9c1.js')) {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
      }

      throw new Error(`Unexpected ${method} request to ${requestUrl}`);
    });

    const expectedPaths = [
      '/assets/index-d438c9c1.js',
      '/static/client/prod/latest/assets/index-d438c9c1.js',
      '/client/prod/latest/assets/index-d438c9c1.js',
      '/prod/latest/assets/index-d438c9c1.js',
      '/latest/assets/index-d438c9c1.js',
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
      message: expect.stringContaining('attempted asset paths: /assets/index-d438c9c1.js'),
    });
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname.startsWith('/assets/')) {
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-d438c9c1.js') {
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

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname.startsWith('/assets/') && method === 'HEAD') {
        throw createNetworkError();
      }

      if (target.pathname.startsWith('/assets/') && method === 'GET') {
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
