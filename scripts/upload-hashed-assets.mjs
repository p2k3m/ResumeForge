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

  const { entries, referencedAssets } = await gatherHashedAssetUploadEntries()
  if (!entries.length) {
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

  for (const entry of entries) {
    const key = buildS3Key(prefix, entry.relativePath)
    const bodyStream = createReadStream(entry.absolutePath)
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bodyStream,
        ContentType: resolveContentType(entry.relativePath),
        CacheControl: resolveHashedAssetCacheControl(entry.relativePath),
      }),
    )
    uploaded.push(entry.relativePath)
  }

  if (!options?.quiet) {
    console.log(
      `[upload-hashed-assets] Uploaded ${uploaded.length} hashed asset${uploaded.length === 1 ? '' : 's'} (${referencedAssets.join(
        ', ',
      )}) to s3://${bucket}/${prefix}/`,
    )
  }

  return { uploaded, bucket, prefix }
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
