import { resolvePrimaryIndexAssets, resolveIndexAssetAliases } from '../scripts/upload-static-build.mjs'

describe('resolvePrimaryIndexAssets', () => {
  it('prefers hashed assets discovered in index.html', () => {
    const hashedAssets = ['/assets/index-abc123.css', './assets/index-abc123.js']
    const files = [
      'assets/index-old.css',
      'assets/index-old.js',
      'assets/index-abc123.css',
      'assets/index-abc123.js',
    ]

    const manifest = resolvePrimaryIndexAssets({ hashedAssets, files })

    expect(manifest.css).toBe('assets/index-abc123.css')
    expect(manifest.js).toBe('assets/index-abc123.js')
  })

  it('falls back to the newest hashed assets discovered in the file list when the HTML manifest is empty', () => {
    const hashedAssets = []
    const files = [
      'assets/index-20240101.css',
      'assets/index-20240101.js',
      'assets/index-20240215.css',
      'assets/index-20240215.js',
      'assets/index-20240320.css',
      'assets/index-20240320.js',
    ]

    const manifest = resolvePrimaryIndexAssets({ hashedAssets, files })

    expect(manifest.css).toBe('assets/index-20240320.css')
    expect(manifest.js).toBe('assets/index-20240320.js')
  })

  it('handles windows-style paths when selecting fallback assets', () => {
    const manifest = resolvePrimaryIndexAssets({
      hashedAssets: [],
      files: ['assets\\index-old.css', 'assets\\index-new.js', 'assets/index-new.css'],
    })

    expect(manifest.css).toBe('assets/index-new.css')
    expect(manifest.js).toBe('assets/index-new.js')
  })
})

describe('resolveIndexAssetAliases', () => {
  it('generates alias uploads for the resolved assets', () => {
    const manifest = { css: 'assets/index-abc123.css', js: 'assets/index-abc123.js' }

    expect(resolveIndexAssetAliases(manifest)).toEqual([
      { alias: 'assets/index-latest.css', source: 'assets/index-abc123.css' },
      { alias: 'assets/index-latest.js', source: 'assets/index-abc123.js' },
    ])
  })

  it('omits aliases when a bundle cannot be resolved', () => {
    expect(resolveIndexAssetAliases({ css: '', js: '' })).toEqual([])
    expect(resolveIndexAssetAliases({ css: 'assets/index-abc123.css' })).toEqual([
      { alias: 'assets/index-latest.css', source: 'assets/index-abc123.css' },
    ])
  })
})
