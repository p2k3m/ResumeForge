#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const clientDistDir = path.join(projectRoot, 'client', 'dist')

function createValidationError(message) {
  const error = new Error(message)
  error.name = 'ClientBuildValidationError'
  return error
}

async function assertDirectoryPopulated(directory, { label } = {}) {
  let metadata
  try {
    metadata = await stat(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[ensure-client-build] Missing ${label ?? 'required directory'} at ${directory}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }

  if (!metadata.isDirectory()) {
    throw createValidationError(
      `[ensure-client-build] Expected ${directory} to be a directory created by the client build.`,
    )
  }

  const entries = await readdir(directory)
  const visibleEntries = entries.filter((entry) => !entry.startsWith('.'))
  if (visibleEntries.length === 0) {
    throw createValidationError(
      `[ensure-client-build] ${directory} is empty. Confirm "npm run build:client" completed successfully before deploying.`,
    )
  }
}

async function assertFileExists(filePath, { label } = {}) {
  try {
    await access(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createValidationError(
        `[ensure-client-build] Missing ${label ?? 'required file'} at ${filePath}. Run "npm run build:client" before deploying.`,
      )
    }
    throw error
  }
}

async function main() {
  await assertDirectoryPopulated(clientDistDir, { label: 'client build output' })
  await assertFileExists(path.join(clientDistDir, 'index.html'), { label: 'client entry point' })

  const assetsDir = path.join(clientDistDir, 'assets')
  await assertDirectoryPopulated(assetsDir, { label: 'hashed asset bundle' })

  console.log(`[ensure-client-build] Client assets verified in ${clientDistDir}`)
}

main().catch((error) => {
  console.error(error?.message ?? error)
  process.exitCode = 1
})
