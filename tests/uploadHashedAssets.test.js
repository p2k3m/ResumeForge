import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { jest } from '@jest/globals'
import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  extractHashedIndexAssetReferences,
  gatherHashedAssetUploadEntries,
  uploadHashedIndexAssets,
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

describe('uploadHashedIndexAssets', () => {
  let tempDir
  let sendMock
  const envKeys = [
    'STAGE_NAME',
    'DEPLOYMENT_ENVIRONMENT',
    'STATIC_ASSETS_BUCKET',
    'STATIC_ASSETS_PREFIX',
    'BUILD_VERSION',
    'DATA_BUCKET',
    'S3_BUCKET',
  ]
  const originalEnv = {}

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashed-upload-exec-'))

    for (const key of envKeys) {
      originalEnv[key] = process.env[key]
    }

    sendMock = jest
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(async (command) => {
        if (command instanceof HeadBucketCommand) {
          return {}
        }
        if (command instanceof PutObjectCommand) {
          return {}
        }
        throw new Error(`Unexpected command: ${command?.constructor?.name ?? 'unknown'}`)
      })
  })

  afterEach(async () => {
    if (sendMock) {
      sendMock.mockRestore()
    }

    for (const key of envKeys) {
      if (typeof originalEnv[key] === 'undefined') {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
      delete originalEnv[key]
    }

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('uploads hashed assets, alias copies, and versioned directories', async () => {
    process.env.STAGE_NAME = 'prod'
    process.env.DEPLOYMENT_ENVIRONMENT = 'prod'
    process.env.STATIC_ASSETS_BUCKET = 'static-bucket-test'
    process.env.STATIC_ASSETS_PREFIX = 'static/client/prod/latest'
    process.env.BUILD_VERSION = '20251029'

    const distDir = path.join(tempDir, 'dist')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-20251029.css" />
        </head>
        <body>
          <script src="/assets/index-20251029.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-20251029.css'), 'body{}', 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-20251029.js'), 'console.log("hi")', 'utf8')

    const result = await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    const cssAlias = await fs.readFile(path.join(assetsDir, 'index-latest.css'), 'utf8')
    const jsAlias = await fs.readFile(path.join(assetsDir, 'index-latest.js'), 'utf8')

    expect(cssAlias).toBe('body{}')
    expect(jsAlias).toBe('console.log("hi")')
    expect(result.versionLabel).toBe('v20251029')

    const putCommands = sendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof PutObjectCommand)

    const uploadedKeys = putCommands.map((command) => command.input.Key)

    expect(uploadedKeys).toEqual(
      expect.arrayContaining([
        'static/client/prod/latest/assets/index-20251029.css',
        'static/client/prod/latest/assets/index-20251029.js',
        'static/client/prod/latest/assets/index-latest.css',
        'static/client/prod/latest/assets/index-latest.js',
        'static/client/prod/latest/assets/v20251029/index-20251029.css',
        'static/client/prod/latest/assets/v20251029/index-20251029.js',
      ]),
    )

    expect(sendMock).toHaveBeenCalled()
    expect(putCommands).toHaveLength(6)
  })

  it('falls back to published CloudFront metadata when env config is missing', async () => {
    process.env.BUILD_VERSION = '20251029'
    delete process.env.STATIC_ASSETS_BUCKET
    delete process.env.STATIC_ASSETS_PREFIX
    delete process.env.STAGE_NAME
    delete process.env.DEPLOYMENT_ENVIRONMENT
    delete process.env.DATA_BUCKET
    delete process.env.S3_BUCKET

    const distDir = path.join(tempDir, 'dist')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-20251029.css" />
        </head>
        <body>
          <script src="/assets/index-20251029.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-20251029.css'), 'body{}', 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-20251029.js'), 'console.log("hi")', 'utf8')

    const result = await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    expect(result.bucket).toBe('resume-forge-app-2025')
    expect(result.prefix).toBe('static/client/prod/latest')

    const putCommands = sendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof PutObjectCommand)

    const uploadedKeys = putCommands.map((command) => command.input.Key)

    expect(uploadedKeys).toEqual(
      expect.arrayContaining([
        'static/client/prod/latest/assets/index-20251029.css',
        'static/client/prod/latest/assets/index-20251029.js',
        'static/client/prod/latest/assets/index-latest.css',
        'static/client/prod/latest/assets/index-latest.js',
      ]),
    )

    expect(sendMock).toHaveBeenCalled()
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
