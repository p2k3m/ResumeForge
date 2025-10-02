#!/usr/bin/env node
import { CloudFormationClient, DescribeStacksCommand, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import fs from 'fs/promises'
import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

async function main() {
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

  if (
    previous?.distributionId &&
    (previous.distributionId !== distributionId || urlChanged)
  ) {
    const callerReference = `resumeforge-${Date.now()}`
    console.log(
      urlChanged
        ? `Domain changed from ${previous.url} to ${urlOutput.OutputValue}; invalidating previous CloudFront distribution ${previous.distributionId} (/*)`
        : `Invalidating previous CloudFront distribution ${previous.distributionId} (/*)`
    )
    try {
      await cloudFront.send(
        new CreateInvalidationCommand({
          DistributionId: previous.distributionId,
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
          `Skipping invalidation; distribution ${previous.distributionId} no longer exists.`
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
  await fs.writeFile(publishFile, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`Published CloudFront URL: ${payload.url}`)
  console.log(`Distribution ${distributionId} is now the active entry point.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
