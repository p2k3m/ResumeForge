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

  test('ignores CloudFront domains even with origin paths', () => {
    expect(
      shouldAppendOriginPathToBase('https://d109hwmzrqr39w.cloudfront.net', '/static/client/prod/latest'),
    ).toBe(false)
  })

  test('skips alias fallbacks for API Gateway metadata base', () => {
    expect(htmlContent).toMatch(
      /directCandidates\.push\({\s*value:\s*metadata\.apiGatewayUrl,[^}]*allowAlias:\s*false/,
    )
  })
})
