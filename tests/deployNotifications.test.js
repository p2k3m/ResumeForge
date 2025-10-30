import { describe, expect, it } from '@jest/globals'
import { classifyDeployFailure } from '../lib/deploy/notifications.js'

describe('classifyDeployFailure', () => {
  it('detects missing client assets errors', () => {
    const error = new Error(
      '[ensure-client-build] Missing required directory at /workspace/client/dist. Run "npm run build:client" before deploying.',
    )

    const classification = classifyDeployFailure(error)

    expect(classification).toEqual(
      expect.objectContaining({
        type: 'missing_client_assets',
        severity: 'error',
      }),
    )
  })

  it('detects missing asset references reported by ensure-client-build', () => {
    const error = new Error(
      '[ensure-client-build] Missing client asset referenced by index.html (assets/index-abc123.js) at /workspace/client/dist/assets/index-abc123.js. Run "npm run build:client" before deploying.',
    )

    const classification = classifyDeployFailure(error)

    expect(classification).toEqual(
      expect.objectContaining({
        type: 'missing_client_assets',
        severity: 'error',
      }),
    )
  })

  it('detects incomplete static uploads', () => {
    const error = new Error(
      '[upload-static] Manifest s3://resume-forge/static/client/prod/latest/manifest.json does not list any uploaded files.',
    )

    const classification = classifyDeployFailure(error)

    expect(classification).toEqual(
      expect.objectContaining({
        type: 'static_upload_incomplete',
        severity: 'error',
      }),
    )
  })

  it('returns null for unrelated errors', () => {
    const classification = classifyDeployFailure(new Error('Network timeout while invalidating CloudFront.'))
    expect(classification).toBeNull()
  })
})
