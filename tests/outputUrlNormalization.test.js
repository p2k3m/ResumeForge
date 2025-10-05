import { ensureOutputFileUrls } from '../server.js';

describe('ensureOutputFileUrls', () => {
  it('derives url and fileUrl from typeUrl when no direct url is provided', () => {
    const [entry] = ensureOutputFileUrls([
      {
        type: 'version1',
        typeUrl: 'https://example.com/resume.pdf#version1',
      },
    ]);

    expect(entry.url).toBe('https://example.com/resume.pdf');
    expect(entry.fileUrl).toBe('https://example.com/resume.pdf');
    expect(entry.typeUrl).toBe('https://example.com/resume.pdf#version1');
  });

  it('infers the document type from the typeUrl fragment when missing', () => {
    const [entry] = ensureOutputFileUrls([
      {
        typeUrl: 'https://example.com/cover.pdf#cover_letter1',
      },
    ]);

    expect(entry.type).toBe('cover_letter1');
    expect(entry.url).toBe('https://example.com/cover.pdf');
    expect(entry.fileUrl).toBe('https://example.com/cover.pdf');
    expect(entry.typeUrl).toBe('https://example.com/cover.pdf#cover_letter1');
  });

  it('appends a type fragment when missing from the typeUrl value', () => {
    const [entry] = ensureOutputFileUrls([
      {
        type: 'version2',
        typeUrl: 'https://example.com/resume.pdf',
      },
    ]);

    expect(entry.typeUrl).toBe('https://example.com/resume.pdf#version2');
  });

  it('filters out entries that do not resolve to a downloadable url', () => {
    const normalized = ensureOutputFileUrls([
      { type: 'version1', url: '   ' },
      { type: 'version2', typeUrl: '#version2' },
      { type: 'version3', downloadUrl: 'https://example.com/v3.pdf ' },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toEqual(
      expect.objectContaining({
        type: 'version3',
        url: 'https://example.com/v3.pdf',
        fileUrl: 'https://example.com/v3.pdf',
        typeUrl: 'https://example.com/v3.pdf#version3',
      })
    );
  });
});
