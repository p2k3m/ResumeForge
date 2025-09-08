// Default timeout for fetching job descriptions. Can be overridden via
// either JOB_FETCH_TIMEOUT_MS or REQUEST_TIMEOUT_MS environment variables.
export const REQUEST_TIMEOUT_MS =
  parseInt(
    process.env.JOB_FETCH_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS,
    10,
  ) || 30000;

export const BLOCKED_PATTERNS = [
  /captcha/i,
  /access denied/i,
  /enable javascript/i,
  /bot detection/i,
];
