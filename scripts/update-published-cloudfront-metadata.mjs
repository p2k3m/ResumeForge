#!/usr/bin/env node
import { CloudFormationClient, DescribeStacksCommand, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation'
import { CloudFrontClient, GetDistributionConfigCommand } from '@aws-sdk/client-cloudfront'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

function resolveScriptDirectory() {
  const __filename = fileURLToPath(import.meta.url)
  return path.dirname(__filename)
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseArguments(argv = process.argv.slice(2), env = process.env) {
  const args = Array.isArray(argv) ? [...argv] : []
  let stackName =
    (typeof env.RESUMEFORGE_STACK_NAME === 'string' && env.RESUMEFORGE_STACK_NAME.trim()) ||
    (typeof env.STACK_NAME === 'string' && env.STACK_NAME.trim()) ||
    ''

  while (args.length > 0) {
    const token = args.shift()
    if (!token) {
      continue
    }

    switch (token) {
      case '--stack': {
        const value = args.shift()
        if (!hasValue(value)) {
          throw new Error('Missing value for --stack.')
        }
        stackName = value.trim()
        break
      }
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        console.warn(`Unrecognised argument "${token}". Use --help to view supported options.`)
        break
    }
  }

  return { stackName }
}

function printUsage() {
  console.log('Usage: node scripts/update-published-cloudfront-metadata.mjs [--stack <stack-name>]')
  console.log('  --stack <stack-name>  CloudFormation stack that owns the CloudFront distribution.')
}

async function loadPreviousMetadata(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    if (!raw.trim()) {
      return null
    }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function resolveStackOutputs({ cloudFormation, stackName }) {
  const response = await cloudFormation.send(new DescribeStacksCommand({ StackName: stackName }))
  const [stack] = response.Stacks || []
  if (!stack) {
    throw new Error(`Stack "${stackName}" not found.`)
  }

  const outputs = stack.Outputs || []
  const urlOutput =
    outputs.find((output) => output.OutputKey === 'AppBaseUrl') ||
    outputs.find((output) => output.OutputKey === 'CloudFrontUrl')
  const apiGatewayOutput = outputs.find((output) => output.OutputKey === 'ApiBaseUrl')

  if (!hasValue(urlOutput?.OutputValue)) {
    throw new Error(
      'Stack is missing an AppBaseUrl/CloudFrontUrl output. Deploy using the provided SAM template.'
    )
  }

  const stackOutputs = {
    url: urlOutput.OutputValue.trim(),
  }

  if (hasValue(apiGatewayOutput?.OutputValue)) {
    stackOutputs.apiGatewayUrl = apiGatewayOutput.OutputValue.trim()
  }

  return stackOutputs
}

async function resolveDistributionId({ cloudFormation, stackName }) {
  const resource = await cloudFormation.send(
    new DescribeStackResourceCommand({
      StackName: stackName,
      LogicalResourceId: 'ResumeForgeDistribution',
    })
  )
  const distributionId = resource?.StackResourceDetail?.PhysicalResourceId
  if (!hasValue(distributionId)) {
    throw new Error(
      'Unable to resolve the CloudFront distribution id from the stack. Ensure ResumeForgeDistribution exists.'
    )
  }
  return distributionId.trim()
}

function normalizeOriginPath(pathValue) {
  if (!hasValue(pathValue)) {
    return '/' 
  }

  const trimmed = pathValue.trim().replace(/\/+$/, '')
  const withoutLeading = trimmed.replace(/^\/+/, '')
  if (!withoutLeading) {
    return '/'
  }

  return `/${withoutLeading}`
}

function resolveS3RegionFromDomain(domainName) {
  if (!hasValue(domainName)) {
    return ''
  }

  const trimmed = domainName.trim().toLowerCase()
  const suffixMatch = trimmed.match(/\.s3[.-](?<suffix>[a-z0-9.-]+)\.amazonaws\.com$/i)
  if (!suffixMatch?.groups?.suffix) {
    return ''
  }

  let suffix = suffixMatch.groups.suffix.toLowerCase()

  const sanitizers = [
    /^dualstack[.-]/,
    /^website[.-]/,
    /^accelerate[.-]/,
    /^fips[.-]/,
    /^s3-website[.-]/,
  ]

  for (const sanitizer of sanitizers) {
    suffix = suffix.replace(sanitizer, '')
  }

  if (!suffix) {
    return ''
  }

  const parts = suffix.split('.').filter(Boolean)
  if (parts.length === 0) {
    return ''
  }

  const candidate = parts[parts.length - 1]
  return candidate || ''
}

function deriveS3OriginDetails(domainName) {
  if (!hasValue(domainName)) {
    return null
  }

  const trimmed = domainName.trim()
  const s3Match = trimmed.match(
    /^(?<bucket>[a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\.s3(?:[.-][a-z0-9.-]+)?\.amazonaws\.com$/i
  )

  if (s3Match?.groups?.bucket) {
    const region = resolveS3RegionFromDomain(trimmed)
    return {
      bucket: s3Match.groups.bucket,
      region: region || 'us-east-1',
    }
  }

  if (!trimmed.includes('.')) {
    return {
      bucket: trimmed,
      region: '',
    }
  }

  return null
}

async function resolveDistributionOrigin({ cloudFront, distributionId }) {
  if (!cloudFront || !hasValue(distributionId)) {
    return null
  }

  const response = await cloudFront.send(
    new GetDistributionConfigCommand({ Id: distributionId })
  )

  const origins = response?.DistributionConfig?.Origins?.Items || []
  if (!origins.length) {
    return null
  }

  const candidates = [
    ...origins.filter((origin) => origin?.S3OriginConfig),
    ...origins.filter((origin) => !origin?.S3OriginConfig),
  ]

  for (const origin of candidates) {
    const details = deriveS3OriginDetails(origin?.DomainName)
    if (!details?.bucket) {
      continue
    }

    const path = normalizeOriginPath(origin?.OriginPath)
    return {
      bucket: details.bucket,
      region: details.region,
      path,
    }
  }

  return null
}

function sanitizeBucketCandidate(value) {
  if (!hasValue(value)) {
    return ''
  }

  let trimmed = value.trim()
  if (trimmed.toLowerCase().startsWith('s3://')) {
    trimmed = trimmed.slice(5)
  }

  trimmed = trimmed.replace(/^\/+/, '')
  if (!trimmed) {
    return ''
  }

  const bucket = trimmed.split(/[\/]/, 1)[0]
  return bucket || ''
}

function selectOriginBucket({ originDetails, previous }) {
  if (originDetails?.bucket) {
    return originDetails.bucket
  }

  const envCandidates = [
    process.env.STATIC_ASSETS_BUCKET,
    process.env.DATA_BUCKET,
    process.env.S3_BUCKET,
  ]

  for (const candidate of envCandidates) {
    const sanitized = sanitizeBucketCandidate(candidate)
    if (sanitized) {
      return sanitized
    }
  }

  const previousBucket = sanitizeBucketCandidate(previous?.originBucket)
  if (previousBucket) {
    return previousBucket
  }

  return ''
}

function sanitizeRegionCandidate(value) {
  if (!hasValue(value)) {
    return ''
  }

  return value.trim().toLowerCase()
}

function selectOriginRegion({ originDetails, previous }) {
  const originRegion = sanitizeRegionCandidate(originDetails?.region)
  if (originRegion) {
    return originRegion
  }

  const envCandidates = [
    process.env.STATIC_ASSETS_REGION,
    process.env.AWS_REGION,
    process.env.AWS_DEFAULT_REGION,
  ]

  for (const candidate of envCandidates) {
    const sanitized = sanitizeRegionCandidate(candidate)
    if (sanitized) {
      return sanitized
    }
  }

  const previousRegion = sanitizeRegionCandidate(previous?.originRegion)
  if (previousRegion) {
    return previousRegion
  }

  return ''
}

function selectOriginPath({ originDetails, previous, hasOriginBucket }) {
  if (originDetails?.path) {
    return originDetails.path
  }

  if (hasOriginBucket) {
    if (hasValue(previous?.originPath)) {
      return normalizeOriginPath(previous.originPath)
    }
    return '/'
  }

  return ''
}

async function writePublishedMetadata({ filePath, payload }) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  try {
    const { stackName } = parseArguments()
    if (!hasValue(stackName)) {
      console.log('[update-published-cloudfront] No stack name provided; skipping metadata refresh.')
      return
    }

    const scriptDir = resolveScriptDirectory()
    const projectRoot = path.resolve(scriptDir, '..')
    const publishFile = path.join(projectRoot, 'config', 'published-cloudfront.json')

    const cloudFormation = new CloudFormationClient({})
    const cloudFront = new CloudFrontClient({})

    const previous = await loadPreviousMetadata(publishFile)
    const stackOutputs = await resolveStackOutputs({ cloudFormation, stackName })
    const distributionId = await resolveDistributionId({ cloudFormation, stackName })

    let originDetails = null
    try {
      originDetails = await resolveDistributionOrigin({ cloudFront, distributionId })
    } catch (error) {
      console.warn(
        '[update-published-cloudfront] Unable to resolve CloudFront origin configuration; falling back to previous metadata.',
        error?.message ? `(${error.message})` : ''
      )
    }

    const payload = {
      stackName,
      url: stackOutputs.url,
      distributionId,
      updatedAt: new Date().toISOString(),
      degraded: false,
    }

    if (stackOutputs.apiGatewayUrl) {
      payload.apiGatewayUrl = stackOutputs.apiGatewayUrl
    }

    const originBucket = selectOriginBucket({ originDetails, previous })
    if (originBucket) {
      payload.originBucket = originBucket
    }

    const originRegion = selectOriginRegion({ originDetails, previous })
    if (originRegion) {
      payload.originRegion = originRegion
    }

    const originPath = selectOriginPath({
      originDetails,
      previous,
      hasOriginBucket: Boolean(payload.originBucket),
    })
    if (originPath) {
      payload.originPath = originPath
    }

    await writePublishedMetadata({ filePath: publishFile, payload })

    const previousUrl = hasValue(previous?.url) ? previous.url.trim() : null
    if (previousUrl && previousUrl !== payload.url) {
      console.log(
        `[update-published-cloudfront] Updated published domain from ${previousUrl} to ${payload.url}.`
      )
    } else {
      console.log(
        `[update-published-cloudfront] Recorded CloudFront domain ${payload.url} in config/published-cloudfront.json.`
      )
    }
  } catch (error) {
    console.error('[update-published-cloudfront] Failed to refresh metadata:', error?.message || error)
    process.exitCode = 1
  }
}

await main()
