#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import { applyStageEnvironment } from '../config/stage.js'
import { resolvePublishedCloudfrontPath } from '../lib/cloudfront/metadata.js'
import { verifyClientAssets } from '../lib/cloudfrontAssetCheck.js'
import { resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function normalizeString(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  return trimmed
}

function parseValueArg(argv, index) {
  if (index < argv.length - 1) {
    return argv[index + 1]
  }
  return ''
}

export function parseStaticPipelineArgs(argv = []) {
  const options = {
    environment: '',
    stackName: '',
    skipClean: false,
    skipBuild: false,
    skipUpload: false,
    skipHashedUpload: false,
    skipVerify: false,
    skipCloudfrontVerify: false,
    skipPublish: false,
    cloudfrontUrl: '',
    assetPrefixes: [],
    cloudfrontRetries: 2,
    cloudfrontRetryDelayMs: 15000,
  }

  if (!Array.isArray(argv)) {
    return options
  }

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    if (typeof raw !== 'string') {
      continue
    }

    const arg = raw.trim()
    if (!arg) {
      continue
    }

    const [flag, inlineValue] = arg.split('=', 2)

    switch (flag) {
      case '--environment': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        options.environment = normalizeString(value)
        break
      }
      case '--stack': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        options.stackName = normalizeString(value)
        break
      }
      case '--cloudfront-url': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        options.cloudfrontUrl = normalizeString(value)
        break
      }
      case '--asset-prefix': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        if (value) {
          options.assetPrefixes.push(normalizeString(value))
        }
        break
      }
      case '--cloudfront-retries': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        const parsed = Number.parseInt(value, 10)
        if (Number.isFinite(parsed) && parsed >= 0) {
          options.cloudfrontRetries = parsed
        }
        break
      }
      case '--cloudfront-retry-delay':
      case '--cloudfront-retry-delay-ms': {
        const value = inlineValue ?? parseValueArg(argv, index)
        if (inlineValue === undefined && value) {
          index += 1
        }
        const parsed = Number.parseInt(value, 10)
        if (Number.isFinite(parsed) && parsed >= 0) {
          options.cloudfrontRetryDelayMs = parsed
        }
        break
      }
      case '--skip-clean':
        options.skipClean = true
        break
      case '--skip-build':
      case '--skip-client-build':
        options.skipBuild = true
        break
      case '--skip-upload':
        options.skipUpload = true
        break
      case '--skip-hashed':
      case '--skip-hashed-upload':
      case '--skip-upload-hashed':
      case '--skip-hashed-assets':
        options.skipHashedUpload = true
        break
      case '--skip-verify':
      case '--skip-static-verify':
        options.skipVerify = true
        options.skipCloudfrontVerify = true
        break
      case '--skip-cloudfront':
      case '--skip-cloudfront-verify':
        options.skipCloudfrontVerify = true
        break
      case '--verify-cloudfront':
        options.skipCloudfrontVerify = false
        break
      case '--skip-publish':
        options.skipPublish = true
        break
      default:
        break
    }
  }

  return options
}

function pickFirstNonEmpty(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeString(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

async function resolvePipelineStackName(options = {}) {
  const explicit = pickFirstNonEmpty(
    options?.stackName,
    process.env.SAM_STACK_NAME,
    process.env.STACK_NAME,
    process.env.RESUMEFORGE_STACK_NAME,
  )

  if (explicit) {
    return explicit
  }

  try {
    const metadata = await loadPublishedCloudfrontMetadata()
    if (metadata && typeof metadata === 'object') {
      const stackFromMetadata = pickFirstNonEmpty(metadata.stackName)
      if (stackFromMetadata) {
        return stackFromMetadata
      }
    }
  } catch (error) {
    console.warn(
      `[static-pipeline] Unable to read published CloudFront metadata while resolving stack name: ${
        error?.message || error
      }`,
    )
  }

  return ''
}

export function buildStaticPipelinePlan(options = {}) {
  const plan = []

  if (!options.skipClean) {
    plan.push({
      id: 'clean',
      type: 'command',
      label: 'Clean workspace',
      command: 'npm',
      args: ['run', 'clean'],
    })
  }

  if (!options.skipBuild) {
    plan.push({
      id: 'build-client',
      type: 'command',
      label: 'Build client bundle',
      command: 'npm',
      args: ['run', 'build:client'],
    })
  }

  if (!options.skipUpload) {
    plan.push({
      id: 'upload-static',
      type: 'command',
      label: 'Upload static assets',
      command: 'npm',
      args: ['run', 'upload:static'],
    })
  }

  if (!options.skipUpload && !options.skipHashedUpload) {
    plan.push({
      id: 'upload-hashed',
      type: 'command',
      label: 'Upload hashed index assets',
      command: 'npm',
      args: ['run', 'upload:hashed'],
    })
  }

  if (!options.skipVerify) {
    const verifyArgs = ['run', 'verify:static']
    const passthrough = ['--skip-cloudfront', '--delete-stale-index-assets']
    plan.push({
      id: 'verify-static',
      type: 'command',
      label: 'Verify static asset upload',
      command: 'npm',
      args: [...verifyArgs, '--', ...passthrough],
    })
  }

  if (!options.skipPublish && options.stackName) {
    plan.push({
      id: 'publish-cloudfront',
      type: 'command',
      label: 'Publish CloudFront metadata',
      command: 'npm',
      args: ['run', 'publish:cloudfront-url', '--', options.stackName],
    })
  }

  if (!options.skipVerify && !options.skipCloudfrontVerify) {
    plan.push({
      id: 'verify-cloudfront',
      type: 'cloudfront-verify',
      label: 'Verify CloudFront client bundle',
    })
  }

  return plan
}

async function runCommandStep(step, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, ...(env || {}) },
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code, signal) => {
      if (typeof code === 'number') {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`${step.label || step.command} exited with code ${code}`))
        }
        return
      }
      reject(new Error(`${step.label || step.command} terminated via signal ${signal || 'unknown'}`))
    })
  })
}

async function loadPublishedCloudfrontMetadata() {
  const metadataPath = resolvePublishedCloudfrontPath({ projectRoot })
  try {
    const raw = await readFile(metadataPath, 'utf8')
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
    throw new Error(`Unable to read published CloudFront metadata at ${metadataPath}: ${error?.message || error}`)
  }
}

function normalizeAssetPrefix(value) {
  const normalized = normalizeString(value)
  if (!normalized) {
    return ''
  }
  return normalized.replace(/^\/+/, '').replace(/\/+$/, '')
}

function extractAssetPrefixesFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return []
  }

  const prefixes = new Set()
  const originPath = normalizeAssetPrefix(metadata.originPath || '')
  if (originPath) {
    prefixes.add(originPath)
  }
  const deployment = normalizeAssetPrefix(metadata.deploymentEnvironment || metadata.stage)
  if (deployment) {
    prefixes.add(`static/client/${deployment}`)
  }
  return Array.from(prefixes)
}

async function verifyCloudfrontDistribution({
  explicitUrl,
  assetPrefixes = [],
  retries,
  retryDelayMs,
} = {}) {
  let url = normalizeString(explicitUrl)
  let metadata

  if (!url) {
    metadata = await loadPublishedCloudfrontMetadata()
    url = normalizeString(resolvePublishedCloudfrontUrl(metadata))
  }

  if (!url) {
    console.warn('[static-pipeline] No CloudFront URL available; skipping CDN verification.')
    return
  }

  const metadataPrefixes = extractAssetPrefixesFromMetadata(metadata)
  const combinedPrefixes = Array.from(
    new Set([
      ...assetPrefixes.map((prefix) => normalizeAssetPrefix(prefix)),
      ...metadataPrefixes,
    ].filter(Boolean)),
  )

  console.log(`[static-pipeline] Verifying CloudFront assets at ${url}`)

  await verifyClientAssets({
    baseUrl: url,
    assetPathPrefixes: combinedPrefixes,
    retries,
    retryDelayMs,
    logger: console,
  })
}

export async function runStaticPipeline(options = {}) {
  if (options.environment) {
    const normalizedEnv = normalizeString(options.environment)
    if (normalizedEnv) {
      process.env.STAGE_NAME = normalizedEnv
      process.env.DEPLOYMENT_ENVIRONMENT = normalizedEnv
    }
  }

  applyStageEnvironment({ propagateToProcessEnv: true, propagateViteEnv: true })

  const stackName = await resolvePipelineStackName(options)
  const effectiveOptions = stackName ? { ...options, stackName } : { ...options }

  if (stackName && !options.stackName) {
    effectiveOptions.stackName = stackName
    console.log(`[static-pipeline] Using stack ${stackName} from environment/metadata.`)
  }

  const plan = buildStaticPipelinePlan(effectiveOptions)

  for (const step of plan) {
    console.log(`\n[static-pipeline] Starting: ${step.label}`)
    if (step.type === 'cloudfront-verify') {
      await verifyCloudfrontDistribution({
        explicitUrl: effectiveOptions.cloudfrontUrl,
        assetPrefixes: effectiveOptions.assetPrefixes,
        retries: effectiveOptions.cloudfrontRetries,
        retryDelayMs: effectiveOptions.cloudfrontRetryDelayMs,
      })
    } else {
      await runCommandStep(step)
    }
    console.log(`[static-pipeline] Completed: ${step.label}`)
  }

  console.log('\n[static-pipeline] Static asset pipeline finished successfully.')
}

async function main() {
  const options = parseStaticPipelineArgs(process.argv.slice(2))
  await runStaticPipeline(options)
}

const isCli = (() => {
  if (!process.argv?.[1]) {
    return false
  }
  try {
    return path.resolve(process.argv[1]) === __filename
  } catch (error) {
    return false
  }
})()

if (isCli) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
