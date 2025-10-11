import { normalizeLogReferences } from '../shared/apiErrorHandling.js'

export function extractErrorMetadata(err) {
  if (!err || typeof err !== 'object') {
    return { logs: [], requestId: '' }
  }

  const requestId =
    typeof err.requestId === 'string'
      ? err.requestId.trim()
      : typeof err?.details?.requestId === 'string'
        ? err.details.requestId.trim()
        : typeof err?.error?.requestId === 'string'
          ? err.error.requestId.trim()
          : ''

  if (Array.isArray(err.logs) && err.logs.length > 0) {
    return { logs: err.logs, requestId }
  }

  if (Array.isArray(err.logReferences) && err.logReferences.length > 0) {
    return { logs: err.logReferences, requestId }
  }

  const rawLogs = err?.details?.logs || err?.error?.details?.logs
  if (rawLogs) {
    const normalized = normalizeLogReferences(rawLogs)
    return { logs: normalized, requestId }
  }

  return { logs: [], requestId }
}
