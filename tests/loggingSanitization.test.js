import { sanitizeLogPayload } from '../server.js';

const REDACTED = '[REDACTED]';

describe('sanitizeLogPayload', () => {
  test('redacts values for sensitive keys and leaves safe fields intact', () => {
    const input = {
      message: 'test_event',
      requestId: 'req-123',
      geminiApiKey: 'super-secret-key',
      nested: {
        refreshToken: 'refresh-token-value',
        data: 'safe',
        credentials: {
          password: 'hunter2',
          safe: 'visible',
        },
      },
      headers: {
        Authorization: 'Bearer token-value',
        'x-custom-header': 'value',
      },
    };

    const sanitized = sanitizeLogPayload(input);

    expect(sanitized.geminiApiKey).toBe(REDACTED);
    expect(sanitized.nested.refreshToken).toBe(REDACTED);
    expect(sanitized.nested.credentials.password).toBe(REDACTED);
    expect(sanitized.nested.credentials.safe).toBe(REDACTED);
    expect(sanitized.nested.data).toBe('safe');
    expect(sanitized.headers.Authorization).toBe(REDACTED);
    expect(sanitized.headers['x-custom-header']).toBe('value');

    // Ensure original object was not mutated
    expect(input.nested.credentials.password).toBe('hunter2');
  });

  test('redacts secrets propagated from parent keys and handles circular references', () => {
    const payload = {
      credentials: {
        apiKey: 'another-secret',
        nested: 'should hide',
      },
    };
    payload.self = payload;

    const sanitized = sanitizeLogPayload(payload);

    expect(sanitized.credentials.apiKey).toBe(REDACTED);
    expect(sanitized.credentials.nested).toBe(REDACTED);
    expect(sanitized.self).toBe('[Circular]');
  });

  test('redacts values that look like secrets even if key is not sensitive', () => {
    const payload = {
      sample: 'ya29.a0AfH6SMCSecretToken',
      other: 'safe-value',
    };

    const sanitized = sanitizeLogPayload(payload);

    expect(sanitized.sample).toBe(REDACTED);
    expect(sanitized.other).toBe('safe-value');
  });
});
