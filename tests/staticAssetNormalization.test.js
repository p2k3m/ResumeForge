import {
  normalizeManifestHashedAssetPath,
  normalizeHashedIndexAssetPath,
} from '../lib/static/normalization.js';

describe('static asset path normalization', () => {
  describe('normalizeManifestHashedAssetPath', () => {
    it('strips trailing punctuation from manifest entries', () => {
      expect(normalizeManifestHashedAssetPath('assets/index-abc123.css,,')).toBe(
        '/assets/index-abc123.css',
      );
    });

    it('drops manifest metadata payloads appended after delimiters', () => {
      expect(
        normalizeManifestHashedAssetPath(
          'assets/index-abc123.css,, {"alias":"/assets/index-latest.css"}',
        ),
      ).toBe('/assets/index-abc123.css');

      expect(
        normalizeManifestHashedAssetPath(
          'assets/index-abc123.css;; {"alias":"/assets/index-latest.css"}',
        ),
      ).toBe('/assets/index-abc123.css');
    });

    it('handles query strings before stripping punctuation', () => {
      expect(normalizeManifestHashedAssetPath('https://cdn.example.com/assets/index-xyz.js?foo=1,,')).toBe(
        '/assets/index-xyz.js',
      );
    });
  });

  describe('normalizeHashedIndexAssetPath', () => {
    it('removes trailing commas before ensuring leading slash', () => {
      expect(normalizeHashedIndexAssetPath('assets/index-abc123.js,,')).toBe(
        '/assets/index-abc123.js',
      );
    });

    it('preserves already normalized values', () => {
      expect(normalizeHashedIndexAssetPath('/assets/index-123.css')).toBe(
        '/assets/index-123.css',
      );
    });
  });
});
