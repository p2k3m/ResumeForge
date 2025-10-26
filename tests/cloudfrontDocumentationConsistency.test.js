import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const loadFile = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8')

describe('CloudFront documentation snapshots', () => {
  const metadata = JSON.parse(
    loadFile('config/published-cloudfront.json')
  )
  const publishedUrl = metadata.url
  const originBucket = metadata.originBucket

  it('mirrors the published URL in the README snapshot', () => {
    const readme = loadFile('README.md')
    expect(readme).toContain(
      `> **Active CloudFront domain:** \`${publishedUrl}\``
    )
    expect(readme).toContain(
      `> Origin bucket: \`${originBucket}\``
    )
  })

  it('keeps the reference docs aligned with the published URL', () => {
    const docs = [
      'docs/cloudfront-url.md',
      'docs/onboarding.md',
      'docs/user-journey.md'
    ]

    docs.forEach((docPath) => {
      const contents = loadFile(docPath)
      expect(contents).toContain(publishedUrl)
      if (docPath === 'docs/cloudfront-url.md') {
        expect(contents).toContain(originBucket)
      }
    })
  })

  it('updates the troubleshooting guide examples to the latest domain', () => {
    const guide = loadFile('docs/troubleshooting-cloudfront.md')
    const expectedSample = `Failed to reach ${publishedUrl}/healthz: fetch failed`
    expect(guide).toContain(
      `Loaded CloudFront URL from config: ${publishedUrl}`
    )
    expect(guide).toContain(expectedSample)
  })
})
