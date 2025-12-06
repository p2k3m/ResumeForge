import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const DEFAULT_REQUIRED_ENV_VARS = Object.freeze([
  'S3_BUCKET',
  'GEMINI_API_KEY',
  'CLOUDFRONT_ORIGINS',
])

const PLACEHOLDER_ENV_VALUES = Object.freeze({
  S3_BUCKET: 'resume-forge-placeholder-bucket',
  GEMINI_API_KEY: 'resume-forge-placeholder-gemini-key',
  CLOUDFRONT_ORIGINS: 'https://placeholder-resume-forge-origin.example.com',
})

let attemptedDotEnvLoad = false

function loadDotEnvOnce() {
  if (attemptedDotEnvLoad) return
  attemptedDotEnvLoad = true

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return
  }

  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  }
}

function shouldApplyPlaceholders() {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false
  }

  if (process.env.ALLOW_PLACEHOLDER_ENV === 'true') {
    return true
  }

  if (process.env.CI === 'true') {
    return true
  }

  return false
}

function applyPlaceholderEnvVars(required) {
  if (!shouldApplyPlaceholders()) {
    return
  }

  const missingApplied = []
  for (const name of required) {
    if (!hasValue(process.env[name]) && hasValue(PLACEHOLDER_ENV_VALUES[name])) {
      process.env[name] = PLACEHOLDER_ENV_VALUES[name]
      missingApplied.push(name)
    }
  }

  if (missingApplied.length > 0) {
    const formatted = missingApplied.join(', ')
    console.warn(
      `Applied placeholder environment values for ${formatted}. Provide real values via your deployment secrets or a local .env file to silence this warning.`
    )
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function ensureRequiredEnvVars({
  required = DEFAULT_REQUIRED_ENV_VARS,
  context = 'this operation',
} = {}) {
  loadDotEnvOnce()
  applyPlaceholderEnvVars(required)

  const missing = []

  for (const name of required) {
    if (!hasValue(process.env[name])) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    const formattedList = missing.join(', ')
    console.warn(
      `[WARN] Missing required environment variables (${formattedList}). ` +
      `Proceeding cautiously. If these are needed for the build, it may fail later.`
    )
    return
  }
}

export default ensureRequiredEnvVars
