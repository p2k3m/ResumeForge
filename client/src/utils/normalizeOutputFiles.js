const URL_KEYS = ['url', 'fileUrl', 'typeUrl', 'downloadUrl', 'href', 'link', 'signedUrl']
const EXPIRES_AT_KEYS = [
  'expiresAt',
  'expiryAt',
  'expiry',
  'expires_at',
  'expiry_at',
  'expiresISO',
  'expiryISO',
  'expiresAtIso',
  'expiresAtISO',
  'expiryIso',
  'expiryISO'
]
const EXPIRES_IN_KEYS = [
  'expiresInSeconds',
  'expiresIn',
  'expiryInSeconds',
  'expirySeconds',
  'expires_in_seconds',
  'expires_in',
  'expiry_in_seconds',
  'expiry_in'
]
const EXPIRES_EPOCH_KEYS = [
  'expiresAtEpoch',
  'expiryAtEpoch',
  'expiryEpoch',
  'expiresEpoch',
  'expiresAtTimestamp',
  'expiryTimestamp',
  'expiryEpochSeconds',
  'expiresEpochSeconds',
  'expires_at_epoch',
  'expiry_at_epoch'
]
const EXPIRES_MS_KEYS = [
  'expiresAtMs',
  'expiryAtMs',
  'expiryMs',
  'expiresMs',
  'expires_at_ms',
  'expiry_at_ms'
]

function pickFirstString(source = {}, keys = []) {
  for (const key of keys) {
    if (source && typeof source === 'object' && key in source) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }
  return ''
}

function toFiniteNumber(value) {
  if (value == null) return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function normaliseExpiresAt(value) {
  if (!value) return undefined
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  return undefined
}

function resolveEpoch(value) {
  const finite = toFiniteNumber(value)
  if (finite == null) return undefined
  const milliseconds = Math.abs(finite) < 1e12 ? finite * 1000 : finite
  return new Date(milliseconds).toISOString()
}

function resolveExpiresAt(entry, options = {}, visited = new Set()) {
  if (!entry || typeof entry !== 'object') {
    return normaliseExpiresAt(entry)
  }
  if (visited.has(entry)) {
    return undefined
  }
  visited.add(entry)

  const directIso = pickFirstString(entry, EXPIRES_AT_KEYS)
  if (directIso) {
    const normalized = normaliseExpiresAt(directIso)
    if (normalized) {
      return normalized
    }
  }

  for (const key of EXPIRES_MS_KEYS) {
    if (key in entry) {
      const normalized = resolveEpoch(entry[key])
      if (normalized) {
        return normalized
      }
    }
  }

  for (const key of EXPIRES_EPOCH_KEYS) {
    if (key in entry) {
      const normalized = resolveEpoch(entry[key])
      if (normalized) {
        return normalized
      }
    }
  }

  for (const key of EXPIRES_IN_KEYS) {
    if (key in entry) {
      const seconds = toFiniteNumber(entry[key])
      if (seconds != null) {
        return new Date(Date.now() + seconds * 1000).toISOString()
      }
    }
  }

  const nestedSources = [
    entry.download,
    entry.asset,
    entry.document,
    entry.file,
    entry.link,
    entry.payload,
    entry.value
  ]

  nestedSources.push(
    ...(Array.isArray(entry.urls) ? entry.urls : []),
    ...(Array.isArray(entry.links) ? entry.links : [])
  )

  if (entry.urls && typeof entry.urls === 'object') {
    nestedSources.push(...Object.values(entry.urls))
  }

  if (entry.links && typeof entry.links === 'object') {
    nestedSources.push(...Object.values(entry.links))
  }

  for (const nested of nestedSources) {
    if (!nested) continue
    const nestedExpiry = resolveExpiresAt(nested, options, visited)
    if (nestedExpiry) {
      return nestedExpiry
    }
  }

  if (options.defaultExpiresAt) {
    const normalized = normaliseExpiresAt(options.defaultExpiresAt)
    if (normalized) {
      return normalized
    }
  }

  if (options.defaultExpiresInSeconds != null) {
    const seconds = toFiniteNumber(options.defaultExpiresInSeconds)
    if (seconds != null) {
      return new Date(Date.now() + seconds * 1000).toISOString()
    }
  }

  return undefined
}

function isLikelyUrl(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed)
}

function extractUrl(entry, visited = new Set()) {
  if (!entry) return ''
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed && isLikelyUrl(trimmed) ? trimmed : ''
  }
  if (typeof entry !== 'object') {
    return ''
  }
  if (visited.has(entry)) {
    return ''
  }
  visited.add(entry)

  const direct = pickFirstString(entry, URL_KEYS)
  if (direct && isLikelyUrl(direct)) {
    return direct
  }

  const nestedSources = [
    entry.download,
    entry.asset,
    entry.document,
    entry.file,
    entry.payload,
    entry.value
  ]

  nestedSources.push(
    ...(Array.isArray(entry.urls) ? entry.urls : []),
    ...(Array.isArray(entry.links) ? entry.links : [])
  )

  if (entry.urls && typeof entry.urls === 'object') {
    nestedSources.push(...Object.values(entry.urls))
  }

  if (entry.links && typeof entry.links === 'object') {
    nestedSources.push(...Object.values(entry.links))
  }

  for (const nested of nestedSources) {
    if (!nested) continue
    const nestedUrl = extractUrl(nested, visited)
    if (nestedUrl) {
      return nestedUrl
    }
  }

  for (const value of Object.values(entry)) {
    if (typeof value === 'string' && isLikelyUrl(value)) {
      return value.trim()
    }
  }

  return ''
}

function deriveType(entry = {}, fallbackType = '', index = 0) {
  const candidates = [entry.type, entry.name, entry.label, fallbackType]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return `file_${index + 1}`
}

function normaliseOutputFileEntry(entry, index = 0, fallbackType = '', options = {}) {
  if (!entry) return null
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (!trimmed) return null
    return {
      type: fallbackType || `file_${index + 1}`,
      url: trimmed,
    }
  }
  if (typeof entry !== 'object') {
    return null
  }

  const url = extractUrl(entry)
  if (!url) {
    return null
  }

  const normalized = {
    ...entry,
    url,
  }

  const expiresAt = resolveExpiresAt(entry, options)
  if (expiresAt) {
    normalized.expiresAt = expiresAt
  } else if ('expiresAt' in normalized) {
    delete normalized.expiresAt
  }

  if (typeof normalized.text !== 'string' && typeof entry?.download?.text === 'string') {
    normalized.text = entry.download.text
  }

  normalized.type = deriveType(entry, fallbackType, index)

  return normalized
}

export function normalizeOutputFiles(rawInput, options = {}) {
  if (!rawInput) {
    return []
  }

  const normalized = []

  if (Array.isArray(rawInput)) {
    rawInput.forEach((entry, index) => {
      const normalizedEntry = normaliseOutputFileEntry(entry, index, '', options)
      if (normalizedEntry) {
        normalized.push(normalizedEntry)
      }
    })
    return normalized
  }

  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim()
    if (!trimmed) return []
    return [
      {
        type: 'file_1',
        url: trimmed,
      },
    ]
  }

  if (typeof rawInput === 'object') {
    Object.entries(rawInput).forEach(([key, value], index) => {
      const normalizedEntry = normaliseOutputFileEntry(value, index, key, options)
      if (normalizedEntry) {
        if (!normalizedEntry.type && typeof key === 'string' && key.trim()) {
          normalizedEntry.type = key.trim()
        }
        normalized.push(normalizedEntry)
      }
    })
  }

  return normalized
}

export default normalizeOutputFiles
