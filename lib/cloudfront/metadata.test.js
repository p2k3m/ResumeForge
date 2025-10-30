import { ensureMetaApiBase, updateMetaApiBase } from './metadata.js';

const META_TAG_REGEX = /<meta\s+name="resumeforge-api-base"\s+content="([^"]*)"\s*\/>/i;

describe('cloudfront metadata HTML helpers', () => {
  describe('ensureMetaApiBase', () => {
    it('inserts the meta tag when missing, before the closing head tag', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>ResumeForge</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

      const result = ensureMetaApiBase(html);

      expect(result).toMatch(META_TAG_REGEX);
      expect(result.indexOf('<meta name="resumeforge-api-base"')).toBeLessThan(result.indexOf('</head>'));
    });

    it('leaves existing meta tags untouched', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta name="resumeforge-api-base" content="https://api.example.com" />
  </head>
</html>`;

      const result = ensureMetaApiBase(html);

      expect(result).toBe(html);
    });
  });

  describe('updateMetaApiBase', () => {
    it('updates the content attribute when the meta tag exists', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta name="resumeforge-api-base" content="https://api.old.example.com" />
  </head>
</html>`;

      const result = updateMetaApiBase(html, 'https://api.new.example.com');

      expect(result).toContain('content="https://api.new.example.com"');
    });

    it('creates the meta tag when it is missing and sets the provided value', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>ResumeForge</title>
  </head>
</html>`;

      const result = updateMetaApiBase(html, 'https://api.created.example.com');

      const match = result.match(META_TAG_REGEX);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('https://api.created.example.com');
    });
  });
});
