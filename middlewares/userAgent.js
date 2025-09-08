import { JOB_FETCH_USER_AGENT } from '../config/http.js';
import { parseUserAgent } from '../lib/serverUtils.js';

export default async function userAgentMiddleware(req, res, next) {
  const userAgent = req.headers['user-agent'] || JOB_FETCH_USER_AGENT;
  let browser = '', os = '', device = '';
  try {
    ({ browser, os, device } = await parseUserAgent(userAgent));
  } catch {
    // ignore parsing errors
  }
  req.userAgent = userAgent;
  req.browser = browser;
  req.os = os;
  req.device = device;
  next();
}
