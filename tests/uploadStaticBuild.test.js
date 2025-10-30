import {
  resolvePrimaryIndexAssets,
  resolveIndexAssetAliases,
  ensureIndexAliasCoverage,
  shouldDeleteObjectKey,
  verifyUploadedAssets,
  extractHashedIndexAssets,
  statementAllowsPublicAssetDownload,
  findMissingBucketPolicyKeys,
} from '../scripts/upload-static-build.mjs'
import { GetObjectCommand } from '@aws-sdk/client-s3'

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
      'assets/index-latest.css',
      'assets/index-latest.js',
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

  it('ignores alias bundles when selecting fallback assets', () => {
    const manifest = resolvePrimaryIndexAssets({
      hashedAssets: [],
      files: [
        'assets/index-latest.css',
        'assets/index-latest.js',
        'assets/index-abc123.css',
        'assets/index-abc123.js',
      ],
    })

    expect(manifest.css).toBe('assets/index-abc123.css')
    expect(manifest.js).toBe('assets/index-abc123.js')
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

describe('extractHashedIndexAssets', () => {
  it('throws when no hashed CSS bundle can be detected', () => {
    const html = `<!DOCTYPE html>
      <html>
        <head>
          <script src="/assets/index-abc123.js"></script>
        </head>
        <body></body>
      </html>`

    expect(() => extractHashedIndexAssets(html)).toThrow(
      '[upload-static] index.html must reference at least one hashed CSS bundle. Found 0 CSS assets.',
    )
  })
})

describe('ensureIndexAliasCoverage', () => {
  it('passes when both aliases are present in the upload list', () => {
    expect(() =>
      ensureIndexAliasCoverage([
        { path: 'index.html' },
        { path: 'assets/index-latest.css' },
        { path: 'assets/index-latest.js' },
      ]),
    ).not.toThrow()
  })

  it('throws a validation error when an alias is missing', () => {
    expect(() => ensureIndexAliasCoverage([{ path: 'assets/index-latest.js' }])).toThrow(
      '[upload-static] Missing required index alias bundle: "assets/index-latest.css".',
    )
  })

  it('normalizes primitive path entries when verifying aliases', () => {
    expect(() => ensureIndexAliasCoverage(['assets/index-latest.css', 'assets/index-latest.js'])).not.toThrow()
  })
})

describe('shouldDeleteObjectKey', () => {
  const prefix = 'static/client/prod/latest/'

  it('preserves hashed index bundles to avoid accidental eviction', () => {
    expect(
      shouldDeleteObjectKey('static/client/prod/latest/assets/index-abc123.css', prefix),
    ).toBe(false)
    expect(
      shouldDeleteObjectKey('static/client/prod/latest/assets/index-abc123.js', prefix),
    ).toBe(false)
  })

  it('keeps alias bundles in place so they can be atomically replaced', () => {
    expect(
      shouldDeleteObjectKey('static/client/prod/latest/assets/index-latest.css', prefix),
    ).toBe(false)
    expect(
      shouldDeleteObjectKey('static/client/prod/latest/assets/index-latest.js', prefix),
    ).toBe(false)
  })

  it('continues to delete unrelated objects when purging the prefix', () => {
    expect(shouldDeleteObjectKey('static/client/prod/latest/index.html', prefix)).toBe(true)
    expect(shouldDeleteObjectKey('static/client/prod/latest/404.html', prefix)).toBe(true)
  })
})

describe('verifyUploadedAssets', () => {
  class FakeS3Client {
    constructor(responses = []) {
      this.responses = Array.from(responses)
      this.commands = []
    }

    async send(command) {
      this.commands.push(command)
      if (this.responses.length === 0) {
        return {}
      }

      const response = this.responses.shift()
      if (response instanceof Error) {
        throw response
      }

      return response ?? {}
    }
  }

  it('issues a GET request for each uploaded asset', async () => {
    const client = new FakeS3Client([{}, {}])
    const uploads = [
      { path: 'index.html', key: 'static/client/prod/latest/index.html' },
      { path: 'assets/index-abc123.js', key: 'static/client/prod/latest/assets/index-abc123.js' },
    ]

    await expect(
      verifyUploadedAssets({ s3: client, bucket: 'my-bucket', uploads }),
    ).resolves.toBeUndefined()

    expect(client.commands).toHaveLength(2)
    for (const command of client.commands) {
      expect(command).toBeInstanceOf(GetObjectCommand)
      expect(command.input).toEqual(expect.objectContaining({ Bucket: 'my-bucket' }))
    }
    expect(client.commands[0].input.Key).toBe('static/client/prod/latest/index.html')
    expect(client.commands[1].input.Key).toBe(
      'static/client/prod/latest/assets/index-abc123.js',
    )
  })

  it('throws an error when a verification request fails', async () => {
    const error = Object.assign(new Error('Not Found'), {
      $metadata: { httpStatusCode: 404 },
      name: 'NotFound',
    })
    const client = new FakeS3Client([error])
    const uploads = [
      { path: 'index.html', key: 'static/client/prod/latest/index.html' },
    ]

    await expect(
      verifyUploadedAssets({ s3: client, bucket: 'missing-bucket', uploads }),
    ).rejects.toThrow('[upload-static] 1 uploaded asset failed verification.')
  })
})

describe('statementAllowsPublicAssetDownload', () => {
  const bucket = 'resume-bucket'
  const key = 'static/client/prod/latest/assets/index-latest.js'

  it('returns true when the statement grants public GetObject on the prefix', () => {
    const statement = {
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${bucket}/static/client/prod/latest/*`,
    }

    expect(statementAllowsPublicAssetDownload(statement, bucket, key)).toBe(true)
  })

  it('returns false when the principal is not public', () => {
    const statement = {
      Effect: 'Allow',
      Principal: { AWS: 'arn:aws:iam::123456789012:role/InternalOnly' },
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${bucket}/*`,
    }

    expect(statementAllowsPublicAssetDownload(statement, bucket, key)).toBe(false)
  })

  it('returns false when the resource does not cover the target key', () => {
    const statement = {
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${bucket}/static/client/legacy/*`,
    }

    expect(statementAllowsPublicAssetDownload(statement, bucket, key)).toBe(false)
  })
})

describe('findMissingBucketPolicyKeys', () => {
  const bucket = 'resume-bucket'

  it('identifies keys that are not covered by any public statements', () => {
    const statements = [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucket}/static/client/prod/latest/index.html`,
      },
    ]

    const missing = findMissingBucketPolicyKeys({
      statements,
      bucket,
      keys: [
        'static/client/prod/latest/index.html',
        'static/client/prod/latest/assets/index-latest.css',
        'static/client/prod/latest/assets/index-latest.js',
      ],
    })

    expect(missing).toEqual([
      'static/client/prod/latest/assets/index-latest.css',
      'static/client/prod/latest/assets/index-latest.js',
    ])
  })

  it('returns an empty array when all keys are covered', () => {
    const statements = [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject', 's3:GetObjectVersion'],
        Resource: `arn:aws:s3:::${bucket}/*`,
      },
    ]

    const missing = findMissingBucketPolicyKeys({
      statements,
      bucket,
      keys: [
        'static/client/prod/latest/index.html',
        'static/client/prod/latest/assets/index-latest.css',
        'static/client/prod/latest/assets/index-latest.js',
      ],
    })

    expect(missing).toEqual([])
  })
})
