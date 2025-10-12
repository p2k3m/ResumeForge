import JSON5 from 'json5';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { executeWithRetry, getErrorStatus, shouldRetryGeminiError } from '../retry.js';

const DEFAULT_MODEL = 'gemini-1.5-flash';

const NOOP_LOGGER = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function serializeError(err) {
  if (!err) {
    return undefined;
  }
  if (err instanceof Error) {
    const base = {
      name: err.name || 'Error',
      message: err.message || '',
    };
    if (err.code) base.code = err.code;
    if (err.stack) base.stack = err.stack;
    return base;
  }
  if (typeof err === 'object') {
    try {
      return JSON.parse(JSON.stringify(err));
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

/**
 * Create a Gemini generative model instance that can be shared across Lambda
 * invocations or Express requests. Secrets are supplied by the caller so this
 * helper can be reused from environments with different credential sources.
 */
export function createGeminiGenerativeModel({ apiKey, model = DEFAULT_MODEL } = {}) {
  if (!apiKey) {
    throw new Error('Gemini API key is required to initialise the generative model.');
  }
  const client = new GoogleGenerativeAI(apiKey);
  return client.getGenerativeModel({ model });
}

/**
 * Invoke Gemini with exponential backoff. The retry policy mirrors the
 * existing resume enhancement flow so downstream services can reuse the same
 * logic when executed from a Lambda Layer or npm module.
 */
export async function generateContentWithRetry(model, prompt, options = {}) {
  if (!model?.generateContent) {
    return null;
  }

  const {
    maxAttempts = 3,
    retryLogEvent,
    retryLogContext = {},
    baseDelayMs = 800,
    maxDelayMs = 6000,
    jitterMs = 400,
    logger = NOOP_LOGGER,
  } = options;

  return await executeWithRetry(
    () => model.generateContent(prompt),
    {
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      jitterMs,
      shouldRetry: (err) => shouldRetryGeminiError(err),
      onRetry: (err, attempt, delayMs) => {
        if (!retryLogEvent) {
          return;
        }
        logger.warn(`${retryLogEvent}_retry`, {
          ...retryLogContext,
          attempt,
          delayMs,
          status: getErrorStatus(err),
          error: serializeError(err),
        });
      },
    }
  );
}

function extractJsonBlock(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const fenced = text.match(/```json[\s\S]*?```/i);
  if (fenced) {
    text = fenced[0].replace(/```json|```/gi, '');
  }
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

/**
 * Parse a JSON object emitted by Gemini. The helper understands fenced JSON
 * blocks and falls back to structured logging when the payload cannot be
 * parsed so callers can surface actionable telemetry.
 */
export function parseGeminiJsonResponse(text, { logger = NOOP_LOGGER } = {}) {
  const block = extractJsonBlock(text);
  if (!block) {
    logger.error('ai_response_missing_json', {
      sample: typeof text === 'string' ? text.slice(0, 200) : undefined,
    });
    return null;
  }
  try {
    return JSON5.parse(block);
  } catch (err) {
    logger.error('ai_json_parse_failed', {
      sample: typeof text === 'string' ? text.slice(0, 200) : undefined,
      error: serializeError(err),
    });
    return null;
  }
}

export const noopGeminiLogger = NOOP_LOGGER;

export default createGeminiGenerativeModel;
