import { jest } from '@jest/globals';
import { verifyClientAssets } from '../lib/cloudfrontAssetCheck.js';

describe('verifyClientAssets', () => {
  test('adds a cache-busting query parameter when an asset initially returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-cb71cdf7.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/index.html' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-cb71cdf7.js') {
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
      return new URL(url).pathname === '/assets/index-cb71cdf7.js' && method === 'GET';
    });

    expect(assetGetCalls.some(([url]) => url.includes('__cf_verify_bust='))).toBe(true);
  });

  test('falls back to a normal GET request before cache-busting when a HEAD request returns 404', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-cb71cdf7.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/index.html' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-cb71cdf7.js') {
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
      return new URL(url).pathname === '/assets/index-cb71cdf7.js' && method === 'GET';
    });

    expect(assetGetCalls).toHaveLength(1);
    expect(new URL(assetGetCalls[0][0]).searchParams.has('__cf_verify_bust')).toBe(false);
  });

  test('requests index.html with cache-busting parameters to avoid stale content', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <script type="module" src="/assets/index-cb71cdf7.js"></script>
        </head>
        <body></body>
      </html>`;

    const fetchImpl = jest.fn(async (requestUrl, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      const target = new URL(requestUrl);

      if (target.pathname === '/index.html' && method === 'GET') {
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (target.pathname === '/assets/index-cb71cdf7.js') {
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

    const indexRequest = fetchImpl.mock.calls.find(([url]) => url.includes('/index.html'));
    expect(indexRequest).toBeDefined();
    const [, options] = indexRequest;
    expect(options?.headers?.['Cache-Control']).toBe('no-cache');
    expect(options?.headers?.Pragma).toBe('no-cache');
    expect(new URL(indexRequest[0]).searchParams.has('__cf_verify_bust')).toBe(true);
  });
});
