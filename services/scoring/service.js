import { handler as scoringHandler } from './handler.js';
import { scoreResumeHttpResponse as toHttpResponse } from '../../lib/resume/scoring.js';

function buildInvocationEvent(payload = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function buildInvocationContext() {
  const requestId = `scoring-service-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2)}`;

  return {
    awsRequestId: requestId,
    functionName: 'scoring-service-proxy',
    invokedFunctionArn: 'arn:aws:lambda:local:0:function:scoring-service-proxy',
    callbackWaitsForEmptyEventLoop: false,
  };
}

function parseHandlerBody(body) {
  if (body === null || typeof body === 'undefined') {
    return {};
  }
  if (typeof body === 'object') {
    return body;
  }
  if (typeof body !== 'string') {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function normalizeHandlerOutcome(response) {
  if (!response || typeof response !== 'object') {
    return {
      ok: false,
      error: {
        statusCode: 500,
        code: 'SCORING_HANDLER_INVALID_RESPONSE',
        message: 'Scoring handler returned an invalid response.',
      },
    };
  }

  const statusCode = Number(response.statusCode || 500);
  const body = parseHandlerBody(response.body);

  if (statusCode >= 200 && statusCode < 300) {
    return {
      ok: true,
      result: body && typeof body === 'object' ? body : {},
    };
  }

  const details = body && typeof body === 'object' ? body.details : undefined;

  return {
    ok: false,
    error: {
      statusCode,
      code:
        body && typeof body.code === 'string' && body.code.trim()
          ? body.code.trim()
          : 'SCORING_FAILED',
      message:
        body && typeof body.message === 'string' && body.message.trim()
          ? body.message.trim()
          : 'Unable to score the resume against the job description.',
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export async function scoreResumeAgainstJob(payload = {}) {
  try {
    const event = buildInvocationEvent(payload);
    const context = buildInvocationContext();
    const response = await scoringHandler(event, context);
    return normalizeHandlerOutcome(response);
  } catch (error) {
    return {
      ok: false,
      error: {
        statusCode: 500,
        code: 'SCORING_HANDLER_ERROR',
        message: error?.message || 'Unable to invoke the scoring service handler.',
        details: error,
      },
    };
  }
}

export default scoreResumeAgainstJob;

export { toHttpResponse };
