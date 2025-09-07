export const REQUEST_TIMEOUT_MS =
  parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 5000;

export const BLOCKED_PATTERNS = [
  /captcha/i,
  /access denied/i,
  /enable javascript/i,
  /bot detection/i,
];
