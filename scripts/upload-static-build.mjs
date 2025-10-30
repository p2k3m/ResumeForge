#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketWebsiteCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import mime from 'mime-types'
import { applyStageEnvironment } from '../config/stage.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const clientDistDir = path.join(projectRoot, 'client', 'dist')
const clientIndexPath = path.join(clientDistDir, 'index.html')
const serviceWorkerPath = path.join(clientDistDir, 'service-worker.js')
const errorDocumentPath = path.join(clientDistDir, '404.html')
const assetsDir = path.join(clientDistDir, 'assets')

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
    /(?:src|href)=["']([^"']*assets\/(?:v[\w.-]+\/)?index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\?[^"'>\s]+)?["']/gi
  const assets = new Set()
  let match
  while ((match = assetPattern.exec(html)) !== null) {
    const [, captured] = match
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
      `[upload-static] index.html must reference at least one hashed JS bundle. Found ${jsCount} JS asset${
        jsCount === 1 ? '' : 's'
      }.`,
    )
  }

  if (cssCount === 0) {
    throw createValidationError(
      `[upload-static] index.html must reference at least one hashed CSS bundle. Found ${cssCount} CSS asset${
        cssCount === 1 ? '' : 's'
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

  const files = await walkDirectory(clientDistDir)
  if (files.length === 0) {
    throw createValidationError('[upload-static] No files were found in client/dist. Build the client before uploading.')
  }

  files.sort((a, b) => a.localeCompare(b))
  const primaryIndexAssets = resolvePrimaryIndexAssets({ hashedAssets, files })

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
      `[upload-static] Failed to configure static website hosting on bucket "${bucket}": ${
        error?.message || error
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
  const normalizedPrefix = String(prefixSource).trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedPrefix) {
    throw new Error('STATIC_ASSETS_PREFIX must resolve to a non-empty value.')
  }

  const effectiveStage = stageName || normalizedStage || baseSegment
  const effectiveEnvironment = deploymentEnvironment || stageName || baseSegment

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

  if (isImmutableHashedIndexAsset(normalizedKey)) {
    return false
  }

  return true
}

async function purgeExistingObjects({ s3, bucket, prefix }) {
  const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
  let continuationToken
  let deletedCount = 0

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefixWithSlash,
        ContinuationToken: continuationToken,
      }),
    )
    const contents = response.Contents || []
    if (contents.length > 0) {
      const objects = contents
        .map((item) => item.Key)
        .filter((key) => shouldDeleteObjectKey(key, prefixWithSlash))
        .map((key) => ({ Key: key }))

      for (let index = 0; index < objects.length; index += 1000) {
        const chunk = objects.slice(index, index + 1000)
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: chunk },
          }),
        )
        deletedCount += chunk.length
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  if (deletedCount > 0) {
    console.log(
      `[upload-static] Removed ${deletedCount} stale object${deletedCount === 1 ? '' : 's'} from s3://${bucket}/${prefixWithSlash}`,
    )
  }
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

async function uploadFiles({ s3, bucket, prefix, files }) {
  const uploaded = []

  for (const relativePath of files) {
    const absolutePath = path.join(clientDistDir, relativePath)
    const key = buildS3Key(prefix, relativePath)
    const contentType = resolveContentType(relativePath)
    const cacheControl = determineCacheControl(relativePath)

    const body = createReadStream(absolutePath)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
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

async function uploadAliasFiles({ s3, bucket, prefix, aliases }) {
  if (!Array.isArray(aliases) || aliases.length === 0) {
    return []
  }

  const uploadedAliases = []

  for (const entry of aliases) {
    const aliasPath = normalizeClientAssetPath(entry?.alias)
    const sourcePath = normalizeClientAssetPath(entry?.source)

    if (!aliasPath || !sourcePath) {
      continue
    }

    const absoluteSourcePath = path.join(clientDistDir, sourcePath)
    await ensureFileExists(absoluteSourcePath, { label: `alias source ${sourcePath}` })
    const key = buildS3Key(prefix, aliasPath)
    const contentType = resolveContentType(aliasPath)
    const cacheControl = 'public, max-age=60, must-revalidate'

    const body = createReadStream(absoluteSourcePath)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    )

    console.log(
      `[upload-static] Uploaded alias ${aliasPath} → s3://${bucket}/${key} (${contentType}; ${cacheControl})`,
    )

    uploadedAliases.push({
      path: aliasPath,
      key,
      contentType,
      cacheControl,
    })
  }

  return uploadedAliases
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
      await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      )
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
    uploadedAt: new Date().toISOString(),
    fileCount: uploadedFiles.length,
    files: uploadedFiles,
    hashedIndexAssets: Array.isArray(hashedAssets) ? hashedAssets : [],
    hashedIndexAssetCount: Array.isArray(hashedAssets) ? hashedAssets.length : 0,
  }

  const body = `${JSON.stringify(payload, null, 2)}\n`
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestKey,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    }),
  )

  console.log(`[upload-static] Published manifest to s3://${bucket}/${manifestKey}`)
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

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: backupKey,
        Body: `${trimmed}\n`,
        ContentType: 'application/json',
        CacheControl: 'no-cache',
      }),
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

async function main() {
  const { files, hashedAssets, primaryIndexAssets } = await gatherClientAssetFiles()
  const { bucket, prefix, stage, deploymentEnvironment } = resolveBucketConfiguration()
  const buildVersion = resolveBuildVersion()
  const s3 = new S3Client({})

  if (buildVersion) {
    console.log(`[upload-static] Using build version ${buildVersion}`)
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (error) {
    const code = error?.$metadata?.httpStatusCode || error?.name || error?.Code
    throw new Error(
      `Unable to access bucket "${bucket}" (${code || 'unknown error'}). Confirm the bucket exists and credentials are configured.`,
    )
  }

  await purgeExistingObjects({ s3, bucket, prefix })
  await configureStaticWebsiteHosting({ s3, bucket })
  const uploadedFiles = await uploadFiles({ s3, bucket, prefix, files })
  const aliasUploads = await uploadAliasFiles({
    s3,
    bucket,
    prefix,
    aliases: resolveIndexAssetAliases(primaryIndexAssets),
  })
  const allUploadedFiles = [...uploadedFiles, ...aliasUploads]
  ensureIndexAliasCoverage(allUploadedFiles)
  await verifyUploadedAssets({ s3, bucket, uploads: allUploadedFiles })
  await uploadManifest({
    s3,
    bucket,
    prefix,
    stage,
    deploymentEnvironment,
    buildVersion,
    uploadedFiles: allUploadedFiles,
    hashedAssets,
  })

  console.log(
    `[upload-static] Uploaded ${files.length + aliasUploads.length} static asset${
      files.length + aliasUploads.length === 1 ? '' : 's'
    } to s3://${bucket}/${prefix}/`,
  )
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
