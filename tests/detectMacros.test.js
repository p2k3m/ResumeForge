import { detectMacros } from '../lib/serverUtils.js';

describe('detectMacros', () => {
  test('flags buffers containing macro indicators', () => {
    const buf = Buffer.from('hello vbaproject.bin world');
    expect(detectMacros(buf)).toBe(true);
  });

  test('returns false for clean buffers', () => {
    const buf = Buffer.from('plain text content');
    expect(detectMacros(buf)).toBe(false);
  });
});
