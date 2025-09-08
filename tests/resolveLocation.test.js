import { jest } from '@jest/globals';
import { resolveLocation } from '../services/dynamo.js';

describe('resolveLocation timeout', () => {
  afterEach(() => {
    delete global.fetch;
    jest.useRealTimers();
  });

  test('returns unknown promptly when fetch stalls', async () => {
    jest.useRealTimers();
    global.fetch = jest.fn((url, { signal } = {}) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })
    );
    const start = Date.now();
    const location = await resolveLocation('1.2.3.4', { timeoutMs: 50 });
    const duration = Date.now() - start;
    expect(location).toBe('unknown');
    expect(duration).toBeLessThan(500);
  });
});
