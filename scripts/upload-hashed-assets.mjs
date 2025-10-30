#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import process from 'node:process'
import {
  HeadBucketCommand,
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
const clientAssetsDir = path.join(clientDistDir, 'assets')

const INDEX_ALIAS_CACHE_CONTROL = 'public, max-age=60, must-revalidate'
const CSS_ALIAS_RELATIVE_PATH = 'assets/index-latest.css'
const JS_ALIAS_RELATIVE_PATH = 'assets/index-latest.js'

export const HASHED_INDEX_ASSET_FILENAME_PATTERN = /^index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js)(?:\.map)?$/i
const HASHED_INDEX_REFERENCE_PATTERN = /assets\/(index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))(?:\?[^"'\s>]+)?/gi

export function normalizeHashedAssetReference(candidate) {
  if (typeof candidate !== 'string') {
    return ''
  }

  const normalized = candidate.replace(/\\/g, '/')
  const match = /assets\/(index-(?!latest(?:\.|$))[\w.-]+\.(?:css|js))/i.exec(normalized)
  if (!match) {
    return ''
  }

  return `assets/${match[1]}`
}

export function extractHashedIndexAssetReferences(html) {
  if (typeof html !== 'string') {
    return []
  }

  HASHED_INDEX_REFERENCE_PATTERN.lastIndex = 0
  const assets = new Set()
  let match
  while ((match = HASHED_INDEX_REFERENCE_PATTERN.exec(html)) !== null) {
    const [, relative] = match
    if (relative) {
      const normalized = normalizeHashedAssetReference(`assets/${relative}`)
      if (normalized) {
        assets.add(normalized)
      }
    }
  }

  return Array.from(assets).sort((a, b) => a.localeCompare(b))
}

export function isHashedIndexAssetFilename(name) {
  if (typeof name !== 'string') {
    return false
  }

  return HASHED_INDEX_ASSET_FILENAME_PATTERN.test(name.trim())
}

function normalizeVersionLabelSegment(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .trim()
    .replace(/^v+/i, '')
    .replace(/[^a-z0-9.-]/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function resolveBuildVersionLabel() {
  const candidates = [
    process.env.BUILD_VERSION,
    process.env.GIT_COMMIT,
    process.env.GIT_SHA,
    process.env.GITHUB_SHA,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeVersionLabelSegment(candidate)
    if (normalized) {
      return `v${normalized}`
    }
  }

  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const fallback =
    `${now.getUTCFullYear()}` +
    `${pad(now.getUTCMonth() + 1)}` +
    `${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}` +
    `${pad(now.getUTCMinutes())}` +
    `${pad(now.getUTCSeconds())}`

  return `v${fallback}`
}

function pickAliasSource({ referencedAssets = [], entries = [], extension }) {
  if (!extension) {
    return ''
  }

  const normalizedReferenced = Array.isArray(referencedAssets)
    ? referencedAssets.map((asset) => normalizeHashedAssetReference(asset))
    : []

  for (const asset of normalizedReferenced) {
    if (asset && asset.endsWith(extension)) {
      return asset
    }
  }

  const candidates = entries
    .map((entry) => normalizeHashedAssetReference(entry?.relativePath))
    .filter((asset) => asset && asset.endsWith(extension))

  if (candidates.length === 0) {
    return ''
  }

  candidates.sort((a, b) => a.localeCompare(b))
  return candidates[candidates.length - 1]
}

async function createIndexAliasCopy({
  sourceRelativePath,
  aliasRelativePath,
  distDirectory,
}) {
  if (!sourceRelativePath || !aliasRelativePath) {
    return null
  }

  const normalizedSource = normalizeHashedAssetReference(sourceRelativePath)
  if (!normalizedSource) {
    return null
  }

  const absoluteSourcePath = path.join(distDirectory, normalizedSource)
  const absoluteAliasPath = path.join(distDirectory, aliasRelativePath)

  await fs.mkdir(path.dirname(absoluteAliasPath), { recursive: true })
  await fs.copyFile(absoluteSourcePath, absoluteAliasPath)

  return {
    relativePath: aliasRelativePath,
    absolutePath: absoluteAliasPath,
    cacheControl: INDEX_ALIAS_CACHE_CONTROL,
  }
}

async function generateIndexAliasUploadEntries({
  referencedAssets,
  entries,
  distDirectory,
}) {
  const uploads = []

  const cssSource = pickAliasSource({
    referencedAssets,
    entries,
    extension: '.css',
  })

  if (cssSource) {
    const cssAlias = await createIndexAliasCopy({
      sourceRelativePath: cssSource,
      aliasRelativePath: CSS_ALIAS_RELATIVE_PATH,
      distDirectory,
    })
    if (cssAlias) {
      uploads.push(cssAlias)
    }
  } else {
    console.warn(
      '[upload-hashed-assets] No hashed CSS bundle detected; skipping index-latest.css alias upload.',
    )
  }

  const jsSource = pickAliasSource({
    referencedAssets,
    entries,
    extension: '.js',
  })

  if (!jsSource) {
    throw new Error(
      '[upload-hashed-assets] Unable to resolve a hashed JS bundle to back index-latest.js.',
    )
  }

  const jsAlias = await createIndexAliasCopy({
    sourceRelativePath: jsSource,
    aliasRelativePath: JS_ALIAS_RELATIVE_PATH,
    distDirectory,
  })

  if (jsAlias) {
    uploads.push(jsAlias)
  }

  return uploads
}

function createVersionedUploadEntries(entries, versionLabel) {
  const normalizedVersion = typeof versionLabel === 'string' ? versionLabel.trim() : ''
  if (!normalizedVersion) {
    return []
  }

  const sanitizedVersion = normalizedVersion.startsWith('v')
    ? normalizedVersion
    : `v${normalizedVersion}`

  const uploads = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    const relativePath = entry?.relativePath
    if (typeof relativePath !== 'string') {
      continue
    }

    const normalized = relativePath.replace(/\\/g, '/').trim()
    if (!normalized.startsWith('assets/')) {
      continue
    }

    const segments = normalized.split('/')
    if (segments.length < 2) {
      continue
    }

    if (segments[1] && /^v[\w.-]+$/i.test(segments[1])) {
      continue
    }

    const versionedPath = ['assets', sanitizedVersion, ...segments.slice(1)].join('/')
    uploads.push({
      relativePath: versionedPath,
      absolutePath: entry.absolutePath,
      cacheControl: entry.cacheControl,
    })
  }

  return uploads
}

export async function gatherHashedAssetUploadEntries({
  assetsDirectory = clientAssetsDir,
  indexHtmlPath = clientIndexPath,
} = {}) {
  let html
  try {
    html = await fs.readFile(indexHtmlPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `[upload-hashed-assets] Missing client index at ${indexHtmlPath}. Run "npm run build:client" before uploading.`,
      )
    }
    throw error
  }

  const referencedAssets = extractHashedIndexAssetReferences(html)
  if (!referencedAssets.length) {
    throw new Error('[upload-hashed-assets] index.html does not reference any hashed index assets.')
  }

  const cssCount = referencedAssets.filter((asset) => asset.endsWith('.css')).length
  const jsCount = referencedAssets.filter((asset) => asset.endsWith('.js')).length

  if (jsCount === 0) {
    throw new Error(
      `[upload-hashed-assets] index.html must reference at least one hashed JS bundle. Found ${jsCount} JS asset${
        jsCount === 1 ? '' : 's'
      }.`,
    )
  }

  if (cssCount === 0) {
    console.warn(
      '[upload-hashed-assets] index.html does not reference a hashed CSS bundle; skipping CSS uploads.',
    )
  }

  let assetEntries
  try {
    assetEntries = await fs.readdir(assetsDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `[upload-hashed-assets] Missing hashed asset directory at ${assetsDirectory}. Run "npm run build:client" before uploading.`,
      )
    }
    throw error
  }

  const hashedAssets = new Map()
  for (const entry of assetEntries) {
    if (!entry.isFile()) {
      continue
    }

    if (!isHashedIndexAssetFilename(entry.name)) {
      continue
    }

    const relativePath = `assets/${entry.name}`
    hashedAssets.set(relativePath, {
      relativePath,
      absolutePath: path.join(assetsDirectory, entry.name),
    })
  }

  for (const referenced of referencedAssets) {
    if (!hashedAssets.has(referenced)) {
      const absolutePath = path.join(clientDistDir, referenced)
      try {
        const stats = await fs.stat(absolutePath)
        if (!stats.isFile()) {
          throw new Error('Not a file')
        }
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new Error(
            `[upload-hashed-assets] Referenced asset ${referenced} is missing from the client build output.`,
          )
        }
        throw error
      }

      hashedAssets.set(referenced, {
        relativePath: referenced,
        absolutePath,
      })
    }

    const sourcemapPath = `${referenced}.map`
    const sourcemapName = path.basename(sourcemapPath)
    if (isHashedIndexAssetFilename(sourcemapName)) {
      const sourcemapRelative = sourcemapPath
      if (!hashedAssets.has(sourcemapRelative)) {
        const sourcemapAbsolute = path.join(clientDistDir, sourcemapRelative)
        try {
          const stats = await fs.stat(sourcemapAbsolute)
          if (stats.isFile()) {
            hashedAssets.set(sourcemapRelative, {
              relativePath: sourcemapRelative,
              absolutePath: sourcemapAbsolute,
            })
          }
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            throw error
          }
        }
      }
    }
  }

  const entries = Array.from(hashedAssets.values()).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  )

  return { entries, referencedAssets }
}

function resolveHashedAssetUploadConfiguration() {
  const { stageName, deploymentEnvironment, staticAssetsBucket, dataBucket } =
    applyStageEnvironment({ propagateToProcessEnv: true, propagateViteEnv: false })

  const bucket = staticAssetsBucket || dataBucket
  if (!bucket) {
    return null
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
  const prefixSource = process.env.STATIC_ASSETS_PREFIX || `static/client/${baseSegment}/latest`
  const normalizedPrefix = String(prefixSource).trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedPrefix) {
    throw new Error('STATIC_ASSETS_PREFIX must resolve to a non-empty value.')
  }

  return {
    bucket,
    prefix: normalizedPrefix,
  }
}

function buildS3Key(prefix, relativePath) {
  const sanitizedPrefix = prefix.replace(/\/+$/, '')
  const sanitizedPath = relativePath.split(path.sep).join('/')
  return `${sanitizedPrefix}/${sanitizedPath}`
}

function resolveHashedAssetCacheControl(relativePath) {
  if (typeof relativePath === 'string' && relativePath.endsWith('.map')) {
    return 'public, max-age=31536000, immutable'
  }

  return 'public, max-age=31536000, immutable'
}

function resolveContentType(relativePath) {
  const lookup = mime.lookup(relativePath)
  if (typeof lookup === 'string' && lookup.trim()) {
    return lookup
  }

  return 'application/octet-stream'
}

export async function uploadHashedIndexAssets(options = {}) {
  const configuration = resolveHashedAssetUploadConfiguration()
  if (!configuration) {
    if (!options?.quiet) {
      console.log('[upload-hashed-assets] No static asset bucket configured; skipping hashed asset upload.')
    }
    return { uploaded: [] }
  }

  const distDirectory = options?.distDirectory || clientDistDir
  const assetsDirectory = options?.assetsDirectory || path.join(distDirectory, 'assets')
  const indexHtmlPath = options?.indexHtmlPath || path.join(distDirectory, 'index.html')

  const { entries, referencedAssets } = await gatherHashedAssetUploadEntries({
    assetsDirectory,
    indexHtmlPath,
  })
  if (!entries.length) {
    if (!options?.quiet) {
      console.log('[upload-hashed-assets] No hashed assets discovered in client build; skipping upload.')
    }
    return { uploaded: [] }
  }

  const aliasEntries = await generateIndexAliasUploadEntries({
    referencedAssets,
    entries,
    distDirectory,
  })

  const versionLabel = resolveBuildVersionLabel()
  const versionedEntries = createVersionedUploadEntries(entries, versionLabel)

  const uploads = [...entries, ...aliasEntries, ...versionedEntries]
  if (uploads.length === 0) {
    if (!options?.quiet) {
      console.log('[upload-hashed-assets] No hashed assets discovered in client build; skipping upload.')
    }
    return { uploaded: [] }
  }

  const s3 = new S3Client({})
  const { bucket, prefix } = configuration

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (error) {
    const code = error?.$metadata?.httpStatusCode || error?.name || error?.Code
    throw new Error(
      `Unable to access bucket "${bucket}" (${code || 'unknown error'}). Confirm the bucket exists and credentials are configured.`,
    )
  }

  const uploaded = []

  for (const entry of uploads) {
    const key = buildS3Key(prefix, entry.relativePath)
    const bodyStream = createReadStream(entry.absolutePath)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyStream,
        ContentType: resolveContentType(entry.relativePath),
        CacheControl: entry.cacheControl || resolveHashedAssetCacheControl(entry.relativePath),
      }),
    )
    uploaded.push(entry.relativePath)
  }

  if (!options?.quiet) {
    const aliasSummary = aliasEntries.map((entry) => entry.relativePath)
    const hashedSummary = entries.map((entry) => entry.relativePath)
    const versionSummary = versionedEntries.map((entry) => entry.relativePath)

    const messageParts = [`hashed assets (${hashedSummary.join(', ')})`]
    if (aliasSummary.length) {
      messageParts.push(`aliases (${aliasSummary.join(', ')})`)
    }
    if (versionSummary.length) {
      messageParts.push(`versioned copies (${versionSummary.join(', ')})`)
    }

    console.log(
      `[upload-hashed-assets] Uploaded ${uploads.length} bundle${uploads.length === 1 ? '' : 's'} to s3://${bucket}/${prefix}/: ${messageParts.join('; ')}`,
    )
  }

  return { uploaded, bucket, prefix, versionLabel }
}

async function main() {
  try {
    await uploadHashedIndexAssets()
  } catch (error) {
    console.error(error?.message || error)
    process.exitCode = 1
  }
}

const isCliInvocation = process.argv[1] && path.resolve(process.argv[1]) === __filename

if (isCliInvocation) {
  await main()
}
