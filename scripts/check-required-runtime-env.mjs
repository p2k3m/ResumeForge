#!/usr/bin/env node
import process from 'process'

const DEFAULT_REQUIRED_ENV_VARS = Object.freeze(['GEMINI_API_KEY'])

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseRequiredEnvList(value) {
  if (!hasValue(value)) {
    return []
  }
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function main() {
  const requiredEnvVars = parseRequiredEnvList(process.env.REQUIRED_RUNTIME_ENV_VARS)
  const required = requiredEnvVars.length ? requiredEnvVars : DEFAULT_REQUIRED_ENV_VARS

  const missing = new Set()
  for (const name of required) {
    if (!hasValue(process.env[name])) {
      missing.add(name)
    }
  }

  if (missing.size === 0) {
    console.log('All required runtime environment variables are present in the environment.')
    return
  }

  throw new Error(
    `Missing required runtime environment variables: ${Array.from(missing).join(', ')}. ` +
      'Set these variables in your environment (for example via GitHub repository secrets) before deploying.'
  )
}

main().catch((err) => {
  if (err) {
    console.error(err.message || err)
  }
  process.exitCode = 1
})
