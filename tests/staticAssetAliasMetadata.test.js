import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import vm from 'node:vm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('static asset alias metadata helpers', () => {
  let shouldAppendOriginPathToBase
  let htmlContent = ''

  beforeAll(async () => {
    const htmlPath = path.resolve(__dirname, '../client/index.html')
    htmlContent = await fs.readFile(htmlPath, 'utf8')
    const html = htmlContent
    const match = html.match(
      /const\s+shouldAppendOriginPathToBase\s*=\s*\(candidate,\s*originPath\)\s*=>\s*{([\s\S]*?)}\n\s*const\s+applyAliasMetadataCandidates/,
    )

    if (!match) {
      throw new Error('Unable to locate shouldAppendOriginPathToBase helper in client/index.html')
    }

    const fnSource = `(candidate, originPath) => {${match[1]}}`

    shouldAppendOriginPathToBase = vm.runInNewContext(fnSource, {
      window: { location: { href: 'https://app.resumeforge.test/' } },
      URL,
    })
  })

  test('returns false when originPath is empty', () => {
    expect(shouldAppendOriginPathToBase('https://example.s3.amazonaws.com', '')).toBe(false)
  })

  test('detects path-style S3 buckets', () => {
    expect(
      shouldAppendOriginPathToBase('https://resume-forge-app-2025.s3.amazonaws.com', '/static/client/prod/latest'),
    ).toBe(true)
    expect(
      shouldAppendOriginPathToBase('https://resume-forge-app-2025.s3.ap-south-1.amazonaws.com', '/static'),
    ).toBe(true)
    expect(
      shouldAppendOriginPathToBase('https://resume-forge-app-2025.s3-website-ap-south-1.amazonaws.com', '/static'),
    ).toBe(true)
    expect(
      shouldAppendOriginPathToBase('https://s3.ap-south-1.amazonaws.com/resume-forge-app-2025', '/static'),
    ).toBe(true)
  })

  test('never appends origin paths for CloudFront viewer domains', () => {
    expect(
      shouldAppendOriginPathToBase('https://d109hwmzrqr39w.cloudfront.net', '/static/client/prod/latest'),
    ).toBe(false)
  })

  test('allows alias fallbacks for API Gateway metadata base', () => {
    expect(htmlContent).toMatch(
      /directCandidates\.push\({\s*value:\s*metadata\.apiGatewayUrl,[^}]*allowAlias:\s*true/,
    )
  })

  test('alias reload waits for metadata before falling back to other transports', async () => {
    const functionMatch = htmlContent.match(
      /function\s+attemptAliasReload\s*\(element\)\s*{([\s\S]*?)}(?=\s*const\s+attemptManifestReload)/,
    )

    if (!functionMatch) {
      throw new Error('Unable to extract attemptAliasReload implementation from client/index.html')
    }

    const context = {
      aliasBaseCandidates: [],
      aliasMetadataLoaded: false,
      aliasMetadataPromise: null,
      ensureAliasMetadataLoadedCallCount: 0,
      attemptProxyOrAliasReloadCallCount: 0,
      attemptStaticProxyReloadCallCount: 0,
      document: { documentElement: { contains: () => true } },
      console: { warn: () => {} },
      appendCacheBustParam: (value) => value,
      describeSource: () => '',
      buildAliasUrlForAttempt: () => ({ url: '', base: '' }),
      aliasPaths: { css: '/assets/index-latest.css', js: '/assets/index-latest.js' },
      window: { location: { href: 'https://app.resumeforge.test/' } },
    }

    context.ensureAliasMetadataLoaded = () => {
      context.ensureAliasMetadataLoadedCallCount += 1
      context.aliasMetadataPromise = Promise.resolve(false)
      return context.aliasMetadataPromise
    }

    context.attemptProxyOrAliasReload = () => {
      context.attemptProxyOrAliasReloadCallCount += 1
      return false
    }

    context.attemptStaticProxyReload = () => {
      context.attemptStaticProxyReloadCallCount += 1
      return false
    }

    const attemptAliasReload = vm.runInNewContext(
      `${functionMatch[0]}; attemptAliasReload`,
      { ...context, Promise },
    )

    const element = {
      tagName: 'link',
      rel: 'stylesheet',
      dataset: {},
      parentNode: {
        replaceChild() {},
        removeChild() {},
        appendChild() {},
      },
    }

    const result = attemptAliasReload(element)
    expect(result).toBe(true)
    expect(context.ensureAliasMetadataLoadedCallCount).toBe(1)
    expect(element.dataset.resumeforgeAliasMetadataPending).toBe('true')

    await context.aliasMetadataPromise

    expect(element.dataset.resumeforgeAliasMetadataPending).toBeUndefined()
    expect(element.dataset.resumeforgeAliasMetadataAttempted).toBe('true')
    expect(context.attemptProxyOrAliasReloadCallCount).toBeGreaterThan(0)
    expect(context.attemptStaticProxyReloadCallCount).toBeGreaterThan(0)
  })

  test('gatherApiFallbackBases considers S3 origins from metadata', () => {
    expect(htmlContent).toMatch(/const\s+bucketBases\s*=\s*buildS3BaseCandidates\(/)
    expect(htmlContent).toMatch(/shouldAppendOriginPathToBase\(base,\s*originPath\)/)
  })
})
