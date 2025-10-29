import path from 'node:path'
import process from 'node:process'

export const DEFAULT_WATCH_GLOBS = Object.freeze([
  'client/src/**/*',
  'client/public/**/*',
  'client/index.html',
  'client/vite.config.js',
  'client/package.json',
])

export const DEFAULT_DEBOUNCE_MS = 1500

export function parseInteger(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return parsed
}

export function parseWatchArguments(rawArgs = [], env = process.env) {
  const args = Array.isArray(rawArgs) ? [...rawArgs] : []
  let stackName =
    (typeof env?.RESUMEFORGE_STACK_NAME === 'string' && env.RESUMEFORGE_STACK_NAME.trim()) ||
    (typeof env?.STACK_NAME === 'string' && env.STACK_NAME.trim()) ||
    ''

  const parsed = {
    stackName: '',
    skipInitial: false,
    debounceMs: parseInteger(env?.CLOUDFRONT_WATCH_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS),
    additionalWatch: [],
    forwardArgs: [],
  }

  while (args.length > 0) {
    const token = args.shift()
    if (!token) {
      continue
    }

    if (token === '--') {
      parsed.forwardArgs.push(...args)
      args.length = 0
      break
    }

    switch (token) {
      case '--stack': {
        const value = args.shift()
        if (!value) {
          throw new Error('Missing value for --stack')
        }
        stackName = value
        break
      }
      case '--skip-initial':
        parsed.skipInitial = true
        break
      case '--watch': {
        const value = args.shift()
        if (!value) {
          throw new Error('Missing value for --watch')
        }
        parsed.additionalWatch.push(value)
        break
      }
      case '--debounce': {
        const value = args.shift()
        if (!value) {
          throw new Error('Missing value for --debounce')
        }
        const parsedValue = Number.parseInt(value, 10)
        if (!Number.isFinite(parsedValue) || parsedValue < 0) {
          throw new Error('The --debounce option requires a non-negative integer value')
        }
        parsed.debounceMs = parsedValue
        break
      }
      default:
        parsed.forwardArgs.push(token)
        break
    }
  }

  if (!stackName) {
    throw new Error(
      'Set RESUMEFORGE_STACK_NAME or pass --stack <stack-name> to watch-cloudfront-assets so the publish step knows which stack to update.',
    )
  }

  parsed.stackName = stackName

  return parsed
}

export function uniqueStrings(values) {
  const seen = new Set()
  const results = []
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    results.push(trimmed)
  }
  return results
}

export function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) {
    return ''
  }
  const normalized = relativePath.replace(/\\/g, '/').split(path.sep).join('/')
  return normalized.replace(/^\.\/+/, '')
}

export function formatChangeSummary(changedFiles, reasons) {
  if (!Array.isArray(changedFiles) || !Array.isArray(reasons)) {
    return 'code change'
  }

  if (changedFiles.length === 0 && reasons.length === 0) {
    return 'code change'
  }

  const parts = []
  if (reasons.includes('initial')) {
    parts.push('initial run')
  }
  if (changedFiles.length === 1) {
    parts.push(changedFiles[0])
  } else if (changedFiles.length > 1) {
    parts.push(`${changedFiles.length} files`)
  }

  if (parts.length === 0) {
    return 'code change'
  }

  return parts.join(', ')
}
