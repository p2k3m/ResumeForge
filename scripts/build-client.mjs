import { existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyStageEnvironment } from '../config/stage.js'
import { uploadHashedIndexAssets } from './upload-hashed-assets.mjs'

function parseBooleanEnv(value, { defaultValue = false } = {}) {
  if (typeof value === 'undefined' || value === null) {
    return defaultValue
  }

  const normalized = String(value).trim().toLowerCase()
  if (!normalized) {
    return defaultValue
  }

  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) {
    return false
  }

  return defaultValue
}

function hasAwsCredentialHints() {
  const candidateKeys = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
    'AWS_PROFILE',
    'AWS_DEFAULT_PROFILE',
    'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
    'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  ]

  return candidateKeys.some((key) => {
    const value = process.env[key]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function shouldUploadHashedAssetsDuringBuild() {
  if (parseBooleanEnv(process.env.FORCE_HASHED_ASSET_UPLOAD)) {
    return true
  }

  if (parseBooleanEnv(process.env.FORCE_HASHED_INDEX_UPLOAD)) {
    return true
  }

  if (parseBooleanEnv(process.env.SKIP_HASHED_ASSET_UPLOAD)) {
    return false
  }

  if (parseBooleanEnv(process.env.SKIP_HASHED_INDEX_UPLOAD)) {
    return false
  }

  if (parseBooleanEnv(process.env.SKIP_HASHED_UPLOAD)) {
    return false
  }

  return hasAwsCredentialHints()
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientDir = path.join(__dirname, '..', 'client')
const clientNodeModules = path.join(clientDir, 'node_modules')

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

function hasDependency(relativePath) {
  return existsSync(path.join(clientNodeModules, relativePath))
}

function runCommand(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options })
  } catch (error) {
    const commandLabel = options.cwd ? `${command} (cwd: ${options.cwd})` : command
    const wrappedError = new Error(`Failed to execute: ${commandLabel}`)
    wrappedError.cause = error
    throw wrappedError
  }
}

function installClientDependencies() {
  const installCommand = 'npm install --include=dev --no-fund --no-audit'
  runCommand(installCommand, { cwd: clientDir })
}

function ensureClientDependencies() {
  const needsInstall =
    !hasDependency('vite') ||
    !hasDependency('@fontsource-variable/inter/wght.css') ||
    !hasDependency('@fontsource-variable/inter/wght-italic.css') ||
    !hasDependency('@fontsource/jetbrains-mono/400.css') ||
    !hasDependency('@fontsource/jetbrains-mono/500.css') ||
    !hasDependency('@fontsource/jetbrains-mono/700.css')

  if (needsInstall) {
    installClientDependencies()
  }
}

function buildClient() {
  applyStageEnvironment({ propagateToProcessEnv: true, propagateViteEnv: true })
  runCommand('npm run build', { cwd: clientDir, env: process.env })
}

async function main() {
  ensureDir(clientNodeModules)
  ensureClientDependencies()
  buildClient()
  if (shouldUploadHashedAssetsDuringBuild()) {
    await uploadHashedIndexAssets()
  } else {
    console.warn(
      '[build-client] Skipping hashed asset upload (AWS credentials not detected). ' +
        'Set FORCE_HASHED_ASSET_UPLOAD=true to override.',
    )
  }
}

await main()
