#!/usr/bin/env node
import { CloudFormationClient, DescribeStacksCommand, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
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
  const payload = {
    stackName,
    url: urlOutput.OutputValue,
    distributionId,
    updatedAt: new Date().toISOString()
  }

  if (apiGatewayOutput?.OutputValue) {
    payload.apiGatewayUrl = apiGatewayOutput.OutputValue
  }
  await fs.writeFile(publishFile, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Published CloudFront URL: ${payload.url}`)
  console.log(`Distribution ${distributionId} is now the active entry point.`)
  if (payload.apiGatewayUrl) {
    console.log(`Recorded API Gateway fallback URL: ${payload.apiGatewayUrl}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
