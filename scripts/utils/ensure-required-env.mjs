const DEFAULT_REQUIRED_ENV_VARS = Object.freeze([
  'S3_BUCKET',
  'GEMINI_API_KEY',
  'CLOUDFRONT_ORIGINS',
])

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function ensureRequiredEnvVars({
  required = DEFAULT_REQUIRED_ENV_VARS,
  context = 'this operation',
} = {}) {
  const missing = []

  for (const name of required) {
    if (!hasValue(process.env[name])) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    const formattedList = missing.join(', ')
    throw new Error(
      `Missing required environment variables (${formattedList}). ` +
        `Set them before running ${context}.`
    )
  }
}

export default ensureRequiredEnvVars
