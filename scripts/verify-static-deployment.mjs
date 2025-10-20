#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js'
import { verifyClientAssets, PROXY_BLOCKED_ERROR_CODE } from '../lib/cloudfrontAssetCheck.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function isTruthyEnv(value) {
  if (typeof value !== 'string') {
    return false
  }
  return /^(?:true|1|yes)$/iu.test(value.trim())
}

function shouldEnforceVerification(flagName) {
  if (flagName && Object.prototype.hasOwnProperty.call(process.env, flagName)) {
    return isTruthyEnv(process.env[flagName])
  }
  return isTruthyEnv(process.env.CI || '')
}

function resolveBucketConfiguration() {
  const bucketCandidate =
    process.env.STATIC_ASSETS_BUCKET || process.env.DATA_BUCKET || process.env.S3_BUCKET
  const bucket = typeof bucketCandidate === 'string' ? bucketCandidate.trim() : ''
  if (!bucket) {
    throw new Error(
      'STATIC_ASSETS_BUCKET (or DATA_BUCKET/S3_BUCKET) must be set to verify uploaded assets.',
    )
  }

  const stageCandidate =
    process.env.STAGE_NAME || process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'prod'
  const stage = String(stageCandidate).trim() || 'prod'
  const prefixCandidate = process.env.STATIC_ASSETS_PREFIX || `static/client/${stage}`
  const normalizedPrefix = String(prefixCandidate).trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedPrefix) {
    throw new Error('STATIC_ASSETS_PREFIX must resolve to a non-empty value.')
  }

  return { bucket, prefix: normalizedPrefix, stage }
}

function buildS3Key(prefix, relativePath) {
  const sanitizedPrefix = prefix.replace(/\/+$/, '')
  const sanitizedPath = relativePath.split(path.sep).join('/')
  return `${sanitizedPrefix}/${sanitizedPath}`
}

async function readStreamToString(stream) {
  if (!stream) {
    return ''
  }
  if (typeof stream.transformToString === 'function') {
    return stream.transformToString()
  }
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
  }
  return chunks.join('')
}

async function loadManifest({ s3, bucket, prefix }) {
  const manifestKey = buildS3Key(prefix, 'manifest.json')

  let response
  try {
    response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
      }),
    )
  } catch (error) {
    const reason = error?.message || error
    throw new Error(
      `[verify-static] Unable to load manifest from s3://${bucket}/${manifestKey}: ${reason}`,
    )
  }

  const raw = await readStreamToString(response.Body)
  if (!raw.trim()) {
    throw new Error(
      `[verify-static] Manifest s3://${bucket}/${manifestKey} is empty. Confirm the upload step completed successfully.`,
    )
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `[verify-static] Manifest s3://${bucket}/${manifestKey} contains invalid JSON: ${error?.message || error}`,
    )
  }

  if (!Array.isArray(parsed?.files) || parsed.files.length === 0) {
    throw new Error(
      `[verify-static] Manifest s3://${bucket}/${manifestKey} does not list any uploaded files.`,
    )
  }

  if (typeof parsed.fileCount === 'number' && parsed.fileCount !== parsed.files.length) {
    throw new Error(
      `[verify-static] Manifest fileCount (${parsed.fileCount}) does not match files.length (${parsed.files.length}).`,
    )
  }

  return {
    manifest: parsed,
    manifestKey,
  }
}

async function verifyS3Assets({ s3, bucket, manifest }) {
  const failures = []
  for (const entry of manifest.files) {
    const key = typeof entry?.key === 'string' && entry.key.trim()
      ? entry.key.trim()
      : buildS3Key(manifest.prefix || '', entry?.path || '')
    if (!key) {
      failures.push('manifest entry missing key/path information')
      continue
    }

    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )
    } catch (error) {
      failures.push(`${key} (${error?.name || error?.Code || error?.message || error})`)
    }
  }

  if (failures.length > 0) {
    const details = failures.join(', ')
    throw new Error(
      `[verify-static] ${failures.length} static asset${failures.length === 1 ? '' : 's'} ` +
        `failed S3 verification: ${details}`,
    )
  }
}

async function resolveCloudfrontUrl() {
  const override = typeof process.env.CLOUDFRONT_URL === 'string' ? process.env.CLOUDFRONT_URL.trim() : ''
  if (override) {
    return override
  }

  const metadataPath = path.resolve(projectRoot, 'config', 'published-cloudfront.json')
  let raw
  try {
    raw = await readFile(metadataPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        '[verify-static] config/published-cloudfront.json is missing. Run "npm run publish:cloudfront-url" before verifying.',
      )
    }
    throw error
  }

  if (!raw.trim()) {
    throw new Error('[verify-static] config/published-cloudfront.json is empty.')
  }

  let metadata
  try {
    metadata = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `[verify-static] Unable to parse config/published-cloudfront.json: ${error?.message || error}`,
    )
  }

  const url = resolvePublishedCloudfrontUrl(metadata)
  if (!url) {
    throw new Error(
      '[verify-static] No CloudFront URL found in config/published-cloudfront.json. Publish the distribution metadata first.',
    )
  }

  return url
}

function resolveCloudfrontRetryConfiguration() {
  const DEFAULT_ATTEMPTS = 10
  const DEFAULT_DELAY_MS = 30000

  const attemptsCandidate = process.env.CLOUDFRONT_VERIFY_MAX_ATTEMPTS
  const delayCandidate = process.env.CLOUDFRONT_VERIFY_RETRY_DELAY_MS

  let attempts = Number.parseInt(attemptsCandidate, 10)
  if (!Number.isFinite(attempts) || attempts < 1) {
    attempts = DEFAULT_ATTEMPTS
  }

  let delayMs = Number.parseInt(delayCandidate, 10)
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    delayMs = DEFAULT_DELAY_MS
  }

  return {
    attempts,
    retries: Math.max(0, attempts - 1),
    retryDelayMs: delayMs,
  }
}

async function verifyCloudfrontAssets(baseUrl, { retries, retryDelayMs }) {
  try {
    await verifyClientAssets({
      baseUrl,
      retries,
      retryDelayMs,
      logger: console,
    })
    return true
  } catch (error) {
    if (error?.code === PROXY_BLOCKED_ERROR_CODE) {
      console.warn(
        `[verify-static] Skipping CloudFront asset verification: ${error?.message || 'access blocked by proxy.'}`,
      )
      console.warn(
        '[verify-static] S3 assets are verified, but CDN availability could not be confirmed from this network.',
      )
      console.warn(
        '[verify-static] Re-run this command from a network with CloudFront access to complete the CDN check.',
      )
      return false
    }
    throw error
  }
}

async function main() {
  const enforceStaticVerification = shouldEnforceVerification('ENFORCE_STATIC_ASSET_VERIFY')

  let bucketConfig
  try {
    bucketConfig = resolveBucketConfiguration()
  } catch (error) {
    if (enforceStaticVerification) {
      throw error
    }

    console.warn(`[verify-static] ${error?.message || error}`)
    console.warn(
      '[verify-static] Static asset verification skipped because enforcement is disabled for this environment.',
    )
    console.warn(
      '[verify-static] Set ENFORCE_STATIC_ASSET_VERIFY=true (or run in CI) to require bucket configuration before continuing.',
    )
    return
  }

  const { bucket, prefix } = bucketConfig
  const s3 = new S3Client({})

  console.log(`[verify-static] Verifying static assets in s3://${bucket}/${prefix}/`)
  const { manifest, manifestKey } = await loadManifest({ s3, bucket, prefix })
  console.log(
    `[verify-static] Loaded manifest with ${manifest.files.length} file${
      manifest.files.length === 1 ? '' : 's'
    } from s3://${bucket}/${manifestKey}`,
  )

  await verifyS3Assets({ s3, bucket, manifest })
  console.log('[verify-static] Confirmed all uploaded static assets are accessible via S3.')

  const skipCloudfront = /^(?:true|1|yes)$/iu.test(
    String(process.env.SKIP_CLOUDFRONT_VERIFY || '').trim(),
  )
  if (skipCloudfront) {
    console.warn('[verify-static] Skipping CloudFront verification due to SKIP_CLOUDFRONT_VERIFY.')
    console.warn(
      '[verify-static] S3 assets are verified, but CDN availability has not been confirmed by this run.',
    )
    return
  }

  const cloudfrontUrl = await resolveCloudfrontUrl()
  console.log(`[verify-static] Verifying CloudFront asset availability at ${cloudfrontUrl}`)
  const enforceCloudfrontVerification = shouldEnforceVerification('ENFORCE_CLOUDFRONT_VERIFY')
  const retryConfig = resolveCloudfrontRetryConfiguration()

  if (retryConfig.attempts > 1) {
    const waitSeconds = Math.round((retryConfig.retryDelayMs * (retryConfig.attempts - 1)) / 1000)
    console.log(
      `[verify-static] Will retry CloudFront asset checks up to ${retryConfig.attempts} times (${waitSeconds}s total wait time).`,
    )
  }

  try {
    const verified = await verifyCloudfrontAssets(cloudfrontUrl, retryConfig)
    if (verified) {
      console.log('[verify-static] CloudFront is serving the expected client assets.')
    } else {
      console.warn(
        '[verify-static] CloudFront asset verification skipped. Confirm CDN availability separately before promoting traffic.',
      )
    }
  } catch (error) {
    if (enforceCloudfrontVerification) {
      throw error
    }

    console.warn(
      `[verify-static] CloudFront asset verification failed (${error?.message || error}). Enforcement disabled, continuing.`,
    )
    console.warn(
      '[verify-static] Set ENFORCE_CLOUDFRONT_VERIFY=true (or run in CI) to force failures when CDN assets are unavailable.',
    )
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
