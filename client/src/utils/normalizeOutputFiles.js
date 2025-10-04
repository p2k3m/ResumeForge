const URL_KEYS = ['url', 'downloadUrl', 'href', 'link', 'signedUrl']

function pickFirstString(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
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
    return value.trim() || undefined
  }
  return undefined
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

function normaliseOutputFileEntry(entry, index = 0, fallbackType = '') {
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

  const url = pickFirstString(entry, URL_KEYS)
  if (!url) {
    return null
  }

  const normalized = {
    ...entry,
    url,
  }

  const expiresAt = normaliseExpiresAt(entry.expiresAt)
  if (expiresAt) {
    normalized.expiresAt = expiresAt
  } else if ('expiresAt' in normalized) {
    delete normalized.expiresAt
  }

  normalized.type = deriveType(entry, fallbackType, index)

  return normalized
}

export function normalizeOutputFiles(rawInput) {
  if (!rawInput) {
    return []
  }

  const normalized = []

  if (Array.isArray(rawInput)) {
    rawInput.forEach((entry, index) => {
      const normalizedEntry = normaliseOutputFileEntry(entry, index)
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
      const normalizedEntry = normaliseOutputFileEntry(value, index, key)
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
