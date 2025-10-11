import {
  API_ERROR_CONTRACTS,
  CV_GENERATION_ERROR_MESSAGE,
  DOWNLOAD_SESSION_EXPIRED_MESSAGE,
  GEMINI_ENHANCEMENT_ERROR_MESSAGE,
  LAMBDA_PROCESSING_ERROR_MESSAGE,
  S3_CHANGE_LOG_ERROR_MESSAGE,
  S3_STORAGE_ERROR_MESSAGE
} from './serviceErrorContracts.js'

export const FRIENDLY_ERROR_MESSAGES = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.friendlyMessage
    ])
  )
)

export const SERVICE_ERROR_SOURCE_BY_CODE = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.service || ''
    ])
  )
)

export const SERVICE_ERROR_STEP_BY_CODE = Object.freeze(
  Object.fromEntries(
    Object.entries(API_ERROR_CONTRACTS).map(([code, contract]) => [
      code,
      contract.step || ''
    ])
  )
)

export const SERVICE_ERROR_STEP_BY_SOURCE = Object.freeze({
  s3: 'download',
  lambda: 'evaluate',
  gemini: 'enhance'
})

const RETRYABLE_SERVICE_SOURCES = new Set(['s3', 'lambda', 'gemini'])
const RETRYABLE_ERROR_CODE_PATTERNS = ['FAILED', 'UNAVAILABLE', 'ERROR', 'TIMEOUT']

export function normalizeServiceSource(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const normalized = value.trim().toLowerCase()
  return ['s3', 'lambda', 'gemini'].includes(normalized) ? normalized : ''
}

export function isRetryableServiceSource(source) {
  const normalized = normalizeServiceSource(source)
  return normalized ? RETRYABLE_SERVICE_SOURCES.has(normalized) : false
}

export function isRetryableErrorCode(code) {
  if (typeof code !== 'string') {
    return false
  }
  const normalized = code.trim().toUpperCase()
  if (!normalized) {
    return false
  }
  return RETRYABLE_ERROR_CODE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function deriveServiceContextFromError(err) {
  if (!err || typeof err !== 'object') {
    return { source: '', code: '' }
  }
  const rawCode =
    typeof err.code === 'string'
      ? err.code.trim().toUpperCase()
      : ''
  const sourceCandidates = [
    err.serviceError,
    err.source,
    err?.details?.source,
    err?.error?.details?.source
  ]
  let normalizedSourceCandidate = ''
  for (const candidate of sourceCandidates) {
    const normalized = normalizeServiceSource(candidate)
    if (normalized) {
      normalizedSourceCandidate = normalized
      break
    }
  }
  const mappedSourceFromCode = rawCode
    ? normalizeServiceSource(SERVICE_ERROR_SOURCE_BY_CODE[rawCode] || '')
    : ''
  const source = normalizedSourceCandidate || mappedSourceFromCode
  return { source, code: rawCode }
}

export function extractServerMessages(data) {
  const candidates = []
  if (Array.isArray(data?.messages)) {
    candidates.push(...data.messages)
  }
  if (Array.isArray(data?.error?.details?.messages)) {
    candidates.push(...data.error.details.messages)
  }
  if (Array.isArray(data?.error?.messages)) {
    candidates.push(...data.error.messages)
  }
  const seen = new Set()
  const normalized = []
  for (const entry of candidates) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

export function resolveApiError({ data, fallback, status }) {
  const normalizedFallback =
    typeof fallback === 'string' && fallback.trim()
      ? fallback.trim()
      : 'Request failed. Please try again.'
  const errorCode =
    typeof data?.error?.code === 'string' ? data.error.code.trim() : ''
  const normalizedCode = errorCode ? errorCode.toUpperCase() : ''
  const errorSource = normalizeServiceSource(data?.error?.details?.source)
  const rawMessage =
    (typeof data?.error?.message === 'string' && data.error.message.trim()) ||
    (typeof data?.message === 'string' && data.message.trim()) ||
    (typeof data?.error === 'string' && data.error.trim()) ||
    ''
  const detailSummary =
    typeof data?.error?.details?.summary === 'string'
      ? data.error.details.summary.trim()
      : ''
  const serverMessages = extractServerMessages(data)
  const fallbackSummary =
    serverMessages.length > 0 ? serverMessages[serverMessages.length - 1] : ''

  let friendlyFromCode = ''
  let normalizedSource = errorSource
  if (!normalizedSource && normalizedCode) {
    normalizedSource = normalizeServiceSource(
      SERVICE_ERROR_SOURCE_BY_CODE[normalizedCode] || ''
    )
  }
  if (normalizedCode && FRIENDLY_ERROR_MESSAGES[normalizedCode]) {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES[normalizedCode]
  } else if (normalizedSource === 's3') {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.STORAGE_UNAVAILABLE
  } else if (normalizedSource === 'gemini') {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.AI_RESPONSE_INVALID
  } else if (normalizedSource === 'lambda') {
    friendlyFromCode = FRIENDLY_ERROR_MESSAGES.DOCUMENT_GENERATION_FAILED
  }

  const summaryCandidate = detailSummary || fallbackSummary
  let messageSource = 'raw'
  let message = rawMessage

  if (summaryCandidate) {
    message = summaryCandidate
    messageSource = 'summary'
  } else if (message) {
    messageSource = 'raw'
  }

  if (!message) {
    if (friendlyFromCode) {
      message = friendlyFromCode
      messageSource = 'friendly'
    } else {
      message = normalizedFallback
      messageSource = 'fallback'
    }
  }

  if (!friendlyFromCode && status >= 500 && messageSource !== 'summary') {
    if (/gemini/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.AI_RESPONSE_INVALID
      messageSource = 'friendly'
      if (!normalizedSource) {
        normalizedSource = 'gemini'
      }
    } else if (/s3|bucket|accessdenied/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.STORAGE_UNAVAILABLE
      messageSource = 'friendly'
      if (!normalizedSource) {
        normalizedSource = 's3'
      }
    } else if (/lambda|serverless|invocation|timeout/i.test(rawMessage)) {
      message = FRIENDLY_ERROR_MESSAGES.DOCUMENT_GENERATION_FAILED
      messageSource = 'friendly'
      if (!normalizedSource) {
        normalizedSource = 'lambda'
      }
    }
  }

  if (!message || /^internal server error$/i.test(message)) {
    message = normalizedFallback
    messageSource = 'fallback'
  }

  const isFriendly =
    messageSource === 'summary' ||
    messageSource === 'friendly' ||
    message !== rawMessage

  return { message, code: normalizedCode, isFriendly, source: normalizedSource }
}

export {
  CV_GENERATION_ERROR_MESSAGE,
  DOWNLOAD_SESSION_EXPIRED_MESSAGE,
  GEMINI_ENHANCEMENT_ERROR_MESSAGE,
  LAMBDA_PROCESSING_ERROR_MESSAGE,
  S3_CHANGE_LOG_ERROR_MESSAGE,
  S3_STORAGE_ERROR_MESSAGE
}
