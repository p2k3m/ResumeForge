/**
 * Parse the body of an API Gateway or Lambda invocation event into a JSON
 * payload. The helper is resilient to base64-encoded bodies and gracefully
 * falls back to an empty object when decoding fails.
 *
 * @param {object} [event] - Raw Lambda event object.
 * @returns {object} Parsed JSON payload or an empty object.
 */
export function parseEventBody(event = {}) {
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

export default parseEventBody;
