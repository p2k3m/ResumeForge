import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  extractHashedIndexAssetReferences,
  gatherHashedAssetUploadEntries,
} from '../scripts/upload-hashed-assets.mjs'

describe('extractHashedIndexAssetReferences', () => {
  it('normalizes hashed asset references from index.html', () => {
    const html = `
      <link rel="stylesheet" href="/assets/index-123abc.css?v=1" />
      <script src="./assets/index-123abc.js"></script>
      <script src="../assets/index-legacy.js?cache=bust"></script>
      <link rel="stylesheet" href="/assets/index-legacy.css" />
      <link rel="preload" href="/assets/index-123abc.css" />
    `

    expect(extractHashedIndexAssetReferences(html)).toEqual([
      'assets/index-123abc.css',
      'assets/index-123abc.js',
      'assets/index-legacy.css',
      'assets/index-legacy.js',
    ])
  })
})

describe('gatherHashedAssetUploadEntries', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashed-upload-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('collects referenced hashed assets and existing variants', async () => {
    const distDir = path.join(tempDir, 'dist')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-1e47f298.css" />
        </head>
        <body>
          <script src="/assets/index-0da0d266.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')

    const assetFiles = [
      'index-1e47f298.css',
      'index-1e47f298.css.map',
      'index-0da0d266.js',
      'index-0da0d266.js.map',
      'index-0aa11111.css',
      'index-0aa11111.js',
    ]

    await Promise.all(
      assetFiles.map((fileName) =>
        fs.writeFile(path.join(assetsDir, fileName), `/* ${fileName} */`, 'utf8'),
      ),
    )

    const { entries, referencedAssets } = await gatherHashedAssetUploadEntries({
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
    })

    expect(referencedAssets).toEqual([
      'assets/index-0da0d266.js',
      'assets/index-1e47f298.css',
    ])

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      'assets/index-0aa11111.css',
      'assets/index-0aa11111.js',
      'assets/index-0da0d266.js',
      'assets/index-0da0d266.js.map',
      'assets/index-1e47f298.css',
      'assets/index-1e47f298.css.map',
    ])
  })

  it('allows builds that inline CSS and only reference hashed JS bundles', async () => {
    const distDir = path.join(tempDir, 'dist-inline')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <body>
          <script src="/assets/index-0da0d266.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')
    await fs.writeFile(
      path.join(assetsDir, 'index-0da0d266.js'),
      '/* index-0da0d266.js */',
      'utf8',
    )

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const result = await gatherHashedAssetUploadEntries({
        assetsDirectory: assetsDir,
        indexHtmlPath: path.join(distDir, 'index.html'),
      })

      expect(result.referencedAssets).toEqual(['assets/index-0da0d266.js'])
      expect(result.entries.map((entry) => entry.relativePath)).toEqual([
        'assets/index-0da0d266.js',
      ])
      expect(warnSpy).toHaveBeenCalledWith(
        '[upload-hashed-assets] index.html does not reference a hashed CSS bundle; skipping CSS uploads.',
      )
    } finally {
      warnSpy.mockRestore()
    }
  })
})
