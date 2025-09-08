import axios from 'axios';
import puppeteer from 'puppeteer';
import { validateUrl } from '../lib/serverUtils.js';
import { JOB_FETCH_USER_AGENT } from '../config/http.js';
import { PUPPETEER_HEADLESS, PUPPETEER_ARGS } from '../config/puppeteer.js';
import { BLOCKED_PATTERNS, REQUEST_TIMEOUT_MS } from '../config/jobFetch.js';

// Default timeout comes from config and can be overridden via environment
// variables as defined in config/jobFetch.js
const DEFAULT_FETCH_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

export async function fetchJobDescription(
  url,
  {
    timeout = DEFAULT_FETCH_TIMEOUT_MS,
    userAgent = JOB_FETCH_USER_AGENT,
    signal,
  } = {},
) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid URL');

  const isBlocked = (content) =>
    !content || !content.trim() || BLOCKED_PATTERNS.some((re) => re.test(content));

  let html = '';
  let axiosErrorMessage;
  try {
    const { data } = await axios.get(valid, {
      timeout,
      headers: { 'User-Agent': userAgent },
      signal,
    });
    html = data;
  } catch (err) {
    if (signal?.aborted) throw err;
    axiosErrorMessage = err.message;
    console.error('Axios job fetch error:', axiosErrorMessage);
    console.log('Axios fallback triggered, attempting Puppeteer fetch');
    // Ignore axios errors and fall back to puppeteer
    html = '';
  }

  if (isBlocked(html)) {
    console.log('Falling back to Puppeteer for job fetch');
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        args: PUPPETEER_ARGS,
      });
      if (signal?.aborted) {
        await browser.close();
        throw new Error('Aborted');
      }
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

      let navigationSucceeded = false;
      for (let attempt = 1; attempt <= 2 && !navigationSucceeded; attempt++) {
        try {
          console.log(
            `Navigating to ${valid} (attempt ${attempt}) with timeout ${timeout}ms`,
          );
          await page.goto(valid, { timeout, waitUntil: 'networkidle2' });
          console.log('Navigation finished');
          navigationSucceeded = true;
        } catch (navErr) {
          if (signal?.aborted) throw new Error('Aborted');
          if (
            navErr.message?.toLowerCase().includes('timeout') &&
            attempt < 2
          ) {
            console.warn(
              `Navigation timed out after ${timeout}ms, retrying...`,
            );
          } else {
            const message = navErr.message?.toLowerCase().includes('timeout')
              ? `Navigation to ${valid} timed out after ${timeout}ms`
              : navErr.message;
            throw new Error(message);
          }
        }
      }

      if (!navigationSucceeded) {
        throw new Error(`Navigation to ${valid} failed`);
      }

      if (signal?.aborted) throw new Error('Aborted');
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

  if (signal?.aborted) throw new Error('Aborted');
  if (isBlocked(html)) {
    const errorMessage = axiosErrorMessage
      ? `Blocked content. Axios error: ${axiosErrorMessage}`
      : 'Blocked content';
    throw new Error(errorMessage);
  }
  return html;
}
