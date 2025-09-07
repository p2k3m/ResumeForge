import axios from 'axios';
import puppeteer from 'puppeteer';
import { validateUrl } from '../lib/serverUtils.js';
import { JOB_FETCH_USER_AGENT } from '../config/http.js';
import { PUPPETEER_HEADLESS, PUPPETEER_ARGS } from '../config/puppeteer.js';
import { BLOCKED_PATTERNS, REQUEST_TIMEOUT_MS } from '../config/jobFetch.js';

const DEFAULT_FETCH_TIMEOUT_MS =
  parseInt(process.env.JOB_FETCH_TIMEOUT_MS || REQUEST_TIMEOUT_MS, 10);

export async function fetchJobDescription(
  url,
  { timeout = DEFAULT_FETCH_TIMEOUT_MS, userAgent = JOB_FETCH_USER_AGENT } = {},
) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid URL');
  try {
    const { data } = await axios.get(valid, {
      timeout,
      headers: { 'User-Agent': userAgent },
    });
    if (data && data.trim()) {
      if (BLOCKED_PATTERNS.some((re) => re.test(data))) {
        throw new Error('Blocked content');
      }
      return data;
    }
  } catch (err) {
    if (err.message === 'Blocked content') throw err;
  }
  const browser = await puppeteer.launch({
    headless: PUPPETEER_HEADLESS,
    args: PUPPETEER_ARGS,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.goto(valid, { timeout, waitUntil: 'networkidle2' });
    const content = await page.content();
    if (BLOCKED_PATTERNS.some((re) => re.test(content))) {
      throw new Error('Blocked content');
    }
    return content;
  } finally {
    await browser.close();
  }
}
