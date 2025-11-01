import { jest } from '@jest/globals';

jest.unstable_mockModule('../lib/uploads/s3StreamingStorage.js', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
  createS3StreamingStorage: jest.fn(() => ({})),
}));

describe('buildStaticAssetKey', () => {
  let buildStaticAssetKey;

  jest.setTimeout(20000);

  beforeAll(async () => {
    ({ buildStaticAssetKey } = await import('../server.js'));
  });

  it('strips trailing punctuation before building the S3 key', () => {
    const key = buildStaticAssetKey('static/client/prod/latest', 'assets/index-abc123.css,,');
    expect(key).toBe('static/client/prod/latest/assets/index-abc123.css');
  });

  it('normalizes relative prefixes and whitespace before combining', () => {
    const key = buildStaticAssetKey(' static/client/prod/latest/ ', ' ./assets/index-def456.js;; ');
    expect(key).toBe('static/client/prod/latest/assets/index-def456.js');
  });
});
