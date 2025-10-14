import { existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  runCommand('npm run build', { cwd: clientDir, env: process.env })
}

ensureDir(clientNodeModules)
ensureClientDependencies()
buildClient()
