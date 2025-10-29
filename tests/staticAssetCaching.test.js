import { jest } from '@jest/globals';

import { setStaticAssetCacheHeaders } from '../server.js';

const createResponseMock = () => ({
  setHeader: jest.fn(),
});

describe('setStaticAssetCacheHeaders', () => {
  test('applies immutable caching for non-HTML assets', () => {
    const res = createResponseMock();

    setStaticAssetCacheHeaders(res, '/assets/main.123abc.js');

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable'
    );
  });

  test('prevents caching for HTML documents', () => {
    const res = createResponseMock();

    setStaticAssetCacheHeaders(res, '/assets/index.html');

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  test('disables caching for index alias requests', () => {
    const res = createResponseMock();

    setStaticAssetCacheHeaders(
      res,
      '/assets/index-123abc.js',
      '/assets/index-latest.js'
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, must-revalidate'
    );
  });
});
