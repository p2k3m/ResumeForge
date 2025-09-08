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

  const isBlocked = (content) =>
    !content || !content.trim() || BLOCKED_PATTERNS.some((re) => re.test(content));

  let html = '';
  try {
    const { data } = await axios.get(valid, {
      timeout,
      headers: { 'User-Agent': userAgent },
    });
    html = data;
  } catch {
    // Ignore axios errors and fall back to puppeteer
    html = '';
  }

  if (isBlocked(html)) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        args: PUPPETEER_ARGS,
      });
    } catch (err) {
      const missingLibMatch = err.message.match(/lib[^\s:]*\.so[^\s:]*/i);
      const missingLib = missingLibMatch ? missingLibMatch[0] : undefined;
      const envDetails = {
        platform: process.platform,
        arch: process.arch,
        error: err.stack,
        missingLib,
      };
      console.error('Chromium dependencies missing', envDetails);
      const messageParts = [
        `Unable to launch browser on ${process.platform}/${process.arch}.`,
        missingLib ? `Missing dependency: ${missingLib}.` : '',
        'Please ensure Chromium dependencies are installed.',
      ].filter(Boolean);
      throw new Error(messageParts.join(' '));
    }
    let page;
    try {
      page = await browser.newPage();
      await page.setUserAgent(userAgent);
      await page.goto(valid, { timeout, waitUntil: 'networkidle2' });
      html = await page.content();
    } finally {
      try {
        await page?.close();
      } catch {
        /* ignore */
      }
      await browser.close();
    }
  }

  if (isBlocked(html)) {
    throw new Error('Blocked content');
  }
  return html;
}
