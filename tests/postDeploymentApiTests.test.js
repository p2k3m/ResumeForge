import { jest } from '@jest/globals';

const mockCheckCloudfrontHealth = jest.fn();
const mockVerifyClientAssets = jest.fn();

jest.unstable_mockModule('../lib/cloudfrontHealthCheck.js', () => ({
  checkCloudfrontHealth: mockCheckCloudfrontHealth,
  resolvePublishedCloudfrontUrl: jest.fn(),
}));

jest.unstable_mockModule('../lib/cloudfrontAssetCheck.js', () => ({
  verifyClientAssets: mockVerifyClientAssets,
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

    expect(mockCheckCloudfrontHealth).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com' })
    );
    expect(mockVerifyClientAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com',
        logger: console,
      })
    );

    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://example.com',
      health: healthResult,
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

    expect(mockCheckCloudfrontHealth).toHaveBeenCalledWith({
      url: 'https://example.net',
      timeoutMs: 5000,
      fetchImpl: customFetch,
    });
    expect(mockVerifyClientAssets).toHaveBeenCalledWith({
      baseUrl: 'https://example.net',
      fetchImpl: customFetch,
      retries: 3,
      retryDelayMs: 15000,
      retryDelays: [1000, 2000],
      logger: customLogger,
      assetPathPrefixes: ['/client'],
    });
  });
});
