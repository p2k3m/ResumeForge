#!/usr/bin/env node
import { CloudFormationClient, DescribeStacksCommand, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation'
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetDistributionConfigCommand,
} from '@aws-sdk/client-cloudfront'
import fs from 'fs/promises'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'
import { ensureRequiredEnvVars } from './utils/ensure-required-env.mjs'

async function main() {
  ensureRequiredEnvVars({ context: 'the CloudFront URL publication workflow' })

  const [, , stackName] = process.argv
  if (!stackName) {
    console.error('Usage: npm run publish:cloudfront-url -- <stack-name>')
    process.exitCode = 1
    return
  }

  const cloudFormation = new CloudFormationClient({})
  const cloudFront = new CloudFrontClient({})

  const stackResponse = await cloudFormation.send(
    new DescribeStacksCommand({ StackName: stackName })
  )
  const [stack] = stackResponse.Stacks || []
  if (!stack) {
    console.error(`Stack "${stackName}" not found.`)
    process.exitCode = 1
    return
  }

  const outputs = stack.Outputs || []
  const urlOutput =
    outputs.find((output) => output.OutputKey === 'AppBaseUrl') ||
    outputs.find((output) => output.OutputKey === 'CloudFrontUrl')
  const apiGatewayOutput = outputs.find((output) => output.OutputKey === 'ApiBaseUrl')
  if (!urlOutput?.OutputValue) {
    console.error(
      'Stack is missing an AppBaseUrl/CloudFrontUrl output. Deploy using the provided SAM template.'
    )
    process.exitCode = 1
    return
  }

  const resource = await cloudFormation.send(
    new DescribeStackResourceCommand({
      StackName: stackName,
      LogicalResourceId: 'ResumeForgeDistribution'
    })
  )
  const distributionId = resource?.StackResourceDetail?.PhysicalResourceId
  if (!distributionId) {
    console.error(
      'Unable to resolve the CloudFront distribution id from the stack. Ensure ResumeForgeDistribution exists.'
    )
    process.exitCode = 1
    return
  }

  const publishFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'config',
    'published-cloudfront.json'
  )

  let previous = null
  try {
    const previousText = await fs.readFile(publishFile, 'utf8')
    previous = JSON.parse(previousText)
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      throw err
    }
  }

  const urlChanged = previous?.url && previous.url !== urlOutput.OutputValue
  const previousDistributionId = previous?.distributionId
  const distributionChanged =
    previousDistributionId && previousDistributionId !== distributionId

  const distributionIdsToInvalidate = new Set()
  if (previousDistributionId) {
    distributionIdsToInvalidate.add(previousDistributionId)
  }
  distributionIdsToInvalidate.add(distributionId)

  const throttlingErrors = new Set(['Throttling', 'ThrottlingException', 'TooManyRequestsException'])

  async function sendWithRetry(command, { attempts = 5, baseDelayMs = 500 } = {}) {
    let attempt = 0
    for (;;) {
      try {
        return await cloudFront.send(command)
      } catch (err) {
        const isThrottled =
          throttlingErrors.has(err?.name) || throttlingErrors.has(err?.Code) || err?.$retryable?.throttling

        if (!isThrottled || attempt + 1 >= attempts) {
          throw err
        }

        const delay = Math.min(baseDelayMs * 2 ** attempt + Math.random() * 100, 10_000)
        attempt += 1
        console.warn(
          `Throttled by CloudFront while creating invalidation (attempt ${attempt} of ${attempts}); retrying in ${Math.round(delay)}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  for (const targetDistributionId of distributionIdsToInvalidate) {
    const callerReference = `resumeforge-${Date.now()}-${targetDistributionId}`
    const isPrevious = targetDistributionId === previousDistributionId
    const isCurrent = targetDistributionId === distributionId

    let message = `Invalidating CloudFront distribution ${targetDistributionId} (/*)`

    if (isPrevious && distributionChanged) {
      message = urlChanged
        ? `Domain changed from ${previous.url} to ${urlOutput.OutputValue}; invalidating previous CloudFront distribution ${targetDistributionId} (/*)`
        : `Invalidating previous CloudFront distribution ${targetDistributionId} (/*)`
    } else if (isCurrent) {
      message = urlChanged
        ? `Domain changed from ${previous?.url ?? 'unpublished'} to ${urlOutput.OutputValue}; invalidating active CloudFront distribution ${targetDistributionId} for cache busting (/*)`
        : `Invalidating active CloudFront distribution ${targetDistributionId} for cache busting (/*)`
    }

    console.log(message)

    try {
      await sendWithRetry(
        new CreateInvalidationCommand({
          DistributionId: targetDistributionId,
          InvalidationBatch: {
            CallerReference: callerReference,
            Paths: {
              Quantity: 1,
              Items: ['/*']
            }
          }
        })
      )
    } catch (err) {
      if (err?.name === 'NoSuchDistribution' || err?.Code === 'NoSuchDistribution') {
        console.warn(
          `Skipping invalidation; distribution ${targetDistributionId} no longer exists.`
        )
      } else {
        throw err
      }
    }
  }

  await fs.mkdir(path.dirname(publishFile), { recursive: true })
  let originDetails = null
  try {
    originDetails = await resolveDistributionOrigin({
      cloudFront,
      distributionId,
    })
  } catch (err) {
    console.warn(
      'Unable to resolve CloudFront origin configuration from the distribution; falling back to environment metadata.',
      err?.message ? `(${err.message})` : ''
    )
  }

  const payload = {
    stackName,
    url: urlOutput.OutputValue,
    distributionId,
    updatedAt: new Date().toISOString(),
    degraded: false
  }

  if (apiGatewayOutput?.OutputValue) {
    payload.apiGatewayUrl = apiGatewayOutput.OutputValue
  }

  const originBucket = selectOriginBucket({ originDetails, previous })
  if (originBucket) {
    payload.originBucket = originBucket
  }

  const originRegion = selectOriginRegion({ originDetails, previous })
  if (originRegion) {
    payload.originRegion = originRegion
  }

  const originPath = selectOriginPath({ originDetails, previous, hasOriginBucket: Boolean(payload.originBucket) })
  if (originPath) {
    payload.originPath = originPath
  }
  await fs.writeFile(publishFile, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Published CloudFront URL: ${payload.url}`)
  console.log(`Distribution ${distributionId} is now the active entry point.`)
  if (payload.apiGatewayUrl) {
    console.log(`Recorded API Gateway fallback URL: ${payload.apiGatewayUrl}`)
  }
  if (payload.originBucket) {
    console.log(`Recorded CloudFront origin bucket: ${payload.originBucket}`)
  }
  if (payload.originRegion) {
    console.log(`Recorded CloudFront origin region: ${payload.originRegion}`)
  }
  if (payload.originPath) {
    console.log(`Recorded CloudFront origin path: ${payload.originPath}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
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
  if (!candidate) {
    return ''
  }

  return candidate
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
