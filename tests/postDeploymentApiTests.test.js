import { jest } from '@jest/globals';

const mockCheckCloudfrontHealth = jest.fn();
const mockVerifyClientAssets = jest.fn();

const MOCK_BROWSER_UA = 'MockBrowserUA/1.0';

jest.unstable_mockModule('../lib/cloudfrontHealthCheck.js', () => ({
  checkCloudfrontHealth: mockCheckCloudfrontHealth,
  resolvePublishedCloudfrontUrl: jest.fn(),
}));

jest.unstable_mockModule('../lib/cloudfrontAssetCheck.js', () => ({
  verifyClientAssets: mockVerifyClientAssets,
  DEFAULT_BROWSER_USER_AGENT: MOCK_BROWSER_UA,
}));

const { runPostDeploymentApiTests } = await import('../lib/postDeploymentApiTests.js');

describe('runPostDeploymentApiTests', () => {
  beforeEach(() => {
    mockCheckCloudfrontHealth.mockReset();
    mockVerifyClientAssets.mockReset();
  });

  test('throws when base URL is missing', async () => {
    await expect(runPostDeploymentApiTests()).rejects.toThrow(
      /base URL is required/i
    );
  });

  test('runs health check and asset verification', async () => {
    const healthResult = { url: 'https://example.com/healthz', payload: { status: 'ok' } };
    mockCheckCloudfrontHealth.mockResolvedValue(healthResult);
    mockVerifyClientAssets.mockResolvedValue(undefined);

    const result = await runPostDeploymentApiTests({ baseUrl: ' https://example.com ' });

    expect(mockCheckCloudfrontHealth).toHaveBeenCalledTimes(2);
    expect(mockCheckCloudfrontHealth).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://example.com',
        fetchImpl: globalThis.fetch,
        userAgent: MOCK_BROWSER_UA,
      })
    );
    expect(mockCheckCloudfrontHealth).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://example.com',
        fetchImpl: globalThis.fetch,
        userAgent: 'curl/8.4.0',
      })
    );

    expect(mockVerifyClientAssets).toHaveBeenCalledTimes(2);
    expect(mockVerifyClientAssets).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseUrl: 'https://example.com',
        logger: console,
        fetchImpl: globalThis.fetch,
        userAgent: MOCK_BROWSER_UA,
        acceptHtml: true,
      })
    );
    expect(mockVerifyClientAssets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseUrl: 'https://example.com',
        logger: console,
        fetchImpl: globalThis.fetch,
        userAgent: 'curl/8.4.0',
        acceptHtml: false,
      })
    );

    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://example.com',
      health: healthResult,
      healthChecks: [
        {
          profile: 'browser',
          label: 'browser',
          userAgent: MOCK_BROWSER_UA,
          result: healthResult,
        },
        {
          profile: 'curl',
          label: 'curl',
          userAgent: 'curl/8.4.0',
          result: healthResult,
        },
      ],
      assetChecks: [
        {
          profile: 'browser',
          label: 'browser',
          userAgent: MOCK_BROWSER_UA,
        },
        {
          profile: 'curl',
          label: 'curl',
          userAgent: 'curl/8.4.0',
        },
      ],
    });
  });

  test('forwards configuration options to helpers', async () => {
    const customFetch = async () => ({ ok: true });
    const customLogger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    const healthResult = { url: 'https://example.net/healthz', payload: { status: 'ok' } };
    mockCheckCloudfrontHealth.mockResolvedValue(healthResult);
    mockVerifyClientAssets.mockResolvedValue(undefined);

    await runPostDeploymentApiTests({
      baseUrl: 'https://example.net',
      fetchImpl: customFetch,
      healthCheckTimeoutMs: 5000,
      retries: 3,
      retryDelayMs: 15000,
      retryDelays: [1000, 2000],
      logger: customLogger,
      assetPathPrefixes: ['/client'],
    });

    expect(mockCheckCloudfrontHealth).toHaveBeenCalledTimes(2);
    expect(mockCheckCloudfrontHealth).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://example.net',
        timeoutMs: 5000,
        fetchImpl: customFetch,
        userAgent: MOCK_BROWSER_UA,
      })
    );
    expect(mockCheckCloudfrontHealth).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://example.net',
        timeoutMs: 5000,
        fetchImpl: customFetch,
        userAgent: 'curl/8.4.0',
      })
    );
    expect(mockVerifyClientAssets).toHaveBeenCalledTimes(2);
    expect(mockVerifyClientAssets).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseUrl: 'https://example.net',
        fetchImpl: customFetch,
        retries: 3,
        retryDelayMs: 15000,
        retryDelays: [1000, 2000],
        logger: customLogger,
        assetPathPrefixes: ['/client'],
        userAgent: MOCK_BROWSER_UA,
        acceptHtml: true,
      })
    );
    expect(mockVerifyClientAssets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseUrl: 'https://example.net',
        fetchImpl: customFetch,
        retries: 3,
        retryDelayMs: 15000,
        retryDelays: [1000, 2000],
        logger: customLogger,
        assetPathPrefixes: ['/client'],
        userAgent: 'curl/8.4.0',
        acceptHtml: false,
      })
    );
  });
});
