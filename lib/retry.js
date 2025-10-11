const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

const RETRYABLE_S3_ERROR_CODES = new Set([
  'SLOWDOWN',
  'SLOWDOWNERROR',
  'REQUESTTIMEOUT',
  'THROTTLING',
  'THROTTLINGEXCEPTION',
  'SERVICEUNAVAILABLE',
  'INTERNALERROR',
]);

const RETRYABLE_GEMINI_ERROR_CODES = new Set([
  'RESOURCE_EXHAUSTED',
  'ABORTED',
  'UNAVAILABLE',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getErrorStatus(err) {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  if (typeof err.status === 'number') {
    return err.status;
  }
  if (typeof err.statusCode === 'number') {
    return err.statusCode;
  }
  if (typeof err.$metadata?.httpStatusCode === 'number') {
    return err.$metadata.httpStatusCode;
  }
  if (typeof err.response?.status === 'number') {
    return err.response.status;
  }
  if (typeof err.cause?.status === 'number') {
    return err.cause.status;
  }
  if (typeof err.cause?.statusCode === 'number') {
    return err.cause.statusCode;
  }
  return undefined;
}

export function isRetryableStatus(status) {
  if (!Number.isFinite(status)) return false;
  return status === 429 || status >= 500;
}

export function isRetryableNetworkError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) {
    return true;
  }
  const name = typeof err.name === 'string' ? err.name.toUpperCase() : '';
  if (name && RETRYABLE_NETWORK_ERROR_CODES.has(name)) {
    return true;
  }
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (!message) {
    return false;
  }
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('connection reset') ||
    message.includes('socket hang up')
  );
}

export function shouldRetryS3Error(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const status = getErrorStatus(err);
  if (isRetryableStatus(status)) {
    return true;
  }
  if (isRetryableNetworkError(err)) {
    return true;
  }
  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (code && RETRYABLE_S3_ERROR_CODES.has(code)) {
    return true;
  }
  const name = typeof err.name === 'string' ? err.name.toUpperCase() : '';
  if (name && RETRYABLE_S3_ERROR_CODES.has(name)) {
    return true;
  }
  return false;
}

export function shouldRetryGeminiError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const status = getErrorStatus(err);
  if (isRetryableStatus(status)) {
    return true;
  }
  if (isRetryableNetworkError(err)) {
    return true;
  }
  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (code && (RETRYABLE_GEMINI_ERROR_CODES.has(code) || RETRYABLE_NETWORK_ERROR_CODES.has(code))) {
    return true;
  }
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  if (!message) {
    return false;
  }
  return (
    message.includes('resource exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('temporarily unavailable') ||
    message.includes('timeout')
  );
}

export async function executeWithRetry(operation, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    jitterMs = 250,
    shouldRetry = () => false,
    onRetry,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxAttempts && shouldRetry(err, attempt);
      if (!canRetry) {
        throw err;
      }
      const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
      const boundedDelay = Math.min(maxDelayMs, exponentialDelay);
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      const waitMs = Math.max(0, boundedDelay + jitter);
      if (typeof onRetry === 'function') {
        try {
          onRetry(err, attempt, waitMs);
        } catch {
          // ignore logging errors
        }
      }
      await sleep(waitMs);
    }
  }
  throw lastError;
}
