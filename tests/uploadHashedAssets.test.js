import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { jest } from '@jest/globals'
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
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
  let manifestPayload
  const envKeys = [
    'STAGE_NAME',
    'DEPLOYMENT_ENVIRONMENT',
    'STATIC_ASSETS_BUCKET',
    'STATIC_ASSETS_PREFIX',
    'BUILD_VERSION',
    'DATA_BUCKET',
    'S3_BUCKET',
    'PUBLISHED_CLOUDFRONT_PATH',
    'RESUMEFORGE_API_BASE_URL',
    'VITE_API_BASE_URL',
    'API_BASE_URL',
    'PUBLIC_API_BASE_URL',
  ]
  const originalEnv = {}
  let metadataPath

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashed-upload-exec-'))

    for (const key of envKeys) {
      originalEnv[key] = process.env[key]
    }

    metadataPath = path.join(tempDir, 'published-cloudfront.json')
    const defaultMetadata = {
      stackName: 'ResumeForge',
      url: 'https://d109hwmzrqr39w.cloudfront.net',
      distributionId: 'E2HWMZRQR39W0',
      originBucket: 'resume-forge-app-2025',
      originRegion: 'ap-south-1',
      originPath: '/static/client/prod/latest',
      updatedAt: '2025-03-18T09:30:00.000Z',
    }
    await fs.writeFile(metadataPath, JSON.stringify(defaultMetadata), 'utf8')
    process.env.PUBLISHED_CLOUDFRONT_PATH = metadataPath

    manifestPayload = {
      stage: 'prod',
      prefix: 'static/client/prod/latest',
      bucket: 'resume-forge-app-2025',
      files: [],
      hashedIndexAssets: [],
      hashedIndexAssetCount: 0,
      uploadedAt: '2024-11-01T00:00:00.000Z',
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
        if (command instanceof HeadObjectCommand) {
          return {}
        }
        if (command instanceof GetObjectCommand) {
          return {
            Body: Buffer.from(JSON.stringify(manifestPayload)),
          }
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
    const apiDir = path.join(distDir, 'api')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.mkdir(apiDir, { recursive: true })

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
    await fs.writeFile(path.join(apiDir, 'published-cloudfront'), '{"url":"https://example.com"}', 'utf8')
    await fs.writeFile(path.join(apiDir, 'published-cloudfront.json'), '{"url":"https://example.com"}', 'utf8')

    const result = await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    const updatedIndex = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
    expect(updatedIndex).toContain('__RESUMEFORGE_CLOUDFRONT_METADATA__')
    expect(updatedIndex).toContain('"url":"https://d109hwmzrqr39w.cloudfront.net"')

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
        'static/client/prod/latest/api/published-cloudfront',
        'static/client/prod/latest/api/published-cloudfront.json',
        'static/client/prod/latest/manifest.json',
        'static/client/prod/latest/assets/v20251029/index-20251029.css',
        'static/client/prod/latest/assets/v20251029/index-20251029.js',
      ]),
    )

    expect(sendMock).toHaveBeenCalled()
    expect(putCommands).toHaveLength(9)

    const manifestPut = putCommands.find((command) =>
      command.input.Key.endsWith('/manifest.json'),
    )
    expect(manifestPut).toBeDefined()
    const manifestBody = manifestPut.input.Body
    const manifestJson = JSON.parse(
      typeof manifestBody === 'string' ? manifestBody : manifestBody.toString(),
    )
    expect(manifestJson.hashedIndexAssets).toEqual([
      'assets/index-20251029.css',
      'assets/index-20251029.js',
    ])
    expect(manifestJson.assetVersionLabel).toBe('v20251029')

    for (const command of putCommands) {
      expect(command.input.Metadata).toEqual(
        expect.objectContaining({
          'build-version': expect.any(String),
          'build-sha': expect.any(String),
          'build-timestamp': expect.any(String),
        }),
      )
    }
  })

  it('recreates manifest.json from the local build when the remote copy is missing', async () => {
    process.env.STAGE_NAME = 'prod'
    process.env.DEPLOYMENT_ENVIRONMENT = 'prod'
    process.env.STATIC_ASSETS_BUCKET = 'static-bucket-test'
    process.env.STATIC_ASSETS_PREFIX = 'static/client/prod/latest'
    process.env.BUILD_VERSION = '20251029'

    const distDir = path.join(tempDir, 'dist-missing-manifest')
    const assetsDir = path.join(distDir, 'assets')
    const apiDir = path.join(distDir, 'api')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.mkdir(apiDir, { recursive: true })

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
    await fs.writeFile(path.join(apiDir, 'published-cloudfront'), '{"url":"https://example.com"}', 'utf8')
    await fs.writeFile(
      path.join(apiDir, 'published-cloudfront.json'),
      '{"url":"https://example.com"}',
      'utf8',
    )

    const localManifest = {
      files: ['assets/index-legacy.css'],
      hashedIndexAssets: [],
      uploadedAt: '2024-10-31T00:00:00.000Z',
    }
    await fs.writeFile(
      path.join(distDir, 'manifest.json'),
      JSON.stringify(localManifest, null, 2),
      'utf8',
    )

    sendMock.mockImplementation(async (command) => {
      if (command instanceof HeadBucketCommand) {
        return {}
      }
      if (command instanceof PutObjectCommand) {
        return {}
      }
      if (command instanceof HeadObjectCommand) {
        return {}
      }
      if (command instanceof GetObjectCommand) {
        const error = new Error('NotFound')
        error.$metadata = { httpStatusCode: 404 }
        error.name = 'NoSuchKey'
        throw error
      }

      throw new Error(`Unexpected command: ${command?.constructor?.name ?? 'unknown'}`)
    })

    await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    const putCommands = sendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof PutObjectCommand)

    const manifestPut = putCommands.find((command) =>
      command.input.Key.endsWith('/manifest.json'),
    )

    expect(manifestPut).toBeDefined()

    const manifestBody = manifestPut.input.Body
    const manifestJson = JSON.parse(
      typeof manifestBody === 'string' ? manifestBody : manifestBody.toString(),
    )

    expect(manifestJson.files).toEqual(
      expect.arrayContaining(['assets/index-20251029.css', 'assets/index-20251029.js']),
    )
    expect(manifestJson.hashedIndexAssets).toEqual([
      'assets/index-20251029.css',
      'assets/index-20251029.js',
    ])
    expect(manifestJson.assetVersionLabel).toBe('v20251029')
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
    const apiDir = path.join(distDir, 'api')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.mkdir(apiDir, { recursive: true })

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
    await fs.writeFile(path.join(apiDir, 'published-cloudfront'), '{"url":"https://example.com"}', 'utf8')
    await fs.writeFile(path.join(apiDir, 'published-cloudfront.json'), '{"url":"https://example.com"}', 'utf8')

    const result = await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    expect(result.bucket).toBe('resume-forge-app-2025')
    expect(result.prefix).toBe('static/client/prod/latest')

    const updatedIndex = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
    expect(updatedIndex).toContain('__RESUMEFORGE_CLOUDFRONT_METADATA__')
    expect(updatedIndex).toContain('"originBucket":"resume-forge-app-2025"')

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
        'static/client/prod/latest/api/published-cloudfront',
        'static/client/prod/latest/api/published-cloudfront.json',
        'static/client/prod/latest/manifest.json',
      ]),
    )

    expect(sendMock).toHaveBeenCalled()
  })

  it('throws when no static asset destination can be resolved', async () => {
    delete process.env.STATIC_ASSETS_BUCKET
    delete process.env.STATIC_ASSETS_PREFIX
    delete process.env.DATA_BUCKET
    delete process.env.S3_BUCKET
    await fs.rm(metadataPath, { force: true })

    const distDir = path.join(tempDir, 'dist-no-destination')
    const assetsDir = path.join(distDir, 'assets')
    const apiDir = path.join(distDir, 'api')
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.mkdir(apiDir, { recursive: true })

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
    await fs.writeFile(path.join(apiDir, 'published-cloudfront'), '{}', 'utf8')
    await fs.writeFile(path.join(apiDir, 'published-cloudfront.json'), '{}', 'utf8')

    await expect(
      uploadHashedIndexAssets({
        distDirectory: distDir,
        assetsDirectory: assetsDir,
        indexHtmlPath: path.join(distDir, 'index.html'),
        quiet: true,
      }),
    ).rejects.toThrow('Unable to resolve a static asset bucket/prefix')
  })

  it('throws when CloudFront fallback metadata files cannot be generated', async () => {
    process.env.STAGE_NAME = 'prod'
    process.env.DEPLOYMENT_ENVIRONMENT = 'prod'
    process.env.STATIC_ASSETS_BUCKET = 'static-bucket-test'
    process.env.STATIC_ASSETS_PREFIX = 'static/client/prod/latest'
    delete process.env.RESUMEFORGE_API_BASE_URL
    delete process.env.VITE_API_BASE_URL
    delete process.env.API_BASE_URL
    delete process.env.PUBLIC_API_BASE_URL

    await fs.rm(metadataPath, { force: true })

    const distDir = path.join(tempDir, 'dist-missing-fallback')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-555555.css" />
        </head>
        <body>
          <script src="/assets/index-555555.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-555555.css'), 'body{}', 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-555555.js'), 'console.log("noop")', 'utf8')

    await expect(
      uploadHashedIndexAssets({
        distDirectory: distDir,
        assetsDirectory: assetsDir,
        indexHtmlPath: path.join(distDir, 'index.html'),
        quiet: true,
      }),
    ).rejects.toThrow(/Required supplementary asset/i)
  })

  it('generates degraded CloudFront metadata when published metadata is unavailable', async () => {
    process.env.STAGE_NAME = 'prod'
    process.env.DEPLOYMENT_ENVIRONMENT = 'prod'
    process.env.STATIC_ASSETS_BUCKET = 'static-bucket-test'
    process.env.STATIC_ASSETS_PREFIX = 'static/client/prod/latest'
    process.env.VITE_API_BASE_URL = 'https://api.resume.example.com/prod'

    await fs.rm(metadataPath, { force: true })

    const distDir = path.join(tempDir, 'dist')
    const assetsDir = path.join(distDir, 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const indexHtml = `
      <html>
        <head>
          <meta name="resumeforge-api-base" content="%VITE_API_BASE_URL%" />
          <link rel="stylesheet" href="/assets/index-424242.css" />
        </head>
        <body>
          <script src="/assets/index-424242.js" type="module"></script>
        </body>
      </html>
    `

    await fs.writeFile(path.join(distDir, 'index.html'), indexHtml, 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-424242.css'), 'html{}', 'utf8')
    await fs.writeFile(path.join(assetsDir, 'index-424242.js'), 'console.log("fallback")', 'utf8')

    const result = await uploadHashedIndexAssets({
      distDirectory: distDir,
      assetsDirectory: assetsDir,
      indexHtmlPath: path.join(distDir, 'index.html'),
      quiet: true,
    })

    expect(result.bucket).toBe('static-bucket-test')
    expect(result.prefix).toBe('static/client/prod/latest')

    const fallbackPayloadRaw = await fs.readFile(
      path.join(distDir, 'api', 'published-cloudfront.json'),
      'utf8',
    )
    const fallbackPayload = JSON.parse(fallbackPayloadRaw)

    expect(fallbackPayload).toMatchObject({
      success: true,
      cloudfront: expect.objectContaining({
        degraded: true,
        apiGatewayUrl: 'https://api.resume.example.com/prod',
        url: 'https://api.resume.example.com/prod',
      }),
    })
    expect(typeof fallbackPayload.cloudfront.updatedAt).toBe('string')
    expect(fallbackPayload.cloudfront.updatedAt.length).toBeGreaterThan(0)

    const updatedIndex = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
    expect(updatedIndex).toContain('__RESUMEFORGE_CLOUDFRONT_METADATA__')
    expect(updatedIndex).toContain('"apiGatewayUrl":"https://api.resume.example.com/prod"')

    const putCommands = sendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof PutObjectCommand)

    const uploadedKeys = putCommands.map((command) => command.input.Key)

    expect(uploadedKeys).toEqual(
      expect.arrayContaining([
        'static/client/prod/latest/assets/index-424242.css',
        'static/client/prod/latest/assets/index-424242.js',
        'static/client/prod/latest/assets/index-latest.css',
        'static/client/prod/latest/assets/index-latest.js',
        'static/client/prod/latest/api/published-cloudfront',
        'static/client/prod/latest/api/published-cloudfront.json',
        'static/client/prod/latest/manifest.json',
      ]),
    )
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
