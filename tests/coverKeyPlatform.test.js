import path from 'path';
import { buildS3Key } from '../routes/processCv.js';

describe('buildS3Key', () => {
  test('produces forward-slash separated keys', () => {
    const originalJoin = path.join;
    path.join = path.win32.join;
    const basePath = ['john_doe', 'enhanced', '2024-01-01'];
    const pdfKey = buildS3Key(basePath, '123-cover_letter.pdf');
    const textKey = buildS3Key(basePath, '123-cover_letter.txt');
    const improvedPdf = buildS3Key(basePath, '123-improved.pdf');
    const improvedText = buildS3Key(basePath, '123-improved.txt');
    expect(pdfKey).toBe('john_doe/enhanced/2024-01-01/123-cover_letter.pdf');
    expect(textKey).toBe('john_doe/enhanced/2024-01-01/123-cover_letter.txt');
    expect(improvedPdf).toBe('john_doe/enhanced/2024-01-01/123-improved.pdf');
    expect(improvedText).toBe('john_doe/enhanced/2024-01-01/123-improved.txt');
    for (const key of [pdfKey, textKey, improvedPdf, improvedText]) {
      expect(key).not.toContain('\\');
    }
    path.join = originalJoin;
  });
});
