import { evaluateJobDescription, toHttpResponse } from './service.js';

function parseBody(event = {}) {
  if (!event || typeof event.body === 'undefined' || event.body === null) {
    return {};
  }

  if (typeof event.body === 'object') {
    return event.body;
  }

  try {
    const decoded = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

export async function handler(event, context) {
  void context;
  const payload = parseBody(event);
  const result = evaluateJobDescription(payload);
  return toHttpResponse(result);
}

export default handler;

