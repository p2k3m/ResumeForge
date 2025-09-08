import axios from 'axios';
import puppeteer from 'puppeteer';
import { validateUrl } from '../lib/serverUtils.js';
import { JOB_FETCH_USER_AGENT } from '../config/http.js';
import { PUPPETEER_HEADLESS, PUPPETEER_ARGS } from '../config/puppeteer.js';
import { BLOCKED_PATTERNS, REQUEST_TIMEOUT_MS } from '../config/jobFetch.js';

export const LINKEDIN_AUTH_REQUIRED = 'LINKEDIN_AUTH_REQUIRED';

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

  const isLinkedInHost = /(^|\.)linkedin\.com$/i.test(host);

  const log = (msg) => {
    const ts = new Date().toISOString();
    const idPart = jobId ? ` [${jobId}]` : '';
    console.log(`[${ts}]${idPart} [jobFetch] ${msg}`);
  };

  if (signal?.aborted) {
    log('aborted_before_start');
    throw new Error('Aborted');
  }

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

  const linkedinLoginPatterns = [/authwall/i, /sign\s?in/i, /login/i];
  if (isLinkedInHost) {
    const requiresAuth =
      !html || linkedinLoginPatterns.some((re) => re.test(html));
    if (requiresAuth) {
      const message = 'LinkedIn job descriptions require authentication';
      log(`linkedin_auth_required host=${host}`);
      const err = new Error(message);
      err.code = LINKEDIN_AUTH_REQUIRED;
      throw err;
    }
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
      const maxAttempts = 2;
      const baseTimeout = Math.max(5000, Math.floor(timeout / 2));
      for (let attempt = 1; attempt <= maxAttempts && !navigationSucceeded; attempt++) {
        const attemptTimeout = Math.min(timeout, baseTimeout * 2 ** (attempt - 1));
        const navStart = Date.now();
        log(`navigation_start host=${host} attempt=${attempt}`);
        try {
          await page.goto(valid, { timeout: attemptTimeout, waitUntil: 'networkidle2' });
          log(
            `navigation_success host=${host} attempt=${attempt} duration=${Date.now() - navStart}ms`,
          );
          navigationSucceeded = true;
        } catch (navErr) {
          const navDur = Date.now() - navStart;
          if (signal?.aborted) throw new Error('Aborted');
          if (
            navErr.message?.toLowerCase().includes('timeout') &&
            attempt < maxAttempts
          ) {
            const backoff = 500 * 2 ** (attempt - 1);
            log(
              `navigation_retry host=${host} attempt=${attempt} duration=${navDur}ms backoff=${backoff}ms`,
            );
            await new Promise((r) => setTimeout(r, backoff));
          } else {
            const message = isLinkedInHost
              ? 'LinkedIn job descriptions require authentication'
              : navErr.message?.toLowerCase().includes('timeout')
              ? `Navigation to ${host} timed out after ${attemptTimeout}ms`
              : navErr.message;
            log(
              `navigation_fail host=${host} attempt=${attempt} duration=${navDur}ms error=${message}`,
            );
            if (attempt === maxAttempts) {
              log(`navigation_retries_exhausted host=${host}`);
            }
            throw new Error(message);
          }
        }
      }

      if (!navigationSucceeded) {
        log(`navigation_retries_exhausted host=${host}`);
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
  if (isLinkedInHost && linkedinLoginPatterns.some((re) => re.test(html))) {
    const errorMessage = 'LinkedIn job descriptions require authentication';
    log(`job_fetch_blocked host=${host} error=${errorMessage}`);
    const err = new Error(errorMessage);
    err.code = LINKEDIN_AUTH_REQUIRED;
    throw err;
  }
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
