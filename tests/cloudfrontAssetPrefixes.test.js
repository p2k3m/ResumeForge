import { jest } from '@jest/globals';

const MANAGED_ENV_KEYS = [
  'STAGE_NAME',
  'DEPLOYMENT_ENVIRONMENT',
  'STATIC_ASSETS_PREFIX',
  'CLOUDFRONT_ASSET_PATH_PREFIXES',
  'CLOUDFRONT_VERIFY_ASSET_PREFIXES',
];

let originalValues;

function applyOverrides(overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('resolveCloudfrontAssetPathPrefixes', () => {
  beforeEach(() => {
    jest.resetModules();
    originalValues = {};
    for (const key of MANAGED_ENV_KEYS) {
      originalValues[key] = Object.prototype.hasOwnProperty.call(process.env, key)
        ? process.env[key]
        : undefined;
      delete process.env[key];
    }
  });

  afterEach(() => {
    applyOverrides(originalValues);
  });

  test('includes default prefix derived from stage environment', async () => {
    applyOverrides({ STAGE_NAME: 'prod' });
    const { resolveCloudfrontAssetPathPrefixes } = await import('../lib/cloudfrontAssetPrefixes.js');
    expect(resolveCloudfrontAssetPathPrefixes()).toEqual(['static/client/prod/latest']);
  });

  test('prefers explicit static assets prefix when provided', async () => {
    applyOverrides({ STAGE_NAME: 'prod', STATIC_ASSETS_PREFIX: '/custom/static/path/' });
    const { resolveCloudfrontAssetPathPrefixes } = await import('../lib/cloudfrontAssetPrefixes.js');
    expect(resolveCloudfrontAssetPathPrefixes()).toEqual(['custom/static/path']);
  });

  test('uses deployment environment when it differs from stage name', async () => {
    applyOverrides({ STAGE_NAME: 'blue', DEPLOYMENT_ENVIRONMENT: 'prod' });
    const { resolveCloudfrontAssetPathPrefixes } = await import('../lib/cloudfrontAssetPrefixes.js');
    expect(resolveCloudfrontAssetPathPrefixes()).toEqual(['static/client/prod/latest']);
  });

  test('merges manual overrides with fallback prefix and removes duplicates', async () => {
    applyOverrides({
      STAGE_NAME: 'prod',
      CLOUDFRONT_ASSET_PATH_PREFIXES: 'legacy , static/client/prod/latest',
    });
    const { resolveCloudfrontAssetPathPrefixes } = await import('../lib/cloudfrontAssetPrefixes.js');
    expect(resolveCloudfrontAssetPathPrefixes()).toEqual([
      'legacy',
      'static/client/prod/latest',
    ]);
  });

  test('supports alternate override environment variable', async () => {
    applyOverrides({
      STAGE_NAME: 'prod',
      CLOUDFRONT_VERIFY_ASSET_PREFIXES: '/blue/one/,/green/two/',
    });
    const { resolveCloudfrontAssetPathPrefixes } = await import('../lib/cloudfrontAssetPrefixes.js');
    expect(resolveCloudfrontAssetPathPrefixes()).toEqual([
      'blue/one',
      'green/two',
      'static/client/prod/latest',
    ]);
  });
});
