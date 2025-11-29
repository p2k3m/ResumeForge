#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createReadStream, readFileSync } from 'node:fs'
import {
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import mime from 'mime-types'
import { applyStageEnvironment } from '../config/stage.js'
import { withBuildMetadata } from '../lib/buildMetadata.js'
import {
  classifyDeployFailure,
  notifyIncompleteStaticUpload,
  notifyMissingClientAssets,
} from '../lib/deploy/notifications.js'
import {
  resolvePublishedCloudfrontPath,
  serializePublishedCloudfrontPayload,
} from '../lib/cloudfront/metadata.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const clientDistDir = path.join(projectRoot, 'client', 'dist')
const clientIndexPath = path.join(clientDistDir, 'index.html')
const serviceWorkerPath = path.join(clientDistDir, 'service-worker.js')
const errorDocumentPath = path.join(clientDistDir, '404.html')
const assetsDir = path.join(clientDistDir, 'assets')
const publishedCloudfrontPath = resolvePublishedCloudfrontPath({ projectRoot })

function resolveBuildVersion() {
  const candidates = [
    process.env.BUILD_VERSION,
    process.env.GIT_COMMIT,
    process.env.GIT_SHA,
    process.env.GITHUB_SHA,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function normalizeVersionLabelSegment(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .trim()
    .replace(/^v+/iu, '')
    .replace(/[^a-z0-9.-]/giu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function buildTimestampVersionLabel() {
  const now = new Date()
  const pad = (input) => String(input).padStart(2, '0')
  return (
    `v${now.getUTCFullYear()}` +
    `${pad(now.getUTCMonth() + 1)}` +
    `${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}` +
    `${pad(now.getUTCMinutes())}` +
    `${pad(now.getUTCSeconds())}`
  )
}

function resolveVersionLabel() {
  const buildVersion = resolveBuildVersion()
  const normalized = normalizeVersionLabelSegment(buildVersion)
  if (normalized) {
    return normalized.startsWith('v') ? normalized : `v${normalized}`
  }

  return buildTimestampVersionLabel()
}

function createValidationError(message) {
  const error = new Error(message)
  error.name = 'StaticAssetValidationError'
  return error
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

function isNotFoundError(error) {
  if (!error) {
    return false
  }

  const statusCode = error?.$metadata?.httpStatusCode
  if (statusCode === 404) {
    return true
  }

  const candidateCodes = [error?.name, error?.Code, error?.code]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toUpperCase())

  if (candidateCodes.some((code) => code === 'NOSUCHKEY' || code === 'NO_SUCH_KEY' || code === 'NOTFOUND')) {
    return true
  }

  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  if (message.includes('no such key') || message.includes('not found')) {
    return true
  }

  return false
}

async function ensureFileExists(filePath, { label } = {}) {
  try {
    await access(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[upload-static] Missing ${label ?? 'required file'} at ${filePath}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }
}

async function ensureDirectoryPopulated(directory, { label } = {}) {
  let metadata
  try {
    metadata = await stat(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[upload-static] Missing ${label ?? 'required directory'} at ${directory}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }

  if (!metadata.isDirectory()) {
    throw createValidationError(`[upload-static] Expected ${directory} to be a directory created by the client build.`)
  }

  const entries = await readdir(directory)
  const visibleEntries = entries.filter((entry) => !entry.startsWith('.'))
  if (visibleEntries.length === 0) {
    throw createValidationError(`[upload-static] ${directory} is empty. Confirm the client build completed successfully.`)
  }

  return visibleEntries
}

export function extractHashedIndexAssets(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw createValidationError('[upload-static] index.html is empty or unreadable.')
  }

  const assetPattern =
    /assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)(?:\?[^"'\s>]+)?/gi
  const assets = new Set()
  let match
  while ((match = assetPattern.exec(html)) !== null) {
    const [captured] = match
    if (captured) {
      const normalized = normalizeClientAssetPath(captured.replace(/\?.*$/, ''))
      if (HASHED_INDEX_ASSET_RELATIVE_PATTERN.test(normalized)) {
        assets.add(normalized)
      }
    }
  }

  if (assets.size === 0) {
    throw createValidationError('[upload-static] index.html does not reference any hashed index assets.')
  }

  const cssCount = Array.from(assets).filter((asset) => asset.endsWith('.css')).length
  const jsCount = Array.from(assets).filter((asset) => asset.endsWith('.js')).length
  if (jsCount === 0) {
    throw createValidationError(
      `[upload-static] index.html must reference at least one hashed JS bundle. Found ${jsCount} JS asset${jsCount === 1 ? '' : 's'
      }.`,
    )
  }

  if (cssCount === 0) {
    throw createValidationError(
      `[upload-static] index.html must reference at least one hashed CSS bundle. Found ${cssCount} CSS asset${cssCount === 1 ? '' : 's'
      }.`,
    )
  }

  return Array.from(assets)
}

function selectPrimaryAssetFromList(assets = [], extension) {
  if (!extension) {
    return ''
  }

  for (const asset of assets) {
    if (asset.endsWith(extension)) {
      return asset
    }
  }

  return ''
}

function collectHashedAssetCandidates(hashedAssets = [], files = []) {
  const normalizedFromHtml = Array.isArray(hashedAssets)
    ? hashedAssets
      .map((asset) => normalizeClientAssetPath(asset))
      .filter((asset) => HASHED_INDEX_ASSET_RELATIVE_PATTERN.test(asset))
    : []

  if (normalizedFromHtml.length) {
    return normalizedFromHtml
  }

  const normalizedFiles = Array.isArray(files)
    ? files
      .map((asset) => normalizeClientAssetPath(asset))
      .filter((asset) => HASHED_INDEX_ASSET_RELATIVE_PATTERN.test(asset))
    : []

  if (!normalizedFiles.length) {
    return []
  }

  return [...normalizedFiles].reverse()
}

export function resolvePrimaryIndexAssets({ hashedAssets = [], files = [] } = {}) {
  const candidates = collectHashedAssetCandidates(hashedAssets, files)

  const cssAsset = selectPrimaryAssetFromList(candidates, '.css')
  const jsAsset = selectPrimaryAssetFromList(candidates, '.js')

  return {
    css: cssAsset,
    js: jsAsset,
  }
}

async function gatherClientAssetFiles() {
  await ensureDirectoryPopulated(clientDistDir, { label: 'client build output' })
  await ensureFileExists(clientIndexPath, { label: 'client entry point' })
  await ensureFileExists(errorDocumentPath, { label: 'custom error page' })
  await ensureDirectoryPopulated(assetsDir, { label: 'hashed asset bundle' })
  await ensureFileExists(serviceWorkerPath, { label: 'service worker' })

  const indexHtml = await readFile(clientIndexPath, 'utf8')
  const hashedAssets = extractHashedIndexAssets(indexHtml)

  for (const assetPath of hashedAssets) {
    const absolutePath = path.join(clientDistDir, assetPath)
    await ensureFileExists(absolutePath, { label: `referenced asset ${assetPath}` })
  }

  const existingFiles = await walkDirectory(clientDistDir)
  if (existingFiles.length === 0) {
    throw createValidationError('[upload-static] No files were found in client/dist. Build the client before uploading.')
  }

  const primaryIndexAssets = resolvePrimaryIndexAssets({
    hashedAssets,
    files: existingFiles,
  })

  for (const assetPath of [primaryIndexAssets.css, primaryIndexAssets.js]) {
    if (!assetPath) {
      continue
    }
    const normalized = normalizeClientAssetPath(assetPath)
    if (!normalized) {
      continue
    }
    const absolutePath = path.join(clientDistDir, normalized)
    await ensureFileExists(absolutePath, { label: `resolved asset ${normalized}` })
  }

  await ensureIndexAliasArtifacts({
    distDir: clientDistDir,
    primaryAssets: primaryIndexAssets,
  })

  await ensurePublishedCloudfrontFallbackInDist({ distDir: clientDistDir })

  for (const aliasPath of INDEX_ASSET_ALIAS_PATHS) {
    const absoluteAliasPath = path.join(clientDistDir, aliasPath)
    await ensureFileExists(absoluteAliasPath, { label: `index alias ${aliasPath}` })
  }

  const files = await walkDirectory(clientDistDir)
  if (files.length === 0) {
    throw createValidationError('[upload-static] No files were found in client/dist. Build the client before uploading.')
  }

  files.sort((a, b) => a.localeCompare(b))

  const manifestHashedAssets = Array.from(
    new Set(
      [
        ...(Array.isArray(hashedAssets) ? hashedAssets : []),
        primaryIndexAssets.css,
        primaryIndexAssets.js,
      ]
        .map((asset) => normalizeClientAssetPath(asset))
        .filter((asset) => HASHED_INDEX_ASSET_RELATIVE_PATTERN.test(asset))
    )
  )

  return { files, hashedAssets: manifestHashedAssets, primaryIndexAssets }
}

async function configureStaticWebsiteHosting({ s3, bucket }) {
  const configuration = {
    IndexDocument: { Suffix: 'index.html' },
    ErrorDocument: { Key: '404.html' },
  }

  try {
    await s3.send(
      new PutBucketWebsiteCommand({
        Bucket: bucket,
        WebsiteConfiguration: configuration,
      }),
    )
    console.log(
      `[upload-static] Configured static website hosting for s3://${bucket} (/ → index.html default, 404.html → error).`,
    )
  } catch (error) {
    throw new Error(
      `[upload-static] Failed to configure static website hosting on bucket "${bucket}": ${error?.message || error
      }`,
    )
  }
}

async function walkDirectory(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const results = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const childFiles = await walkDirectory(fullPath, base)
      results.push(...childFiles)
    } else if (entry.isFile()) {
      const relativePath = path.relative(base, fullPath)
      results.push(relativePath)
    }
  }

  return results
}

function determineCacheControl(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized === 'index.html') {
    return 'public, max-age=60, must-revalidate'
  }
  if (normalized === 'service-worker.js') {
    return 'no-cache, no-store, must-revalidate'
  }
  if (INDEX_ASSET_ALIAS_PATHS.has(normalized)) {
    return INDEX_ALIAS_CACHE_CONTROL
  }
  if (
    normalized === 'api/published-cloudfront' ||
    normalized === 'api/published-cloudfront.json'
  ) {
    return 'no-store'
  }
  if (/assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)$/.test(normalized)) {
    return 'public, max-age=31536000, immutable'
  }
  if (/assets\/.*\.(?:woff2?|ttf|otf|eot|svg)$/i.test(normalized)) {
    return 'public, max-age=31536000, immutable'
  }
  if (/assets\/.*\.(?:png|jpe?g|gif|webp|avif)$/i.test(normalized)) {
    return 'public, max-age=31536000, immutable'
  }
  return 'public, max-age=86400'
}

function loadPublishedCloudfrontMetadataSafe() {
  try {
    const raw = readFileSync(publishedCloudfrontPath, 'utf8')
    if (!raw) {
      return null
    }

    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }

    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    console.warn(
      `[upload-static] Unable to read published CloudFront metadata at ${publishedCloudfrontPath}: ${error?.message || error}`,
    )
    return null
  }
}

function normalizeOriginPath(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

function derivePrefixFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return ''
  }

  const originPath = normalizeOriginPath(metadata.originPath)
  if (originPath) {
    return originPath
  }

  const urlCandidate = typeof metadata.url === 'string' ? metadata.url.trim() : ''
  if (urlCandidate) {
    try {
      const parsedUrl = new URL(urlCandidate)
      const normalizedPath = normalizeOriginPath(parsedUrl.pathname || '')
      if (normalizedPath) {
        return normalizedPath
      }
    } catch (error) {
      // Ignore URL parsing errors and fall through to return ''
    }
  }

  return ''
}

function deriveEnvironmentFromPrefix(prefix) {
  if (typeof prefix !== 'string') {
    return ''
  }

  const sanitized = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!sanitized) {
    return ''
  }

  const segments = sanitized.split('/')
  if (segments.length >= 3 && segments[0] === 'static' && segments[1] === 'client') {
    return segments[2]
  }

  if (segments.length >= 1) {
    return segments[segments.length - 1]
  }

  return ''
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
      'STATIC_ASSETS_BUCKET (or DATA_BUCKET/S3_BUCKET) must be set to upload static assets to S3.',
    )
  }

  const normalizePrefixSegment = (value) => {
    if (typeof value !== 'string') {
      return ''
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return ''
    }

    return trimmed
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const normalizedEnvironment = normalizePrefixSegment(deploymentEnvironment)
  const normalizedStage = normalizePrefixSegment(stageName)
  const baseSegment = normalizedEnvironment || normalizedStage || 'prod'
  const prefixSource =
    process.env.STATIC_ASSETS_PREFIX || `static/client/${baseSegment}/latest`
  const computedPrefix = String(prefixSource).trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!computedPrefix) {
    throw new Error('STATIC_ASSETS_PREFIX must resolve to a non-empty value.')
  }

  let normalizedPrefix = computedPrefix
  let effectiveStage = stageName || normalizedStage || baseSegment
  let effectiveEnvironment = deploymentEnvironment || stageName || baseSegment

  if (!process.env.STATIC_ASSETS_PREFIX) {
    const metadata = loadPublishedCloudfrontMetadataSafe()
    const metadataPrefix = derivePrefixFromMetadata(metadata)
    const sanitizedMetadataPrefix = metadataPrefix
      ? metadataPrefix.replace(/^\/+/, '').replace(/\/+$/, '')
      : ''

    if (sanitizedMetadataPrefix && sanitizedMetadataPrefix !== normalizedPrefix) {
      console.log(
        `[upload-static] Using CloudFront origin path ${sanitizedMetadataPrefix} for static asset uploads (overriding ${normalizedPrefix}).`,
      )
      normalizedPrefix = sanitizedMetadataPrefix
    }

    const derivedEnvironment = deriveEnvironmentFromPrefix(sanitizedMetadataPrefix)
    const normalizedDerived = normalizePrefixSegment(derivedEnvironment)
    if (normalizedDerived) {
      effectiveStage = normalizedDerived
      effectiveEnvironment = normalizedDerived
      process.env.STAGE_NAME = normalizedDerived
      process.env.DEPLOYMENT_ENVIRONMENT = normalizedDerived
    }

    if (sanitizedMetadataPrefix) {
      process.env.STATIC_ASSETS_PREFIX = sanitizedMetadataPrefix
    }
  }

  return {
    bucket,
    prefix: normalizedPrefix,
    stage: effectiveStage,
    deploymentEnvironment: effectiveEnvironment,
  }
}

const IMMUTABLE_HASHED_INDEX_ASSET_PATTERN = /\/assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)(?:\.map)?$/
const HASHED_INDEX_ASSET_RELATIVE_PATTERN = /^assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)$/i
const INDEX_ASSET_ALIAS_PATHS = new Set(['assets/index-latest.css', 'assets/index-latest.js'])
const INDEX_ALIAS_CACHE_CONTROL = 'public, max-age=60, must-revalidate'
const RESERVED_STATIC_ASSET_PATHS = new Set([
  'api/published-cloudfront',
  'api/published-cloudfront.json',
])

export function normalizeClientAssetPath(relativePath) {
  if (typeof relativePath !== 'string') {
    return ''
  }

  const trimmed = relativePath.trim()
  if (!trimmed) {
    return ''
  }

  const withoutLeadingDot = trimmed.replace(/^(?:\.\/)+/, '')
  const withoutLeadingSlash = withoutLeadingDot.replace(/^\/+/, '')
  return withoutLeadingSlash.replace(/\\/g, '/')
}

function buildVersionedAssetPath(relativePath, versionLabel) {
  const normalizedPath = normalizeClientAssetPath(relativePath)
  if (!normalizedPath.startsWith('assets/')) {
    return ''
  }

  const segments = normalizedPath.split('/')
  if (segments.length < 2) {
    return ''
  }

  if (/^v[\w.-]+$/iu.test(segments[1])) {
    return normalizedPath
  }

  const sanitizedLabel = normalizeVersionLabelSegment(versionLabel)
  if (!sanitizedLabel) {
    return ''
  }

  const resolvedLabel = sanitizedLabel.startsWith('v')
    ? sanitizedLabel
    : `v${sanitizedLabel}`

  return ['assets', resolvedLabel, ...segments.slice(1)].join('/')
}

export function resolveIndexAssetAliases(primaryAssets) {
  const cssAsset = normalizeClientAssetPath(primaryAssets?.css)
  const jsAsset = normalizeClientAssetPath(primaryAssets?.js)

  if (!cssAsset && !jsAsset) {
    return []
  }

  const aliases = []
  if (cssAsset && cssAsset !== 'assets/index-latest.css') {
    aliases.push({ alias: 'assets/index-latest.css', source: cssAsset })
  }
  if (jsAsset && jsAsset !== 'assets/index-latest.js') {
    aliases.push({ alias: 'assets/index-latest.js', source: jsAsset })
  }

  return aliases
}

async function ensureIndexAliasArtifacts({
  distDir = clientDistDir,
  primaryAssets,
} = {}) {
  const aliases = resolveIndexAssetAliases(primaryAssets)
  if (!aliases.length) {
    return
  }

  for (const { alias, source } of aliases) {
    if (!alias || !source) {
      continue
    }

    const normalizedSource = normalizeClientAssetPath(source)
    if (!normalizedSource) {
      continue
    }

    const sourcePath = path.join(distDir, normalizedSource)
    const aliasPath = path.join(distDir, alias)

    await ensureFileExists(sourcePath, {
      label: `resolved asset ${normalizedSource}`,
    })

    await mkdir(path.dirname(aliasPath), { recursive: true })
    await copyFile(sourcePath, aliasPath)
  }
}

async function loadPublishedCloudfrontMetadataForDist() {
  let raw
  try {
    raw = await readFile(publishedCloudfrontPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        '[upload-static] config/published-cloudfront.json is missing. Run "npm run publish:cloudfront-url" before uploading.',
      )
    }
    throw error
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    throw createValidationError(
      '[upload-static] config/published-cloudfront.json is empty. Run "npm run publish:cloudfront-url" before uploading.',
    )
  }

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw createValidationError(
      `[upload-static] Unable to parse config/published-cloudfront.json: ${error?.message || error}`,
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw createValidationError(
      '[upload-static] config/published-cloudfront.json must contain an object with the published metadata.',
    )
  }

  return parsed
}

async function ensurePublishedCloudfrontFallbackInDist({
  distDir = clientDistDir,
} = {}) {
  const metadata = await loadPublishedCloudfrontMetadataForDist()
  const payload = serializePublishedCloudfrontPayload(metadata)
  const targets = [
    path.join(distDir, 'api', 'published-cloudfront'),
    path.join(distDir, 'api', 'published-cloudfront.json'),
  ]

  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, payload, 'utf8')
  }
}

export function ensureIndexAliasCoverage(uploads) {
  const normalizedUploads = new Set()

  if (Array.isArray(uploads)) {
    for (const entry of uploads) {
      const candidate = normalizeClientAssetPath(entry?.path ?? entry)
      if (candidate) {
        normalizedUploads.add(candidate)
      }
    }
  }

  const missingAliases = []
  for (const alias of INDEX_ASSET_ALIAS_PATHS) {
    if (!normalizedUploads.has(alias)) {
      missingAliases.push(alias)
    }
  }

  if (missingAliases.length > 0) {
    const aliasSummary = missingAliases.map((alias) => `"${alias}"`).join(', ')
    const plural = missingAliases.length === 1 ? '' : 's'
    throw createValidationError(
      `[upload-static] Missing required index alias bundle${plural}: ${aliasSummary}. Run "npm run build:client" before deploying so the client build can regenerate the hashed index assets.`,
    )
  }
}

function isImmutableHashedIndexAsset(key) {
  if (typeof key !== 'string' || !key) {
    return false
  }

  const normalizedKey = key.replace(/\\/g, '/').trim()
  return IMMUTABLE_HASHED_INDEX_ASSET_PATTERN.test(normalizedKey)
}

export function shouldDeleteObjectKey(key, prefix) {
  if (typeof key !== 'string' || !key) {
    return false
  }

  const normalizedKey = key.replace(/\\/g, '/').trim()
  if (!normalizedKey.startsWith(prefix)) {
    return false
  }

  const relativePath = normalizedKey.slice(prefix.length)
  if (!relativePath || relativePath === '/') {
    return false
  }

  const sanitized = relativePath.replace(/^\/+/, '')
  if (!sanitized) {
    return false
  }

  if (INDEX_ASSET_ALIAS_PATHS.has(sanitized)) {
    return false
  }

  if (RESERVED_STATIC_ASSET_PATHS.has(sanitized)) {
    return false
  }

  if (isImmutableHashedIndexAsset(normalizedKey)) {
    return false
  }

  // CRITICAL FIX: Do not delete any assets from the assets/ directory.
  // This prevents 404 errors for users who have a cached index.html that references
  // older hashed assets that would otherwise be deleted during a new deployment.
  if (normalizedKey.includes('/assets/')) {
    return false
  }

  return true
}

function normalizePolicyActions(actions) {
  if (!actions) {
    return []
  }

  const actionList = Array.isArray(actions) ? actions : [actions]
  return actionList
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function principalAllowsPublicAccess(principal) {
  if (!principal) {
    return false
  }

  if (principal === '*') {
    return true
  }

  if (typeof principal === 'string') {
    return principal.trim() === '*'
  }

  if (typeof principal === 'object') {
    const values = []
    for (const value of Object.values(principal)) {
      if (Array.isArray(value)) {
        values.push(...value)
      } else {
        values.push(value)
      }
    }
    return values
      .filter((value) => typeof value === 'string')
      .some((value) => value.trim() === '*')
  }

  return false
}

function actionsAllowPublicGet(actions) {
  const normalized = normalizePolicyActions(actions)
  if (!normalized.length) {
    return false
  }

  return normalized.some((action) => {
    if (action === '*' || action === 's3:*') {
      return true
    }
    if (action === 's3:getobject') {
      return true
    }
    if (action.startsWith('s3:getobject')) {
      return true
    }
    return false
  })
}

function escapeRegexSegment(segment) {
  if (typeof segment !== 'string') {
    return ''
  }

  return segment.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
}

function resourceEntryAllowsKey(resourceEntry, bucket, key) {
  if (typeof resourceEntry !== 'string') {
    return false
  }

  const trimmedEntry = resourceEntry.trim()
  if (!trimmedEntry) {
    return false
  }

  if (trimmedEntry === '*') {
    return true
  }

  const bucketArnPrefix = `arn:aws:s3:::${bucket}`
  if (!trimmedEntry.toLowerCase().startsWith(bucketArnPrefix.toLowerCase())) {
    return false
  }

  let suffix = trimmedEntry.slice(bucketArnPrefix.length)
  if (!suffix) {
    return false
  }

  if (suffix === '/*') {
    return true
  }

  suffix = suffix.replace(/^\//, '')
  if (!suffix) {
    return false
  }

  const normalizedKey = key.replace(/^\/+/, '')
  const escapedSegments = suffix
    .split('*')
    .map((segment) => escapeRegexSegment(segment))
  const escapedPattern = escapedSegments.join('.*')
  const pattern = new RegExp(`^${escapedPattern}$`)
  return pattern.test(normalizedKey)
}

function resourcesAllowKey(resources, bucket, key) {
  if (!resources) {
    return false
  }

  const resourceList = Array.isArray(resources) ? resources : [resources]
  return resourceList.some((entry) => resourceEntryAllowsKey(entry, bucket, key))
}

export function statementAllowsPublicAssetDownload(statement, bucket, key) {
  if (!statement || statement.Effect !== 'Allow') {
    return false
  }

  if (!principalAllowsPublicAccess(statement.Principal)) {
    return false
  }

  if (!actionsAllowPublicGet(statement.Action)) {
    return false
  }

  return resourcesAllowKey(statement.Resource, bucket, key)
}

export function findMissingBucketPolicyKeys({ statements = [], bucket, keys = [] }) {
  const normalizedStatements = Array.isArray(statements)
    ? statements.filter(Boolean)
    : [statements].filter(Boolean)

  const normalizedKeys = Array.from(
    new Set(
      keys
        .filter((key) => typeof key === 'string')
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  )

  const missing = []
  for (const key of normalizedKeys) {
    const sanitizedKey = key.replace(/^\/+/, '')
    const hasAccess = normalizedStatements.some((statement) =>
      statementAllowsPublicAssetDownload(statement, bucket, sanitizedKey),
    )
    if (!hasAccess) {
      missing.push(sanitizedKey)
    }
  }

  return missing
}

function joinBucketPrefix(prefix, key) {
  const normalizedKey = String(key || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')

  if (!normalizedKey) {
    return ''
  }

  const normalizedPrefix = String(prefix || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  if (!normalizedPrefix) {
    return normalizedKey
  }

  return `${normalizedPrefix}/${normalizedKey}`
}

async function ensureBucketPolicyAllowsPublicAssetAccess({
  s3,
  bucket,
  prefix,
  requiredKeys = [],
}) {
  let response
  try {
    response = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }))
  } catch (error) {
    const statusCode = error?.$metadata?.httpStatusCode
    const errorCode = (error?.name || error?.Code || error?.code || '').trim()

    if (errorCode === 'NoSuchBucketPolicy' || statusCode === 404) {
      throw new Error(
        `[upload-static] Bucket "${bucket}" does not have a bucket policy. Configure a policy that allows public s3:GetObject access to s3://${bucket}/${prefix}/ before deploying.`,
      )
    }

    if (statusCode === 403 || errorCode === 'AccessDenied') {
      throw new Error(
        `[upload-static] Unable to read the bucket policy for "${bucket}" (access denied). Grant GetBucketPolicy permission or confirm the policy allows public reads for s3://${bucket}/${prefix}/.`,
      )
    }

    throw new Error(
      `[upload-static] Unable to load the bucket policy for "${bucket}": ${error?.message || error}`,
    )
  }

  const policyString = typeof response?.Policy === 'string' ? response.Policy.trim() : ''
  if (!policyString) {
    throw new Error(
      `[upload-static] Bucket policy response for "${bucket}" is empty. Confirm the policy allows public s3:GetObject access to s3://${bucket}/${prefix}/.`,
    )
  }

  let policyDocument
  try {
    policyDocument = JSON.parse(policyString)
  } catch (error) {
    throw new Error(
      `[upload-static] Bucket policy for "${bucket}" is not valid JSON: ${error?.message || error}`,
    )
  }

  const statements = Array.isArray(policyDocument?.Statement)
    ? policyDocument.Statement.filter(Boolean)
    : [policyDocument?.Statement].filter(Boolean)

  if (!statements.length) {
    throw new Error(
      `[upload-static] Bucket policy for "${bucket}" does not contain any statements. Add a statement that allows public s3:GetObject access to s3://${bucket}/${prefix}/.`,
    )
  }

  const validationKeys = new Set([joinBucketPrefix(prefix, 'index.html')].filter(Boolean))

  for (const alias of INDEX_ASSET_ALIAS_PATHS) {
    validationKeys.add(joinBucketPrefix(prefix, alias))
  }

  const normalizedRequiredKeys = Array.isArray(requiredKeys)
    ? requiredKeys
      .filter((key) => typeof key === 'string')
      .map((key) => joinBucketPrefix(prefix, key))
      .filter(Boolean)
    : []

  for (const key of normalizedRequiredKeys) {
    validationKeys.add(key)
  }

  const missingKeys = findMissingBucketPolicyKeys({
    statements,
    bucket,
    keys: Array.from(validationKeys),
  })

  if (missingKeys.length > 0) {
    const summary = missingKeys.map((key) => `- s3://${bucket}/${key}`).join('\n')
    throw new Error(
      `[upload-static] Bucket policy for "${bucket}" must allow public s3:GetObject access to the deployed client bundle. Update the policy so unauthenticated users can read:\n${summary}`,
    )
  }
}

async function listExistingObjects({ s3, bucket, prefix }) {
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
  const existing = new Set()
  let continuationToken

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefixWithSlash,
        ContinuationToken: continuationToken,
      }),
    )
    const contents = response.Contents || []
    for (const item of contents) {
      if (item?.Key) {
        existing.add(item.Key)
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return existing
}

async function purgeExistingObjects({
  s3,
  bucket,
  prefix,
  existingKeys,
  retainKeys = [],
}) {
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
  const sourceKeys = existingKeys ? Array.from(existingKeys) : []

  if (!existingKeys) {
    const discovered = await listExistingObjects({ s3, bucket, prefix })
    discovered.forEach((key) => sourceKeys.push(key))
  }

  if (sourceKeys.length === 0) {
    return
  }

  const retainSet = new Set(retainKeys)
  const deletionTargets = sourceKeys
    .filter((key) => shouldDeleteObjectKey(key, prefixWithSlash) && !retainSet.has(key))
    .map((key) => ({ Key: key }))

  if (deletionTargets.length === 0) {
    return
  }

  for (let index = 0; index < deletionTargets.length; index += 1000) {
    const chunk = deletionTargets.slice(index, index + 1000)
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk },
      }),
    )
  }

  console.log(
    `[upload-static] Removed ${deletionTargets.length} stale object${deletionTargets.length === 1 ? '' : 's'
    } from s3://${bucket}/${prefixWithSlash}`,
  )
}

function buildS3Key(prefix, relativePath) {
  const sanitizedPrefix = prefix.replace(/\/+$/, '')
  const sanitizedPath = relativePath.split(path.sep).join('/')
  return `${sanitizedPrefix}/${sanitizedPath}`
}

function resolveContentType(relativePath) {
  const lookup = mime.lookup(relativePath)
  if (typeof lookup === 'string' && lookup.trim()) {
    return lookup
  }

  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized === 'api/published-cloudfront') {
    return 'application/json'
  }

  return 'application/octet-stream'
}

function resolveObjectAcl(relativePath) {
  // ACLs are not supported on buckets with "Bucket owner enforced" setting.
  // Public access is managed via the bucket policy.
  return undefined
}

async function uploadFiles({ s3, bucket, prefix, files }) {
  const uploaded = []

  for (const relativePath of files) {
    const absolutePath = path.join(clientDistDir, relativePath)
    const key = buildS3Key(prefix, relativePath)
    const contentType = resolveContentType(relativePath)
    const cacheControl = determineCacheControl(relativePath)
    const acl = resolveObjectAcl(relativePath)

    const body = createReadStream(absolutePath)
    await s3.send(
      new PutObjectCommand(
        withBuildMetadata({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
          ...(acl ? { ACL: acl } : {}),
        }),
      ),
    )
    console.log(
      `[upload-static] Uploaded ${relativePath} → s3://${bucket}/${key} (${contentType}; ${cacheControl})`,
    )

    uploaded.push({
      path: relativePath.replace(/\\/g, '/'),
      key,
      contentType,
      cacheControl,
    })
  }

  return uploaded
}

async function uploadVersionedAssets({ s3, bucket, prefix, versionLabel, hashedAssets }) {
  const sanitizedLabel = normalizeVersionLabelSegment(versionLabel)
  if (!sanitizedLabel) {
    return []
  }

  const uploads = []

  for (const assetPath of Array.isArray(hashedAssets) ? hashedAssets : []) {
    const normalizedPath = normalizeClientAssetPath(assetPath)
    if (!normalizedPath) {
      continue
    }

    const versionedPath = buildVersionedAssetPath(normalizedPath, sanitizedLabel)
    if (!versionedPath || versionedPath === normalizedPath) {
      continue
    }

    const absolutePath = path.join(clientDistDir, normalizedPath)
    await ensureFileExists(absolutePath, { label: `versioned asset source ${normalizedPath}` })

    const key = buildS3Key(prefix, versionedPath)
    const contentType = resolveContentType(versionedPath)
    const cacheControl = 'public, max-age=31536000, immutable'
    const acl = resolveObjectAcl(versionedPath)

    const body = createReadStream(absolutePath)
    await s3.send(
      new PutObjectCommand(
        withBuildMetadata(
          {
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: cacheControl,
            ...(acl ? { ACL: acl } : {}),
          },
          { versionLabel: sanitizedLabel },
        ),
      ),
    )

    console.log(
      `[upload-static] Uploaded versioned asset ${versionedPath} → s3://${bucket}/${key} (${contentType}; ${cacheControl})`,
    )

    uploads.push({
      path: versionedPath,
      key,
      contentType,
      cacheControl,
    })
  }

  return uploads
}

export async function verifyUploadedAssets({ s3, bucket, uploads }) {
  if (!Array.isArray(uploads) || uploads.length === 0) {
    console.log(
      `[upload-static] No uploaded assets to verify for s3://${bucket || '<unknown>'}/`,
    )
    return
  }

  const failures = []

  for (const upload of uploads) {
    const key = typeof upload?.key === 'string' ? upload.key.trim() : ''
    if (!key) {
      continue
    }

    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )

      if (response?.Body && typeof response.Body.destroy === 'function') {
        response.Body.destroy()
      }
    } catch (error) {
      const pathLabel =
        typeof upload?.path === 'string' && upload.path.trim()
          ? upload.path.trim()
          : key

      const statusCode = error?.$metadata?.httpStatusCode
      const errorCode = error?.name || error?.Code || error?.code
      const reason = error?.message || String(error)

      console.error(
        `[upload-static] Verification failed for ${pathLabel} (s3://${bucket}/${key}): ${reason}`,
      )

      failures.push({ path: pathLabel, key, statusCode, errorCode, reason })
    }
  }

  if (failures.length > 0) {
    const failureSummary = failures
      .map((failure) => {
        const details = [
          typeof failure.statusCode === 'number' && !Number.isNaN(failure.statusCode)
            ? `status ${failure.statusCode}`
            : '',
          failure.errorCode ? `code ${failure.errorCode}` : '',
        ]
          .filter(Boolean)
          .join(', ')

        const suffix = details ? ` (${details})` : ''
        const reason = failure.reason ? ` — ${failure.reason}` : ''
        return `- ${failure.path} → s3://${bucket}/${failure.key}${suffix}${reason}`
      })
      .join('\n')

    throw new Error(
      `[upload-static] ${failures.length} uploaded asset${failures.length === 1 ? '' : 's'} failed verification.\n${failureSummary}`,
    )
  }

  console.log(
    `[upload-static] Verified ${uploads.length} uploaded asset${uploads.length === 1 ? '' : 's'} are accessible in s3://${bucket}/`,
  )
}

async function uploadManifest({
  s3,
  bucket,
  prefix,
  stage,
  deploymentEnvironment,
  buildVersion,
  versionLabel,
  uploadedFiles,
  hashedAssets,
}) {
  const manifestKey = buildS3Key(prefix, 'manifest.json')
  await backupExistingManifest({ s3, bucket, manifestKey })
  const payload = {
    stage,
    prefix,
    bucket,
    deploymentEnvironment: deploymentEnvironment || stage,
    buildVersion: buildVersion || null,
    assetVersionLabel: versionLabel || null,
    uploadedAt: new Date().toISOString(),
    fileCount: uploadedFiles.length,
    files: uploadedFiles,
    hashedIndexAssets: Array.isArray(hashedAssets) ? hashedAssets : [],
    hashedIndexAssetCount: Array.isArray(hashedAssets) ? hashedAssets.length : 0,
  }

  const body = `${JSON.stringify(payload, null, 2)}\n`
  const manifestAcl = resolveObjectAcl('manifest.json')
  await s3.send(
    new PutObjectCommand(
      withBuildMetadata(
        {
          Bucket: bucket,
          Key: manifestKey,
          Body: body,
          ContentType: 'application/json',
          CacheControl: 'no-cache',
          ...(manifestAcl ? { ACL: manifestAcl } : {}),
        },
        { versionLabel },
      ),
    ),
  )

  console.log(`[upload-static] Published manifest to s3://${bucket}/${manifestKey}`)

  return { key: manifestKey }
}

async function backupExistingManifest({ s3, bucket, manifestKey }) {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
      }),
    )

    const raw = await readStreamToString(response.Body)
    const trimmed = raw.trim()
    if (!trimmed) {
      console.log(
        `[upload-static] Existing manifest at s3://${bucket}/${manifestKey} is empty. Skipping backup before publishing.`,
      )
      return
    }

    let backupKey = manifestKey.replace(/manifest\.json$/u, 'manifest.previous.json')
    if (!backupKey || backupKey === manifestKey) {
      backupKey = `${manifestKey}.previous`
    }

    const backupAcl = resolveObjectAcl('manifest.previous.json')
    await s3.send(
      new PutObjectCommand(
        withBuildMetadata({
          Bucket: bucket,
          Key: backupKey,
          Body: `${trimmed}\n`,
          ContentType: 'application/json',
          CacheControl: 'no-cache',
          ...(backupAcl ? { ACL: backupAcl } : {}),
        }),
      ),
    )

    console.log(`[upload-static] Backed up existing manifest to s3://${bucket}/${backupKey}`)
  } catch (error) {
    if (isNotFoundError(error)) {
      console.log(
        `[upload-static] No existing manifest found at s3://${bucket}/${manifestKey}. Proceeding without creating a backup.`,
      )
      return
    }

    throw new Error(
      `[upload-static] Failed to back up existing manifest from s3://${bucket}/${manifestKey}: ${error?.message || error}`,
    )
  }
}

async function handleDeployUploadError({ error, context = {}, source }) {
  const classification = classifyDeployFailure(error)
  if (!classification) {
    return
  }

  const notificationDetails = {
    ...context,
  }

  if (source) {
    notificationDetails.source = source
  }
  if (classification.reason) {
    notificationDetails.errorMessage = classification.reason
  }
  if (error?.stack && typeof error.stack === 'string' && error.stack.trim()) {
    notificationDetails.errorStack = error.stack
  }

  if (!notificationDetails.stage && !notificationDetails.deploymentEnvironment) {
    const stageEnv = applyStageEnvironment({ propagateToProcessEnv: true, propagateViteEnv: false })
    if (stageEnv.stageName && !notificationDetails.stage) {
      notificationDetails.stage = stageEnv.stageName
    }
    if (stageEnv.deploymentEnvironment && !notificationDetails.deploymentEnvironment) {
      notificationDetails.deploymentEnvironment = stageEnv.deploymentEnvironment
    }
  }

  if (classification.type === 'static_upload_incomplete') {
    await notifyIncompleteStaticUpload(notificationDetails)
  } else if (classification.type === 'missing_client_assets') {
    await notifyMissingClientAssets(notificationDetails)
  }
}

async function main() {
  const deployContext = {}

  try {
    const { files, hashedAssets } = await gatherClientAssetFiles()
    const { bucket, prefix, stage, deploymentEnvironment } = resolveBucketConfiguration()
    Object.assign(deployContext, { bucket, prefix, stage, deploymentEnvironment })
    const buildVersion = resolveBuildVersion()
    const versionLabel = resolveVersionLabel()
    const s3 = new S3Client({})

    if (buildVersion) {
      console.log(`[upload-static] Using build version ${buildVersion}`)
    }
    if (versionLabel) {
      console.log(`[upload-static] Using versioned asset directory ${versionLabel}`)
    }

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch (error) {
      const statusCode = error?.$metadata?.httpStatusCode
      const errorCode = error?.name || error?.Code || error?.code

      if (statusCode === 403 || errorCode === 'AccessDenied') {
        console.warn(
          `Warning: Unable to verify bucket "${bucket}" with HeadBucket (access denied). Continuing upload attempts – ensure the IAM policy allows PutObject, GetObject, and DeleteObject.`,
        )
      } else {
        throw new Error(
          `Unable to access bucket "${bucket}" (${statusCode || errorCode || 'unknown error'}). Confirm the bucket exists and credentials are configured.`,
        )
      }
    }

    await ensureBucketPolicyAllowsPublicAssetAccess({
      s3,
      bucket,
      prefix,
      requiredKeys: files,
    })

    const existingKeys = await listExistingObjects({ s3, bucket, prefix })
    await configureStaticWebsiteHosting({ s3, bucket })
    const uploadedFiles = await uploadFiles({ s3, bucket, prefix, files })
    const versionedUploads = await uploadVersionedAssets({
      s3,
      bucket,
      prefix,
      versionLabel,
      hashedAssets,
    })
    const allUploadedFiles = [...uploadedFiles, ...versionedUploads]
    ensureIndexAliasCoverage(allUploadedFiles)
    await verifyUploadedAssets({ s3, bucket, uploads: allUploadedFiles })
    const manifestUpload = await uploadManifest({
      s3,
      bucket,
      prefix,
      stage,
      deploymentEnvironment,
      buildVersion,
      versionLabel,
      uploadedFiles: allUploadedFiles,
      hashedAssets,
    })

    const retainKeys = new Set()
    for (const entry of allUploadedFiles) {
      if (entry?.key) {
        retainKeys.add(entry.key)
      }
    }
    if (manifestUpload?.key) {
      retainKeys.add(manifestUpload.key)
    }

    await purgeExistingObjects({
      s3,
      bucket,
      prefix,
      existingKeys,
      retainKeys: Array.from(retainKeys),
    })

    console.log(
      `[upload-static] Uploaded ${files.length + versionedUploads.length} static asset${files.length + versionedUploads.length === 1 ? '' : 's'
      } to s3://${bucket}/${prefix}/`,
    )
  } catch (error) {
    await handleDeployUploadError({ error, context: deployContext, source: 'upload-static-build' })
    throw error
  }
}

const isCliInvocation = (() => {
  if (!process.argv?.[1]) {
    return false
  }

  try {
    return path.resolve(process.argv[1]) === __filename
  } catch (error) {
    return false
  }
})()

if (isCliInvocation) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
