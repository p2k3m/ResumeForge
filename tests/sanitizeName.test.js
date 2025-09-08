import { sanitizeName } from '../lib/sanitizeName.js';

describe('sanitizeName', () => {
  test.each([
    ['John/Smith', 'john_smith'],
    ['../Jane Doe', 'jane_doe'],
    ['John@Doe', 'john_doe']
  ])('sanitizes %s to %s', (input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
  });
});
