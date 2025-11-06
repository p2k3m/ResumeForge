import { parseStaticPipelineArgs, buildStaticPipelinePlan } from '../scripts/static-asset-pipeline.mjs'

describe('parseStaticPipelineArgs', () => {
  it('parses environment, stack, and skip flags', () => {
    const options = parseStaticPipelineArgs([
      '--environment',
      'prod',
      '--stack=ResumeForgeStack',
      '--skip-clean',
      '--skip-build',
      '--skip-upload',
      '--skip-hashed',
      '--skip-cloudfront',
      '--cloudfront-url',
      'https://example.cloudfront.net',
      '--asset-prefix',
      'static/client/prod/latest',
      '--cloudfront-retries',
      '4',
      '--cloudfront-retry-delay',
      '20000',
    ])

    expect(options.environment).toBe('prod')
    expect(options.stackName).toBe('ResumeForgeStack')
    expect(options.skipClean).toBe(true)
    expect(options.skipBuild).toBe(true)
    expect(options.skipUpload).toBe(true)
    expect(options.skipHashedUpload).toBe(true)
    expect(options.skipCloudfrontVerify).toBe(true)
    expect(options.cloudfrontUrl).toBe('https://example.cloudfront.net')
    expect(options.assetPrefixes).toContain('static/client/prod/latest')
    expect(options.cloudfrontRetries).toBe(4)
    expect(options.cloudfrontRetryDelayMs).toBe(20000)
  })

  it('treats skip verify flag as disabling both verifiers', () => {
    const options = parseStaticPipelineArgs(['--skip-verify'])
    expect(options.skipVerify).toBe(true)
    expect(options.skipCloudfrontVerify).toBe(true)
  })
})

describe('buildStaticPipelinePlan', () => {
  it('includes all steps when verification and publishing are enabled', () => {
    const plan = buildStaticPipelinePlan({
      stackName: 'ResumeForgeStack',
      skipVerify: false,
      skipCloudfrontVerify: false,
    })

    expect(plan.map((step) => step.id)).toEqual([
      'clean',
      'build-client',
      'upload-static',
      'upload-hashed',
      'verify-static',
      'publish-cloudfront',
      'verify-cloudfront',
    ])
  })

  it('omits skipped steps', () => {
    const plan = buildStaticPipelinePlan({
      skipClean: true,
      skipBuild: true,
      skipUpload: true,
      skipVerify: true,
      skipCloudfrontVerify: true,
      skipPublish: true,
    })

    expect(plan).toHaveLength(0)
  })
})
