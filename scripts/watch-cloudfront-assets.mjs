#!/usr/bin/env node
import chokidar from 'chokidar'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_WATCH_GLOBS,
  formatChangeSummary,
  normalizeRelativePath,
  parseInteger,
  parseWatchArguments,
  uniqueStrings,
} from './watch-cloudfront-shared.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const repairScriptPath = path.join(projectRoot, 'scripts', 'repair-cloudfront-assets.mjs')

async function main(rawArgs = process.argv.slice(2), env = process.env) {
  const options = parseWatchArguments(rawArgs, env)
  const debounceMs = parseInteger(options.debounceMs, DEFAULT_DEBOUNCE_MS)

  const watchGlobs = uniqueStrings([...DEFAULT_WATCH_GLOBS, ...options.additionalWatch])
  if (watchGlobs.length === 0) {
    console.error('[watch-cloudfront] No watch targets were provided. Exiting.')
    process.exitCode = 1
    return
  }

  console.log('[watch-cloudfront] Watching for frontend changes:')
  for (const glob of watchGlobs) {
    console.log(`  • ${glob}`)
  }

  let isRunning = false
  let pendingLaunch = false
  const pendingFiles = new Set()
  const pendingReasons = new Set()
  let debounceTimer = null

  function requestRun({ filePath, reason }) {
    if (filePath) {
      pendingFiles.add(normalizeRelativePath(filePath))
    }
    if (reason) {
      pendingReasons.add(reason)
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (isRunning) {
        pendingLaunch = true
        return
      }
      triggerRun()
    }, debounceMs)
  }

  function triggerRun() {
    if (isRunning) {
      pendingLaunch = true
      return
    }

    const changedFiles = Array.from(pendingFiles)
    pendingFiles.clear()

    const reasons = Array.from(pendingReasons)
    pendingReasons.clear()

    const summary = formatChangeSummary(changedFiles, reasons)
    console.log(`[watch-cloudfront] Triggering CloudFront asset workflow (${summary})`)

    isRunning = true
    pendingLaunch = false

    const args = [repairScriptPath, '--stack', options.stackName, ...options.forwardArgs]
    const child = spawn('node', args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('close', (code, signal) => {
      isRunning = false
      if (typeof code === 'number' && code !== 0) {
        console.error(`[watch-cloudfront] Asset workflow exited with code ${code}`)
      } else if (signal) {
        console.error(`[watch-cloudfront] Asset workflow terminated due to signal ${signal}`)
      } else {
        console.log('[watch-cloudfront] Asset workflow completed successfully')
      }

      if (pendingFiles.size > 0 || pendingReasons.size > 0 || pendingLaunch) {
        pendingLaunch = false
        triggerRun()
      }
    })

    child.on('error', (error) => {
      isRunning = false
      console.error(`[watch-cloudfront] Failed to start asset workflow: ${error?.message || error}`)
    })
  }

  const watcher = chokidar.watch(watchGlobs, {
    cwd: projectRoot,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.idea/**',
      '**/.vscode/**',
      '**/.cache/**',
      'client/dist/**',
      'dist/**',
      '**/*.swp',
      '**/*~',
    ],
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 100,
    },
    persistent: true,
  })

  watcher.on('all', (eventName, filePath) => {
    if (!filePath) {
      return
    }
    const relative = normalizeRelativePath(filePath)
    console.log(`[watch-cloudfront] ${eventName} detected: ${relative}`)
    requestRun({ filePath: relative })
  })

  watcher.on('error', (error) => {
    console.error(`[watch-cloudfront] Watcher error: ${error?.message || error}`)
  })

  watcher.on('ready', () => {
    console.log('[watch-cloudfront] Watcher initialised')
    if (!options.skipInitial) {
      requestRun({ reason: 'initial' })
    }
  })

  const shutdown = async (signal) => {
    console.log(`[watch-cloudfront] Caught ${signal}. Shutting down watcher...`)
    try {
      await watcher.close()
    } catch (error) {
      console.error(`[watch-cloudfront] Error shutting down watcher: ${error?.message || error}`)
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    process.exit(0)
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

const invokedDirectly =
  typeof process?.argv?.[1] === 'string' &&
  path.resolve(process.argv[1]) === __filename

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}

export default main
