#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js'
import {
  verifyClientAssets,
  PROXY_BLOCKED_ERROR_CODE,
  CLOUDFRONT_FORBIDDEN_ERROR_CODE,
} from '../lib/cloudfrontAssetCheck.js'
import { applyStageEnvironment } from '../config/stage.js'
import {
  categorizeStaleHashedIndexAssets,
  resolveHashedIndexAssetRetentionMs,
  formatDurationForLog,
  formatAssetAgeForLog,
} from '../lib/static/hashedIndexAssetRetention.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const MASK_PATTERNS = [/^[*]+$/u, /REDACTED/iu, /MASKED/iu, /CHANGEME/iu]

function isMaskedValue(value) {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  return MASK_PATTERNS.some((pattern) => pattern.test(trimmed))
}

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
  const {
    stageName,
    deploymentEnvironment,
    staticAssetsBucket,
    dataBucket,
  } = applyStageEnvironment({ propagateToProcessEnv: true, propagateViteEnv: false })

  const bucket = staticAssetsBucket || dataBucket
  if (!bucket) {
    throw new Error(
      'STATIC_ASSETS_BUCKET (or DATA_BUCKET/S3_BUCKET) must be set to verify uploaded assets.',
    )
  }

  const stage = stageName || deploymentEnvironment || 'prod'
  const prefixCandidate =
    process.env.STATIC_ASSETS_PREFIX || `static/client/${stage}/latest`
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

function normalizeHashedAssetPath(value) {
  if (typeof value !== 'string') {
    return null
  }

  let normalized = value.trim()
  if (!normalized) {
    return null
  }

  const queryIndex = normalized.indexOf('?')
  if (queryIndex >= 0) {
    normalized = normalized.slice(0, queryIndex)
  }

  const assetsIndex = normalized.indexOf('assets/')
  if (assetsIndex >= 0) {
    normalized = normalized.slice(assetsIndex)
  } else {
    normalized = normalized
      .replace(/^(?:\.\.\/)+/u, '')
      .replace(/^(?:\.\/)+/u, '')
      .replace(/^\/+/, '')
  }

  if (!normalized.startsWith('assets/')) {
    return null
  }

  if (!/^assets\/index-[\w.-]+\.(?:css|js)$/u.test(normalized)) {
    return null
  }

  return normalized
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

function normalizeHashedIndexAssets(manifest) {
  const manifestAssets = Array.isArray(manifest?.hashedIndexAssets)
    ? manifest.hashedIndexAssets
    : []
  const manifestFiles = Array.isArray(manifest?.files) ? manifest.files : []

  const fallbackAssets = manifestAssets.length
    ? []
    : manifestFiles
        .map((entry) => entry?.path || entry?.key || '')
        .filter(Boolean)

  const combined = manifestAssets.length ? manifestAssets : fallbackAssets

  const normalizedAssets = []
  const seen = new Set()
  for (const asset of combined) {
    if (typeof asset !== 'string') {
      continue
    }
    const trimmed = asset.trim()
    if (!trimmed) {
      continue
    }
    const normalizedPath = trimmed.replace(/^\/+/, '').replace(/\\/g, '/')
    const match = normalizedPath.match(/assets\/index-[\w.-]+\.(?:css|js)$/u)
    if (!match) {
      continue
    }

    const relative = match[0]

    if (!seen.has(relative)) {
      seen.add(relative)
      normalizedAssets.push(relative)
    }
  }

  return normalizedAssets
}

function extractHashedIndexAssetsFromHtml(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('[verify-static] index.html is empty or unreadable from S3.')
  }

  const assetPattern = /assets\/index-[\w.-]+\.(?:css|js)(?:\?[^"'>\s]+)?/gu
  const matches = html.match(assetPattern) || []
  const assets = []
  const seen = new Set()

  for (const match of matches) {
    const normalized = normalizeHashedAssetPath(match)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      assets.push(normalized)
    }
  }

  if (assets.length === 0) {
    throw new Error('[verify-static] index.html does not reference any hashed index assets.')
  }

  const cssCount = assets.filter((asset) => asset.endsWith('.css')).length
  const jsCount = assets.filter((asset) => asset.endsWith('.js')).length
  if (cssCount === 0 || jsCount === 0) {
    throw new Error(
      `[verify-static] index.html must reference hashed CSS and JS bundles. Found ${cssCount} CSS and ${jsCount} JS assets.`,
    )
  }

  return assets
}

async function ensureIndexHtmlMatchesManifest({ s3, bucket, prefix, hashedAssets }) {
  const indexKey = buildS3Key(prefix, 'index.html')

  let response
  try {
    response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: indexKey,
      }),
    )
  } catch (error) {
    const reason = error?.message || error
    throw new Error(
      `[verify-static] Unable to load index.html from s3://${bucket}/${indexKey}: ${reason}`,
    )
  }

  const html = await readStreamToString(response.Body)
  const indexAssets = extractHashedIndexAssetsFromHtml(html)

  const manifestSet = new Set(
    hashedAssets.map((asset) => normalizeHashedAssetPath(asset)).filter(Boolean),
  )
  const indexSet = new Set(indexAssets.map((asset) => normalizeHashedAssetPath(asset)).filter(Boolean))

  const missingFromManifest = Array.from(indexSet).filter((asset) => !manifestSet.has(asset))
  if (missingFromManifest.length > 0) {
    const details = missingFromManifest.join(', ')
    throw new Error(
      `[verify-static] index.html references hashed asset${
        missingFromManifest.length === 1 ? '' : 's'
      } not listed in manifest.json: ${details}.`,
    )
  }

  const missingFromIndex = Array.from(manifestSet).filter((asset) => !indexSet.has(asset))
  if (missingFromIndex.length > 0) {
    const details = missingFromIndex.join(', ')
    throw new Error(
      `[verify-static] Manifest hashed asset${
        missingFromIndex.length === 1 ? '' : 's'
      } not referenced by index.html: ${details}.`,
    )
  }

  return { indexKey, indexAssets }
}

function ensureHashedIndexAssets(manifest, { manifestKey, bucket }) {
  const hashedAssets = normalizeHashedIndexAssets(manifest)
  if (hashedAssets.length === 0) {
    throw new Error(
      `[verify-static] Manifest s3://${bucket}/${manifestKey} must list hashed index assets. Redeploy the static build.`,
    )
  }

  const hasCss = hashedAssets.some((asset) => asset.endsWith('.css'))
  const hasJs = hashedAssets.some((asset) => asset.endsWith('.js'))
  if (!hasCss || !hasJs) {
    throw new Error(
      `[verify-static] Manifest s3://${bucket}/${manifestKey} must include hashed index CSS and JS bundles.`,
    )
  }

  return hashedAssets
}

async function deleteStaleIndexAssets({ s3, bucket, prefix, staleAssets }) {
  if (!Array.isArray(staleAssets) || staleAssets.length === 0) {
    return
  }

  const keys = staleAssets
    .map((asset) => buildS3Key(prefix, asset))
    .filter((key) => typeof key === 'string' && key.trim())

  if (keys.length === 0) {
    return
  }

  const batchedKeys = []
  const BATCH_SIZE = 1000
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    batchedKeys.push(keys.slice(i, i + BATCH_SIZE))
  }

  const errors = []

  for (const batch of batchedKeys) {
    try {
      const response = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: false,
          },
        }),
      )

      if (Array.isArray(response?.Errors) && response.Errors.length > 0) {
        for (const deletionError of response.Errors) {
          const key = deletionError?.Key || '(unknown)'
          const code = deletionError?.Code || deletionError?.code
          const message = deletionError?.Message || deletionError?.message
          const detailParts = [key]
          if (code || message) {
            detailParts.push(code || message)
          }
          errors.push(detailParts.join(' '))
        }
      }
    } catch (error) {
      const reason = error?.message || error
      errors.push(reason)
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[verify-static] Failed to delete stale hashed index assets: ${errors.join(', ')}`,
    )
  }
}

async function ensureNoStaleIndexAssets({
  s3,
  bucket,
  prefix,
  hashedAssets,
  autoDelete = true,
}) {
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
  const hashedSet = new Set(
    hashedAssets.map((asset) => (typeof asset === 'string' ? asset.trim() : asset)).filter(Boolean),
  )
  const hashedPattern = /^assets\/index-[\w.-]+\.(?:css|js)$/u
  const candidates = []

  let continuationToken
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefixWithSlash,
        ContinuationToken: continuationToken,
      }),
    )

    for (const item of response.Contents || []) {
      if (!item?.Key || typeof item.Key !== 'string') {
        continue
      }
      const key = item.Key.trim()
      if (!key.startsWith(prefixWithSlash)) {
        continue
      }
      const relative = key.slice(prefixWithSlash.length)
      if (!hashedPattern.test(relative)) {
        continue
      }
      if (hashedSet.has(relative)) {
        continue
      }
      candidates.push({ key: relative, lastModified: item?.LastModified })
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  if (candidates.length === 0) {
    return { resolvedByDeletion: false, staleAssets: [], retainedAssets: [], retentionMs: 0, protectedByRetention: [] }
  }

  const retentionMs = resolveHashedIndexAssetRetentionMs(process.env)
  const { eligibleForDeletion, protectedByRetention } = categorizeStaleHashedIndexAssets({
    hashedAssets,
    candidates,
    now: Date.now(),
    retentionMs,
  })

  if (eligibleForDeletion.length === 0) {
    return {
      resolvedByDeletion: false,
      staleAssets: [],
      retainedAssets: protectedByRetention.map((entry) => entry.key),
      retentionMs,
      protectedByRetention,
    }
  }

  const detailList = eligibleForDeletion
    .map((entry) => {
      const ageLabel = formatAssetAgeForLog(entry.ageMs)
      return `${entry.key}${ageLabel ? ` (${ageLabel})` : ''}`
    })
    .join(', ')

  const flaggedAssets = eligibleForDeletion.map((entry) => ({ key: entry.key, ageMs: entry.ageMs }))

  if (autoDelete) {
    await deleteStaleIndexAssets({
      s3,
      bucket,
      prefix,
      staleAssets: eligibleForDeletion.map((entry) => entry.key),
    })
    console.warn(
      `[verify-static] Deleted ${eligibleForDeletion.length} stale hashed index asset${
        eligibleForDeletion.length === 1 ? '' : 's'
      } under s3://${bucket}/${prefixWithSlash}: ${detailList}.`,
    )
    return {
      resolvedByDeletion: true,
      staleAssets: eligibleForDeletion.map((entry) => entry.key),
      retainedAssets: protectedByRetention.map((entry) => entry.key),
      retentionMs,
      protectedByRetention,
      deletedAssets: flaggedAssets,
    }
  }

  return {
    resolvedByDeletion: false,
    staleAssets: flaggedAssets.map((entry) => entry.key),
    retainedAssets: protectedByRetention.map((entry) => entry.key),
    retentionMs,
    protectedByRetention,
    flaggedAssets,
    staleDetailList: detailList,
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
  const DEFAULT_ATTEMPTS = 12
  const DEFAULT_INITIAL_DELAY_MS = 30000
  const DEFAULT_BACKOFF_FACTOR = 1.5
  const DEFAULT_MAX_DELAY_MS = 300000

  const attemptsCandidate = process.env.CLOUDFRONT_VERIFY_MAX_ATTEMPTS
  const delayCandidate = process.env.CLOUDFRONT_VERIFY_RETRY_DELAY_MS
  const backoffCandidate = process.env.CLOUDFRONT_VERIFY_BACKOFF_FACTOR
  const maxDelayCandidate = process.env.CLOUDFRONT_VERIFY_MAX_DELAY_MS

  let attempts = Number.parseInt(attemptsCandidate, 10)
  if (!Number.isFinite(attempts) || attempts < 1) {
    attempts = DEFAULT_ATTEMPTS
  }

  let initialDelayMs = Number.parseInt(delayCandidate, 10)
  if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS
  }

  let backoffFactor = Number.parseFloat(backoffCandidate)
  if (!Number.isFinite(backoffFactor) || backoffFactor < 1) {
    backoffFactor = DEFAULT_BACKOFF_FACTOR
  }

  let maxDelayMs = Number.parseInt(maxDelayCandidate, 10)
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0) {
    maxDelayMs = DEFAULT_MAX_DELAY_MS
  }

  const retryDelays = []
  if (attempts > 1) {
    let currentDelay = initialDelayMs
    for (let i = 0; i < attempts - 1; i += 1) {
      const normalizedDelay = Math.max(0, Math.min(Math.round(currentDelay), maxDelayMs))
      retryDelays.push(normalizedDelay)
      const nextDelay = currentDelay * backoffFactor
      currentDelay = Number.isFinite(nextDelay) && nextDelay > 0 ? nextDelay : initialDelayMs
    }
  }

  return {
    attempts,
    retryDelays,
  }
}

function shouldAllowCloudfrontFailure({ cliOverride } = {}) {
  if (typeof cliOverride === 'boolean') {
    return cliOverride
  }

  const overrideCandidates = [
    process.env.ALLOW_CLOUDFRONT_VERIFY_FAILURE,
    process.env.CLOUDFRONT_VERIFY_ALLOW_FAILURE,
  ]

  for (const candidate of overrideCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return isTruthyEnv(candidate)
    }
  }

  return false
}

function shouldDeleteStaleIndexAssets({ cliOverride } = {}) {
  if (typeof cliOverride === 'boolean') {
    return cliOverride
  }

  const overrideCandidates = [
    process.env.STATIC_VERIFY_DELETE_STALE_INDEX_ASSETS,
    process.env.DELETE_STALE_INDEX_ASSETS,
  ]

  for (const candidate of overrideCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return isTruthyEnv(candidate)
    }
  }

  return false
}

function parseCliFlags(argv = []) {
  const flags = {
    skipCloudfront: false,
    allowCloudfrontFailure: undefined,
    deleteStaleIndexAssets: undefined,
  }

  if (!Array.isArray(argv)) {
    return flags
  }

  for (const rawArg of argv) {
    if (typeof rawArg !== 'string') {
      continue
    }

    const arg = rawArg.trim()
    if (!arg.startsWith('--')) {
      continue
    }

    const normalized = arg.replace(/=.*$/u, '').toLowerCase()

    if (normalized === '--skip-cloudfront' || normalized === '--skip-cloudfront-verify') {
      flags.skipCloudfront = true
      continue
    }

    if (normalized === '--allow-cloudfront-failure') {
      flags.allowCloudfrontFailure = true
      continue
    }

    if (normalized === '--no-allow-cloudfront-failure') {
      flags.allowCloudfrontFailure = false
      continue
    }

    if (normalized === '--delete-stale-index-assets') {
      flags.deleteStaleIndexAssets = true
      continue
    }

    if (normalized === '--no-delete-stale-index-assets') {
      flags.deleteStaleIndexAssets = false
    }
  }

  return flags
}

async function verifyCloudfrontAssets(baseUrl, { retryDelays, assetPathPrefixes }) {
  try {
    await verifyClientAssets({
      baseUrl,
      retryDelays,
      logger: console,
      assetPathPrefixes,
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
    if (error?.code === CLOUDFRONT_FORBIDDEN_ERROR_CODE) {
      console.warn(
        `[verify-static] CloudFront denied access to hashed client assets (${error?.status || 403}).`,
      )
      if (Array.isArray(error?.attemptedAssetPaths) && error.attemptedAssetPaths.length > 0) {
        console.warn(
          `[verify-static] Attempted asset paths: ${error.attemptedAssetPaths.join(', ')}`,
        )
      }
      if (error?.url) {
        console.warn(`[verify-static] Last attempted asset URL: ${error.url}`)
      }
      console.warn(
        '[verify-static] Continuing without CDN verification because the distribution returned AccessDenied. Review origin access policies or invalidations before promoting traffic.',
      )
      console.warn(
        '[verify-static] Set ALLOW_CLOUDFRONT_VERIFY_FAILURE=false (or rerun once CloudFront is serving assets) to restore enforcement.',
      )
      return false
    }
    throw error
  }
}

async function main() {
  const cliFlags = parseCliFlags(process.argv.slice(2))
  const enforceStaticVerification = shouldEnforceVerification('ENFORCE_STATIC_ASSET_VERIFY')
  const allowCloudfrontFailure = shouldAllowCloudfrontFailure({
    cliOverride: cliFlags.allowCloudfrontFailure,
  })

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

  if (isMaskedValue(bucket) || isMaskedValue(prefix)) {
    console.warn(
      '[verify-static] Detected masked static asset configuration. Skipping verification to avoid false positives.',
    )
    if (enforceStaticVerification) {
      console.warn(
        '[verify-static] Set ENFORCE_STATIC_ASSET_VERIFY=false or provide real bucket details to re-enable verification.',
      )
    }
    return
  }

  const s3 = new S3Client({})

  console.log(`[verify-static] Verifying static assets in s3://${bucket}/${prefix}/`)
  const { manifest, manifestKey } = await loadManifest({ s3, bucket, prefix })
  console.log(
    `[verify-static] Loaded manifest with ${manifest.files.length} file${
      manifest.files.length === 1 ? '' : 's'
    } from s3://${bucket}/${manifestKey}`,
  )

  const hashedAssets = ensureHashedIndexAssets(manifest, { manifestKey, bucket })
  const { indexKey, indexAssets } = await ensureIndexHtmlMatchesManifest({
    s3,
    bucket,
    prefix,
    hashedAssets,
  })
  console.log(
    `[verify-static] index.html (${indexAssets.length} asset${
      indexAssets.length === 1 ? '' : 's'
    }) matches manifest hashed bundle references at s3://${bucket}/${indexKey}`,
  )

  await verifyS3Assets({ s3, bucket, manifest })
  console.log('[verify-static] Confirmed all uploaded static assets are accessible via S3.')

  const deleteStaleIndexAssets = shouldDeleteStaleIndexAssets({
    cliOverride: cliFlags.deleteStaleIndexAssets,
  })
  const staleCheck = await ensureNoStaleIndexAssets({
    s3,
    bucket,
    prefix,
    hashedAssets,
    autoDelete: deleteStaleIndexAssets,
  })
  const retainedAssets = Array.isArray(staleCheck?.retainedAssets)
    ? staleCheck.retainedAssets
    : []
  const staleAssets = Array.isArray(staleCheck?.staleAssets) ? staleCheck.staleAssets : []
  if (retainedAssets.length > 0) {
    const retentionDurationLabel = formatDurationForLog(
      typeof staleCheck?.retentionMs === 'number'
        ? staleCheck.retentionMs
        : resolveHashedIndexAssetRetentionMs(process.env),
    )
    const protectedDetails = Array.isArray(staleCheck?.protectedByRetention)
      ? staleCheck.protectedByRetention
          .map((entry) => `${entry.key} (${formatAssetAgeForLog(entry.ageMs)})`)
          .join(', ')
      : retainedAssets.join(', ')
    console.log(
      `[verify-static] Retaining ${retainedAssets.length} hashed index asset${
        retainedAssets.length === 1 ? '' : 's'
      } within the ${retentionDurationLabel} retention window: ${protectedDetails}.`,
    )
  }

  if (staleCheck?.resolvedByDeletion) {
    const removedAssets = Array.isArray(staleCheck.staleAssets)
      ? staleCheck.staleAssets.join(', ')
      : ''
    if (removedAssets) {
      console.log(
        `[verify-static] Removed stale hashed index asset${
          staleCheck.staleAssets.length === 1 ? '' : 's'
        }: ${removedAssets}`,
      )
    } else {
      console.log('[verify-static] Removed stale hashed index assets from the deployment prefix.')
    }
  } else if (staleAssets.length > 0) {
    const flaggedEntries = Array.isArray(staleCheck?.flaggedAssets)
      ? staleCheck.flaggedAssets
      : []
    const detailList = flaggedEntries.length
      ? flaggedEntries
          .map((entry) => {
            const ageLabel = formatAssetAgeForLog(entry.ageMs)
            return `${entry.key}${ageLabel ? ` (${ageLabel})` : ''}`
          })
          .join(', ')
      : staleAssets.join(', ')

    console.warn(
      `[verify-static] Detected ${staleAssets.length} hashed index asset${
        staleAssets.length === 1 ? '' : 's'
      } older than the retention window under s3://${bucket}/${prefix}/: ${detailList}.`,
    )
    console.warn(
      '[verify-static] Leaving these assets in place to protect clients with cached index.html responses.',
    )
    console.warn(
      '[verify-static] Re-run with --delete-stale-index-assets (or set STATIC_VERIFY_DELETE_STALE_INDEX_ASSETS=true) once it is safe to prune them.',
    )
  } else if (retainedAssets.length === 0) {
    console.log('[verify-static] No stale hashed index assets detected in the deployment prefix.')
  }

  const manifestPrefix = typeof manifest?.prefix === 'string' ? manifest.prefix.trim() : ''
  const candidatePrefixes = [manifestPrefix, prefix]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim().replace(/^\/+/, '').replace(/\/+$/, ''))
  const assetPathPrefixes = Array.from(new Set(candidatePrefixes))

  if (assetPathPrefixes.length > 0) {
    console.log(
      `[verify-static] Will probe CloudFront assets with path prefix fallback${
        assetPathPrefixes.length === 1 ? '' : 'es'
      }: ${assetPathPrefixes.join(', ')}`,
    )
  }

  const skipCloudfrontEnv = /^(?:true|1|yes)$/iu.test(
    String(process.env.SKIP_CLOUDFRONT_VERIFY || '').trim(),
  )
  const skipCloudfront = cliFlags.skipCloudfront || skipCloudfrontEnv
  if (skipCloudfront) {
    if (cliFlags.skipCloudfront) {
      console.warn('[verify-static] Skipping CloudFront verification due to --skip-cloudfront flag.')
    } else {
      console.warn('[verify-static] Skipping CloudFront verification due to SKIP_CLOUDFRONT_VERIFY.')
    }
    console.warn(
      '[verify-static] S3 assets are verified, but CDN availability has not been confirmed by this run.',
    )
    return
  }

  const cloudfrontUrl = await resolveCloudfrontUrl()

  if (isMaskedValue(cloudfrontUrl)) {
    console.warn('[verify-static] CloudFront URL is masked. Skipping CDN verification step.')
    if (enforceStaticVerification) {
      console.warn(
        '[verify-static] Provide a valid CloudFront URL or disable enforcement via ENFORCE_CLOUDFRONT_VERIFY=false.',
      )
    }
    return
  }

  console.log(`[verify-static] Verifying CloudFront asset availability at ${cloudfrontUrl}`)
  const enforceCloudfrontVerification = allowCloudfrontFailure
    ? false
    : shouldEnforceVerification('ENFORCE_CLOUDFRONT_VERIFY')
  const retryConfig = resolveCloudfrontRetryConfiguration()

  if (retryConfig.attempts > 1) {
    const totalWaitMs = retryConfig.retryDelays.reduce((sum, value) => sum + value, 0)
    const waitSeconds = Math.round(totalWaitMs / 1000)
    console.log(
      `[verify-static] Will retry CloudFront asset checks up to ${retryConfig.attempts} times (${waitSeconds}s total wait time).`,
    )
  }

  try {
    const verified = await verifyCloudfrontAssets(cloudfrontUrl, {
      ...retryConfig,
      assetPathPrefixes,
    })
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

    if (allowCloudfrontFailure) {
      console.warn(
        `[verify-static] CloudFront asset verification failed (${error?.message || error}). Continuing because ALLOW_CLOUDFRONT_VERIFY_FAILURE is enabled.`,
      )
      console.warn(
        '[verify-static] Confirm CDN availability separately before promoting traffic. Disabling enforcement should be reserved for break-glass scenarios.',
      )
      return
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
