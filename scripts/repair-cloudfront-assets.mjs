#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function printUsage() {
  console.log(`Usage: npm run repair:cloudfront -- --stack <stack-name> [options]\n\n` +
    'Options:\n' +
    '  --stack <stack-name>        SAM stack name that owns the CloudFront distribution (required).\n' +
    '  --skip-build                Skip rebuilding the client bundle (assumes client/dist is current).\n' +
    '  --skip-upload               Skip uploading static assets to S3.\n' +
    '  --skip-publish              Skip publishing the CloudFront metadata / issuing invalidations.\n' +
    '  --skip-verify               Skip running the CloudFront verification step.\n')
}

function parseArguments(argv) {
  const args = [...argv]
  let stackName = ''
  let skipBuild = false
  let skipUpload = false
  let skipPublish = false
  let skipVerify = false

  while (args.length > 0) {
    const token = args.shift()
    if (!token) {
      continue
    }

    switch (token) {
      case '--stack': {
        const value = args.shift()
        if (!value) {
          throw new Error('Missing value for --stack.')
        }
        stackName = value
        break
      }
      case '--skip-build':
        skipBuild = true
        break
      case '--skip-upload':
        skipUpload = true
        break
      case '--skip-publish':
        skipPublish = true
        break
      case '--skip-verify':
        skipVerify = true
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  if (!stackName) {
    throw new Error('The --stack option is required.')
  }

  return { stackName, skipBuild, skipUpload, skipPublish, skipVerify }
}

function runStep({ command, args = [], label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('close', (code, signal) => {
      if (typeof code === 'number' && code === 0) {
        resolve()
        return
      }

      if (signal) {
        reject(new Error(`${label ?? command} exited due to signal ${signal}`))
        return
      }

      reject(new Error(`${label ?? command} exited with code ${code}`))
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))

    const steps = []

    if (!options.skipBuild) {
      steps.push({
        label: 'Build client',
        command: 'node',
        args: [path.join(projectRoot, 'scripts', 'build-client.mjs')],
      })
    }

    if (!options.skipUpload) {
      steps.push({
        label: 'Upload static assets',
        command: 'node',
        args: [path.join(projectRoot, 'scripts', 'upload-static-build.mjs')],
      })
    }

    if (!options.skipPublish) {
      steps.push({
        label: 'Publish CloudFront URL',
        command: 'node',
        args: [
          path.join(projectRoot, 'scripts', 'publish-cloudfront-url.mjs'),
          options.stackName,
        ],
      })
    }

    if (!options.skipVerify) {
      steps.push({
        label: 'Verify CloudFront distribution',
        command: 'node',
        args: [path.join(projectRoot, 'scripts', 'verify-cloudfront.mjs')],
      })
    }

    if (steps.length === 0) {
      console.log('No steps to execute. All actions were skipped.')
      return
    }

    for (const step of steps) {
      const label = step.label ?? `${step.command} ${step.args.join(' ')}`
      console.log(`\n[repair-cloudfront] Starting: ${label}`)
      await runStep(step)
      console.log(`[repair-cloudfront] Completed: ${label}`)
    }

    console.log('\nCloudFront asset repair workflow finished successfully.')
  } catch (error) {
    if (error?.message) {
      console.error(error.message)
    } else {
      console.error(error)
    }
    if (process.exitCode === undefined) {
      process.exitCode = 1
    }
  }
}

main()
