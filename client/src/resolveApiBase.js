const CLOUD_FRONT_HOST = /\.cloudfront\.net$/i

function normalizePath(pathname = '') {
  const trimmed = pathname.trim()
  if (!trimmed || trimmed === '/') return ''
  return trimmed.replace(/\/+$/u, '')
}

export function resolveApiBase(rawBaseUrl) {
  if (typeof window === 'undefined') {
    return (rawBaseUrl || '').trim()
  }

  const globalOverride =
    typeof window.__RESUMEFORGE_API_BASE_URL__ === 'string'
      ? window.__RESUMEFORGE_API_BASE_URL__.trim()
      : ''

  const candidate = (globalOverride || rawBaseUrl || '').trim()

  if (!candidate || candidate === '/' || candidate === 'undefined' || candidate === 'null') {
    return ''
  }

  const cleanedCandidate = candidate.replace(/\s+/gu, '')

  try {
    const url = new URL(cleanedCandidate, window.location.origin)
    const normalizedPath = normalizePath(url.pathname)

    const locationPath = normalizePath(window.location.pathname)
    const atRoot = !locationPath
    const matchesHost = url.hostname === window.location.hostname
    const looksLikeCloudFront = CLOUD_FRONT_HOST.test(url.hostname)

    if (atRoot && matchesHost && !normalizedPath) {
      return url.origin
    }

    if (looksLikeCloudFront && normalizedPath) {
      return `${url.origin}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`
    }

    return `${url.origin}${normalizedPath ? (normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`) : ''}`
  } catch {
    if (cleanedCandidate.startsWith('/')) {
      return cleanedCandidate.replace(/\/+$/u, '')
    }
    return cleanedCandidate
  }
}

export function buildApiUrl(base, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (!base) {
    return normalizedPath
  }

  if (/^https?:\/\//iu.test(base)) {
    const url = new URL(base)
    const prefix = normalizePath(url.pathname)
    const fullPath = `${prefix}${normalizedPath}`
    url.pathname = fullPath
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const normalizedBase = base.startsWith('/') ? base : `/${base}`
  return `${normalizedBase.replace(/\/+$/u, '')}${normalizedPath}`
}
