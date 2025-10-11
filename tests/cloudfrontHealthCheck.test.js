import {
  MockAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  fetch as undiciFetch,
} from 'undici';
import { checkCloudfrontHealth, buildHealthCheckUrl } from '../lib/cloudfrontHealthCheck.js';

describe('checkCloudfrontHealth', () => {
  let originalDispatcher;
  let mockAgent;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();
  });

  test('verifies a root CloudFront distribution', async () => {
    const origin = 'https://dk892hgnzrcsl.cloudfront.net';
    const pool = mockAgent.get(origin);
    pool.intercept({ path: '/healthz', method: 'GET' }).reply(
      200,
      { status: 'ok' },
      { headers: { 'content-type': 'application/json' } }
    );

    const result = await checkCloudfrontHealth({ url: origin, fetchImpl: undiciFetch });
    expect(result).toMatchObject({
      ok: true,
      url: `${origin}/healthz`,
      payload: { status: 'ok' },
    });
  });

  test('verifies a distribution with a stage path', async () => {
    const originWithStage = 'https://dk892hgnzrcsl.cloudfront.net/prod';
    const pool = mockAgent.get('https://dk892hgnzrcsl.cloudfront.net');
    pool
      .intercept({ path: '/prod/healthz', method: 'GET' })
      .reply(200, { status: 'ok' }, { headers: { 'content-type': 'application/json' } });

    const result = await checkCloudfrontHealth({ url: originWithStage, fetchImpl: undiciFetch });
    expect(result).toMatchObject({
      ok: true,
      url: 'https://dk892hgnzrcsl.cloudfront.net/prod/healthz',
    });
  });

  test('throws when the health check fails', async () => {
    const origin = 'https://dk892hgnzrcsl.cloudfront.net';
    const pool = mockAgent.get(origin);
    pool
      .intercept({ path: '/healthz', method: 'GET' })
      .reply(503, { message: 'Service unavailable' }, { headers: { 'content-type': 'application/json' } });

    await expect(checkCloudfrontHealth({ url: origin, fetchImpl: undiciFetch })).rejects.toThrow(
      /CloudFront health check returned 503/i
    );
  });
});

describe('buildHealthCheckUrl', () => {
  test('normalizes root URL', () => {
    const url = buildHealthCheckUrl('https://dk892hgnzrcsl.cloudfront.net');
    expect(url.toString()).toBe('https://dk892hgnzrcsl.cloudfront.net/healthz');
  });

  test('normalizes URL with trailing slash', () => {
    const url = buildHealthCheckUrl('https://dk892hgnzrcsl.cloudfront.net/');
    expect(url.toString()).toBe('https://dk892hgnzrcsl.cloudfront.net/healthz');
  });

  test('normalizes URL with stage path', () => {
    const url = buildHealthCheckUrl('https://dk892hgnzrcsl.cloudfront.net/prod');
    expect(url.toString()).toBe('https://dk892hgnzrcsl.cloudfront.net/prod/healthz');
  });
});
