#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getStageEnvironment, resolveStageName } from '../config/stage.js'
import { resolvePublishedCloudfrontPath } from '../lib/cloudfront/metadata.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function hasString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function sanitizeMetadata(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const metadata = raw.cloudfront && typeof raw.cloudfront === 'object' ? raw.cloudfront : raw
  const sanitized = {}
  let hasField = false

  const assignTrimmed = (key) => {
    const candidate = metadata[key]
    if (!hasString(candidate)) {
      return
    }
    sanitized[key] = candidate.trim()
    hasField = true
  }

  assignTrimmed('stackName')
  assignTrimmed('distributionId')
  assignTrimmed('originBucket')
  assignTrimmed('originRegion')
  assignTrimmed('originPath')

  if (hasString(metadata.url)) {
    sanitized.url = metadata.url.trim()
    hasField = true
  }

  if (hasString(metadata.apiGatewayUrl)) {
    sanitized.apiGatewayUrl = metadata.apiGatewayUrl.trim()
    hasField = true
  }

  if (hasString(metadata.deploymentEnvironment)) {
    sanitized.deploymentEnvironment = metadata.deploymentEnvironment.trim()
    hasField = true
  }

  if (hasString(metadata.stage)) {
    sanitized.stage = metadata.stage.trim()
    hasField = true
  }

  if (typeof metadata.degraded === 'boolean') {
    sanitized.degraded = metadata.degraded
    hasField = true
  }

  if (typeof metadata.updatedAt === 'string' && metadata.updatedAt.trim()) {
    sanitized.updatedAt = metadata.updatedAt.trim()
    hasField = true
  }

  return hasField ? sanitized : null
}

async function loadPublishedMetadata() {
  const metadataPath = resolvePublishedCloudfrontPath({ projectRoot })
  try {
    const raw = await readFile(metadataPath, 'utf8')
    if (!raw.trim()) {
      return null
    }
    const parsed = JSON.parse(raw)
    return sanitizeMetadata(parsed)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw new Error(`Unable to read published CloudFront metadata at ${metadataPath}: ${error?.message || error}`)
  }
}

function sanitizePrefix(value) {
  if (!hasString(value)) {
    return ''
  }
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

function inferEnvironmentFromPrefix(prefix) {
  const sanitized = sanitizePrefix(prefix)
  if (!sanitized) {
    return ''
  }

  const segments = sanitized.split('/').filter(Boolean)
  if (segments.length >= 3 && segments[0] === 'static' && segments[1] === 'client') {
    return segments[2]
  }

  return ''
}

function normalizeStage(value, fallback) {
  if (hasString(value)) {
    return value.trim()
  }
  if (hasString(fallback)) {
    return fallback.trim()
  }
  return ''
}

function resolveDefaultStage(metadata, stageEnv) {
  if (hasString(stageEnv?.stageName)) {
    return stageEnv.stageName
  }

  if (hasString(metadata?.deploymentEnvironment)) {
    return metadata.deploymentEnvironment
  }

  if (hasString(metadata?.stage)) {
    return metadata.stage
  }

  if (hasString(metadata?.originPath)) {
    const inferred = inferEnvironmentFromPrefix(metadata.originPath)
    if (inferred) {
      return inferred
    }
  }

  return resolveStageName() || 'prod'
}

function resolveDefaultDeploymentEnv(metadata, stageEnv, resolvedStage) {
  if (hasString(stageEnv?.deploymentEnvironment)) {
    return stageEnv.deploymentEnvironment
  }

  if (hasString(metadata?.deploymentEnvironment)) {
    return metadata.deploymentEnvironment
  }

  if (hasString(metadata?.originPath)) {
    const inferred = inferEnvironmentFromPrefix(metadata.originPath)
    if (inferred) {
      return inferred
    }
  }

  if (hasString(resolvedStage)) {
    return resolvedStage.trim()
  }

  return 'prod'
}

function resolveBucket(metadata, stageEnv) {
  if (hasString(process.env.STATIC_ASSETS_BUCKET)) {
    return process.env.STATIC_ASSETS_BUCKET.trim()
  }

  if (hasString(stageEnv?.staticAssetsBucket)) {
    return stageEnv.staticAssetsBucket.trim()
  }

  if (hasString(metadata?.originBucket)) {
    return metadata.originBucket.trim()
  }

  if (hasString(process.env.DATA_BUCKET)) {
    return process.env.DATA_BUCKET.trim()
  }

  if (hasString(stageEnv?.dataBucket)) {
    return stageEnv.dataBucket.trim()
  }

  if (hasString(process.env.S3_BUCKET)) {
    return process.env.S3_BUCKET.trim()
  }

  return ''
}

function resolvePrefix(metadata, deploymentEnvironment) {
  if (hasString(process.env.STATIC_ASSETS_PREFIX)) {
    return sanitizePrefix(process.env.STATIC_ASSETS_PREFIX)
  }

  if (hasString(metadata?.originPath)) {
    return sanitizePrefix(metadata.originPath)
  }

  const envSegment = sanitizePrefix(`static/client/${deploymentEnvironment || 'prod'}/latest`)
  return envSegment
}

function resolveRegion(metadata) {
  if (hasString(process.env.AWS_REGION)) {
    return process.env.AWS_REGION.trim()
  }

  if (hasString(process.env.AWS_DEFAULT_REGION)) {
    return process.env.AWS_DEFAULT_REGION.trim()
  }

  if (hasString(metadata?.originRegion)) {
    return metadata.originRegion.trim()
  }

  return 'us-east-1'
}

function buildContext(metadata, stageEnv) {
  const resolvedStage = normalizeStage(stageEnv?.stageName, metadata?.stage)
  const stageName = resolvedStage || resolveDefaultStage(metadata, stageEnv)
  const deploymentEnvironment = resolveDefaultDeploymentEnv(metadata, stageEnv, stageName)
  const bucket = resolveBucket(metadata, stageEnv)
  const prefix = resolvePrefix(metadata, deploymentEnvironment)
  const region = resolveRegion(metadata)

  if (!hasString(bucket)) {
    throw new Error('Unable to resolve the static asset bucket. Provide STATIC_ASSETS_BUCKET or populate config/published-cloudfront.json.')
  }

  if (!hasString(prefix)) {
    throw new Error('Unable to resolve the static asset prefix. Configure STATIC_ASSETS_PREFIX or ensure originPath is published.')
  }

  const context = {
    STAGE_NAME: stageName,
    DEPLOYMENT_ENVIRONMENT: deploymentEnvironment,
    STATIC_ASSETS_BUCKET: bucket,
    STATIC_ASSETS_PREFIX: prefix,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
  }

  if (!hasString(process.env.DATA_BUCKET)) {
    context.DATA_BUCKET = bucket
  }

  if (!hasString(process.env.S3_BUCKET)) {
    context.S3_BUCKET = bucket
  }

  if (hasString(metadata?.distributionId)) {
    context.CLOUDFRONT_DISTRIBUTION_ID = metadata.distributionId.trim()
  }

  if (hasString(metadata?.url)) {
    context.CLOUDFRONT_URL = metadata.url.trim()
  }

  if (hasString(metadata?.apiGatewayUrl)) {
    context.API_BASE_URL = metadata.apiGatewayUrl.trim()
  }

  return context
}

function parseArguments(argv = process.argv.slice(2)) {
  const options = {
    format: 'env',
    includeKeys: new Set(),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const rawToken = argv[index]
    if (!rawToken) {
      continue
    }

    const [token, inlineValue] = rawToken.split('=', 2)

    const resolveValue = (fallbackIndex) => {
      if (inlineValue !== undefined) {
        return inlineValue
      }
      const candidate = argv[fallbackIndex]
      if (typeof candidate === 'string') {
        return candidate
      }
      return undefined
    }

    if (token === '--format' || token === '-f') {
      const value = resolveValue(index + (inlineValue === undefined ? 1 : 0))
      if (typeof value === 'string') {
        options.format = value.trim().toLowerCase()
        if (inlineValue === undefined) {
          index += 1
        }
      }
      continue
    }

    if (token === '--include' || token === '-i') {
      const value = resolveValue(index + (inlineValue === undefined ? 1 : 0))
      if (typeof value === 'string') {
        value
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
          .forEach((key) => options.includeKeys.add(key))
        if (inlineValue === undefined) {
          index += 1
        }
      }
      continue
    }

    if (token === '--help' || token === '-h') {
      printUsage()
      process.exit(0)
    }

    console.warn(`Unrecognised argument "${token}". Use --help to view supported options.`)
  }

  return options
}

function printUsage() {
  console.log('Usage: node scripts/export-static-deployment-context.mjs [options]')
  console.log('Options:')
  console.log('  --format <format>   Output format: env (default), github, json')
  console.log('  --include <keys>    Comma separated list of keys to include in json output')
}

function emitEnvFormat(context) {
  return Object.entries(context)
    .filter(([, value]) => hasString(value))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function emitJsonFormat(context, includeKeys) {
  if (includeKeys && includeKeys.size > 0) {
    const subset = {}
    for (const key of includeKeys) {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        subset[key] = context[key]
      }
    }
    return JSON.stringify(subset, null, 2)
  }

  return JSON.stringify(context, null, 2)
}

async function main() {
  const options = parseArguments()
  const metadata = await loadPublishedMetadata()
  const stageEnv = getStageEnvironment()
  const context = buildContext(metadata, stageEnv)

  const format = options.format || 'env'
  switch (format) {
    case 'env':
    case 'github':
      console.log(emitEnvFormat(context))
      break
    case 'json':
      console.log(emitJsonFormat(context, options.includeKeys))
      break
    default:
      throw new Error(`Unsupported format "${format}". Supported formats: env, github, json.`)
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
