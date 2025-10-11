import { scoreResumeAgainstJob, toHttpResponse } from './service.js';

function parseBody(event = {}) {
  if (event && typeof event.body === 'object') {
    return event.body;
  }
  if (!event || event.body === undefined || event.body === null) {
    return {};
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
  const outcome = scoreResumeAgainstJob(payload);
  return toHttpResponse(outcome);
}

export default handler;

