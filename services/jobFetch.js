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
    jobId,
  } = {},
) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid URL');

  const host = (() => {
    try {
      return new URL(valid).host;
    } catch {
      return 'unknown';
    }
  })();

  const log = (msg) => {
    const ts = new Date().toISOString();
    const idPart = jobId ? ` [${jobId}]` : '';
    console.log(`[${ts}]${idPart} [jobFetch] ${msg}`);
  };

  const isBlocked = (content) =>
    !content || !content.trim() || BLOCKED_PATTERNS.some((re) => re.test(content));

  let html = '';
  let axiosErrorMessage;
  const axiosStart = Date.now();
  log(`axios_start host=${host}`);
  try {
    const { data } = await axios.get(valid, {
      timeout,
      headers: { 'User-Agent': userAgent },
      signal,
    });
    html = data;
    log(`axios_success host=${host} duration=${Date.now() - axiosStart}ms`);
  } catch (err) {
    if (signal?.aborted) throw err;
    axiosErrorMessage = err.message;
    log(
      `axios_fail host=${host} duration=${Date.now() - axiosStart}ms error=${axiosErrorMessage}`,
    );
    log('axios_fallback_to_puppeteer');
    // Ignore axios errors and fall back to puppeteer
    html = '';
  }

  if (isBlocked(html)) {
    log('puppeteer_fallback_start');
    let browser;
    try {
      const launchStart = Date.now();
      browser = await puppeteer.launch({
        headless: PUPPETEER_HEADLESS,
        args: PUPPETEER_ARGS,
      });
      log(`puppeteer_launch_success duration=${Date.now() - launchStart}ms`);
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
        const navStart = Date.now();
        log(`navigation_start host=${host} attempt=${attempt}`);
        try {
          await page.goto(valid, { timeout, waitUntil: 'networkidle2' });
          log(
            `navigation_success host=${host} attempt=${attempt} duration=${Date.now() - navStart}ms`,
          );
          navigationSucceeded = true;
        } catch (navErr) {
          const navDur = Date.now() - navStart;
          if (signal?.aborted) throw new Error('Aborted');
          if (
            navErr.message?.toLowerCase().includes('timeout') &&
            attempt < 2
          ) {
            log(
              `navigation_retry host=${host} attempt=${attempt} duration=${navDur}ms`,
            );
          } else {
            const message = navErr.message?.toLowerCase().includes('timeout')
              ? `Navigation to ${host} timed out after ${timeout}ms`
              : navErr.message;
            log(
              `navigation_fail host=${host} attempt=${attempt} duration=${navDur}ms error=${message}`,
            );
            throw new Error(message);
          }
        }
      }

      if (!navigationSucceeded) {
        throw new Error(`Navigation to ${host} failed`);
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
    log(`job_fetch_blocked host=${host} error=${errorMessage}`);
    throw new Error(errorMessage);
  }
  log(`job_fetch_success host=${host}`);
  return html;
}
