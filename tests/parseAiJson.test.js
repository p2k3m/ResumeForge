import { jest } from '@jest/globals';
import { parseAiJson } from '../server.js';

describe('parseAiJson logging', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('logs truncated snippet when JSON block is missing', () => {
    const longText = 'A'.repeat(1000);
    parseAiJson(longText);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toContain('A'.repeat(200));
    expect(logged).not.toContain('A'.repeat(300));
    expect(logged).not.toContain(longText);
  });

  test('logs truncated snippet when JSON parsing fails', () => {
    const prefix = 'B'.repeat(1000);
    const invalidJson = `${prefix}{"foo": [}`;
    parseAiJson(invalidJson);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls[0].join(' ');
    expect(logged).toContain('B'.repeat(200));
    expect(logged).not.toContain('B'.repeat(300));
    expect(logged).not.toContain(prefix);
  });
});

