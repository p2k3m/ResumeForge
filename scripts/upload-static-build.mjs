#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import {
  DeleteObjectsCommand,
  HeadBucketCommand,
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

function extractHashedIndexAssets(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw createValidationError('[upload-static] index.html is empty or unreadable.')
  }

  const assetPattern = /assets\/index-[\w.-]+\.(?:css|js)(?:\?[^"'>\s]+)?/g
  const assets = new Set()
  let match
  while ((match = assetPattern.exec(html)) !== null) {
    const [full] = match
    if (full) {
      const normalized = full.replace(/\?.*$/, '')
      assets.add(normalized)
    }
  }

  if (assets.size === 0) {
    throw createValidationError('[upload-static] index.html does not reference any hashed index assets.')
  }

  const cssCount = Array.from(assets).filter((asset) => asset.endsWith('.css')).length
  const jsCount = Array.from(assets).filter((asset) => asset.endsWith('.js')).length
  if (cssCount === 0 || jsCount === 0) {
    throw createValidationError(
      `[upload-static] index.html must reference hashed CSS and JS bundles. Found ${cssCount} CSS and ${jsCount} JS assets.`,
    )
  }

  return Array.from(assets)
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
  return { files, hashedAssets }
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
  if (/assets\/index-[\w.-]+\.(?:css|js)$/.test(normalized)) {
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

  const environmentLabel = deploymentEnvironment || stageName || 'prod'
  const stage = stageName || environmentLabel || 'prod'
  const prefixCandidate = process.env.STATIC_ASSETS_PREFIX || `static/client/${stage}`
  const normalizedPrefix = String(prefixCandidate).trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedPrefix) {
    throw new Error('STATIC_ASSETS_PREFIX must resolve to a non-empty value.')
  }

  return { bucket, prefix: normalizedPrefix, stage, deploymentEnvironment: environmentLabel }
}

function shouldDeleteObjectKey(key, prefix) {
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

async function main() {
  const { files, hashedAssets } = await gatherClientAssetFiles()
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
  await uploadManifest({
    s3,
    bucket,
    prefix,
    stage,
    deploymentEnvironment,
    buildVersion,
    uploadedFiles,
    hashedAssets,
  })

  console.log(
    `[upload-static] Uploaded ${files.length} static asset${files.length === 1 ? '' : 's'} to s3://${bucket}/${prefix}/`,
  )
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
