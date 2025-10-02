import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { EventEmitter } from 'events';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
  UpdateItemCommand,
  ScanCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import fs from 'fs/promises';
import fsSync from 'fs';
import { logEvent, logErrorTrace } from './logger.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import WordExtractorPackage from 'word-extractor';
import JSON5 from 'json5';
import { renderTemplatePdf } from './lib/pdf/index.js';
import {
  parseTemplateParams as parseTemplateParamsConfig,
  resolveTemplateParams as resolveTemplateParamsConfig
} from './lib/pdf/utils.js';

const WordExtractor = WordExtractorPackage?.default || WordExtractorPackage;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDistDir = path.join(__dirname, 'client', 'dist');
const clientIndexPath = path.join(clientDistDir, 'index.html');
let cachedClientIndexHtml;

function ensureAxiosResponseInterceptor(client) {
  if (!client) return null;
  if (!client.interceptors) {
    client.interceptors = {};
  }
  if (!client.interceptors.response) {
    client.interceptors.response = {
      handlers: [],
      use(onFulfilled, onRejected) {
        this.handlers.push({ onFulfilled, onRejected });
        return this.handlers.length - 1;
      }
    };
  } else if (typeof client.interceptors.response.use !== 'function') {
    client.interceptors.response.handlers =
      client.interceptors.response.handlers || [];
    client.interceptors.response.use = function (onFulfilled, onRejected) {
      this.handlers.push({ onFulfilled, onRejected });
      return this.handlers.length - 1;
    };
  }
  return client.interceptors.response;
}

const axiosResponseInterceptor = ensureAxiosResponseInterceptor(axios);

axiosResponseInterceptor?.use(
  (response) => response,
  (error) => {
    if (!error || typeof error !== 'object') {
      return Promise.reject(error);
    }

    const { config, response, request } = error;
    const method = (config?.method || 'GET').toUpperCase();
    const url = config?.url || 'unknown URL';

    if (response) {
      const status = response.status;
      const statusText = response.statusText || 'HTTP error';
      const detail = (() => {
        const data = response.data;
        if (!data) return '';
        if (typeof data === 'string') return data.slice(0, 200);
        if (typeof data === 'object') {
          const msg = data.error || data.message;
          if (typeof msg === 'string') return msg;
          try {
            return JSON.stringify(data).slice(0, 200);
          } catch {
            return '';
          }
        }
        return '';
      })();
      const message =
        `HTTP ${status} ${statusText} when requesting ${method} ${url}` +
        (detail ? `: ${detail}` : '');
      const enhancedError = new Error(message);
      enhancedError.cause = error;
      return Promise.reject(enhancedError);
    }

    if (request) {
      const message = `No response received from ${method} ${url}`;
      const enhancedError = new Error(message);
      enhancedError.cause = error;
      return Promise.reject(enhancedError);
    }

    return Promise.reject(error);
  }
);

const CV_GENERATION_ERROR_MESSAGE =
  'Your new CV could not be generated. Please try again or contact support.';

let chromium;
let puppeteerCore;
let chromiumLaunchAttempted = false;
let customChromiumLauncher;

let sharedGenerativeModelPromise;
let sharedWordExtractor;

function isModuleNotFoundError(err, moduleName) {
  if (!err) return false;
  const code = err.code || err?.cause?.code;
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
    return err.message?.includes(moduleName);
  }
  return false;
}

async function safeOptionalImport(moduleName) {
  try {
    return await import(moduleName);
  } catch (err) {
    if (isModuleNotFoundError(err, moduleName)) {
      logStructured('info', 'optional_dependency_unavailable', {
        module: moduleName,
      });
      return null;
    }
    throw err;
  }
}

async function getChromiumBrowser() {
  if (customChromiumLauncher) {
    return customChromiumLauncher();
  }
  if (chromiumLaunchAttempted && !chromium) return null;
  try {
    if (!chromium || !puppeteerCore) {
      const chromiumImport = await safeOptionalImport('@sparticuz/chromium');
      const puppeteerImport = await safeOptionalImport('puppeteer-core');
      if (!chromiumImport || !puppeteerImport) {
        chromiumLaunchAttempted = true;
        chromium = undefined;
        puppeteerCore = undefined;
        return null;
      }
      chromium = chromiumImport.default ?? chromiumImport;
      puppeteerCore = puppeteerImport.default ?? puppeteerImport;
    }
    chromiumLaunchAttempted = true;
    const executablePath = await chromium.executablePath();
    return await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });
  } catch (err) {
    chromiumLaunchAttempted = true;
    logStructured('error', 'chromium_launch_failed', {
      error: serializeError(err),
    });
    return null;
  }
}

function setChromiumLauncher(fn) {
  customChromiumLauncher = typeof fn === 'function' ? fn : null;
  if (!customChromiumLauncher) {
    chromium = undefined;
    puppeteerCore = undefined;
    chromiumLaunchAttempted = false;
  }
}

async function getSharedGenerativeModel() {
  if (sharedGenerativeModelPromise) {
    return sharedGenerativeModelPromise;
  }
  sharedGenerativeModelPromise = (async () => {
    try {
      const { GEMINI_API_KEY } = getSecrets();
      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY missing for generative model');
      }
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (err) {
      sharedGenerativeModelPromise = undefined;
      throw err;
    }
  })();
  return sharedGenerativeModelPromise;
}

async function parseUserAgent(ua) {
  const fallback = { browser: ua || '', os: ua || '', device: ua || '' };
  if (!ua) return fallback;
  try {
    const { default: UAParser } = await import('ua-parser-js');
    const result = new UAParser(ua).getResult();
    return {
      browser: result.browser?.name || ua,
      os: result.os?.name || ua,
      device: result.device?.model || ua
    };
  } catch {
    return fallback;
  }
}

function clientAssetsAvailable() {
  return fsSync.existsSync(clientIndexPath);
}

const FALLBACK_CLIENT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ResumeForge Portal</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; background: #f7fafc; color: #1a202c; }
      main { max-width: 640px; margin: 0 auto; background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1 { margin-top: 0; font-size: 2rem; }
      p { line-height: 1.6; }
      .cta { margin-top: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; border-radius: 9999px; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main id="portal-form">
      <h1>ResumeForge Portal</h1>
      <p>The client application build assets are currently unavailable. This is a lightweight fallback view to keep the service responsive while the full interface is rebuilt.</p>
      <p>You can regenerate the production UI by running <code>npm run build:client</code>. Until then, API endpoints remain available.</p>
      <a class="cta" href="https://github.com/" rel="noreferrer">Return to dashboard</a>
    </main>
  </body>
</html>`;

async function getClientIndexHtml() {
  if (!clientAssetsAvailable()) {
    if (!cachedClientIndexHtml) {
      cachedClientIndexHtml = FALLBACK_CLIENT_INDEX_HTML;
    }
    return cachedClientIndexHtml;
  }

  if (cachedClientIndexHtml && process.env.NODE_ENV !== 'development') {
    return cachedClientIndexHtml;
  }

  const html = await fs.readFile(clientIndexPath, 'utf8');
  if (process.env.NODE_ENV !== 'development') {
    cachedClientIndexHtml = html;
  }
  return html;
}

const DEFAULT_AWS_REGION = 'ap-south-1';
const DEFAULT_ALLOWED_ORIGINS = [];
const URL_EXPIRATION_SECONDS = 60 * 60; // 1 hour
const isTestEnvironment = process.env.NODE_ENV === 'test';

const parsePositiveInt = (value) => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const JOB_DESCRIPTION_WAIT_MS =
  parsePositiveInt(process.env.JOB_DESCRIPTION_WAIT_MS) ?? (isTestEnvironment ? 0 : 1000);

const DYNAMO_TABLE_POLL_INTERVAL_MS =
  parsePositiveInt(process.env.DYNAMO_TABLE_POLL_INTERVAL_MS) ?? (isTestEnvironment ? 25 : 1000);

const DYNAMO_TABLE_MAX_WAIT_MS =
  parsePositiveInt(process.env.DYNAMO_TABLE_MAX_WAIT_MS) ?? (isTestEnvironment ? 2000 : 60000);

function createIdentifier() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeError(err) {
  if (!err) {
    return undefined;
  }
  if (err instanceof Error) {
    const base = {
      name: err.name || 'Error',
      message: err.message || '',
    };
    if (err.code) base.code = err.code;
    if (err.stack) base.stack = err.stack;
    return base;
  }
  if (typeof err === 'object') {
    try {
      return JSON.parse(JSON.stringify(err));
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

function toLoggable(value) {
  if (value instanceof Error) {
    return serializeError(value);
  }
  return value;
}

const requestContextStore = new Map();
let errorLogS3Client;
let errorLogBucket;
const ERROR_LOG_PREFIX = 'logs/errors/';

function ensureRequestContext(requestId) {
  if (!requestId) {
    return undefined;
  }
  let context = requestContextStore.get(requestId);
  if (!context) {
    context = {};
    requestContextStore.set(requestId, context);
  }
  return context;
}

function getRequestContext(requestId) {
  if (!requestId) return undefined;
  return requestContextStore.get(requestId);
}

function updateRequestContext(requestId, updates = {}) {
  if (!requestId || !updates || typeof updates !== 'object') {
    return;
  }
  const context = ensureRequestContext(requestId);
  if (!context) return;
  Object.assign(context, updates);
}

function clearRequestContext(requestId) {
  if (!requestId) return;
  requestContextStore.delete(requestId);
}

function normaliseUserId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const normalised = String(value).trim();
    return normalised || undefined;
  }
  if (typeof value === 'object') {
    if ('id' in value) {
      return normaliseUserId(value.id);
    }
    if ('userId' in value) {
      return normaliseUserId(value.userId);
    }
  }
  return undefined;
}

function extractUserIdFromRequest(req = {}) {
  const { body, headers = {}, query } = req;
  const candidates = [
    body && typeof body === 'object' ? body.userId : undefined,
    body && typeof body === 'object' ? body.user?.id : undefined,
    body && typeof body === 'object' ? body.user?.userId : undefined,
    body && typeof body === 'object' ? body.user : undefined,
    query?.userId,
    headers['x-user-id'],
    headers['x-userid'],
    headers['x-user'],
  ];
  for (const candidate of candidates) {
    const userId = normaliseUserId(candidate);
    if (userId) {
      return userId;
    }
  }
  return undefined;
}

function captureUserContext(req, res) {
  const userId = extractUserIdFromRequest(req);
  if (userId) {
    res.locals.userId = userId;
    updateRequestContext(req.requestId || res.locals.requestId, { userId });
  }
  return userId;
}

const scheduleTask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn) => setTimeout(fn, 0);

function scheduleErrorLog(entry) {
  if (!entry || !errorLogS3Client || !errorLogBucket) {
    return;
  }
  const payload = { ...entry };
  scheduleTask(() => {
    logErrorTrace({
      s3: errorLogS3Client,
      bucket: errorLogBucket,
      prefix: ERROR_LOG_PREFIX,
      entry: payload,
    }).catch((err) => {
      const fallback = {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 's3_error_log_failed',
        error: serializeError(err),
      };
      try {
        console.error(JSON.stringify(fallback));
      } catch {
        console.error('Failed to persist error log', err);
      }
    });
  });
}

function logStructured(level, message, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  if (payload.requestId && payload.userId === undefined) {
    const contextMatch = getRequestContext(payload.requestId);
    if (contextMatch?.userId) {
      payload.userId = contextMatch.userId;
    }
  }
  const logFn =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : console.log;
  try {
    const serialised = JSON.stringify(payload, (_, value) => toLoggable(value));
    logFn(serialised);
    if (level === 'error') {
      const safePayload = JSON.parse(serialised);
      scheduleErrorLog(safePayload);
    }
  } catch (err) {
    const fallback = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Failed to serialize log payload',
      originalMessage: message,
      error: serializeError(err),
    };
    console.error(JSON.stringify(fallback));
  }
}

let runtimeConfigFileCache;
let runtimeConfigFileError;
let runtimeConfigFileLoaded = false;

function loadRuntimeConfigFile() {
  if (runtimeConfigFileLoaded) {
    if (runtimeConfigFileError) {
      throw runtimeConfigFileError;
    }
    return runtimeConfigFileCache;
  }

  runtimeConfigFileLoaded = true;
  const explicitPath = readEnvValue('RUNTIME_CONFIG_PATH');
  const resolveCandidate = (value) => {
    if (!value) return undefined;
    if (path.isAbsolute(value)) return value;
    return path.resolve(process.cwd(), value);
  };

  const candidates = [];
  const addCandidate = (candidate) => {
    if (!candidate) return;
    if (candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  addCandidate(resolveCandidate(explicitPath));

  const baseDirs = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  const filenames = ['runtime-config.json', 'runtime-config.json5'];
  for (const baseDir of baseDirs) {
    for (const name of filenames) {
      addCandidate(path.join(baseDir, name));
      addCandidate(path.join(baseDir, 'config', name));
    }
  }

  for (const candidate of candidates) {
    try {
      if (!candidate || !fsSync.existsSync(candidate)) {
        continue;
      }
      const raw = fsSync.readFileSync(candidate, 'utf8');
      if (!raw.trim()) {
        continue;
      }
      const parsed = JSON5.parse(raw);
      runtimeConfigFileCache = parsed;
      logStructured('info', 'runtime_config_file_loaded', {
        path: candidate,
        keys: Object.keys(parsed || {}),
      });
      return runtimeConfigFileCache;
    } catch (err) {
      runtimeConfigFileError = err;
      logStructured('error', 'runtime_config_file_invalid', {
        path: candidate,
        error: serializeError(err),
      });
      throw err;
    }
  }

  runtimeConfigFileCache = null;
  return runtimeConfigFileCache;
}

function sendError(res, status, code, message, details) {
  const error = {
    code,
    message,
  };
  if (details !== undefined) {
    error.details = details;
  }
  if (res.locals.requestId) {
    error.requestId = res.locals.requestId;
  }
  if (res.locals.jobId) {
    error.jobId = res.locals.jobId;
  }
  const userId = res.locals.userId;
  const payload = { success: false, error };
  logStructured(status >= 500 ? 'error' : 'warn', 'api_error_response', {
    requestId: res.locals.requestId,
    jobId: res.locals.jobId,
    ...(userId ? { userId } : {}),
    status,
    error,
  });
  return res.status(status).json(payload);
}

function getUrlHost(value) {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function readEnvValue(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}

function normaliseOrigins(value) {
  if (Array.isArray(value)) {
    return value
      .map((origin) => (origin || '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  return undefined;
}

function parseAllowedOrigins(value) {
  if (!value) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = normaliseOrigins(value);
  return parsed && parsed.length ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

function resolvePublishedCloudfrontPath() {
  const override = readEnvValue('PUBLISHED_CLOUDFRONT_PATH');
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(process.cwd(), override);
  }
  return path.resolve(__dirname, 'config', 'published-cloudfront.json');
}

async function loadPublishedCloudfrontMetadata() {
  const filePath = resolvePublishedCloudfrontPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const metadata = {
      stackName:
        typeof parsed?.stackName === 'string' && parsed.stackName.trim()
          ? parsed.stackName.trim()
          : null,
      url:
        typeof parsed?.url === 'string' && parsed.url.trim()
          ? parsed.url.trim()
          : null,
      distributionId:
        typeof parsed?.distributionId === 'string' && parsed.distributionId.trim()
          ? parsed.distributionId.trim()
          : null,
      updatedAt:
        typeof parsed?.updatedAt === 'string' && parsed.updatedAt.trim()
          ? parsed.updatedAt.trim()
          : null,
    };

    if (metadata.url) {
      try {
        const normalized = new URL(metadata.url);
        const cleanedPath = normalized.pathname?.replace(/\/$/, '') || '';
        const normalizedUrl = `${normalized.origin}${cleanedPath}${
          normalized.search || ''
        }${normalized.hash || ''}`;
        metadata.url = normalizedUrl || normalized.toString();
      } catch (err) {
        logStructured('warn', 'published_cloudfront_invalid_url', {
          url: metadata.url,
          error: serializeError(err),
        });
        metadata.url = null;
      }
    }

    return metadata;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    if (err instanceof SyntaxError) {
      logStructured('error', 'published_cloudfront_invalid_json', {
        path: filePath,
        error: serializeError(err),
      });
      throw new Error('Published CloudFront metadata is invalid JSON');
    }
    logStructured('error', 'published_cloudfront_read_failed', {
      path: filePath,
      error: serializeError(err),
    });
    throw err;
  }
}

function extractMissingConfig(err) {
  if (!err) return [];
  const message = err.message || String(err);
  const match = message.match(/Missing required environment variables: (.+)$/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function describeConfigurationError(err) {
  if (!err) return 'failed to load configuration';
  const missing = extractMissingConfig(err);
  if (missing.length) {
    return (
      'ResumeForge is missing required configuration values: ' +
      missing.join(', ') +
      '. Set them via environment variables or config/runtime-config.json5.'
    );
  }
  const message = err.message || String(err);
  if (/Failed to load runtime configuration file/i.test(message)) {
    return (
      'Runtime configuration file could not be loaded. ' +
      'Ensure config/runtime-config.json5 exists and contains valid JSON5.'
    );
  }
  return message;
}

function describeProcessingFailure(err) {
  if (!err) {
    return 'Processing failed. Check the server logs for additional details.';
  }

  const collectMessages = (value) => {
    const messages = [];
    let current = value;
    const seen = new Set();
    while (current && typeof current === 'object' && !seen.has(current)) {
      seen.add(current);
      const message = typeof current.message === 'string' ? current.message.trim() : '';
      if (message && !messages.includes(message)) {
        messages.push(message);
      }
      current = current.cause;
    }
    return messages;
  };

  const messages = collectMessages(err);
  if (!messages.length) {
    return 'Processing failed. Please try again later.';
  }

  if (messages.some((msg) => /pdf generation failed/i.test(msg))) {
    return CV_GENERATION_ERROR_MESSAGE;
  }

  const meaningful = messages.find((msg) => !/^processing failed$/i.test(msg));
  const summary = meaningful || messages[0];
  if (/^processing failed$/i.test(summary)) {
    return 'Processing failed. Please try again later.';
  }
  return `Processing failed: ${summary}`;
}

function buildRuntimeConfig() {
  const fileConfig = (() => {
    try {
      return loadRuntimeConfigFile() || {};
    } catch (err) {
      throw new Error(`Failed to load runtime configuration file: ${err.message}`);
    }
  })();

  const region =
    readEnvValue('AWS_REGION') || fileConfig.AWS_REGION || DEFAULT_AWS_REGION;
  const s3Bucket = readEnvValue('S3_BUCKET') || fileConfig.S3_BUCKET;
  const geminiApiKey =
    readEnvValue('GEMINI_API_KEY') || fileConfig.GEMINI_API_KEY;
  const allowedOrigins = parseAllowedOrigins(
    readEnvValue('CLOUDFRONT_ORIGINS') ||
      readEnvValue('ALLOWED_ORIGINS') ||
      fileConfig.CLOUDFRONT_ORIGINS ||
      fileConfig.ALLOWED_ORIGINS
  );
  const piiHashSecret =
    readEnvValue('PII_HASH_SECRET') ?? fileConfig.PII_HASH_SECRET ?? '';

  const missing = [];
  if (!s3Bucket) missing.push('S3_BUCKET');
  if (!geminiApiKey) missing.push('GEMINI_API_KEY');

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  process.env.AWS_REGION = region;
  process.env.S3_BUCKET = s3Bucket;
  process.env.GEMINI_API_KEY = geminiApiKey;
  if (piiHashSecret && !process.env.PII_HASH_SECRET) {
    process.env.PII_HASH_SECRET = piiHashSecret;
  }

  return Object.freeze({
    AWS_REGION: region,
    S3_BUCKET: s3Bucket,
    GEMINI_API_KEY: geminiApiKey,
    CLOUDFRONT_ORIGINS: allowedOrigins,
    PII_HASH_SECRET: piiHashSecret || '',
  });
}

let runtimeConfigCache;
let runtimeConfigError;
let runtimeConfigLogged = false;

function loadRuntimeConfig({ logOnError = false } = {}) {
  if (runtimeConfigCache) {
    return runtimeConfigCache;
  }
  try {
    runtimeConfigCache = buildRuntimeConfig();
    runtimeConfigError = undefined;
    runtimeConfigLogged = false;
    return runtimeConfigCache;
  } catch (err) {
    runtimeConfigCache = undefined;
    runtimeConfigError = err;
    if (logOnError && !runtimeConfigLogged) {
      logStructured('error', 'runtime_config_load_failed', {
        error: serializeError(err),
      });
      runtimeConfigLogged = true;
    }
    return undefined;
  }
}

function getRuntimeConfig() {
  const config = loadRuntimeConfig();
  if (config) {
    return config;
  }
  throw runtimeConfigError || new Error('Runtime configuration unavailable');
}

const runtimeConfigSnapshot = loadRuntimeConfig({ logOnError: true });

const app = express();

app.use((req, res, next) => {
  if (!req.requestId) {
    req.requestId = createIdentifier();
  }
  res.locals.requestId = req.requestId;
  ensureRequestContext(req.requestId);
  captureUserContext(req, res);
  const cleanup = () => {
    clearRequestContext(req.requestId);
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const pathLabel = req.originalUrl || req.url;
  logStructured('info', 'http_request_received', {
    requestId: req.requestId,
    method: req.method,
    path: pathLabel,
  });
  res.on('finish', () => {
    logStructured('info', 'http_request_completed', {
      requestId: req.requestId,
      method: req.method,
      path: pathLabel,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      contentLength: res.get('Content-Length'),
    });
  });
  res.on('error', (err) => {
    logStructured('error', 'http_response_error', {
      requestId: req.requestId,
      method: req.method,
      path: pathLabel,
      error: serializeError(err),
    });
  });
  next();
});

const allowedOrigins =
  runtimeConfigSnapshot?.CLOUDFRONT_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS;
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (!allowedOrigins.length || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (allowedOrigin === origin) return true;
      if (allowedOrigin.endsWith('*')) {
        const prefix = allowedOrigin.slice(0, -1);
        return origin.startsWith(prefix);
      }
      return false;
    });

    return callback(
      isAllowed ? null : new Error('Origin not allowed by CORS policy')
    );
  },
  credentials: true
};
app.use(cors(corsOptions));

app.use((req, res, next) => {
  const socket = req.socket;
  if (!socket || typeof socket.on !== 'function') {
    const emitter = new EventEmitter();
    const noop = () => {};
    const proxy = {
      destroyed: false,
      readable: true,
      writable: false,
      setKeepAlive: noop,
      setNoDelay: noop,
      setTimeout: noop,
      address: () => ({ port: 443 }),
      end: noop,
      destroy: () => {
        proxy.destroyed = true;
      }
    };
    Object.setPrototypeOf(proxy, emitter);
    proxy.on = emitter.on.bind(emitter);
    proxy.once = emitter.once.bind(emitter);
    proxy.addListener = emitter.addListener.bind(emitter);
    proxy.removeListener = emitter.removeListener.bind(emitter);
    proxy.removeAllListeners = emitter.removeAllListeners.bind(emitter);
    proxy.emit = emitter.emit.bind(emitter);
    Object.defineProperty(req, 'socket', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: proxy
    });
    Object.defineProperty(req, 'connection', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: proxy
    });
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use((req, res, next) => {
  captureUserContext(req, res);
  next();
});

if (clientAssetsAvailable()) {
  app.use(express.static(clientDistDir, { index: false, fallthrough: true }));
} else {
  logStructured('warn', 'client_build_missing', {
    path: clientIndexPath,
  });
}

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const mimetype = file.mimetype || '';
    const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);

    if (!allowedExtensions.has(ext)) {
      return cb(
        new Error('Unsupported resume format. Please upload a PDF, DOC, or DOCX file.')
      );
    }

    if (ext === '.pdf') {
      if (mimetype && mimetype !== 'application/pdf') {
        return cb(new Error('The uploaded file is not a valid PDF document.'));
      }
      return cb(null, true);
    }

    if (ext === '.docx') {
      if (mimetype && !/wordprocessingml|officedocument|ms-?word/i.test(mimetype)) {
        return cb(new Error('The uploaded file is not a valid DOCX document.'));
      }
      return cb(null, true);
    }

    if (ext === '.doc') {
      if (mimetype && !/ms-?word|officedocument|application\/octet-stream/i.test(mimetype)) {
        return cb(new Error('The uploaded file is not a valid DOC document.'));
      }
      return cb(null, true);
    }

    return cb(null, true);
  }
});

const uploadResume = upload.single('resume');

const CV_TEMPLATES = ['modern', 'ucmo', 'professional', 'vibrant', '2025'];
const CL_TEMPLATES = ['cover_modern', 'cover_classic'];
const TEMPLATE_IDS = CV_TEMPLATES; // Backwards compatibility
const ALL_TEMPLATES = [...CV_TEMPLATES, ...CL_TEMPLATES];

// Map each CV template to a style group so we can ensure contrasting picks
const CV_TEMPLATE_GROUPS = {
  modern: 'modern',
  ucmo: 'classic',
  professional: 'professional',
  vibrant: 'creative',
  2025: 'futuristic'
};

// Predefined contrasting template pairs used when no explicit templates are provided
const CONTRASTING_PAIRS = [
  ['modern', 'vibrant'],
  ['ucmo', '2025'],
  ['professional', 'vibrant']
];

const TECHNICAL_TERMS = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c\\+\\+',
  'c#',
  'go',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'react',
  'angular',
  'vue',
  'node',
  'express',
  'next.js',
  'docker',
  'kubernetes',
  'aws',
  'gcp',
  'azure',
  'sql',
  'mysql',
  'postgresql',
  'mongodb',
  'git',
  'graphql',
  'linux',
  'bash',
  'redis',
  'jenkins',
  'terraform',
  'ansible'
];
function selectTemplates({
  defaultClTemplate = CL_TEMPLATES[0],
  template1,
  template2,
  coverTemplate1,
  coverTemplate2,
  cvTemplates,
  clTemplates
} = {}) {
  if (typeof cvTemplates === 'string') {
    try {
      cvTemplates = JSON.parse(cvTemplates);
    } catch {
      cvTemplates = cvTemplates.split(',');
    }
  }
  if (typeof clTemplates === 'string') {
    try {
      clTemplates = JSON.parse(clTemplates);
    } catch {
      clTemplates = clTemplates.split(',');
    }
  }
  if (Array.isArray(cvTemplates)) {
    if (!template1 && cvTemplates[0]) template1 = cvTemplates[0];
    if (!template2 && cvTemplates[1]) template2 = cvTemplates[1];
  }
  if (Array.isArray(clTemplates)) {
    if (!coverTemplate1 && clTemplates[0]) coverTemplate1 = clTemplates[0];
    if (!coverTemplate2 && clTemplates[1]) coverTemplate2 = clTemplates[1];
  }
  // Always include 'ucmo' and ensure the other template is from a different group
  const UCMO_GROUP = CV_TEMPLATE_GROUPS['ucmo'];
  const pickOther = (exclude = []) => {
    const candidates = CV_TEMPLATES.filter(
      (t) =>
        t !== 'ucmo' &&
        !exclude.includes(t) &&
        CV_TEMPLATE_GROUPS[t] !== UCMO_GROUP
    );
    return candidates[Math.floor(Math.random() * candidates.length)] || 'modern';
  };

  const userOther = [template1, template2].find(
    (t) => t && t !== 'ucmo' && CV_TEMPLATE_GROUPS[t] !== UCMO_GROUP
  );

  if (template1 === 'ucmo') {
    template2 = userOther || pickOther([template1]);
  } else if (template2 === 'ucmo') {
    template1 = userOther || pickOther([template2]);
  } else {
    template1 = 'ucmo';
    template2 = userOther || pickOther([template1]);
  }

  if (template1 === template2) {
    template2 = pickOther([template1]);
  }

  if (!coverTemplate1 && !coverTemplate2) {
    coverTemplate1 = CL_TEMPLATES[0];
    coverTemplate2 = CL_TEMPLATES.find((t) => t !== coverTemplate1) || CL_TEMPLATES[0];
  } else {
    coverTemplate1 = coverTemplate1 || defaultClTemplate;
    coverTemplate2 = coverTemplate2 || defaultClTemplate;
  }
  if (coverTemplate1 === coverTemplate2) {
    coverTemplate2 = CL_TEMPLATES.find((t) => t !== coverTemplate1) || CL_TEMPLATES[0];
  }
  return { template1, template2, coverTemplate1, coverTemplate2 };
}

const configuredRegion =
  runtimeConfigSnapshot?.AWS_REGION || readEnvValue('AWS_REGION') || DEFAULT_AWS_REGION;
process.env.AWS_REGION = configuredRegion;

const region = configuredRegion;
const s3Client = new S3Client({ region });
errorLogS3Client = s3Client;
errorLogBucket =
  runtimeConfigSnapshot?.S3_BUCKET ||
  process.env.S3_BUCKET ||
  readEnvValue('S3_BUCKET');
const piiHashSecret =
  runtimeConfigSnapshot?.PII_HASH_SECRET || process.env.PII_HASH_SECRET || '';

const parsedRetention = Number.parseInt(
  process.env.SESSION_RETENTION_DAYS || '',
  10
);
const SESSION_RETENTION_DAYS =
  Number.isFinite(parsedRetention) && parsedRetention > 0
    ? parsedRetention
    : 30;
const SESSION_PREFIX = '';
const SESSION_PATH_REGEX = /^([^/]+)\/cv\/(\d{4}-\d{2}-\d{2})\//;

function anonymizePersonalData(value) {
  if (!value) return '';
  const hash = crypto.createHash('sha256');
  hash.update(String(value));
  if (piiHashSecret) {
    hash.update(piiHashSecret);
  }
  // GDPR: store irreversible hashes so DynamoDB never contains raw identifiers.
  return hash.digest('hex');
}

function buildCopySource(bucket, key) {
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
  return `${bucket}/${encodedKey}`;
}

function extractLocationMetadata(req = {}) {
  const headers = req?.headers || {};
  const readHeader = (name) => {
    const raw = headers[name];
    if (Array.isArray(raw)) return raw[0];
    return raw || '';
  };

  const city =
    readHeader('x-vercel-ip-city') ||
    readHeader('cloudfront-viewer-city') ||
    readHeader('x-geoip-city');
  const region =
    readHeader('x-vercel-ip-country-region') ||
    readHeader('x-vercel-ip-region') ||
    readHeader('cloudfront-viewer-state') ||
    readHeader('x-geoip-region');
  const country =
    readHeader('x-vercel-ip-country') ||
    readHeader('cloudfront-viewer-country') ||
    readHeader('x-geoip-country');

  const parts = [];
  if (city) parts.push(city);
  if (region) parts.push(region);
  if (country) parts.push(country);

  return {
    city: city || '',
    region: region || '',
    country: country || '',
    label: parts.length ? parts.join(', ') : 'Unknown',
  };
}

async function purgeExpiredSessions({
  bucket: overrideBucket,
  retentionDays = SESSION_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  const { S3_BUCKET } = getSecrets();
  const bucket = overrideBucket || S3_BUCKET;
  if (!bucket) {
    throw new Error('S3 bucket not configured');
  }
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - retentionMs;
  let continuationToken;
  let scanned = 0;
  const keysToDelete = [];

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: SESSION_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    const contents = response.Contents || [];
    for (const object of contents) {
      const key = object.Key;
      if (!key) continue;
      scanned += 1;
      const match = key.match(SESSION_PATH_REGEX);
      if (!match) continue;
      const sessionDate = new Date(match[2]);
      if (Number.isNaN(sessionDate.getTime())) continue;
      if (sessionDate.getTime() <= cutoff) {
        keysToDelete.push(key);
      }
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  let deleted = 0;
  const expiredSessionPrefixes = new Set();
  for (let i = 0; i < keysToDelete.length; i += 1000) {
    const chunk = keysToDelete.slice(i, i + 1000).map((Key) => ({ Key }));
    if (!chunk.length) continue;
    for (const { Key } of chunk) {
      if (!Key) continue;
      const match = Key.match(SESSION_PATH_REGEX);
      if (match) {
        expiredSessionPrefixes.add(`${match[1]}/cv/${match[2]}/`);
      }
    }
    const result = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true },
      })
    );
    deleted += result?.Deleted?.length ?? chunk.length;
  }

  let metadataDeleted = 0;
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';
  const dynamoClient = new DynamoDBClient({ region });
  const keysForDeletion = new Set();
  let lastEvaluatedKey;
  do {
    try {
      if (!tableName) {
        break;
      }
      const response = await dynamoClient.send(
        new ScanCommand({
          TableName: tableName,
          ProjectionExpression:
            '#pk, s3Key, uploadedAt, cv1Url, cv2Url, coverLetter1Url, coverLetter2Url',
          ExpressionAttributeNames: { '#pk': 'linkedinProfileUrl' },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      const items = response.Items || [];
      for (const item of items) {
        const pk = item?.linkedinProfileUrl?.S;
        if (!pk) continue;
        const s3Key = item?.s3Key?.S || '';
        let shouldDelete = false;
        let detectedPrefix;
        if (s3Key) {
          const match = s3Key.match(SESSION_PATH_REGEX);
          if (match) {
            detectedPrefix = `${match[1]}/cv/${match[2]}/`;
            const sessionDate = new Date(match[2]);
            if (!Number.isNaN(sessionDate.getTime())) {
              if (sessionDate.getTime() <= cutoff) {
                shouldDelete = true;
                expiredSessionPrefixes.add(detectedPrefix);
              } else if (expiredSessionPrefixes.has(detectedPrefix)) {
                shouldDelete = true;
              }
            }
          }
        }

        if (!shouldDelete) {
          const uploadedAt = item?.uploadedAt?.S;
          if (uploadedAt) {
            const uploadedDate = new Date(uploadedAt);
            if (!Number.isNaN(uploadedDate.getTime()) && uploadedDate.getTime() <= cutoff) {
              shouldDelete = true;
            }
          }
        }

        if (!shouldDelete) continue;

        keysForDeletion.add(pk);
        if (detectedPrefix) {
          expiredSessionPrefixes.add(detectedPrefix);
        }
        const linkedUrls = [
          item?.cv1Url?.S,
          item?.cv2Url?.S,
          item?.coverLetter1Url?.S,
          item?.coverLetter2Url?.S,
        ];
        for (const url of linkedUrls) {
          if (typeof url !== 'string' || !url) continue;
          try {
            const parsed = new URL(url);
            const derivedKey = decodeURIComponent(
              parsed.pathname.replace(/^\//, '')
            );
            if (!derivedKey) continue;
            const derivedMatch = derivedKey.match(SESSION_PATH_REGEX);
            if (derivedMatch) {
              expiredSessionPrefixes.add(
                `${derivedMatch[1]}/cv/${derivedMatch[2]}/`
              );
            }
          } catch (err) {
            logStructured('warn', 'metadata_url_parse_failed', {
              url,
              error: serializeError(err),
            });
          }
        }
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    } catch (err) {
      if (err?.name === 'ResourceNotFoundException') {
        logStructured('warn', 'dynamo_table_missing_for_retention', {
          tableName,
        });
        lastEvaluatedKey = undefined;
        break;
      }
      logStructured('error', 'dynamo_scan_failed_for_retention', {
        tableName,
        error: serializeError(err),
      });
      throw err;
    }
  } while (lastEvaluatedKey);

  for (const pk of keysForDeletion) {
    try {
      const response = await dynamoClient.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: pk } },
        })
      );
      metadataDeleted += 1;
    } catch (err) {
      logStructured('error', 'dynamo_metadata_delete_failed', {
        tableName,
        key: pk,
        error: serializeError(err),
      });
    }
  }

  // GDPR: scheduled retention removes artefacts that exceed policy windows.
  return { bucket, scanned, deleted, retentionDays, metadataDeleted };
}

async function handleDataRetentionEvent(event = {}) {
  const detailRetention = Number.parseInt(event?.detail?.retentionDays, 10);
  const retentionDays =
    Number.isFinite(detailRetention) && detailRetention > 0
      ? detailRetention
      : SESSION_RETENTION_DAYS;
  const now = event?.time ? new Date(event.time) : new Date();
  try {
    const result = await purgeExpiredSessions({
      retentionDays,
      now,
    });
    logStructured('info', 's3_session_retention_completed', {
      ...result,
      source: event?.source,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (err) {
    logStructured('error', 's3_session_retention_failed', {
      error: serializeError(err),
      source: event?.source,
    });
    throw err;
  }
}

function getSecrets() {
  return getRuntimeConfig();
}

async function fetchLinkedInProfile(url) {
  try {
    const { data: html } = await axios.get(url);
    const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
    const headlineMatch =
      html.match(/<title>([^<]*)<\/title>/i) || html.match(/"headline":"(.*?)"/i);
    const headline = headlineMatch ? strip(headlineMatch[1]) : '';

    const extractList = (id) => {
      const sectionRegex = new RegExp(
        `<section[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/section>`,
        'i'
      );
      const sectionMatch = html.match(sectionRegex);
      if (!sectionMatch) return [];
      const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const items = [];
      let m;
      while ((m = itemRegex.exec(sectionMatch[1])) !== null) {
        const itemHtml = m[1];
        const text = strip(itemHtml);
        if (!text) continue;
        if (id === 'experience') {
          const titleMatch =
            itemHtml.match(/<h3[^>]*>(.*?)<\/h3>/i) ||
            itemHtml.match(/"title"\s*:\s*"(.*?)"/i);
          const companyMatch =
            itemHtml.match(/<h4[^>]*>(.*?)<\/h4>/i) ||
            itemHtml.match(/"companyName"\s*:\s*"(.*?)"/i);
          const dateMatch =
            itemHtml.match(/<span[^>]*>([^<]*\d{4}[^<]*)<\/span>/i) ||
            itemHtml.match(/"dateRange"\s*:\s*"(.*?)"/i);
          let startDate = '';
          let endDate = '';
          if (dateMatch) {
            const parts = strip(dateMatch[1]).split(/[-–to]+/);
            startDate = parts[0]?.trim() || '';
            endDate = parts[1]?.trim() || '';
          }
          items.push({
            company: companyMatch ? strip(companyMatch[1]) : '',
            title: titleMatch ? strip(titleMatch[1]) : '',
            startDate,
            endDate
          });
        } else if (id === 'licenses_and_certifications') {
          const nameMatch =
            itemHtml.match(/<h3[^>]*>(.*?)<\/h3>/i) ||
            itemHtml.match(/"name"\s*:\s*"(.*?)"/i);
          const providerMatch =
            itemHtml.match(/<h4[^>]*>(.*?)<\/h4>/i) ||
            itemHtml.match(/"issuer"\s*:\s*"(.*?)"/i);
          const urlMatch =
            itemHtml.match(/href=["']([^"']+)["']/i) ||
            itemHtml.match(/"url"\s*:\s*"(.*?)"/i);
          items.push({
            name: nameMatch ? strip(nameMatch[1]) : '',
            provider: providerMatch ? strip(providerMatch[1]) : '',
            url: urlMatch ? strip(urlMatch[1]) : '',
          });
        } else {
          items.push(text);
        }
      }
      return items;
    };

    return {
      headline,
      experience: extractList('experience'),
      education: extractList('education'),
      skills: extractList('skills'),
      certifications: extractList('licenses_and_certifications'),
    };
  } catch (err) {
    throw new Error('LinkedIn profile fetch failed');
  }
}

async function fetchCredlyProfile(url) {
  try {
    const { data: html } = await axios.get(url);
    const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
    const badgeRegex = /<div[^>]*class=["'][^"']*badge[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    const badges = [];
    let m;
    while ((m = badgeRegex.exec(html)) !== null) {
      const block = m[1];
      const statusMatch = block.match(/<span[^>]*class=["'][^"']*(?:status|state)[^"']*["'][^>]*>(.*?)<\/span>/i);
      if (statusMatch && !/active/i.test(strip(statusMatch[1]))) continue;
      const nameMatch = block.match(/class=["'][^"']*badge-name[^"']*["'][^>]*>(.*?)<\/span>/i);
      const providerMatch = block.match(/class=["'][^"']*(?:issuer-name|org|organization)[^"']*["'][^>]*>(.*?)<\/span>/i);
      const urlMatch = block.match(/<a[^>]*href=["']([^"']+)["']/i);
      let url = urlMatch ? strip(urlMatch[1]) : '';
      url = normalizeUrl(url);
      badges.push({
        name: nameMatch ? strip(nameMatch[1]) : '',
        provider: providerMatch ? strip(providerMatch[1]) : '',
        url,
        source: 'credly'
      });
    }
    return badges;
  } catch (err) {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      const authError = new Error('Credly authentication required');
      authError.code = 'CREDLY_AUTH_REQUIRED';
      throw authError;
    }
    if (err?.response?.status === 404) {
      const notFound = new Error('Credly profile not found');
      notFound.code = 'CREDLY_PROFILE_NOT_FOUND';
      throw notFound;
    }
    logStructured('warn', 'credly_profile_fetch_error', {
      url,
      status: err?.response?.status,
      error: serializeError(err),
    });
    return [];
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseManualCertificates(value) {
  if (!value) return [];
  const results = [];
  const pushCertificate = (item) => {
    if (!item) return;
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) return;
      let name = text;
      let provider = '';
      const byMatch = text.match(/^(.*?)[\s-]*\bby\b\s+(.*)$/i);
      if (byMatch) {
        name = byMatch[1].trim();
        provider = byMatch[2].trim();
      } else {
        const split = text.split(/[-–|]/);
        if (split.length >= 2) {
          name = split[0].trim();
          provider = split.slice(1).join(' ').trim();
        } else {
          const parenMatch = text.match(/^(.*?)\s*\(([^)]+)\)$/);
          if (parenMatch) {
            name = parenMatch[1].trim();
            provider = parenMatch[2].trim();
          }
        }
      }
      results.push({ name, provider, source: 'manual' });
      return;
    }
    if (typeof item === 'object' && item) {
      const name = (item.name || item.title || '').trim();
      const provider = (item.provider || item.issuer || item.organization || '').trim();
      if (!name && !provider) return;
      results.push({ name, provider, source: item.source || 'manual' });
    }
  };

  if (Array.isArray(value)) {
    value.forEach(pushCertificate);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (/^\s*\[/.test(trimmed)) {
      try {
        const parsed = JSON5.parse(trimmed);
        if (Array.isArray(parsed)) parsed.forEach(pushCertificate);
      } catch (err) {
        logStructured('warn', 'manual_certificate_json_parse_failed', {
          error: serializeError(err),
        });
      }
    } else {
      trimmed
        .split(/\r?\n|;/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach(pushCertificate);
    }
  } else if (typeof value === 'object') {
    pushCertificate(value);
  }

  return results;
}

const COMMON_CERTIFICATIONS = [
  { keyword: 'aws', suggestion: 'AWS Certified Solutions Architect' },
  { keyword: 'azure', suggestion: 'Microsoft Certified: Azure Administrator Associate' },
  { keyword: 'gcp', suggestion: 'Google Cloud Professional Cloud Architect' },
  { keyword: 'pmp', suggestion: 'Project Management Professional (PMP)' },
  { keyword: 'scrum', suggestion: 'Certified Scrum Master (CSM)' },
  { keyword: 'security+', suggestion: 'CompTIA Security+' },
  { keyword: 'cissp', suggestion: 'CISSP - Certified Information Systems Security Professional' },
  { keyword: 'cpa', suggestion: 'Certified Public Accountant (CPA)' },
];

function dedupeCertificates(certificates = []) {
  const seen = new Set();
  const result = [];
  certificates.forEach((cert = {}) => {
    const name = (cert.name || '').trim();
    const provider = (cert.provider || '').trim();
    const url = (cert.url || '').trim();
    if (!name && !provider && !url) return;
    const key = `${name.toLowerCase()}|${provider.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      name,
      provider,
      url,
      source: cert.source || 'resume',
    });
  });
  return result;
}

function computeSkillGap(jobSkills = [], resumeSkills = []) {
  const resumeSet = new Set(
    (resumeSkills || []).map((skill) => skill.toLowerCase())
  );
  return (jobSkills || [])
    .map((skill) => String(skill || '').trim())
    .filter(Boolean)
    .filter((skill) => !resumeSet.has(skill.toLowerCase()));
}

const MONTH_LOOKUP = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseExperienceDate(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (/present|current/i.test(normalized)) {
    return new Date();
  }

  const isoMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    if (Number.isFinite(year) && Number.isFinite(month)) {
      return new Date(Date.UTC(year, Math.max(0, Math.min(11, month)), 1));
    }
  }

  const monthMatch = normalized.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i
  );
  if (monthMatch) {
    const monthKey = monthMatch[1].slice(0, 3).toLowerCase();
    const year = Number(monthMatch[2]);
    const month = MONTH_LOOKUP[monthKey];
    if (Number.isFinite(year) && typeof month === 'number') {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  const yearMatch = normalized.match(/(\d{4})/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (Number.isFinite(year)) {
      return new Date(Date.UTC(year, 0, 1));
    }
  }

  return null;
}

function estimateExperienceYears(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return 0;
  }

  const ranges = entries
    .map((entry = {}) => {
      const start = parseExperienceDate(entry.startDate);
      const end = parseExperienceDate(entry.endDate) || new Date();
      if (!start || Number.isNaN(start.valueOf())) return null;
      if (Number.isNaN(end.valueOf()) || end < start) {
        return [start.getTime(), new Date().getTime()];
      }
      return [start.getTime(), end.getTime()];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  if (!ranges.length) return 0;

  const merged = [];
  for (const range of ranges) {
    const [start, end] = range;
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push([start, end]);
      continue;
    }
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const totalMs = merged.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
  const years = totalMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.round(years * 10) / 10);
}

function extractRequiredExperience(text = '') {
  if (!text) return null;
  const normalized = String(text);
  const regex = /(?:at\s+least|minimum(?:\s+of)?|min\.?|require(?:s|d)?|with)?\s*(\d+)(?:\s*[-–to]{1,3}\s*(\d+))?\s*(\+|plus)?\s*(?:years|yrs)/gi;
  let highestMin = null;
  let highestMax = null;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const first = Number(match[1]);
    const second = match[2] ? Number(match[2]) : null;
    const hasPlus = Boolean(match[3]);
    if (!Number.isFinite(first)) continue;
    let localMin = first;
    let localMax = second;
    if (Number.isFinite(localMax)) {
      if (localMax < localMin) {
        [localMin, localMax] = [localMax, localMin];
      }
    } else if (hasPlus) {
      localMax = null;
    } else {
      localMax = first;
    }
    if (!Number.isFinite(localMin)) continue;
    if (highestMin === null || localMin > highestMin) {
      highestMin = localMin;
    }
    if (localMax === null) {
      highestMax = null;
    } else if (highestMax !== null) {
      highestMax = Math.max(highestMax, localMax);
    } else {
      highestMax = localMax;
    }
  }

  if (highestMin === null) return null;
  return { minYears: highestMin, maxYears: highestMax };
}

function suggestRelevantCertifications(jobText = '', jobSkills = [], existing = []) {
  const normalized = jobText.toLowerCase();
  const existingNames = new Set(
    existing.map((cert) => (cert.name || '').toLowerCase()).filter(Boolean)
  );
  const skillSet = new Set((jobSkills || []).map((skill) => skill.toLowerCase()));
  const suggestions = [];
  for (const item of COMMON_CERTIFICATIONS) {
    if (existingNames.has(item.suggestion.toLowerCase())) continue;
    if (normalized.includes(item.keyword) || skillSet.has(item.keyword)) {
      suggestions.push(item.suggestion);
    }
  }
  return suggestions;
}

function extractSectionContent(resumeText = '', headingPattern) {
  const lines = String(resumeText).split(/\r?\n/);
  const regex =
    headingPattern instanceof RegExp
      ? headingPattern
      : new RegExp(`^#\s*${headingPattern}\b`, 'i');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i].trim())) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    return { heading: '', content: [], start: -1, end: -1 };
  }
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^#\s+/.test(lines[j].trim())) {
      end = j;
      break;
    }
  }
  return {
    heading: lines[start],
    content: lines.slice(start + 1, end),
    start,
    end,
    lines,
  };
}

function replaceSectionContent(
  resumeText = '',
  headingPattern,
  newContentLines = [],
  { headingLabel, insertIndex = 1 } = {}
) {
  const lines = String(resumeText).split(/\r?\n/);
  const regex =
    headingPattern instanceof RegExp
      ? headingPattern
      : new RegExp(`^#\s*${headingPattern}\b`, 'i');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i].trim())) {
      start = i;
      break;
    }
  }

  const sanitizedContent = newContentLines.map((line) => line.replace(/\s+$/, ''));

  if (start === -1) {
    const headingLine = `# ${headingLabel || 'Summary'}`;
    const before = lines.slice(0, Math.min(insertIndex, lines.length));
    const after = lines.slice(Math.min(insertIndex, lines.length));
    const block = [headingLine, ...sanitizedContent];
    const merged = [...before, ...block, ...after]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
    return merged.trim();
  }

  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^#\s+/.test(lines[j].trim())) {
      end = j;
      break;
    }
  }
  const before = lines.slice(0, start + 1);
  const after = lines.slice(end);
  const merged = [...before, ...sanitizedContent, ...after]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return merged.trim();
}

function sanitizeSectionLines(lines = []) {
  const cleaned = lines.map((line) => line.replace(/\s+$/, ''));
  while (cleaned.length && !cleaned[0].trim()) cleaned.shift();
  while (cleaned.length && !cleaned[cleaned.length - 1].trim()) cleaned.pop();
  return cleaned;
}

function deriveHeadingLabel(sectionHeading = '', fallback = '') {
  const heading = sectionHeading || fallback;
  if (!heading) return '';
  return heading.replace(/^#\s*/, '').trim();
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applySectionUpdate(originalResume, updatedResume, options = {}) {
  const { pattern, defaultLabel, insertIndex = 1 } = options;
  const baseSection = extractSectionContent(originalResume, pattern);
  const updatedSection = extractSectionContent(updatedResume, pattern);
  const baseContent = sanitizeSectionLines(baseSection.content);
  let newContent = sanitizeSectionLines(
    updatedSection.content.length ? updatedSection.content : baseContent
  );
  const precedingLine =
    updatedSection && typeof updatedSection.start === 'number' && updatedSection.start > 0
      ? (updatedSection.lines?.[updatedSection.start - 1] || '').trim()
      : '';
  if (
    newContent.length &&
    precedingLine &&
    newContent[0].trim().toLowerCase() === precedingLine.toLowerCase()
  ) {
    newContent = newContent.slice(1);
  }
  if (!newContent.length) {
    return {
      updatedResume: originalResume,
      beforeExcerpt: baseContent.join('\n').trim(),
      afterExcerpt: '',
    };
  }

  const headingLabel =
    deriveHeadingLabel(updatedSection.heading, baseSection.heading) || defaultLabel;

  const merged = replaceSectionContent(originalResume, pattern, newContent, {
    headingLabel,
    insertIndex,
  });

  return {
    updatedResume: merged,
    beforeExcerpt: baseContent.join('\n').trim(),
    afterExcerpt: newContent.join('\n').trim(),
  };
}

function normalizeSectionExcerpt(updatedResume, pattern, fallback = '') {
  const section = extractSectionContent(updatedResume, pattern);
  if (!Array.isArray(section.content) || !section.content.length) {
    return fallback || '';
  }
  let lines = sanitizeSectionLines(section.content);
  const precedingLine =
    section && typeof section.start === 'number' && section.start > 0
      ? (section.lines?.[section.start - 1] || '').trim()
      : '';
  if (
    lines.length &&
    precedingLine &&
    lines[0].trim().toLowerCase() === precedingLine.toLowerCase()
  ) {
    lines = lines.slice(1);
  }
  const joined = lines.join('\n').trim();
  return joined || fallback || '';
}

function inferDesignationLine(updatedLines = [], originalLines = [], context = {}) {
  const { jobTitle = '' } = context;
  const normalizedJob = jobTitle.trim().toLowerCase();
  const searchWindow = Math.min(updatedLines.length, 12);

  if (normalizedJob) {
    for (let i = 0; i < searchWindow; i++) {
      const line = updatedLines[i]?.trim();
      if (line && line.toLowerCase().includes(normalizedJob)) {
        return line;
      }
    }
  }

  for (let i = 1; i < searchWindow; i++) {
    const updated = updatedLines[i]?.trim();
    const original = originalLines[i]?.trim();
    if (updated && updated !== original) {
      return updated;
    }
  }

  return jobTitle || '';
}

function applyDesignationUpdate(originalResume, updatedResume, context = {}) {
  const baseLines = String(originalResume || '').split(/\r?\n/);
  const updatedLines = String(updatedResume || '').split(/\r?\n/);
  const candidate = inferDesignationLine(updatedLines, baseLines, context).trim();
  if (!candidate) {
    return {
      updatedResume: originalResume,
      beforeExcerpt: '',
      afterExcerpt: '',
    };
  }

  const { currentTitle = '', originalTitle = '' } = context;
  const searchTitles = [currentTitle, originalTitle].filter(Boolean);
  const maxIndex = Math.min(baseLines.length, 12);
  let replaced = false;
  let before = '';

  for (let i = 0; i < maxIndex && !replaced; i++) {
    const line = baseLines[i];
    if (!line || !line.trim()) continue;
    for (const title of searchTitles) {
      if (!title) continue;
      const regex = new RegExp(escapeRegExp(title), 'i');
      const match = line.match(regex);
      if (match) {
        baseLines[i] = line.replace(regex, candidate);
        before = match[0];
        replaced = true;
        break;
      }
    }
  }

  if (!replaced) {
    const alreadyExists = baseLines.some(
      (line) => line && line.trim().toLowerCase() === candidate.toLowerCase()
    );
    if (!alreadyExists) {
      const insertIndex = baseLines.length > 1 ? 1 : baseLines.length;
      baseLines.splice(insertIndex, 0, candidate);
    }
  }

  const merged = baseLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    updatedResume: merged,
    beforeExcerpt: before,
    afterExcerpt: candidate,
  };
}

function enforceTargetedUpdate(type, originalResume, result = {}, context = {}) {
  const safeOriginal = String(originalResume || '');
  const baseResult = {
    updatedResume: result.updatedResume || safeOriginal,
    beforeExcerpt: result.beforeExcerpt || '',
    afterExcerpt: result.afterExcerpt || '',
    explanation: result.explanation,
    confidence: result.confidence,
    changeDetails: Array.isArray(result.changeDetails) ? result.changeDetails : [],
  };

  if (!safeOriginal) {
    return baseResult;
  }

  if (type === 'enhance-all') {
    let workingResume = safeOriginal;
    const beforeSnippets = [];
    const afterSnippets = [];
    const changeDetails = Array.isArray(baseResult.changeDetails)
      ? [...baseResult.changeDetails]
      : [];
    const targetJobTitle = (context.jobTitle || '').trim();

    const defaultReasons = {
      summary: targetJobTitle
        ? `Summary now mirrors the ${targetJobTitle} mandate with measurable wins.`
        : 'Summary now mirrors the target role with measurable wins.',
      skills: targetJobTitle
        ? `Skills list surfaces ${targetJobTitle} keywords pulled from the JD.`
        : 'Skills list surfaces the JD keywords recruiters scan for.',
      experience: targetJobTitle
        ? `Experience bullets emphasise impact tied to ${targetJobTitle} responsibilities.`
        : 'Experience bullets emphasise accomplishments tied to the JD priorities.',
      designation: targetJobTitle
        ? `Headline now states ${targetJobTitle} to remove designation mismatch.`
        : 'Headline now reflects the target job title for ATS clarity.',
    };

    const trackChange = (key, label, sectionResult = {}, reasons, options = {}) => {
      const nextResume = sectionResult.updatedResume || workingResume;
      const didChange = nextResume !== workingResume;
      const forceRecord = Boolean(options.forceRecord);
      if (!didChange && !forceRecord) {
        return;
      }

      const before = (sectionResult.beforeExcerpt || '').trim();
      const after = (sectionResult.afterExcerpt || '').trim();
      if (didChange) {
        if (before) beforeSnippets.push(before);
        if (after) afterSnippets.push(after);
        workingResume = nextResume;
      } else if (forceRecord && after) {
        afterSnippets.push(after);
      }
      const reasonList = Array.isArray(reasons)
        ? reasons.filter(Boolean)
        : reasons
        ? [reasons]
        : [];
      changeDetails.push({
        key,
        section: label,
        label,
        before,
        after,
        reasons: reasonList,
      });
    };

    trackChange(
      'summary',
      'Summary',
      applySectionUpdate(workingResume, baseResult.updatedResume, {
        pattern: /^#\s*summary/i,
        defaultLabel: 'Summary',
        insertIndex: 1,
      }),
      defaultReasons.summary
    );

    trackChange(
      'skills',
      'Skills',
      applySectionUpdate(workingResume, baseResult.updatedResume, {
        pattern: /^#\s*skills/i,
        defaultLabel: 'Skills',
        insertIndex: 2,
      }),
      defaultReasons.skills
    );

    trackChange(
      'experience',
      'Work Experience',
      applySectionUpdate(workingResume, baseResult.updatedResume, {
        pattern: /^#\s*(work\s+)?experience/i,
        defaultLabel: 'Work Experience',
      }),
      defaultReasons.experience
    );

    trackChange(
      'designation',
      'Headline',
      applyDesignationUpdate(
        workingResume,
        baseResult.updatedResume,
        context
      ),
      defaultReasons.designation,
      {
        forceRecord: Boolean(
          (context && (context.jobTitle || context.currentTitle || context.originalTitle)) ||
            (baseResult.beforeExcerpt || baseResult.afterExcerpt)
        ),
      }
    );

    const combinedBefore = [baseResult.beforeExcerpt, ...beforeSnippets]
      .map((snippet) => (snippet || '').trim())
      .filter(Boolean)
      .join('\n\n');
    const combinedAfter = [baseResult.afterExcerpt, ...afterSnippets]
      .map((snippet) => (snippet || '').trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      ...baseResult,
      updatedResume: workingResume,
      beforeExcerpt: combinedBefore || baseResult.beforeExcerpt || '',
      afterExcerpt: combinedAfter || baseResult.afterExcerpt || '',
      changeDetails,
    };
  }

  if (!baseResult.updatedResume) {
    return { ...baseResult, updatedResume: safeOriginal };
  }

  if (type === 'improve-summary') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: /^#\s*summary/i,
      defaultLabel: 'Summary',
      insertIndex: 1,
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'add-missing-skills') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: /^#\s*skills/i,
      defaultLabel: 'Skills',
      insertIndex: 2,
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'align-experience') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: /^#\s*(work\s+)?experience/i,
      defaultLabel: 'Work Experience',
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'change-designation') {
    const designationResult = applyDesignationUpdate(
      safeOriginal,
      baseResult.updatedResume,
      context
    );
    return {
      ...baseResult,
      ...designationResult,
      beforeExcerpt: designationResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: designationResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  return baseResult;
}

const IMPROVEMENT_CONFIG = {
  'improve-summary': {
    title: 'Improve Summary',
    focus: [
      'Rewrite the Summary section so it mirrors the target job title and top responsibilities.',
      'Surface quantifiable achievements from the resume that prove readiness for the role.',
      'Work in missing or high-priority skills naturally without introducing new facts.',
    ],
  },
  'add-missing-skills': {
    title: 'Add Missing Skills',
    focus: [
      'Blend the missing or underrepresented skills into both the Skills list and relevant experience bullets.',
      'Revise existing bullets so each new skill is backed by duties already present in the resume.',
      'Avoid duplicating bullets—edit succinctly while keeping ATS-friendly formatting.',
    ],
  },
  'change-designation': {
    title: 'Change Designation',
    focus: [
      'Update the headline or latest role title to match the target job title while keeping chronology intact.',
      'Adjust surrounding bullets so they evidence the updated title with truthful scope and impact.',
      'Retain original employers, dates, and role ordering exactly.',
    ],
  },
  'align-experience': {
    title: 'Align Experience',
    focus: [
      'Rewrite the most relevant experience bullets so they mirror the job description’s responsibilities and metrics.',
      'Highlight missing keywords or responsibilities from the JD using facts already in the resume.',
      'Keep bullet formatting, tense, and chronology consistent throughout the section.',
    ],
  },
  'enhance-all': {
    title: 'Enhance All',
    focus: [
      'Deliver the summary, skills, designation, and experience improvements in one cohesive pass.',
      'Address missing skills and JD priorities everywhere they fit naturally in the resume.',
      'Ensure the final resume remains ATS-safe, truthful, and consistent in tone and formatting.',
    ],
  },
};

function condensePromptValue(value, maxLength = 600) {
  if (Array.isArray(value)) {
    return condensePromptValue(
      value
        .flatMap((item) => {
          if (!item) return [];
          if (typeof item === 'string') return item;
          if (typeof item === 'number') return String(item);
          if (typeof item === 'object') {
            if (item && typeof item.name === 'string') return item.name;
            return Object.values(item || {})
              .filter((val) => typeof val === 'string')
              .join(' ');
          }
          return [];
        })
        .filter(Boolean)
        .join(', '),
      maxLength
    );
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return condensePromptValue(value.text, maxLength);
    }
    return condensePromptValue(
      Object.values(value)
        .filter((val) => typeof val === 'string')
        .join(' '),
      maxLength
    );
  }

  const text = typeof value === 'number' ? String(value) : String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatPromptLine(label, value, { fallback = 'Not provided', maxLength = 600 } = {}) {
  const condensed = condensePromptValue(value, maxLength);
  return `- ${label}: ${condensed || fallback}`;
}

function buildImprovementPrompt(type, context, instructions) {
  const requests = Array.isArray(instructions)
    ? instructions.filter(Boolean)
    : [instructions].filter(Boolean);

  const resumeText = context.resumeText || '';
  const jobDescription = context.jobDescription || '';
  const sections = collectSectionText(resumeText, context.linkedinData || {}, context.knownCertificates || []);
  const combinedCertificates = [
    ...(context.knownCertificates || []),
    ...(context.manualCertificates || []),
  ];
  const candidateName = extractName(resumeText);

  const candidateContextBlock = [
    'Candidate context:',
    formatPromptLine('Candidate name', candidateName, { fallback: 'Not listed' }),
    formatPromptLine('Summary snapshot', sections.summary, {
      fallback: 'Summary not detected',
      maxLength: 400,
    }),
    formatPromptLine('Experience snapshot', sections.experience, {
      fallback: 'Experience details limited',
      maxLength: 450,
    }),
    formatPromptLine('Resume-listed skills', sections.skills || context.resumeSkills || [], {
      fallback: 'Skills not provided',
      maxLength: 300,
    }),
    formatPromptLine('Certifications noted', sections.certifications || combinedCertificates, {
      fallback: 'None mentioned',
      maxLength: 250,
    }),
  ].join('\n');

  const jobContextLines = [
    formatPromptLine('Target job title', context.jobTitle, { fallback: 'Not supplied' }),
    formatPromptLine('Job description priority skills', context.jobSkills || [], {
      fallback: 'Not provided',
      maxLength: 350,
    }),
    formatPromptLine('Skills missing from resume', context.missingSkills || [], {
      fallback: 'None detected',
      maxLength: 350,
    }),
  ];

  const jobContextBlock = ['Job context:', ...jobContextLines, formatPromptLine('JD excerpt', jobDescription, {
    fallback: 'Not provided',
    maxLength: 600,
  })].join('\n');

  const actionBlock = requests.length
    ? `Action requests for ${IMPROVEMENT_CONFIG[type]?.title || 'this improvement'}:\n- ${requests.join('\n- ')}`
    : '';

  const ruleLines = [
    'Preserve the existing chronology, dates, and employers.',
    'Keep URLs untouched.',
    'Maintain bullet formatting where present.',
    'Leave unrelated sections unchanged.',
    'Only include information that can be inferred from the resume and supplied context.',
    'Do not invent achievements, companies, or dates.',
  ];

  if (requests.length) {
    ruleLines.push('In the explanation, reference the JD skill or responsibility you reinforced.');
  }

  const ruleBlock = `Rules:\n- ${ruleLines.join('\n- ')}`;

  return [
    'You are an elite ATS resume editor. Apply the requested transformation without fabricating experience.',
    candidateContextBlock,
    jobContextBlock,
    actionBlock,
    ruleBlock,
    'Return ONLY valid JSON with keys: updatedResume (string), beforeExcerpt (string), afterExcerpt (string), explanation (string), confidence (0-1).',
    'Resume text:\n"""',
    resumeText,
    '"""',
    'Job description text:\n"""',
    jobDescription || 'Not provided',
    '"""',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function fallbackImprovement(type, context) {
  const resumeText = context.resumeText || '';
  const jobTitle = context.jobTitle || '';
  const jobSkills = context.jobSkills || [];
  const missingSkills = context.missingSkills || [];
  const fallbackSkills = missingSkills.length ? missingSkills : jobSkills.slice(0, 3);
  const fallbackSkillText = summarizeList(fallbackSkills, {
    conjunction: 'and',
  });

  const baseResult = {
    updatedResume: resumeText,
    beforeExcerpt: '',
    afterExcerpt: '',
    explanation: 'No changes applied.',
    confidence: 0.2,
  };

  if (!resumeText) {
    return baseResult;
  }

  if (type === 'improve-summary') {
    const section = extractSectionContent(resumeText, /^#\s*summary/i);
    const before = section.content.join('\n').trim();
    const summaryLine = `Forward-looking ${jobTitle || 'professional'} with strengths in ${
      fallbackSkillText || 'delivering measurable outcomes'
    } and a record of translating goals into results.`;
    const updatedResume = replaceSectionContent(resumeText, /^#\s*summary/i, [summaryLine], {
      headingLabel: 'Summary',
      insertIndex: 1,
    });
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: summaryLine,
      explanation: 'Refreshed the summary using job-aligned language.',
      confidence: 0.35,
    };
  }

  if (type === 'add-missing-skills') {
    if (!fallbackSkills.length) {
      return {
        ...baseResult,
        explanation: 'No missing skills detected—resume already covers the job keywords.',
      };
    }
    const section = extractSectionContent(resumeText, /^#\s*skills/i);
    const before = section.content.join('\n').trim();
    const bullet = `- ${fallbackSkills.join(', ')}`;
    const existing = section.content.some((line) =>
      fallbackSkills.some((skill) => line.toLowerCase().includes(skill.toLowerCase()))
    );
    const newContent = existing
      ? section.content
      : [...section.content.filter(Boolean), bullet];
    const updatedResume = replaceSectionContent(
      resumeText,
      /^#\s*skills/i,
      newContent,
      { headingLabel: 'Skills', insertIndex: 2 }
    );
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: existing ? before : bullet,
      explanation: existing
        ? 'Skills section already covers the requested keywords.'
        : 'Added missing job keywords into the skills section.',
      confidence: existing ? 0.25 : 0.33,
    };
  }

  if (type === 'change-designation') {
    if (!jobTitle) {
      return {
        ...baseResult,
        explanation: 'No job title provided to align designation.',
      };
    }
    const currentTitle = context.currentTitle || context.originalTitle || '';
    const escaped = currentTitle
      ? currentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    let updatedResume = resumeText;
    let before = currentTitle;
    let replaced = false;
    if (escaped) {
      const regex = new RegExp(escaped, 'i');
      if (regex.test(resumeText)) {
        updatedResume = resumeText.replace(regex, jobTitle);
        replaced = true;
      }
    }
    if (!replaced) {
      const lines = resumeText.split(/\r?\n/);
      if (lines.length) {
        lines.splice(1, 0, jobTitle.toUpperCase());
        updatedResume = lines.join('\n');
      }
    }
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: jobTitle,
      explanation: 'Aligned the visible designation with the target job title.',
      confidence: 0.3,
    };
  }

  if (type === 'align-experience') {
    const section = extractSectionContent(resumeText, /^#\s*(work\s+)?experience/i);
    const headingLabel = section.heading.replace(/^#\s*/, '') || 'Work Experience';
    const before = section.content.join('\n').trim();
    const focusPhrase = fallbackSkillText
      ? `${fallbackSkillText} initiatives`
      : 'role priorities';
    const bullet = `- Highlighted ${jobTitle || 'role'} achievements demonstrating ownership of ${focusPhrase}.`;
    const newContent = [...section.content, bullet];
    const updatedResume = replaceSectionContent(
      resumeText,
      /^#\s*(work\s+)?experience/i,
      newContent,
      { headingLabel }
    );
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: bullet,
      explanation: 'Added an accomplishment bullet that mirrors the job description focus.',
      confidence: 0.32,
    };
  }

  if (type === 'enhance-all') {
    let interim = fallbackImprovement('improve-summary', context);
    interim = fallbackImprovement('add-missing-skills', {
      ...context,
      resumeText: interim.updatedResume,
    });
    interim = fallbackImprovement('change-designation', {
      ...context,
      resumeText: interim.updatedResume,
    });
    const finalResult = fallbackImprovement('align-experience', {
      ...context,
      resumeText: interim.updatedResume,
    });
    return {
      ...finalResult,
      explanation: 'Applied deterministic improvements for summary, skills, designation, and experience.',
      confidence: 0.34,
    };
  }

  return baseResult;
}

async function runTargetedImprovement(type, context = {}) {
  const config = IMPROVEMENT_CONFIG[type];
  if (!config) {
    throw new Error(`Unsupported improvement type: ${type}`);
  }
  const resumeText = String(context.resumeText || '').trim();
  if (!resumeText) {
    throw new Error('resumeText is required');
  }

  const jobDescription = String(context.jobDescription || '').trim();
  const jobSkills = Array.isArray(context.jobSkills) ? context.jobSkills : [];
  const resumeSkills = Array.isArray(context.resumeSkills) && context.resumeSkills.length
    ? context.resumeSkills
    : extractResumeSkills(resumeText);
  const missingSkills = Array.isArray(context.missingSkills) && context.missingSkills.length
    ? context.missingSkills
    : computeSkillGap(jobSkills, resumeSkills);
  const knownCertificates = Array.isArray(context.knownCertificates)
    ? dedupeCertificates(context.knownCertificates)
    : [];
  const manualCertificates = Array.isArray(context.manualCertificates)
    ? context.manualCertificates
    : parseManualCertificates(context.manualCertificates);

  const promptContext = {
    resumeText,
    jobDescription,
    jobTitle: context.jobTitle || '',
    jobSkills,
    resumeSkills,
    missingSkills,
    knownCertificates,
    manualCertificates,
  };

  const sectionContext = buildSectionPreservationContext(resumeText);

  const scopeContext = {
    jobTitle: context.jobTitle || '',
    currentTitle: context.currentTitle || '',
    originalTitle: context.originalTitle || '',
  };

  try {
    const model = await getSharedGenerativeModel();
    if (model?.generateContent) {
      const prompt = buildImprovementPrompt(type, promptContext, config.focus);
      const response = await model.generateContent(prompt);
      const parsed = parseAiJson(response?.response?.text?.());
      if (parsed && typeof parsed === 'object') {
        const updated = sanitizeGeneratedText(
          parsed.updatedResume || parsed.resume || resumeText,
          { ...sectionContext }
        );
        const beforeExcerpt = (parsed.beforeExcerpt || '').trim();
        const afterExcerpt = (parsed.afterExcerpt || '').trim();
        const explanation = parsed.explanation || `Applied improvement: ${config.title}`;
        const confidence = Number.isFinite(parsed.confidence)
          ? clamp(parsed.confidence, 0, 1)
          : 0.6;
        const changeDetails = Array.isArray(parsed.changeDetails)
          ? parsed.changeDetails
          : [];
        return enforceTargetedUpdate(
          type,
          resumeText,
          {
            updatedResume: updated,
            beforeExcerpt,
            afterExcerpt,
            explanation,
            confidence,
            changeDetails,
          },
          scopeContext
        );
      }
    }
  } catch (err) {
    logStructured('warn', 'targeted_improvement_ai_failed', {
      type,
      error: serializeError(err),
    });
  }

  const fallbackResult = fallbackImprovement(type, {
    ...promptContext,
    currentTitle: context.currentTitle,
    originalTitle: context.originalTitle,
  });

  return enforceTargetedUpdate(type, resumeText, fallbackResult, scopeContext);
}

async function scrapeJobDescription(url, options = {}) {
  if (!url) throw new Error('Job description URL is required');

  const { maxAttempts = 3, timeout = 30000, waitUntil = 'networkidle2' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const browser = await getChromiumBrowser();
      if (browser) {
        const page = await browser.newPage();
        try {
          await page.goto(url, { waitUntil, timeout });
          const waitMs = JOB_DESCRIPTION_WAIT_MS;
          if (waitMs > 0) {
            if (typeof page.waitForTimeout === 'function') {
              await page.waitForTimeout(waitMs);
            } else {
              await sleep(waitMs);
            }
          }
          const html = await page.content();
          await page.close();
          if (!html || !html.trim()) {
            throw new Error('Job description page returned empty content');
          }
          return html;
        } catch (err) {
          try {
            await page.close();
          } catch {
            /* ignore */
          }
          throw err;
        }
      }

      const { data } = await axios.get(url, { timeout });
      const html =
        typeof data === 'string'
          ? data
          : typeof data?.toString === 'function'
          ? data.toString()
          : '';
      if (!html.trim()) {
        throw new Error('Job description response was empty');
      }
      return html;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = 500 * 2 ** (attempt - 1);
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to fetch job description');
}

function analyzeJobDescription(html) {
  const strip = (s) =>
    s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const text = strip(html);

  let title = '';
  const titleMatch =
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
    html.match(/<title>([^<]+)<\/title>/i) ||
    html.match(/"title"\s*:\s*"([^\"]+)"/i);
  if (titleMatch) title = strip(titleMatch[1]);

  const lower = text.toLowerCase();
  const skills = [];
  const termCounts = [];
  for (const term of TECHNICAL_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    const matches = lower.match(regex);
    const count = matches ? matches.length : 0;
    const normalized = term.replace(/\\+\\+/g, '++');
    if (count > 0) {
      skills.push(normalized);
    }
    termCounts.push({ term: normalized, count });
  }

  if (skills.length < 5) {
    const remaining = termCounts
      .filter(({ term }) => !skills.includes(term))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5 - skills.length)
      .map(({ term }) => term);
    skills.push(...remaining);
  }

  return { title, skills, text };
}

function extractResumeSkills(text = '') {
  const lower = text.toLowerCase();
  const skills = [];
  for (const term of TECHNICAL_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    if (regex.test(lower)) {
      skills.push(term.replace(/\\+\\+/g, '++'));
    }
  }
  return skills;
}

function calculateMatchScore(jobSkills = [], resumeSkills = []) {
  const table = jobSkills.map((skill) => {
    const matched = resumeSkills.some(
      (s) => s.toLowerCase() === skill.toLowerCase()
    );
    return { skill, matched };
  });
  const matchedCount = table.filter((r) => r.matched).length;
  const score = jobSkills.length
    ? Math.round((matchedCount / jobSkills.length) * 100)
    : 0;
  const newSkills = table.filter((r) => !r.matched).map((r) => r.skill);
  return { score, table, newSkills };
}

function collectSectionText(resumeText = '', linkedinData = {}, credlyCertifications = []) {
  const parsed = parseContent(resumeText, { skipRequiredSections: true });
  const sectionMap = {};
  parsed.sections.forEach((sec) => {
    const key = normalizeHeading(sec.heading).toLowerCase();
    const lines = sec.items
      .map((tokens) => tokens.map((t) => t.text || '').join('').trim())
      .filter(Boolean)
      .join('\n');
    sectionMap[key] = lines;
  });

  const fmtExp = (exp = {}) => {
    const datePart = exp.startDate || exp.endDate ? ` (${exp.startDate || ''} – ${exp.endDate || ''})` : '';
    const base = [exp.title, exp.company].filter(Boolean).join(' at ');
    return `${base}${datePart}`.trim();
  };
  const fmtCert = (c = {}) => (c.provider ? `${c.name} - ${c.provider}` : c.name);

  const summary = [sectionMap.summary || '', linkedinData.headline || '']
    .filter(Boolean)
    .join('\n');
  const experience = [
    extractExperience(resumeText).map(fmtExp).join('\n'),
    extractExperience(linkedinData.experience || []).map(fmtExp).join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
  const education = [
    extractEducation(resumeText).join('\n'),
    extractEducation(linkedinData.education || []).join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
  const certifications = [
    extractCertifications(resumeText).map(fmtCert).join('\n'),
    extractCertifications(linkedinData.certifications || []).map(fmtCert).join('\n'),
    (credlyCertifications || []).map(fmtCert).join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
  const skills = [
    extractResumeSkills(resumeText).join(', '),
    (linkedinData.skills || []).join(', '),
  ]
    .filter(Boolean)
    .join(', ');
  const projects = sectionMap.projects || '';

  return { summary, experience, education, certifications, skills, projects };
}

async function rewriteSectionsWithGemini(
  name,
  sections,
  jobDescription,
  jobSkills = [],
  generativeModel,
  sanitizeOptions = {}
) {
  if (!generativeModel?.generateContent) {
    const text = [name].join('\n');
    return {
      text: sanitizeGeneratedText(text, sanitizeOptions),
      project: '',
      modifiedTitle: '',
      addedSkills: [],
    };
  }
  try {
    const outputSchema = {
      summary: ['string'],
      experience: ['string'],
      education: ['string'],
      certifications: ['string'],
      skills: ['string'],
      projects: ['string'],
      projectSnippet: 'string',
      latestRoleTitle: 'string',
      latestRoleDescription: 'string',
      mandatorySkills: ['string'],
      addedSkills: ['string'],
    };
    const inputPayload = {
      candidateName: name,
      resumeSections: sections,
      jobDescription,
      jobSkills,
    };
    const prompt = [
      'You are an elite resume architect optimizing for Gemini/OpenAI outputs.',
      'Follow these rules precisely:',
      '- Never degrade CV structure; respect existing headings, chronology, and polished tone.',
      '- Align work experience bullets, summary lines, and highlights directly with the job description responsibilities using evidence from the candidate history.',
      '- Blend JD-critical skills into the skills section only when the candidate context proves them—avoid isolated keyword stuffing.',
      '- Emphasise measurable impact and outcomes that demonstrate the candidate already performs what the JD requires; do not fabricate new roles or tools.',
      '- Respond using ONLY valid JSON conforming to the provided schema.',
      '',
      'OUTPUT_SCHEMA:',
      JSON.stringify(outputSchema, null, 2),
      '',
      'INPUT_CONTEXT:',
      JSON.stringify(inputPayload, null, 2),
    ].join('\n');
    const result = await generativeModel.generateContent(prompt);
    const parsed = parseAiJson(result?.response?.text?.());
    if (parsed) {
      const mk = (heading, arr) =>
        arr?.length ? [`# ${heading}`, ...arr.map((b) => `- ${b}`)] : [];
      const lines = [name];
      lines.push(...mk('Summary', parsed.summary));

      const expItems = [];
      if (parsed.latestRoleTitle || parsed.latestRoleDescription) {
        const combined = [
          parsed.latestRoleTitle,
          parsed.latestRoleDescription,
        ]
          .filter(Boolean)
          .join(': ');
        expItems.push(`- ${combined}`.trim());
      }
      if (Array.isArray(parsed.experience)) {
        expItems.push(...parsed.experience.map((b) => `- ${b}`));
      }
      if (expItems.length) {
        lines.push('# Work Experience', ...expItems);
      }

      lines.push(...mk('Education', parsed.education));
      lines.push(...mk('Certifications', parsed.certifications));
      const skillsList = Array.from(
        new Set([...(parsed.skills || []), ...(parsed.mandatorySkills || [])])
      );
      lines.push(...mk('Skills', skillsList));
      lines.push(...mk('Projects', parsed.projects));
      const raw = lines.join('\n');
      const cleaned = sanitizeGeneratedText(
        sanitizeGeneratedText(raw, sanitizeOptions),
        sanitizeOptions
      );
      return {
        text: cleaned,
        project: parsed.projectSnippet || parsed.project || '',
        modifiedTitle: parsed.latestRoleTitle || '',
        addedSkills: parsed.addedSkills || [],
      };
    }
  } catch {
    /* ignore */
  }
  const fallback = [name].join('\n');
  return {
    text: sanitizeGeneratedText(fallback, sanitizeOptions),
    project: '',
    modifiedTitle: '',
    addedSkills: [],
  };
}

async function generateProjectSummary(
  jobDescription = '',
  resumeSkills = [],
  jobSkills = [],
  generativeModel
) {
  const skills = resumeSkills.length ? resumeSkills : jobSkills;
  if (!jobDescription && !skills.length) return '';
  const skillList = skills.slice(0, 3).join(', ');

  // Strip code blocks, symbols, and parentheses/braces from the job description
  const cleaned = jobDescription
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[<>\[\]{}()]/g, ' ')
    .replace(/[;#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const focus = cleaned.split(/[\n.!?]/)[0].trim().toLowerCase();

  if (generativeModel?.generateContent) {
    try {
      const prompt =
        `You are a resume assistant. Using the job description and top skills, ` +
        `write one concise sentence that begins with "Led a project" and ` +
        `describes a project using those skills.\nJob Description: ${cleaned}\n` +
        `Top Skills: ${skillList}`;
      const result = await generativeModel.generateContent(prompt);
      const text = result?.response?.text?.().trim() || '';
      if (text) {
        const aiSummary = text.replace(/[(){}]/g, '');
        return aiSummary.endsWith('.') ? aiSummary : `${aiSummary}.`;
      }
    } catch {
      // Fall back to manual generation
    }
  }

  let summary = '';
  if (skillList && focus) {
    summary = `Led a project using ${skillList} to ${focus}`;
  } else if (skillList) {
    summary = `Led a project using ${skillList} to achieve key objectives`;
  } else if (focus) {
    summary = `Led a project to ${focus}`;
  } else {
    summary = 'Led a project to achieve key objectives';
  }

  summary = summary.replace(/[(){}]/g, '');
  return `${summary}.`;
}

function mergeResumeWithLinkedIn(resumeText, profile, jobTitle) {
  const parts = [resumeText];
  if (profile && typeof profile === 'object') {
    if (profile.headline) parts.push(`LinkedIn Headline: ${profile.headline}`);
    if (profile.experience?.length) {
      const formatted = profile.experience.map((exp, idx) => {
        const e = { ...exp };
        if (idx === 0 && jobTitle) e.title = jobTitle;
        const datePart = e.startDate || e.endDate ? ` (${e.startDate || ''} – ${e.endDate || ''})` : '';
        const base = [e.title, e.company].filter(Boolean).join(' at ');
        return `${base}${datePart}`.trim();
      });
      parts.push('LinkedIn Experience: ' + formatted.join('; '));
    }
    if (profile.education?.length)
      parts.push('LinkedIn Education: ' + profile.education.join('; '));
    if (profile.skills?.length)
      parts.push('LinkedIn Skills: ' + profile.skills.join(', '));
  }
  return parts.join('\n');
}

function stripUrlPunctuation(url = '') {
  let trimmed = String(url || '').trim();
  trimmed = trimmed.replace(/^[\[({<]+/, '');
  while (/[)>.,;:!]+$/.test(trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function normalizeUrl(url = '') {
  let trimmed = stripUrlPunctuation(url);
  if (!trimmed) return '';
  if (/^(?:https?|mailto|tel):/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://www.credly.com${trimmed}`;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^(?:[a-z0-9.-]*\.)?linkedin\.com/i.test(trimmed)) return `https://${trimmed}`;
  if (/^(?:[a-z0-9.-]*\.)?credly\.com/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function extractContactDetails(text = '', linkedinProfileUrl = '') {
  const result = {
    email: '',
    phone: '',
    linkedin: '',
    contactLines: [],
  };

  if (text) {
    const emailMatch = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    const phoneMatch = String(text).match(/(\+?\d[\d\s().-]{7,}\d)/);
    if (phoneMatch) {
      result.phone = phoneMatch[0].replace(/\s+/g, ' ').trim();
    }
  }

  const normalizedLinkedIn = normalizeUrl(linkedinProfileUrl);
  if (normalizedLinkedIn) {
    result.linkedin = normalizedLinkedIn;
  }

  const seen = new Set();
  const pushLine = (label, value) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    const key = `${label}:${trimmed}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.contactLines.push(`${label}: ${trimmed}`);
  };

  pushLine('Email', result.email);
  pushLine('Phone', result.phone);
  pushLine('LinkedIn', result.linkedin);

  return result;
}

function parseLine(text) {
  let bullet = false;
  text = text.replace(/^[\-*–]\s+/, () => {
    bullet = true;
    return '';
  });
  const tokens = [];
  if (bullet) tokens.push({ type: 'bullet' });

  function processPart(part, forceBold = false) {
    const pieces = part.split(/(\n|\t)/);
    for (const piece of pieces) {
      if (piece === '\n') {
        tokens.push({ type: 'newline' });
        continue;
      }
      if (piece === '\t') {
        tokens.push({ type: 'tab' });
        continue;
      }
      const linkRegex =
        /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+|(?:www\.)?(?:[a-z0-9.-]*linkedin\.com|credly\.com)\S*)/gi;
      let lastIndex = 0;
      let match;

      function flushSegment(segment) {
        if (!segment) return;
        const segTokens = parseEmphasis(segment);
        if (forceBold) {
          segTokens.forEach((t) => {
            if (t.style === 'italic') t.style = 'bolditalic';
            else t.style = t.style && t.style.includes('bold') ? t.style : 'bold';
          });
        }
        tokens.push(...segTokens);
      }

      while ((match = linkRegex.exec(piece)) !== null) {
        let leadingParenCount = 0;
        if (match.index > lastIndex) {
          let segment = piece.slice(lastIndex, match.index);
          const leadingParens = segment.match(/\(+$/);
          if (leadingParens) {
            leadingParenCount = leadingParens[0].length;
            segment = segment.slice(0, -leadingParenCount);
          }
          flushSegment(segment);
        }
        if (match[1] && match[2]) {
          const href = normalizeUrl(match[2]);
          if (!href) {
            if (leadingParenCount) {
              flushSegment('('.repeat(leadingParenCount));
            }
            flushSegment(match[0]);
            lastIndex = linkRegex.lastIndex;
            continue;
          }
          tokens.push({
            type: 'link',
            text: match[1].replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        } else if (match[3]) {
          let raw = match[3];
          let trailing = '';
          while (/[)>.,;:]+$/.test(raw)) {
            trailing = raw.slice(-1) + trailing;
            raw = raw.slice(0, -1);
          }
          const href = normalizeUrl(raw);
          if (!href) {
            if (leadingParenCount) {
              flushSegment('('.repeat(leadingParenCount));
            }
            flushSegment(match[0]);
            lastIndex = linkRegex.lastIndex;
            continue;
          }
          const domainMap = {
            'linkedin.com': 'LinkedIn',
            'github.com': 'GitHub',
            'credly.com': 'Credly'
          };
          let label = raw;
          try {
            const hostname = new URL(href).hostname.replace(/^www\./, '');
            label = domainMap[hostname] || href;
          } catch {
            if (/linkedin\.com/i.test(href)) label = 'LinkedIn';
            else if (/credly\.com/i.test(href)) label = 'Credly';
            else label = href;
          }
          tokens.push({
            type: 'link',
            text: label.replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
          if (trailing) {
            let trailingToFlush = trailing;
            let parensToDrop = leadingParenCount;
            while (parensToDrop > 0 && trailingToFlush.startsWith(')')) {
              trailingToFlush = trailingToFlush.slice(1);
              parensToDrop--;
            }
            if (trailingToFlush) {
              flushSegment(trailingToFlush);
            }
          }
        }
        if (leadingParenCount > 0) {
          while (leadingParenCount > 0 && piece[linkRegex.lastIndex] === ')') {
            linkRegex.lastIndex++;
            leadingParenCount--;
          }
        }
        lastIndex = linkRegex.lastIndex;
      }
      if (lastIndex < piece.length) {
        flushSegment(piece.slice(lastIndex));
      }
    }
  }

  const pipeIdx = text.indexOf('|');
  if (pipeIdx !== -1) {
    const before = text.slice(0, pipeIdx).trim();
    const after = text.slice(pipeIdx + 1);
    processPart(before, true);
    tokens.push({ type: 'jobsep' });
    const segments = after.split('|');
    segments.forEach((seg) => {
      const trimmed = seg.trim();
      if (!trimmed) return;
      tokens.push({ type: 'paragraph', text: ' ' });
      processPart(trimmed, false);
    });
  } else {
    processPart(text, false);
  }

  if (tokens.length === 0) {
    return [{ type: 'paragraph', text: text.replace(/[*_]/g, '') }];
  }
  const filtered = tokens.filter((t) => t.type !== 'paragraph' || t.text);
  filtered.forEach((t, i) => {
    if (t.type === 'newline' || t.type === 'tab' || t.type === 'jobsep') return;
    t.continued = i < filtered.length - 1;
  });
  return filtered;
}

function parseEmphasis(segment) {
  const tokens = [];
  let i = 0;
  let buffer = '';
  const stack = [];

  const pushBuffer = () => {
    if (!buffer) return;
    tokens.push({ type: 'paragraph', text: buffer, style: styleFromStack(), continued: true });
    buffer = '';
  };

  const styleFromStack = () => {
    const hasBold = stack.some((s) => s.type === 'bold' || s.type === 'bolditalic');
    const hasItalic = stack.some((s) => s.type === 'italic' || s.type === 'bolditalic');
    if (hasBold && hasItalic) return 'bolditalic';
    if (hasBold) return 'bold';
    if (hasItalic) return 'italic';
    return undefined;
  };

  while (i < segment.length) {
    const ch = segment[i];
    if (ch === '*' || ch === '_') {
      let count = 1;
      while (segment[i + count] === ch) count++;
      let remaining = count;
      while (remaining > 0) {
        const markerLen = remaining >= 3 ? 3 : remaining >= 2 ? 2 : 1;
        const type = markerLen === 3 ? 'bolditalic' : markerLen === 2 ? 'bold' : 'italic';
        const ahead = segment.indexOf(ch.repeat(markerLen), i + markerLen);
        if (
          stack.length &&
          stack[stack.length - 1].char === ch &&
          stack[stack.length - 1].type === type
        ) {
          pushBuffer();
          stack.pop();
        } else if (ahead !== -1) {
          pushBuffer();
          stack.push({ char: ch, type });
        }
        i += markerLen;
        remaining -= markerLen;
      }
    } else {
      buffer += ch;
      i++;
    }
  }

  pushBuffer();
  if (stack.length) {
    tokens.forEach((t) => {
      t.style = undefined;
    });
  }
  tokens.forEach((t) => {
    if (t.text) t.text = t.text.replace(/[*_]/g, '');
  });
  return tokens.filter((t) => t.text);
}


function normalizeHeading(heading = '') {
  const base = String(heading)
    .trim()
    .replace(/[-–—:.;,!?]+$/g, '')
    .trim();
  const normalized = base
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'experience') {
    return 'Work Experience';
  }
  if (lower.includes('training') || lower.includes('certification')) {
    return 'Certification';
  }
  return normalized;
}


function ensureRequiredSections(
  data,
  {
    resumeExperience = [],
    linkedinExperience = [],
    resumeEducation = [],
    linkedinEducation = [],
    resumeCertifications = [],
    linkedinCertifications = [],
    credlyCertifications = [],
    credlyProfileUrl,
    jobTitle,
    project,
    skipRequiredSections = false
  } = {},
) {
  if (skipRequiredSections) {
    data.sections = pruneEmptySections(data.sections || []);
    data.sections = mergeDuplicateSections(data.sections);
    return data;
  }
  const required = ['Work Experience', 'Education'];
  required.forEach((heading) => {
    const normalized = normalizeHeading(heading);
    const key = normalized.toLowerCase();
    let section = data.sections.find(
      (s) => normalizeHeading(s.heading).toLowerCase() === key
    );
    if (!section) {
      section = { heading: normalized, items: [] };
      data.sections.push(section);
    } else {
      section.heading = normalizeHeading(section.heading);
    }
    if (normalized.toLowerCase() === 'work experience') {
      section.items = section.items || [];
      const unparsedItems = [];
      const existing = section.items
        .map((tokens) => {
          const parts = [];
          for (const t of tokens) {
            if (t.type === 'newline') break;
            if (t.text) parts.push(t.text);
          }
          const line = parts.join('').trim();
          if (!line) {
            unparsedItems.push(tokens);
            return null;
          }
          const parsed = extractExperience([line])[0];
          if (!parsed) {
            unparsedItems.push(tokens);
            return null;
          }
          const key = [
            parsed.company || '',
            parsed.title || '',
            parsed.startDate || '',
            parsed.endDate || ''
          ]
            .map((s) => s.toLowerCase())
            .join('|');
          return { key, exp: parsed };
        })
        .filter(Boolean);

      const seen = new Set(existing.map((e) => e.key));
      const flatten = (arr = []) =>
        arr.flatMap((exp) => {
          if (Array.isArray(exp.roles) && exp.roles.length) {
            return exp.roles.map((role) => {
              const { roles, ...base } = exp;
              return {
                ...base,
                ...role,
                company: role.company || base.company || '',
                responsibilities:
                  role.responsibilities || base.responsibilities || [],
              };
            });
          }
          return exp;
        });
      const combined = [
        ...flatten(resumeExperience),
        ...flatten(linkedinExperience),
      ];
      const additions = [];
      combined.forEach((exp) => {
        const key = [
          exp.company || '',
          exp.title || '',
          exp.startDate || '',
          exp.endDate || ''
        ]
          .map((s) => s.toLowerCase())
          .join('|');
        if (!seen.has(key)) {
          seen.add(key);
          additions.push({ ...exp, key });
        }
      });

      additions.sort((a, b) => {
        const aDate = Date.parse(a.endDate || a.startDate || '');
        const bDate = Date.parse(b.endDate || b.startDate || '');
        return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
      });
      if (jobTitle && additions.length && existing.length === 0) {
        additions[0].title = jobTitle;
      }

      const format = (exp) => {
        const datePart =
          exp.startDate || exp.endDate
            ? ` (${exp.startDate || ''} – ${exp.endDate || ''})`
            : '';
        const base = [exp.title, exp.company].filter(Boolean).join(' at ');
        return `${base}${datePart}`.trim();
      };

      const toTokens = (exp, key) => {
        const tokens = parseLine(format(exp));
        if (!tokens.some((t) => t.type === 'bullet')) {
          tokens.unshift({ type: 'bullet' });
        }
        return { key, exp, tokens };
      };

      const formattedExisting = existing.map((e) => toTokens(e.exp, e.key));
      const formattedAdditions = additions.map((exp) =>
        toTokens(exp, exp.key)
      );

      const all = [...formattedExisting, ...formattedAdditions];
      all.sort((a, b) => {
        const aDate = Date.parse(a.exp.endDate || a.exp.startDate || '');
        const bDate = Date.parse(b.exp.endDate || b.exp.startDate || '');
        return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
      });

      if (all.length || unparsedItems.length) {
        section.items = [
          ...all.map((e) => e.tokens),
          ...unparsedItems
        ];
      } else {
        const otherExperienceHasItems = data.sections.some((s) => {
          if (s === section) return false;
          const heading = normalizeHeading(s.heading).toLowerCase();
          return (
            heading.includes('experience') &&
            Array.isArray(s.items) &&
            s.items.length > 0
          );
        });
        section.items = otherExperienceHasItems
          ? []
          : [parseLine('Information not provided')];
      }
    } else if (!section.items || section.items.length === 0) {
      if (normalized.toLowerCase() === 'education') {
        const bullets = resumeEducation.length
          ? resumeEducation
          : linkedinEducation;
        if (bullets.length) {
          section.items = bullets.map((b) => parseLine(String(b)));
        } else {
          section.items = [parseLine('Information not provided')];
        }
      } else {
        section.items = [parseLine('Information not provided')];
      }
    }
  });

  const hasProjects = data.sections.some(
    (s) => normalizeHeading(s.heading).toLowerCase() === 'projects'
  );
  if (!hasProjects && project) {
    const sentences = String(project)
      .replace(/\s+/g, ' ')
      .split(/[.!?]\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (sentences.length) {
      const section = { heading: 'Projects', items: [] };
      sentences.forEach((s) => {
        const tokens = parseLine(s.trim());
        if (!tokens.some((t) => t.type === 'bullet'))
          tokens.unshift({ type: 'bullet' });
        section.items.push(tokens);
      });
      data.sections.push(section);
    }
  }

  // Certifications section
  const certHeading = 'Certification';
  let certSection = data.sections.find(
    (s) => normalizeHeading(s.heading).toLowerCase() === certHeading.toLowerCase()
  );

  const existingCerts = certSection
    ? certSection.items.map((tokens) => {
        const text = tokens
          .map((t) => t.text || t.href || '')
          .join(' ')
          .trim();
        return extractCertifications([text])[0] || {};
      })
    : [];

  const allCerts = [
    ...credlyCertifications,
    ...existingCerts,
    ...resumeCertifications,
    ...linkedinCertifications,
  ];

  const deduped = [];
  const seenCerts = new Set();
  allCerts.forEach((cert) => {
    const key = [cert.name || '', cert.provider || '']
      .map((s) => s.toLowerCase())
      .join('|');
    if (!(cert.name || cert.provider) || seenCerts.has(key)) return;
    seenCerts.add(key);
    deduped.push({ ...cert, url: normalizeUrl(cert.url) });
  });

  const getCertDate = (cert = {}) =>
    new Date(
      cert.date ||
        cert.issueDate ||
        cert.issued ||
        cert.startDate ||
        cert.endDate ||
        0
    ).getTime();

  const limitedCerts = deduped
    .sort((a, b) => getCertDate(b) - getCertDate(a))
    .slice(0, 5);

  const certItems = limitedCerts.map((cert) => {
    const tokens = [{ type: 'bullet' }];
    const text = cert.provider
      ? `${cert.name} - ${cert.provider}`
      : cert.name;
    const href = normalizeUrl(cert.url);
    tokens.push({ type: 'link', text, href });
    return tokens;
  });

  const normalizedCredlyProfileUrl = normalizeUrl(credlyProfileUrl);
  if (normalizedCredlyProfileUrl) {
    const alreadyHasProfile = certItems.some((item) =>
      item.some((t) => t.type === 'link' && t.href === normalizedCredlyProfileUrl)
    );
    if (!alreadyHasProfile) {
      certItems.push([
        { type: 'bullet' },
        { type: 'link', text: 'Credly Profile', href: normalizedCredlyProfileUrl },
      ]);
    }
  }

  if (certItems.length) {
    if (!certSection) {
      certSection = { heading: certHeading, items: [] };
      data.sections.push(certSection);
    }
    certSection.heading = certHeading;
    certSection.items = certItems;
  } else if (certSection) {
    data.sections = data.sections.filter((s) => s !== certSection);
  }

  data.sections = pruneEmptySections(data.sections);
  data.sections = mergeDuplicateSections(data.sections);

  return data;
}


function normalizeName(name = 'Resume') {
  return String(name).replace(/[*_]/g, '');
}

function containsContactInfo(str = '') {
  const text = String(str).toLowerCase();
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /\b(?:\+?\d[\d\-\s().]{7,}\d)\b/.test(text) ||
    /\bhttps?:\/\/\S+/i.test(text) ||
    /linkedin|github/.test(text)
  );
}

function isJobEntry(tokens = []) {
  const text = tokens
    .map((t) => `${t.text || ''} ${t.href || ''}`)
    .join(' ');
  if (containsContactInfo(text)) return false;
  if (tokens.some((t) => t.type === 'jobsep')) return true;
  const lower = text.toLowerCase();
  const monthRange = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}.*?(present|\d{4})/;
  const yearRange = /\b\d{4}\b\s*[-–to]+\s*(present|\d{4})/;
  return monthRange.test(lower) || yearRange.test(lower);
}

const SKILL_CATEGORY_MAP = {
  database: [
    'mysql',
    'postgres',
    'postgresql',
    'oracle',
    'sqlite',
    'mongodb',
    'sql'
  ]
};

function splitSkills(sections = [], jobSkills = []) {
  const jobSet = new Set((jobSkills || []).map((s) => s.toLowerCase()));
  sections.forEach((sec) => {
    const heading = (sec.heading || '').toLowerCase();
    if (!heading.includes('skill')) return;
    if (jobSet.size === 0) {
      const expanded = [];
      sec.items.forEach((tokens) => {
        const text = tokens
          .filter((t) => t.text)
          .map((t) => t.text)
          .join('')
          .trim();
        if (/[;,]/.test(text)) {
          const skills = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
          skills.forEach((skill) => {
            const skillTokens = parseLine(skill);
            if (skillTokens[0]?.type !== 'bullet') {
              skillTokens.unshift({ type: 'bullet' });
            }
            expanded.push(skillTokens);
          });
        } else {
          if (tokens[0]?.type !== 'bullet') {
            const idx = tokens.findIndex((t) => t.type === 'bullet');
            if (idx > -1) {
              const [bullet] = tokens.splice(idx, 1);
              tokens.unshift(bullet);
            } else {
              tokens.unshift({ type: 'bullet' });
            }
          }
          expanded.push(tokens);
        }
      });
      sec.items = expanded;
      return;
    }
    const collected = [];
    sec.items.forEach((tokens) => {
      const text = tokens
        .filter((t) => t.text)
        .map((t) => t.text)
        .join('')
        .trim();
      if (!text) return;
      const parts = /[;,]/.test(text) ? text.split(/[;,]/) : [text];
      parts
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((skill) => {
          collected.push(skill);
        });
    });
    const uniqMap = new Map();
    collected.forEach((skill) => {
      const lower = skill.toLowerCase();
      if (!uniqMap.has(lower)) uniqMap.set(lower, skill);
    });
    let filtered = Array.from(uniqMap.entries());
    if (jobSet.size) {
      filtered = filtered.filter(([lower]) => jobSet.has(lower));
    }
    const groupMap = new Map();
    filtered.forEach(([lower, display]) => {
      let label = null;
      for (const [cat, members] of Object.entries(SKILL_CATEGORY_MAP)) {
        const all = [cat, ...members];
        if (all.includes(lower)) {
          label = cat;
          break;
        }
      }
      if (label) {
        if (!groupMap.has(label)) groupMap.set(label, new Set([label]));
        if (lower !== label) groupMap.get(label).add(display);
      } else {
        groupMap.set(display.toLowerCase(), new Set([display]));
      }
    });
    const grouped = Array.from(groupMap.values()).map((set) =>
      Array.from(set)
        .slice(0, 4)
        .join(', ')
    );
    const top = grouped.slice(0, 5);
    sec.items = top.map((text) => {
      const tokens = parseLine(text);
      if (tokens[0]?.type !== 'bullet') tokens.unshift({ type: 'bullet' });
      return tokens;
    });
  });
}

function moveSummaryJobEntries(sections = []) {
  const summary = sections.find(
    (s) => normalizeHeading(s.heading || '').toLowerCase() === 'summary'
  );
  if (!summary) return;
  let work = sections.find(
    (s) => normalizeHeading(s.heading || '').toLowerCase() ===
      'work experience'
  );
  if (!work) {
    work = { heading: normalizeHeading('Work Experience'), items: [] };
    sections.push(work);
  }
  const sanitizeTokens = (tokens = []) => {
    const filtered = tokens.filter((t) => {
      const raw = `${t.text || ''} ${t.href || ''}`.toLowerCase();
      if (t.type === 'jobsep') return false;
      return !containsContactInfo(raw);
    });
    while (filtered[0] && !(filtered[0].text || '').trim()) filtered.shift();
    while (
      filtered[filtered.length - 1] &&
      !(filtered[filtered.length - 1].text || '').trim()
    )
      filtered.pop();
    return filtered;
  };

  summary.items = summary.items.filter((tokens) => {
    const sanitized = sanitizeTokens(tokens);
    if (isJobEntry(sanitized)) {
      if (sanitized.length) work.items.push(sanitized);
      return false;
    }
    return true;
  });
  if (summary.items.length === 0) {
    const idx = sections.indexOf(summary);
    if (idx !== -1) sections.splice(idx, 1);
  }
}

function mergeDuplicateSections(sections = []) {
  const seen = new Map();
  const result = [];
  sections.forEach((sec) => {
    const heading = normalizeHeading(sec.heading || '');
    const key = heading.toLowerCase();
    const items = [...(sec.items || [])];
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.heading = normalizeHeading(existing.heading || '');
      if ((existing.items || []).length === 0 && items.length > 0) {
        const copy = { ...sec, heading, items };
        const idx = result.indexOf(existing);
        if (idx !== -1) result.splice(idx, 1);
        seen.set(key, copy);
        result.push(copy);
      } else {
        existing.items = existing.items.concat(items);
      }
    } else if (items.length > 0) {
      const copy = { ...sec, heading, items };
      seen.set(key, copy);
      result.push(copy);
    }
  });
  return result.filter((sec) => (sec.items || []).length > 0);
}

function pruneEmptySections(sections = []) {
  const hasVisibleText = (t) =>
    typeof t.text === 'string' && /[^\s\u2022·\-–—]/.test(t.text);
  return sections.filter((sec) => {
    sec.items = (sec.items || []).filter((tokens) =>
      tokens.some(hasVisibleText)
    );
    return sec.items.length > 0;
  });
}

function parseContent(text, options = {}) {
  const { defaultHeading = 'Summary', ...rest } = options;
  try {
    const data = JSON.parse(text);
    const name = normalizeName(data.name || 'Resume');
    const rawSections = Array.isArray(data.sections)
      ? data.sections
      : Object.entries(data).map(([heading, content]) => ({ heading, content }));
    const sections = rawSections.map((sec) => {
      const heading = sec.heading || '';
      const items = [];
      const src = sec.items || sec.content;
      if (Array.isArray(src)) {
        src.forEach((i) => {
          const tokens = parseLine(String(i));
          if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
          items.push(tokens);
        });
      } else if (src) {
        const tokens = parseLine(String(src));
        if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
        items.push(tokens);
      }
      return {
        heading,
        items: items.map((tokens) =>
          tokens.reduce((acc, t, i) => {
            acc.push(t);
            const next = tokens[i + 1];
            if (
              next &&
              t.text &&
              next.text &&
              !/\s$/.test(t.text) &&
              !/^\s/.test(next.text)
            ) {
              acc.push({ type: 'paragraph', text: ' ' });
            }
            return acc;
          }, [])
        )
      };
    });
    splitSkills(sections, options.jobSkills);
    moveSummaryJobEntries(sections);
    sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
    ensured.sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    ensured.sections = mergeDuplicateSections(ensured.sections);
    ensured.sections = pruneEmptySections(ensured.sections);
    return ensured;
  } catch {
    const lines = text.split(/\r?\n/);
    const name = normalizeName((lines.shift() || 'Resume').trim());
    const sections = [];
    let currentSection = { heading: defaultHeading, items: [] };
    sections.push(currentSection);
    let current = [];
    for (const raw of lines) {
      const line = raw.replace(/\t/g, '\u0009');
      const trimmed = line.trim();
      if (!trimmed) {
        if (current.length) current.push({ type: 'newline' });
        continue;
      }
      const headingMatch = trimmed.match(/^#{1,6}\s+(.*)/);
      if (headingMatch) {
        if (current.length) {
          currentSection.items.push(current);
          current = [];
        }
        if (
          currentSection.items.length === 0 &&
          currentSection.heading === defaultHeading
        ) {
          sections.pop();
        }
        currentSection = { heading: headingMatch[1].trim(), items: [] };
        sections.push(currentSection);
        continue;
      }
      const plainHeadingMatch = trimmed.match(
        /^((?:work|professional)\s*experience|education|skills|projects|certification|summary)$/i
      );
      if (plainHeadingMatch) {
        if (current.length) currentSection.items.push(current);
        if (
          currentSection.items.length === 0 &&
          currentSection.heading === defaultHeading
        ) {
          sections.pop();
        }
        currentSection = {
          heading: normalizeHeading(plainHeadingMatch[0]),
          items: []
        };
        sections.push(currentSection);
        current = [];
        continue;
      }
      const bulletMatch = line.match(/^[\-*–]\s+/);
      if (bulletMatch) {
        if (current.length) currentSection.items.push(current);
        current = parseLine(line);
        continue;
      }
      const indentMatch = line.match(/^\s+(.*)/);
      if (indentMatch && current.length) {
        current.push({ type: 'newline' });
        const tabs = (line.match(/^\s+/) || [''])[0];
        for (const ch of tabs) {
          if (ch === '\u0009') current.push({ type: 'tab' });
        }
        // Preserve internal spacing on continuation lines
        current.push(...parseLine(indentMatch[1]));
        continue;
      }
      if (current.length) currentSection.items.push(current);
      current = parseLine(line.trim());
    }
    if (current.length) currentSection.items.push(current);
    if (
      sections.length &&
      sections[0].heading === defaultHeading &&
      sections[0].items.length === 0
    ) {
      sections.shift();
    }
    sections.forEach((sec, sIdx) => {
      sec.items = sec.items.map((tokens) =>
        tokens.reduce((acc, t, i) => {
          acc.push(t);
          const next = tokens[i + 1];
          if (
            next &&
            t.text &&
            next.text &&
            !/\s$/.test(t.text) &&
            !/^\s/.test(next.text)
          ) {
            acc.push({ type: 'paragraph', text: ' ' });
          }
          return acc;
        }, [])
      );
    });
    splitSkills(sections, options.jobSkills);
    moveSummaryJobEntries(sections);
    sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
    ensured.sections.forEach((sec) => {
      sec.heading = normalizeHeading(sec.heading);
    });
    ensured.sections = mergeDuplicateSections(ensured.sections);
    ensured.sections = pruneEmptySections(ensured.sections);
    return ensured;
  }
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let generatePdf = async function (
  text,
  templateId = 'modern',
  options = {},
  generativeModel
) {
  const requestedTemplateId = templateId;
  let canonicalTemplateId = templateId;
  if (!ALL_TEMPLATES.includes(templateId)) {
    const baseCandidate = (templateId || '').split(/[-_]/)[0];
    if (ALL_TEMPLATES.includes(baseCandidate)) {
      canonicalTemplateId = baseCandidate;
    } else {
      canonicalTemplateId = 'modern';
    }
  }
  templateId = canonicalTemplateId;
  logStructured('debug', 'pdf_template_resolved', {
    requestedTemplateId,
    templateId,
    usingRenderer: templateId === '2025',
  });
  const data = parseContent(text, options);
  data.sections.forEach((sec) => {
    sec.heading = normalizeHeading(sec.heading);
  });
  data.sections = mergeDuplicateSections(data.sections);
  const templateParams =
    options && typeof options.templateParams === 'object'
      ? { ...options.templateParams }
      : {};
  if (templateId === '2025') {
    logStructured('debug', 'pdf_renderer_invoked', {
      templateId,
      requestedTemplateId,
      sectionCount: data.sections.length,
    });
    try {
      const pdfBuffer = await renderTemplatePdf(requestedTemplateId, {
        data,
        rawText: text,
        options: { ...options },
        templateParams,
        templateId
      });
      logStructured('info', 'pdf_renderer_completed', {
        templateId,
        requestedTemplateId,
        bytes: pdfBuffer.length,
      });
      return pdfBuffer;
    } catch (err) {
      logStructured('error', 'pdf_renderer_failed', {
        templateId,
        requestedTemplateId,
        error: serializeError(err),
      });
      if (err?.code === 'PDF_LIB_MISSING') {
        logStructured('warn', 'pdf_renderer_dependency_missing', {
          templateId,
          requestedTemplateId,
          dependency: 'pdf-lib',
        });
        canonicalTemplateId = 'modern';
        templateId = 'modern';
        logStructured('info', 'pdf_template_fallback_applied', {
          requestedTemplateId,
          fallbackTemplateId: templateId,
        });
      } else {
        throw err;
      }
    }
  }
  let html;
  if (templateId === 'ucmo' && generativeModel?.generateContent) {
    try {
      const prompt =
        `Using the resume text below, output complete HTML with inline CSS ` +
        `that matches the University of Central Missouri sample layout, ` +
        `including a contact info table at the top with the UCMO logo on the ` +
        `right, Times New Roman fonts, and similar spacing. Return only ` +
        `the HTML and CSS.\n\nResume Text:\n${text}`;
      const result = await generativeModel.generateContent(prompt);
      const generated = result?.response?.text?.();
      if (generated) html = generated;
    } catch {
      /* ignore */
    }
  }
  if (!html) {
    const templatePath = path.resolve('templates', `${templateId}.html`);
    logStructured('debug', 'pdf_template_loading', {
      templateId,
      templatePath,
    });
    let templateSource;
    try {
      templateSource = await fs.readFile(templatePath, 'utf-8');
    } catch (err) {
      logStructured('error', 'pdf_template_load_failed', {
        templateId,
        templatePath,
        error: serializeError(err),
      });
    }
    if (templateSource) {
      let css = '';
      try {
        css = await fs.readFile(path.resolve('templates', `${templateId}.css`), 'utf-8');
      } catch (err) {
        logStructured('debug', 'pdf_template_css_missing', {
          templateId,
          cssPath: path.resolve('templates', `${templateId}.css`),
          error: serializeError(err),
        });
      }
      // Convert token-based data to HTML for Handlebars templates
      const htmlData = {
        ...data,
        sections: data.sections.map((sec) => ({
          ...sec,
          items: sec.items.map((tokens) =>
            tokens
              .map((t, i) => {
                const text = t.text ? escapeHtml(t.text) : '';
                if (t.type === 'link') {
                  const next = tokens[i + 1];
                  const space = next && next.text && !/^\s/.test(next.text)
                    ? ' '
                    : '';
                  return `<a href="${t.href}">${text.trim()}</a>${space}`;
                }
                if (t.type === 'heading') {
                  return `<strong>${text}</strong>`;
                }
                if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
                if (t.style === 'bold') return `<strong>${text}</strong>`;
                if (t.style === 'italic') return `<em>${text}</em>`;
                if (t.type === 'newline') return '<br>';
                if (t.type === 'tab') return '<span class="tab"></span>';
                if (t.type === 'bullet') {
                  if (sec.heading?.toLowerCase() === 'education') {
                    return '<span class="edu-bullet">•</span> ';
                  }
                  return '<span class="bullet">•</span> ';
                }
                if (t.type === 'jobsep') return '';
                return text;
              })
              .join('')
          )
        }))
      };
      html = Handlebars.compile(templateSource)(htmlData);
      if (css) {
        html = html.replace('</head>', `<style>${css}</style></head>`);
      }
      logStructured('debug', 'pdf_template_compiled', {
        templateId,
        htmlLength: html.length,
      });
    } else {
      logStructured('warn', 'pdf_template_unavailable_fallback', {
        templateId,
      });
    }
  }
  if (html) {
    try {
      const browser = await getChromiumBrowser();
      if (browser) {
        try {
          logStructured('debug', 'pdf_chromium_render_start', {
            templateId,
            requestedTemplateId,
          });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle0' });
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true
          });
          logStructured('debug', 'pdf_chromium_render_complete', {
            templateId,
            requestedTemplateId,
            bytes: pdfBuffer.length,
          });
          return pdfBuffer;
        } finally {
          await browser.close();
        }
      } else {
        logStructured('debug', 'pdf_chromium_unavailable', {
          templateId,
          requestedTemplateId,
        });
      }
    } catch (err) {
      logStructured('error', 'chromium_pdf_generation_failed', {
        templateId,
        requestedTemplateId,
        error: serializeError(err),
      });
    }
  } else {
    logStructured('debug', 'pdf_chromium_skipped_no_html', {
      templateId,
      requestedTemplateId,
    });
  }

  const { default: PDFDocument } = await import('pdfkit');
  logStructured('debug', 'pdf_pdfkit_fallback', {
    templateId,
    requestedTemplateId,
  });
  const styleMap = {
    modern: {
      font: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique',
      headingColor: '#1f3c5d',
      bullet: '•',
      eduBullet: '•',
      bulletColor: '#4a5568',
      textColor: '#333',
      lineGap: 6,
      paragraphGap: 10
    },
    professional: {
      font: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique',
      headingColor: '#1f3c5d',
      bullet: '•',
      eduBullet: '•',
      bulletColor: '#4a5568',
      textColor: '#333',
      lineGap: 6,
      paragraphGap: 10
    },
    ucmo: {
      font: 'Times-Roman',
      bold: 'Times-Bold',
      italic: 'Times-Italic',
      headingColor: '#1f3c5d',
      bullet: '•',
      eduBullet: '•',
      bulletColor: '#4a5568',
      textColor: '#333',
      lineGap: 6,
      paragraphGap: 10
    },
    vibrant: {
      font: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique',
      headingColor: '#1f3c5d',
      bullet: '•',
      eduBullet: '•',
      bulletColor: '#4a5568',
      textColor: '#333',
      lineGap: 6,
      paragraphGap: 10
    },
    '2025': {
      font: 'Helvetica',
      bold: 'Helvetica-Bold',
      italic: 'Helvetica-Oblique',
      headingColor: '#1f3c5d',
      bullet: '•',
      eduBullet: '•',
      bulletColor: '#4a5568',
      textColor: '#333',
      lineGap: 6,
      paragraphGap: 8
    }
  };
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];
    doc.on('data', (d) => buffers.push(d));
    doc.on('end', () => {
      const result = Buffer.concat(buffers);
      logStructured('debug', 'pdf_pdfkit_fallback_complete', {
        templateId,
        requestedTemplateId,
        bytes: result.length,
      });
      resolve(result);
    });
    doc.on('error', (err) => {
      logStructured('error', 'pdf_pdfkit_fallback_failed', {
        templateId,
        requestedTemplateId,
        error: serializeError(err),
      });
      reject(err);
    });
    // Optional font embedding for Roboto/Helvetica families if available
    let robotoAvailable = false;
    try {
      const fontsDir = path.resolve('fonts');
      const reg = path.join(fontsDir, 'Roboto-Regular.ttf');
      const bold = path.join(fontsDir, 'Roboto-Bold.ttf');
      const italic = path.join(fontsDir, 'Roboto-Italic.ttf');
      if (fsSync.existsSync(reg)) {
        doc.registerFont('Roboto', reg);
        robotoAvailable = true;
      }
      if (fsSync.existsSync(bold)) doc.registerFont('Roboto-Bold', bold);
      if (fsSync.existsSync(italic)) doc.registerFont('Roboto-Italic', italic);
      const hReg = path.join(fontsDir, 'Helvetica.ttf');
      const hBold = path.join(fontsDir, 'Helvetica-Bold.ttf');
      const hItalic = path.join(fontsDir, 'Helvetica-Oblique.ttf');
      if (fsSync.existsSync(hReg)) doc.registerFont('Helvetica', hReg);
      if (fsSync.existsSync(hBold)) doc.registerFont('Helvetica-Bold', hBold);
      if (fsSync.existsSync(hItalic)) doc.registerFont('Helvetica-Oblique', hItalic);
    } catch {}
    if (robotoAvailable) {
      ['modern', 'vibrant'].forEach((tpl) => {
        styleMap[tpl].font = 'Roboto';
        styleMap[tpl].bold = 'Roboto-Bold';
        styleMap[tpl].italic = 'Roboto-Italic';
      });
    }
    const style = styleMap[templateId] || styleMap.modern;

    doc.font(style.bold)
      .fillColor(style.headingColor)
      .fontSize(20)
      .text(data.name, { paragraphGap: style.paragraphGap, align: 'left', lineGap: style.lineGap })
      .fillColor(style.textColor);

    data.sections.forEach((sec) => {
      doc
        .font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(14)
        .text(sec.heading, { paragraphGap: style.paragraphGap, lineGap: style.lineGap });
      (sec.items || []).forEach((tokens) => {
        const startY = doc.y;
        doc.font(style.font).fontSize(12);
        tokens.forEach((t, idx) => {
          if (t.type === 'bullet') {
            const glyph =
              sec.heading?.toLowerCase() === 'education'
                ? style.eduBullet || style.bullet
                : style.bullet;
            doc
              .fillColor(style.bulletColor)
              .text(`${glyph} `, { continued: true, lineGap: style.lineGap })
              .text('', { continued: true })
              .fillColor(style.textColor);
            return;
          }
          if (t.type === 'jobsep') {
            return;
          }
          if (t.type === 'newline') {
            const before = doc.y;
            doc.text('', { continued: false, lineGap: style.lineGap });
            if (doc.y === before) doc.moveDown();
            doc.text('   ', { continued: true, lineGap: style.lineGap });
            return;
          }
          const opts = { continued: idx < tokens.length - 1, lineGap: style.lineGap };
          if (t.type === 'tab') {
            doc.text('    ', opts);
            return;
          }
          if (t.type === 'link') {
            doc.fillColor('blue');
            doc.text(t.text, {
              lineGap: style.lineGap,
              link: t.href,
              underline: true,
              continued: false
            });
            if (idx < tokens.length - 1)
              doc.text('', { continued: true, lineGap: style.lineGap });
            doc.fillColor(style.textColor);
            return;
          }
          if (t.type === 'heading') {
            // Render heading tokens using the bold font
            doc.font(style.bold);
            doc.text(t.text, opts);
            doc.font(style.font);
            return;
          }
          if (t.style === 'bold' || t.style === 'bolditalic') doc.font(style.bold);
          else if (t.style === 'italic') doc.font(style.italic);
          else doc.font(style.font);
          doc.text(t.text, opts);
          doc.font(style.font);
        });
        if (doc.y === startY) doc.moveDown();
        const extra = style.paragraphGap / doc.currentLineHeight(true);
        if (extra) doc.moveDown(extra);
      });
      doc.moveDown();
    });
    doc.end();
  });
};

function setGeneratePdf(fn) {
  generatePdf = fn;
}

function uniqueTemplates(templates = []) {
  const seen = new Set();
  const result = [];
  for (const template of templates) {
    if (!template) continue;
    if (seen.has(template)) continue;
    seen.add(template);
    result.push(template);
  }
  return result;
}

async function generatePdfWithFallback({
  documentType,
  templates,
  buildOptionsForTemplate,
  inputText,
  generativeModel,
  logContext = {}
}) {
  const candidates = uniqueTemplates(Array.isArray(templates) ? templates : []);
  if (!candidates.length) {
    const error = new Error(`No PDF templates provided for ${documentType}`);
    logStructured('error', 'pdf_generation_no_templates', {
      ...logContext,
      documentType,
    });
    throw error;
  }

  let lastError;

  for (let index = 0; index < candidates.length; index += 1) {
    const templateId = candidates[index];
    const attempt = index + 1;
    logStructured('info', 'pdf_generation_attempt', {
      ...logContext,
      documentType,
      template: templateId,
      attempt,
      totalAttempts: candidates.length,
    });

    try {
      const options = (typeof buildOptionsForTemplate === 'function'
        ? buildOptionsForTemplate(templateId)
        : {}) || {};
      const optionKeys =
        options && typeof options === 'object' ? Object.keys(options) : [];
      const templateParamKeys =
        options && typeof options.templateParams === 'object'
          ? Object.keys(options.templateParams)
          : [];

      logStructured('debug', 'pdf_generation_options_prepared', {
        ...logContext,
        documentType,
        template: templateId,
        optionKeys,
        templateParamKeys,
      });

      const buffer = await generatePdf(
        inputText,
        templateId,
        options,
        generativeModel
      );

      logStructured('info', 'pdf_generation_attempt_succeeded', {
        ...logContext,
        documentType,
        template: templateId,
        attempt,
        bytes: buffer.length,
      });

      return { buffer, template: templateId };
    } catch (error) {
      lastError = error;
      logStructured('error', 'pdf_generation_attempt_failed', {
        ...logContext,
        documentType,
        template: templateId,
        attempt,
        error: serializeError(error),
      });
    }
  }

  logStructured('error', 'pdf_generation_all_attempts_failed', {
    ...logContext,
    documentType,
    templates: candidates,
    error: serializeError(lastError),
  });

  const failure = new Error(
    `PDF generation failed for ${documentType}. Tried templates: ${candidates.join(
      ', '
    )}`
  );
  if (lastError) {
    failure.cause = lastError;
  }
  failure.templatesTried = candidates;
  throw failure;
}

function normalizeExtractedText(text = '') {
  if (!text) return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000\u2028\u2029]/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

const RESUME_EXTRACTION_MESSAGES = {
  pdf: {
    intro: "We couldn't read your PDF resume.",
    guidance:
      'Please export a new PDF (make sure it is not password protected) and upload it again.'
  },
  docx: {
    intro: "We couldn't read your DOCX resume.",
    guidance:
      'Please download a fresh DOCX copy (or export it to PDF) from your editor and try again.'
  },
  doc: {
    intro: "We couldn't read your DOC resume.",
    guidance:
      'Please re-save it as a DOC file or export it to PDF before uploading again.'
  },
  default: {
    intro: "We couldn't read your resume.",
    guidance: 'Please upload a valid PDF or DOCX resume and try again.'
  }
};

function createResumeExtractionError(type, reason, cause) {
  const key = type && RESUME_EXTRACTION_MESSAGES[type] ? type : 'default';
  const { intro, guidance } = RESUME_EXTRACTION_MESSAGES[key];
  const message = `${intro} ${guidance}`.trim();
  const error = new Error(message);
  error.resumeType = type || 'unknown';
  if (reason) {
    error.reason = reason;
  }
  if (cause) {
    error.cause = cause;
  }
  return error;
}

async function extractDocxText(buffer) {
  if (!mammoth || typeof mammoth.extractRawText !== 'function') {
    throw createResumeExtractionError('docx', 'dependency_missing');
  }

  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result?.value;
    if (typeof text !== 'string' || !text.trim()) {
      throw createResumeExtractionError('docx', 'empty_text');
    }
    return text;
  } catch (err) {
    if (err?.resumeType === 'docx') {
      throw err;
    }
    throw createResumeExtractionError('docx', 'parse_failed', err);
  }
}

async function extractDocText(buffer) {
  if (!sharedWordExtractor) {
    sharedWordExtractor = new WordExtractor();
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resumeforge-'));
  const tmpPath = path.join(tmpDir, `resume-${Date.now()}.doc`);
  try {
    await fs.writeFile(tmpPath, buffer);
    const document = await sharedWordExtractor.extract(tmpPath);
    if (!document) {
      throw createResumeExtractionError('doc', 'missing_document');
    }
    const sections = [];
    if (typeof document.getBody === 'function') {
      sections.push(document.getBody());
    }
    if (typeof document.getHeaders === 'function') {
      const headers = document.getHeaders();
      if (Array.isArray(headers)) {
        sections.push(headers.join('\n'));
      }
    }
    if (typeof document.getFooters === 'function') {
      const footers = document.getFooters();
      if (Array.isArray(footers)) {
        sections.push(footers.join('\n'));
      }
    }
    if (typeof document.getText === 'function') {
      sections.push(document.getText());
    }
    const combined = sections.filter(Boolean).join('\n\n');
    if (!combined.trim()) {
      throw createResumeExtractionError('doc', 'empty_text');
    }
    return combined;
  } catch (err) {
    if (err?.resumeType === 'doc') {
      throw err;
    }
    throw createResumeExtractionError('doc', 'parse_failed', err);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractText(file) {
  const ext = (path.extname(file.originalname) || '').toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();
  const buffer = file.buffer;

  if (!buffer) {
    throw new Error('Resume file buffer is missing.');
  }

  const normalizedExt =
    ext ||
    (mimetype.includes('pdf')
      ? '.pdf'
      : mimetype.includes('wordprocessingml')
        ? '.docx'
        : mimetype.includes('msword')
          ? '.doc'
          : '');

  if (normalizedExt === '.pdf') {
    try {
      const data = await pdfParse(buffer);
      const text = data?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw createResumeExtractionError('pdf', 'empty_text');
      }
      return normalizeExtractedText(text);
    } catch (err) {
      if (err?.resumeType === 'pdf') {
        throw err;
      }
      throw createResumeExtractionError('pdf', 'parse_failed', err);
    }
  }

  if (normalizedExt === '.docx') {
    const text = await extractDocxText(buffer);
    return normalizeExtractedText(text);
  }

  if (normalizedExt === '.doc') {
    const text = await extractDocText(buffer);
    return normalizeExtractedText(text);
  }

  throw new Error('Unsupported resume format encountered. Only PDF, DOC, or DOCX files are processed.');
}

function stripLeadingArticle(text = '') {
  if (!text) return '';
  return text.replace(/^(?:an?|the)\s+/i, '').trim();
}

function formatQuotedList(items = []) {
  const limited = items.filter(Boolean).slice(0, 3).map((item) => `"${item}"`);
  if (!limited.length) {
    return '';
  }
  if (limited.length === 1) {
    return limited[0];
  }
  if (limited.length === 2) {
    return `${limited[0]} and ${limited[1]}`;
  }
  return `${limited.slice(0, -1).join(', ')}, and ${limited[limited.length - 1]}`;
}

function buildClassifierReason(description = '', matches = []) {
  const docType = stripLeadingArticle(description || 'non-resume document');
  const quoted = formatQuotedList(matches);
  if (/job description/i.test(docType)) {
    if (quoted) {
      return `Detected job-posting keywords such as ${quoted}.`;
    }
    return 'Detected patterns typical of a job-posting document.';
  }
  if (quoted) {
    return `Detected ${docType} keywords such as ${quoted}.`;
  }
  return `Detected patterns typical of ${docType}.`;
}

const DOCUMENT_CLASSIFIERS = [
  {
    description: 'a job description document',
    keywords: [
      'responsibilities',
      'qualifications',
      'job description',
      'what you will do',
      'we are looking for',
      'you will',
      'apply now',
      'employment type',
    ],
    threshold: 2,
  },
  {
    description: 'a cover letter',
    keywords: ['dear', 'sincerely', 'cover letter'],
    threshold: 2,
  },
  {
    description: 'an invoice document',
    keywords: ['invoice', 'bill to', 'payment terms', 'invoice number'],
    threshold: 2,
  },
  {
    description: 'meeting notes',
    keywords: ['meeting notes', 'action items', 'attendees'],
    threshold: 2,
  },
  {
    description: 'an academic paper',
    keywords: ['abstract', 'introduction', 'references'],
    threshold: 2,
  },
  {
    description: 'a policy or compliance document',
    keywords: ['policy', 'scope', 'compliance', 'procedures'],
    threshold: 2,
  },
  {
    description: 'a marketing brochure',
    keywords: ['call to action', 'our services', 'clients', 'testimonials'],
    threshold: 2,
  },
  {
    description: 'a slide deck outline',
    keywords: ['slide', 'agenda', 'speaker notes'],
    threshold: 2,
  },
  {
    description: 'a certificate or award notice',
    keywords: ['certificate of', 'awarded to', 'this certifies'],
    threshold: 1,
  },
];

const JOB_POSTING_PHRASES = [
  'we are looking for',
  'you will',
  'you must',
  'we offer',
  'apply now',
  'how to apply',
  'company overview',
  'about the role',
  'about the team',
  'about the company',
  'compensation',
  'salary',
  'benefits',
  'job description',
  'job summary',
  'employment type',
  'location:',
  'equal opportunity employer',
  'perks',
];

const JOB_POSTING_REQUIREMENT_KEYWORDS = [
  'responsibilities',
  'qualifications',
  'requirements',
  'desired skills',
  'preferred qualifications',
  'what you will do',
  'what we are looking for',
];

function runDocumentClassifiers(normalized) {
  for (const classifier of DOCUMENT_CLASSIFIERS) {
    const matches = classifier.keywords.filter((keyword) => normalized.includes(keyword));
    if (matches.length >= classifier.threshold) {
      return {
        isResume: false,
        description: classifier.description,
        confidence: 0.4,
        reason: buildClassifierReason(classifier.description, matches),
      };
    }
  }
  return null;
}

function detectJobPostingDocument(normalized) {
  const phraseMatches = JOB_POSTING_PHRASES.filter((phrase) => normalized.includes(phrase));

  if (!phraseMatches.length) {
    return null;
  }

  const requirementMatches = JOB_POSTING_REQUIREMENT_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  );

  if (
    phraseMatches.length >= 3 ||
    (phraseMatches.length >= 2 && requirementMatches.length >= 2)
  ) {
    const clauses = [];
    const phraseReason = formatQuotedList(phraseMatches);
    if (phraseReason) {
      clauses.push(`phrases like ${phraseReason}`);
    }
    const requirementReason = formatQuotedList(requirementMatches);
    if (requirementReason) {
      clauses.push(`sections such as ${requirementReason}`);
    }
    const joinedReason = clauses.length
      ? `${clauses.slice(0, -1).join(', ')}${clauses.length > 1 ? ' and ' : ''}${clauses[clauses.length - 1]}`
      : 'language typical of job postings';
    return {
      isResume: false,
      description: 'a job description document',
      confidence: 0.35,
      reason: `Detected job-posting ${joinedReason}.`,
    };
  }

  return null;
}

function getNonResumeClassification(normalized) {
  return runDocumentClassifiers(normalized) ?? detectJobPostingDocument(normalized);
}

async function classifyDocument(text = '') {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      isResume: false,
      description: 'an empty document',
      confidence: 0,
      reason: 'The uploaded file does not contain any text to evaluate.',
    };
  }

  const normalized = trimmed.toLowerCase();
  const nonResumeClassification = getNonResumeClassification(normalized);

  if (/professional summary/i.test(trimmed) && /experience/i.test(trimmed)) {
    if (nonResumeClassification) {
      return nonResumeClassification;
    }
    return { isResume: true, description: 'a professional resume', confidence: 0.6 };
  }

  const excerpt = trimmed.slice(0, 3600);
  try {
    const model = await getSharedGenerativeModel();
    if (model?.generateContent) {
      const prompt =
        'You are an AI document classifier. Determine whether the provided text is a curriculum vitae/resume. ' +
        'Return ONLY valid JSON with keys: type ("resume" or "non_resume"), probableType (string describing the document if not a resume), ' +
        'confidence (0-1), and reason (short explanation). Consider layout clues, section headings, and whether the text emphasises experience.\n\n' +
        `Document excerpt:\n"""${excerpt}"""`;
      const response = await model.generateContent(prompt);
      const parsed = parseAiJson(response?.response?.text?.());
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
        const type = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : '';
        const isResume = type === 'resume';
        const confidence = Number.isFinite(parsed.confidence) ? clamp(parsed.confidence, 0, 1) : isResume ? 0.75 : 0.5;
        const probableType = parsed.probableType || (isResume ? 'a professional resume' : 'a non-resume document');
        const description = isResume ? 'a professional resume' : probableType;
        if (isResume && nonResumeClassification) {
          return nonResumeClassification;
        }
        const parsedReason =
          typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
        const fallbackReason = isResume
          ? ''
          : `The document content aligns with ${stripLeadingArticle(description)} rather than a CV.`;
        return {
          isResume,
          description,
          confidence,
          reason: parsedReason || fallbackReason || undefined,
        };
      }
    }
  } catch (err) {
    logStructured('warn', 'document_classification_ai_failed', {
      error: serializeError(err),
    });
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const resumeSignals = [
    ['experience', 'education'],
    ['skills', 'summary'],
    ['projects', 'experience'],
    ['professional summary'],
  ];

  let resumeScore = 0;
  for (const signal of resumeSignals) {
    if (signal.every((term) => normalized.includes(term))) {
      resumeScore += 1;
    }
  }

  const sectionHits = ['experience', 'education', 'skills', 'projects', 'certifications', 'languages', 'summary'].filter((term) =>
    normalized.includes(term)
  );
  if (sectionHits.length >= 4) {
    resumeScore += 2;
  } else if (sectionHits.length >= 3) {
    resumeScore += 1.5;
  } else if (sectionHits.length >= 2) {
    resumeScore += 1;
  }

  if (uniqueWords.has('resume') || uniqueWords.has('curriculum') || uniqueWords.has('vitae')) {
    resumeScore += 1;
  }

  const headingMatches = (trimmed.match(/\n[A-Z][A-Z\s]{3,}\n/g) || []).length;
  if (headingMatches >= 2) {
    resumeScore += 1;
  }

  if (resumeScore >= 3) {
    if (nonResumeClassification) {
      return nonResumeClassification;
    }
    return { isResume: true, description: 'a professional resume', confidence: 0.6 };
  }

  if (nonResumeClassification) {
    return nonResumeClassification;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    /experience/i.test(trimmed) &&
    /education/i.test(trimmed) &&
    /skills/i.test(trimmed)
  ) {
    return { isResume: true, description: 'a professional resume', confidence: 0.55 };
  }

  const snippet = lines[0]?.slice(0, 60).trim() || '';
  return {
    isResume: false,
    description: snippet
      ? `a document starting with "${snippet}${lines[0].length > 60 ? '…' : ''}"`
      : 'a non-resume document',
    confidence: 0.3,
    reason:
      'The text lacks resume-defining sections such as Experience, Education, or Skills.',
  };
}

async function isResume(text) {
  const result = await classifyDocument(text);
  return result.isResume;
}

function scoreRatingLabel(score) {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  return 'NEEDS_IMPROVEMENT';
}

function createMetric(category, score, tips = []) {
  const boundedScore = clamp(score, 0, 100);
  const roundedScore = Math.round(boundedScore);
  const rating = scoreRatingLabel(roundedScore);
  const sanitizedTips = Array.from(
    new Set(
      (tips || [])
        .map((tip) => (typeof tip === 'string' ? tip.trim() : ''))
        .filter(Boolean)
    )
  );

  if (!sanitizedTips.length) {
    if (rating === 'EXCELLENT') {
      sanitizedTips.push(
        `Keep refining your ${category.toLowerCase()} as you add new achievements so the resume stays future-proof.`
      );
    } else {
      sanitizedTips.push(
        `Focus on improving ${category.toLowerCase()} to raise this score—tighten structure and mirror the job requirements.`
      );
    }
  }

  return {
    category,
    score: roundedScore,
    rating,
    ratingLabel: rating,
    tips: sanitizedTips,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function idealRatioScore(value, { ideal = 0.4, tolerance = 0.25 } = {}) {
  if (!isFinite(value) || value <= 0) return 0;
  const diff = Math.abs(value - ideal);
  return clamp01(1 - diff / tolerance);
}

function idealRangeScore(
  value,
  { idealMin = 0, idealMax = 1, tolerance = (idealMax - idealMin) / 2 } = {}
) {
  if (!isFinite(value) || value <= 0) return 0;
  if (value >= idealMin && value <= idealMax) return 1;
  const distance = value < idealMin ? idealMin - value : value - idealMax;
  if (tolerance <= 0) return 0;
  return clamp01(1 - distance / tolerance);
}

function summarizeList(values = [], { limit = 3, conjunction = 'and' } = {}) {
  if (!values.length) return '';
  const unique = Array.from(new Set(values)).filter(Boolean);
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} ${conjunction} ${unique[1]}`;
  const display = unique.slice(0, limit);
  const remaining = unique.length - display.length;
  if (remaining > 0) {
    return `${display.join(', ')} and ${remaining} more`;
  }
  return `${display.slice(0, -1).join(', ')} ${conjunction} ${display.slice(-1)}`;
}

function buildSelectionInsights(context = {}) {
  const {
    jobTitle = '',
    originalTitle = '',
    modifiedTitle = '',
    jobDescriptionText = '',
    bestMatch = {},
    originalMatch = {},
    missingSkills = [],
    addedSkills = [],
    scoreBreakdown = {},
    resumeExperience = [],
    linkedinExperience = [],
    knownCertificates = [],
    certificateSuggestions = [],
    manualCertificatesRequired = false,
  } = context;

  const metrics = Array.isArray(scoreBreakdown)
    ? scoreBreakdown
    : scoreBreakdownToArray(scoreBreakdown);
  const metricScores = metrics
    .map((metric) => (typeof metric?.score === 'number' ? metric.score : null))
    .filter((score) => Number.isFinite(score));
  const metricAverage = metricScores.length
    ? metricScores.reduce((sum, value) => sum + value, 0) / metricScores.length
    : 0;

  const targetTitle = String(jobTitle || '').trim();
  const visibleTitle = String(modifiedTitle || originalTitle || '').trim();
  const normalizeTitle = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizedTarget = normalizeTitle(targetTitle);
  const normalizedVisible = normalizeTitle(visibleTitle);

  let designationStatus = 'unknown';
  let designationMessage = 'Designation information was not available.';
  let designationScore = 65;
  if (normalizedTarget && normalizedVisible) {
    const matches =
      normalizedVisible.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedVisible);
    designationStatus = matches ? 'match' : 'mismatch';
    designationMessage = matches
      ? 'Current resume title aligns with the job designation.'
      : `Current resume title (“${visibleTitle || '—'}”) does not match the JD designation (“${targetTitle || '—'}”).`;
    designationScore = matches ? 92 : 58;
  } else if (normalizedTarget) {
    designationStatus = 'partial';
    designationMessage =
      'Provide or adjust your current headline so we can confirm designation alignment.';
    designationScore = 72;
  } else if (normalizedVisible) {
    designationStatus = 'partial';
    designationMessage =
      'The job post did not include a clear title. Keep your designation focused on the target role.';
    designationScore = 70;
  }

  const combinedExperience = []
    .concat(Array.isArray(resumeExperience) ? resumeExperience : [])
    .concat(Array.isArray(linkedinExperience) ? linkedinExperience : []);
  const candidateYears = estimateExperienceYears(combinedExperience);
  const requiredRange = extractRequiredExperience(jobDescriptionText || '');
  const requiredMin = requiredRange?.minYears ?? null;
  const requiredMax = requiredRange?.maxYears ?? null;
  let experienceStatus = 'unknown';
  let experienceMessage = candidateYears
    ? `Resume indicates roughly ${candidateYears} years of experience.`
    : 'Experience duration not detected—ensure roles list start and end dates.';
  let experienceScore = candidateYears > 0 ? 68 : 52;

  if (requiredMin !== null) {
    const gap = candidateYears - requiredMin;
    if (candidateYears <= 0) {
      experienceStatus = 'gap';
      experienceMessage = `The JD requests ${requiredMin}+ years of experience. Add explicit tenure to highlight your depth.`;
      experienceScore = 42;
    } else if (gap >= 0) {
      experienceStatus = 'match';
      experienceMessage = `Resume shows ~${candidateYears} years, meeting the ${requiredMin}+ year requirement.`;
      experienceScore = 94;
    } else if (gap >= -1) {
      experienceStatus = 'partial';
      experienceMessage = `You're within about ${Math.abs(Math.round(gap * 10) / 10)} years of the ${requiredMin}+ year requirement—emphasise long-running projects to demonstrate depth.`;
      experienceScore = 74;
    } else {
      experienceStatus = 'gap';
      experienceMessage = `The JD requests ${requiredMin}+ years, but the resume highlights about ${candidateYears}. Surface earlier roles or clarify overlapping engagements.`;
      experienceScore = 48;
    }
    if (requiredMax !== null && candidateYears > requiredMax + 2) {
      experienceStatus = experienceStatus === 'match' ? 'info' : experienceStatus;
      experienceMessage += ` The posting targets up to ${requiredMax} years—frame examples that match this level.`;
      experienceScore = Math.min(experienceScore, 78);
    }
  } else if (candidateYears > 0) {
    experienceStatus = 'info';
    experienceMessage = `JD does not specify years, but the resume reflects ~${candidateYears} years of experience.`;
    experienceScore = 76;
  }

  const skillCoverage = typeof bestMatch?.score === 'number' ? bestMatch.score : 0;
  const originalCoverage = typeof originalMatch?.score === 'number' ? originalMatch.score : skillCoverage;
  const missing = Array.isArray(missingSkills)
    ? missingSkills.filter(Boolean)
    : [];
  const added = Array.isArray(addedSkills) ? addedSkills.filter(Boolean) : [];
  let skillsStatus = 'match';
  let skillsMessage = `Resume now covers ${skillCoverage}% of the JD skills.`;
  if (missing.length) {
    skillsStatus = 'gap';
    skillsMessage = `Still missing ${summarizeList(missing, { limit: 4 })} from the JD.`;
  } else if (skillCoverage < 70) {
    skillsStatus = 'partial';
    skillsMessage = `Resume covers ${skillCoverage}% of JD skills. Reinforce keywords in experience and summary.`;
  } else if (added.length) {
    skillsMessage = `Resume now covers ${skillCoverage}% of the JD skills, adding ${summarizeList(added, { limit: 4 })}.`;
  }

  const impactScore = Number(scoreBreakdown?.impact?.score) || 0;
  let tasksStatus = 'unknown';
  let tasksMessage = 'Task alignment insights were not available.';
  if (impactScore >= 80) {
    tasksStatus = 'match';
    tasksMessage = 'Accomplishment bullets clearly mirror the JD tasks.';
  } else if (impactScore >= 55) {
    tasksStatus = 'partial';
    tasksMessage = 'Some bullets align with the JD—add measurable outcomes to emphasise task ownership.';
  } else {
    tasksStatus = 'gap';
    tasksMessage = 'Highlight JD-specific responsibilities with quantifiable results to improve task alignment.';
  }

  const crispnessScore = Number(scoreBreakdown?.crispness?.score) || 0;
  const otherScore = Number(scoreBreakdown?.otherQuality?.score) || 0;
  const highlightScore = Math.round((crispnessScore + otherScore) / 2) || 0;
  let highlightsStatus = 'info';
  let highlightsMessage = 'Maintain concise, impact-oriented bullets.';
  if (highlightScore >= 80) {
    highlightsStatus = 'match';
    highlightsMessage = 'Highlights read crisply with strong, results-focused language.';
  } else if (highlightScore < 55) {
    highlightsStatus = 'gap';
    highlightsMessage = 'Tighten lengthy bullets and emphasise quantifiable wins to strengthen highlights.';
  }

  const suggestions = (certificateSuggestions || [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
  const knownNames = (knownCertificates || [])
    .map((cert) => cert?.name)
    .filter(Boolean);
  let certificationStatus = 'match';
  let certificationMessage = 'Existing certifications align with the posting.';
  if (suggestions.length) {
    certificationStatus = 'gap';
    certificationMessage = `Consider adding ${summarizeList(suggestions, { limit: 3 })} to mirror the JD.`;
  }
  if (manualCertificatesRequired) {
    certificationStatus = certificationStatus === 'match' ? 'info' : certificationStatus;
    certificationMessage += ' Credly login was blocked—paste key certifications manually so we can include them.';
  }
  const certificationScore =
    certificationStatus === 'match'
      ? 88
      : certificationStatus === 'info'
        ? 72
        : 60;

  let probability =
    metricAverage * 0.3 +
    skillCoverage * 0.25 +
    experienceScore * 0.15 +
    designationScore * 0.1 +
    (impactScore || metricAverage) * 0.1 +
    certificationScore * 0.05 +
    highlightScore * 0.05;
  probability = clamp(Math.round(probability), 5, 97);
  const level = probability >= 75 ? 'High' : probability >= 55 ? 'Medium' : 'Low';
  const probabilityMessage = `Projected ${level.toLowerCase()} probability (${probability}%) that this resume will be selected for the JD.`;
  const baseSummary = 'These skills and highlights were added to match the JD. Please prepare for the interview accordingly.';
  const summary = added.length
    ? `${baseSummary} Added focus areas: ${summarizeList(added, { limit: 4 })}.`
    : baseSummary;

  const flags = [];
  const pushFlag = (key, type, title, detail) => {
    flags.push({ key, type, title, detail });
  };

  if (designationStatus === 'mismatch') {
    pushFlag('designation', 'warning', 'Designation mismatch', designationMessage);
  } else if (designationStatus === 'match') {
    pushFlag('designation', 'success', 'Designation aligned', designationMessage);
  } else {
    pushFlag('designation', 'info', 'Designation review', designationMessage);
  }

  if (experienceStatus === 'gap') {
    pushFlag('experience', 'warning', 'Experience gap', experienceMessage);
  } else if (experienceStatus === 'partial') {
    pushFlag('experience', 'info', 'Experience nearly there', experienceMessage);
  } else if (experienceStatus === 'match') {
    pushFlag('experience', 'success', 'Experience requirement met', experienceMessage);
  } else if (experienceStatus === 'info') {
    pushFlag('experience', 'info', 'Experience context', experienceMessage);
  }

  if (missing.length) {
    pushFlag('skills', 'warning', 'Missing skills', skillsMessage);
  } else {
    pushFlag('skills', 'success', 'Skill coverage strong', skillsMessage);
  }

  if (tasksStatus === 'gap') {
    pushFlag('tasks', 'warning', 'Task alignment needed', tasksMessage);
  } else if (tasksStatus === 'partial') {
    pushFlag('tasks', 'info', 'Task alignment in progress', tasksMessage);
  } else if (tasksStatus === 'match') {
    pushFlag('tasks', 'success', 'Tasks aligned', tasksMessage);
  }

  if (certificationStatus === 'gap') {
    pushFlag('certifications', 'warning', 'Missing certifications', certificationMessage);
  } else if (certificationStatus === 'info') {
    pushFlag('certifications', 'info', 'Certifications update', certificationMessage);
  } else {
    pushFlag('certifications', 'success', 'Certifications covered', certificationMessage);
  }

  if (highlightsStatus === 'gap') {
    pushFlag('highlights', 'warning', 'Boost highlights', highlightsMessage);
  } else if (highlightsStatus === 'match') {
    pushFlag('highlights', 'success', 'Highlights resonate', highlightsMessage);
  } else {
    pushFlag('highlights', 'info', 'Highlights can improve', highlightsMessage);
  }

  return {
    probability,
    level,
    message: probabilityMessage,
    summary,
    designation: {
      status: designationStatus,
      message: designationMessage,
      currentTitle: visibleTitle,
      targetTitle,
    },
    experience: {
      status: experienceStatus,
      message: experienceMessage,
      candidateYears,
      requiredYears: requiredMin,
      maximumYears: requiredMax,
    },
    skills: {
      status: skillsStatus,
      message: skillsMessage,
      coverage: skillCoverage,
      missing,
      added,
      improvement: skillCoverage - originalCoverage,
    },
    tasks: {
      status: tasksStatus,
      message: tasksMessage,
      score: impactScore,
    },
    certifications: {
      status: certificationStatus,
      message: certificationMessage,
      suggestions,
      known: knownNames,
      manualEntryRequired: Boolean(manualCertificatesRequired),
    },
    highlights: {
      status: highlightsStatus,
      message: highlightsMessage,
      score: highlightScore,
    },
    flags,
  };
}

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOP_WORDS = new Set(
  'a,an,and,are,as,at,be,by,for,from,has,have,in,is,it,of,on,or,that,the,to,with,will,our,your,they,them,into,about,over,more,than,who,what,when,where,which,were,while,within,under,across,through,using,per'
    .split(',')
    .map((word) => word.trim())
);

const ATS_METRIC_DEFINITIONS = [
  { key: 'layoutSearchability', category: 'Layout & Searchability' },
  { key: 'atsReadability', category: 'ATS Readability' },
  { key: 'impact', category: 'Impact' },
  { key: 'crispness', category: 'Crispness' },
  { key: 'otherQuality', category: 'Other Quality Metrics' },
];

function sanitizeMetric(metric, category) {
  if (!metric || typeof metric !== 'object') {
    return createMetric(category, 0);
  }

  const boundedScore = typeof metric.score === 'number' ? clamp(metric.score, 0, 100) : 0;
  const roundedScore = Math.round(boundedScore);
  const rating = scoreRatingLabel(roundedScore);
  const tips = Array.from(
    new Set(
      []
        .concat(typeof metric.tip === 'string' ? metric.tip : [])
        .concat(Array.isArray(metric.tips) ? metric.tips : [])
        .map((tip) => (typeof tip === 'string' ? tip.trim() : ''))
        .filter(Boolean)
    )
  );

  const defaultTips = createMetric(category, roundedScore, tips).tips;

  return {
    ...metric,
    category: metric.category || category,
    score: roundedScore,
    rating,
    ratingLabel: rating,
    tips: tips.length ? tips : defaultTips,
  };
}

function ensureScoreBreakdownCompleteness(source = {}) {
  return ATS_METRIC_DEFINITIONS.reduce((acc, { key, category }) => {
    const metric = sanitizeMetric(source[key], category);
    return { ...acc, [key]: metric };
  }, {});
}

function scoreBreakdownToArray(scoreBreakdown = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  return ATS_METRIC_DEFINITIONS.map(({ key }) => normalized[key]);
}

function buildScoreBreakdown(
  text = '',
  { jobText = '', jobSkills = [], resumeSkills = [] } = {}
) {
  if (!text?.trim()) {
    return ensureScoreBreakdownCompleteness();
  }

  const analysis = analyzeResumeForMetrics(text, { jobText, jobSkills, resumeSkills });

  const layout = evaluateLayoutMetric(analysis);
  const ats = evaluateAtsMetric(analysis);
  const impact = evaluateImpactMetric(analysis);
  const crispness = evaluateCrispnessMetric(analysis);
  const other = evaluateOtherMetric(analysis);

  return ensureScoreBreakdownCompleteness({
    layoutSearchability: layout,
    atsReadability: ats,
    impact,
    crispness,
    otherQuality: other,
  });
}

const METRIC_ACTION_VERBS = [
  'accelerated',
  'achieved',
  'built',
  'delivered',
  'developed',
  'drove',
  'enhanced',
  'expanded',
  'improved',
  'increased',
  'launched',
  'led',
  'optimized',
  'reduced',
  'scaled',
  'spearheaded',
  'streamlined',
];

function extractSummaryText(text = '') {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const headingPattern = /^[A-Z][A-Z0-9\s/&-]{2,}$/;
  const summaryHeadingPattern = /^(summary|professional summary|profile|overview)$/i;
  let collecting = false;
  const collected = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!collecting) {
      if (trimmed && summaryHeadingPattern.test(trimmed)) {
        collecting = true;
      }
      continue;
    }
    if (!trimmed) {
      collected.push('');
      continue;
    }
    const isHeading =
      headingPattern.test(trimmed) && trimmed === trimmed.toUpperCase();
    if (isHeading) {
      break;
    }
    if (
      /^(experience|work experience|employment history|education|skills|projects|certifications|awards|accomplishments)$/i.test(
        trimmed
      )
    ) {
      break;
    }
    collected.push(trimmed.replace(/\s+/g, ' '));
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

function analyzeResumeForMetrics(
  text = '',
  { jobText = '', jobSkills = [], resumeSkills = [] } = {}
) {
  const normalizedResume = text.toLowerCase();
  const normalizedJobText = (jobText || '').toLowerCase();
  const allLines = text.split(/\r?\n/);
  const lines = allLines.map((line) => line.trim()).filter(Boolean);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const denseParagraphs = paragraphs.filter((block) => {
    if (/^[-•\u2022\u2023\u25e6\*]/.test(block)) return false;
    const wordCount = block.split(/\s+/).filter(Boolean).length;
    return wordCount >= 70;
  });
  const bulletLines = lines.filter((line) => /^[-•\u2022\u2023\u25e6\*]/.test(line));
  const headingLines = lines.filter((line) => {
    if (line.length > 42) return false;
    const upper = line.replace(/[^A-Za-z]/g, '').toUpperCase();
    return upper.length >= 4 && line === line.toUpperCase();
  });
  const headingSet = new Set(
    headingLines.map((line) => line.replace(/[^a-z]/gi, '').toLowerCase())
  );

  const multiColumnIndicators = lines.filter((line) => line.split(/\s{3,}/).length >= 2);
  const bulletRatio = lines.length ? bulletLines.length / lines.length : 0;
  const bulletWordCounts = bulletLines.map((line) =>
    line
      .replace(/^[-•\u2022\u2023\u25e6\*]\s*/, '')
      .split(/\s+/)
      .filter(Boolean).length
  );
  const longBulletLines = [];
  const shortBulletLines = [];
  bulletLines.forEach((line, index) => {
    const wordCount = bulletWordCounts[index] || 0;
    if (wordCount > 28) {
      longBulletLines.push(line);
    }
    if (wordCount > 0 && wordCount < 8) {
      shortBulletLines.push(line);
    }
  });
  const avgBulletWords = bulletWordCounts.length
    ? bulletWordCounts.reduce((sum, val) => sum + val, 0) / bulletWordCounts.length
    : 0;
  const fillerBullets = bulletLines.filter((line) =>
    /\b(responsible for|duties included|tasked with)\b/i.test(line)
  );

  const achievementLines = bulletLines.filter((line) =>
    METRIC_ACTION_VERBS.some((verb) =>
      new RegExp(`\\b${escapeRegex(verb)}\\b`, 'i').test(line)
    ) || /[+\d%$]/.test(line)
  );

  const normalizedJobSkills = new Set(
    (jobSkills || []).map((skill) => skill.toLowerCase()).filter(Boolean)
  );
  const normalizedResumeSkills = new Set(
    (resumeSkills || []).map((skill) => skill.toLowerCase()).filter(Boolean)
  );

  const jobKeywordCandidates = (normalizedJobText.match(/[a-z0-9+.#]+/g) || [])
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 80);
  const jobKeywordSet = new Set([...normalizedJobSkills, ...jobKeywordCandidates]);
  const bulletKeywordHits = bulletLines.filter((line) =>
    Array.from(jobKeywordSet).some((keyword) =>
      new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(line)
    )
  );

  const jobKeywordMatches = Array.from(jobKeywordSet).filter((keyword) =>
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text)
  );

  const summaryText = extractSummaryText(text);
  const summaryKeywordHits = summaryText
    ? Array.from(jobKeywordSet).filter((keyword) =>
        new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(summaryText)
      )
    : [];
  const summarySkillHits = summaryText
    ? Array.from(normalizedJobSkills).filter((skill) =>
        new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(summaryText)
      )
    : [];

  const rawLineCount = allLines.length;
  const estimatedPageCount = Math.max(1, Math.ceil(rawLineCount / 55));

  const nonAsciiCharacters = (text.match(/[\u2460-\u24ff\u2500-\u257f]/g) || []).length;
  const hasContactInfo =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    /\b\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text);
  const summaryPresent = Array.from(headingSet).some((heading) =>
    /summary|profile|overview/.test(heading)
  );

  return {
    text,
    normalizedResume,
    normalizedJobText,
    lines,
    bulletLines,
    headingLines,
    headingSet,
    multiColumnIndicators,
    bulletRatio,
    bulletWordCounts,
    avgBulletWords,
    fillerBullets,
    paragraphs,
    denseParagraphs,
    achievementLines,
    longBulletLines,
    shortBulletLines,
    normalizedJobSkills,
    normalizedResumeSkills,
    jobKeywordSet,
    bulletKeywordHits,
    jobKeywordMatches,
    summaryText,
    summaryKeywordHits,
    summarySkillHits,
    nonAsciiCharacters,
    hasContactInfo,
    summaryPresent,
    rawLineCount,
    estimatedPageCount,
  };
}

function evaluateLayoutMetric(analysis) {
  const {
    headingLines,
    headingSet,
    bulletRatio,
    bulletLines,
    lines,
    hasContactInfo,
    denseParagraphs,
    estimatedPageCount,
    rawLineCount,
  } = analysis;

  const keySections = ['experience', 'education', 'skills', 'summary'];
  const sectionPresence = keySections.filter((section) =>
    Array.from(headingSet).some((heading) => heading.includes(section))
  );

  const headingScore = clamp01(headingLines.length / 6);
  const sectionScore = clamp01(sectionPresence.length / keySections.length);
  const bulletScore = bulletLines.length
    ? idealRatioScore(bulletRatio, { ideal: 0.42, tolerance: 0.28 })
    : 0;
  const contactScore = hasContactInfo ? 1 : 0;

  const paragraphPenalty = denseParagraphs.length
    ? Math.min(0.25, denseParagraphs.length * 0.08)
    : 0;

  const pagePenalty = estimatedPageCount > 2 ? Math.min(0.3, (estimatedPageCount - 2) * 0.18) : 0;
  const lengthPenalty = rawLineCount > 130 ? Math.min(0.2, (rawLineCount - 130) * 0.003) : 0;

  const layoutScore =
    100 *
    clamp01(
      headingScore * 0.23 +
        sectionScore * 0.24 +
        bulletScore * 0.33 +
        contactScore * 0.14 -
        paragraphPenalty -
        pagePenalty -
        lengthPenalty
    );

  const missingHeadings = keySections
    .filter((section) => !sectionPresence.includes(section))
    .map((heading) => heading.charAt(0).toUpperCase() + heading.slice(1));

  const layoutTips = [];
  if (missingHeadings.length) {
    layoutTips.push(
      `Add clear section headers for ${summarizeList(missingHeadings)} so ATS bots can index your resume (only ${headingLines.length} heading${headingLines.length === 1 ? '' : 's'} detected).`
    );
  }
  if (bulletLines.length && bulletScore < 0.55) {
    layoutTips.push(
      `Adjust your bullet usage—${bulletLines.length} bullet${bulletLines.length === 1 ? '' : 's'} across ${lines.length} lines makes scanning harder for recruiters.`
    );
  }
  if (!bulletLines.length) {
    layoutTips.push('Break dense paragraphs into bullets so scanners can pick out wins.');
  }
  if (!hasContactInfo) {
    layoutTips.push('Add contact details (email or phone) so hiring teams can reach you quickly.');
  }
  if (denseParagraphs.length) {
    layoutTips.push(
      `Break up ${denseParagraphs.length} dense paragraph${denseParagraphs.length === 1 ? '' : 's'} with bullet points so resume scanners do not skip your achievements.`
    );
  }
  if (estimatedPageCount > 2) {
    layoutTips.push(
      `Tighten the document to two pages—ATS scoring drops once resumes stretch to ${estimatedPageCount} pages.`
    );
  }
  if (rawLineCount > 130 && estimatedPageCount <= 2) {
    layoutTips.push(
      'Trim excess line spacing or sections so the resume stays within a quick-scan length.'
    );
  }
  if (!layoutTips.length) {
    layoutTips.push(
      'Your structure is solid—keep the consistent headings and bullet patterns to remain searchable.'
    );
  }

  return createMetric('Layout & Searchability', layoutScore, layoutTips);
}

function evaluateAtsMetric(analysis) {
  const { normalizedResume, text, multiColumnIndicators, nonAsciiCharacters } = analysis;
  const atsIssues = [];

  let penalty = 0;
  const hasTableLikeFormatting = /\btable\b/.test(normalizedResume) && /\|/.test(text);
  if (hasTableLikeFormatting) {
    penalty += 22;
    atsIssues.push('table-like formatting');
  }
  if (normalizedResume.includes('table of contents')) {
    penalty += 18;
    atsIssues.push('a table of contents');
  }
  if (/\bpage \d+ of \d+/i.test(text)) {
    penalty += 12;
    atsIssues.push('page number footers');
  }
  if (/https?:\/\/\S+\.(png|jpg|jpeg|gif|svg)/i.test(text)) {
    penalty += 16;
    atsIssues.push('embedded images');
  }
  if (multiColumnIndicators.length > 0) {
    penalty += Math.min(5 + multiColumnIndicators.length * 3, 20);
    atsIssues.push('multi-column spacing that ATS bots misread');
  }
  if (/[{}<>]/.test(text)) {
    penalty += 8;
    atsIssues.push('decorative characters or HTML brackets');
  }

  penalty += Math.min(nonAsciiCharacters * 1.5, 18);

  const atsScore = clamp(100 - penalty, 0, 100);

  const atsTips = atsIssues.length
    ? [`Remove ${summarizeList(atsIssues)}—they frequently break ATS parsing engines.`]
    : ['Great job avoiding tables or decorative elements that confuse ATS parsers.'];

  return createMetric('ATS Readability', atsScore, atsTips);
}

function evaluateImpactMetric(analysis) {
  const {
    achievementLines,
    bulletLines,
    bulletKeywordHits,
    jobKeywordSet,
    summaryKeywordHits,
    summaryPresent,
    summarySkillHits,
    normalizedJobSkills,
  } = analysis;

  const bulletCount = bulletLines.length;
  const achievementRatio = bulletCount ? achievementLines.length / bulletCount : 0;
  const keywordHitRatio = bulletCount ? bulletKeywordHits.length / bulletCount : 0;
  const achievementVolumeScore = clamp01(achievementLines.length / Math.max(3, bulletCount * 0.6));

  const summarySkillScore = normalizedJobSkills.size
    ? clamp01(summarySkillHits.length / Math.max(1, Math.min(normalizedJobSkills.size, 6)))
    : 0;
  const summaryKeywordScore = jobKeywordSet.size
    ? clamp01(
        (summaryKeywordHits.length + summarySkillScore * Math.min(jobKeywordSet.size, 6)) /
          Math.max(2, Math.min(jobKeywordSet.size, 12))
      )
    : summaryKeywordHits.length
    ? 0.6
    : 0;

  const impactScore =
    100 *
    clamp01(
      achievementRatio * 0.45 +
        keywordHitRatio * 0.22 +
        achievementVolumeScore * 0.23 +
        Math.max(summaryKeywordScore, summarySkillScore) * 0.1
    );

  const impactTips = [];
  if (!achievementLines.length) {
    impactTips.push(
      'Add metrics or outcome verbs (e.g., increased, reduced) to your bullets—none of the bullet points currently show quantified results.'
    );
  } else if (achievementLines.length < Math.max(3, Math.ceil(bulletLines.length * 0.4))) {
    impactTips.push(
      `Strengthen impact statements by pairing more bullets with numbers—only ${achievementLines.length} of ${bulletLines.length || 'your'} bullet${achievementLines.length === 1 ? '' : 's'} include metrics or performance verbs.`
    );
  } else {
    impactTips.push(
      'Your bullets already show strong impact—keep pairing metrics with outcome-driven verbs.'
    );
  }

  if (
    jobKeywordSet.size > 0 &&
    bulletKeywordHits.length < Math.max(2, Math.ceil(jobKeywordSet.size * 0.1))
  ) {
    const keywordSample = Array.from(jobKeywordSet)
      .slice(0, 5)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    if (keywordSample.length) {
      impactTips.push(
        `Mirror the job posting by weaving in keywords such as ${summarizeList(keywordSample)} inside your accomplishment bullets.`
      );
    }
  }

  if (summaryPresent && summarySkillHits.length === 0 && normalizedJobSkills.size > 0) {
    impactTips.push(
      'Rework your summary to echo critical job keywords so reviewers immediately see the alignment.'
    );
  }

  return createMetric('Impact', impactScore, impactTips);
}

function evaluateCrispnessMetric(analysis) {
  const { bulletLines, avgBulletWords, fillerBullets, longBulletLines, shortBulletLines } = analysis;

  const bulletsStartingWithVerbs = bulletLines.filter((line) =>
    METRIC_ACTION_VERBS.some((verb) =>
      new RegExp(`^[-•\u2022\u2023\u25e6\*]?\s*${escapeRegex(verb)}\b`, 'i').test(line)
    )
  );

  const lengthScore = idealRangeScore(avgBulletWords, {
    idealMin: 12,
    idealMax: 22,
    tolerance: 10,
  });
  const fillerRatio = bulletLines.length ? fillerBullets.length / bulletLines.length : 1;
  const fillerScore = clamp01(1 - fillerRatio);
  const verbStartRatio = bulletLines.length
    ? bulletsStartingWithVerbs.length / bulletLines.length
    : 0;

  const longBulletRatio = bulletLines.length
    ? longBulletLines.length / bulletLines.length
    : 0;
  const shortBulletRatio = bulletLines.length
    ? shortBulletLines.length / bulletLines.length
    : 0;
  const balanceScore = clamp01(1 - Math.min(1, longBulletRatio * 1.1 + Math.max(0, shortBulletRatio - 0.3)));

  const crispnessScore =
    100 * clamp01(lengthScore * 0.3 + fillerScore * 0.25 + verbStartRatio * 0.25 + balanceScore * 0.2);

  const crispnessTips = [];
  if (!bulletLines.length) {
    crispnessTips.push(
      'Introduce concise bullet points (12–20 words) so recruiters can skim quickly.'
    );
  }
  if (avgBulletWords && avgBulletWords < 12) {
    crispnessTips.push(
      `Expand key bullets beyond ${Math.round(avgBulletWords)} words to explain scope and outcomes without losing clarity.`
    );
  }
  if (avgBulletWords > 22) {
    crispnessTips.push(
      `Tighten lengthy bullets—your average is ${Math.round(avgBulletWords)} words, above the ATS-friendly 18–22 word sweet spot.`
    );
  }
  if (longBulletLines.length) {
    crispnessTips.push(
      `Break overly long bullets (${longBulletLines.length}) into two lines so each accomplishment pops.`
    );
  }
  if (shortBulletLines.length > Math.ceil(bulletLines.length * 0.4)) {
    crispnessTips.push('Add a bit more context to ultra-short bullets so they explain the impact.');
  }
  if (fillerBullets.length) {
    crispnessTips.push(
      `Replace filler openers like "responsible for" with action verbs—${fillerBullets.length} bullet${fillerBullets.length === 1 ? '' : 's'} use passive phrasing.`
    );
  }
  if (!crispnessTips.length) {
    crispnessTips.push(
      'Bullet length is crisp and skimmable—maintain this balance while adding fresh wins as needed.'
    );
  }

  return createMetric('Crispness', crispnessScore, crispnessTips);
}

function evaluateOtherMetric(analysis) {
  const {
    normalizedJobSkills,
    normalizedResumeSkills,
    jobKeywordSet,
    jobKeywordMatches,
    headingSet,
    achievementLines,
    bulletLines,
    text,
    summaryKeywordHits,
    summaryText,
    summaryPresent,
    summarySkillHits,
  } = analysis;

  let matchedSkills = 0;
  normalizedJobSkills.forEach((skill) => {
    if (normalizedResumeSkills.has(skill)) matchedSkills += 1;
  });

  const skillMatchRatio = normalizedJobSkills.size
    ? matchedSkills / normalizedJobSkills.size
    : 0;

  const keywordCoverage = jobKeywordSet.size
    ? jobKeywordMatches.length / jobKeywordSet.size
    : 0;

  const impactDensity = bulletLines.length
    ? achievementLines.length / bulletLines.length
    : 0;

  const summarySkillScore = normalizedJobSkills.size
    ? clamp01(summarySkillHits.length / Math.max(1, Math.min(normalizedJobSkills.size, 6)))
    : 0;
  const summaryRelevanceScore = summaryPresent
    ? jobKeywordSet.size
      ? clamp01((summaryKeywordHits.length + summarySkillScore * Math.min(jobKeywordSet.size, 6)) / Math.max(2, Math.min(jobKeywordSet.size, 10)))
      : summaryText
      ? Math.max(0.4, summarySkillScore)
      : 0.4
    : 0;

  const otherScore =
    100 *
    clamp01(
      skillMatchRatio * 0.35 +
        keywordCoverage * 0.25 +
        impactDensity * 0.2 +
        summaryRelevanceScore * 0.2
    );

  const jobSkillsArray = Array.from(normalizedJobSkills);
  const missingSkillSet = jobSkillsArray
    .filter((skill) => !normalizedResumeSkills.has(skill))
    .slice(0, 6)
    .map((skill) => skill.charAt(0).toUpperCase() + skill.slice(1));

  const keywordDeficit = Array.from(jobKeywordSet)
    .filter((keyword) => !new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text))
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  const otherTips = [];
  if (missingSkillSet.length) {
    otherTips.push(
      `Incorporate keywords such as ${summarizeList(missingSkillSet)} to mirror the job description.`
    );
  }
  if (keywordDeficit.length && !missingSkillSet.length) {
    otherTips.push(
      `Reference domain language from the posting—for example ${summarizeList(keywordDeficit)}—to reinforce alignment.`
    );
  }
  if (!summaryPresent) {
    otherTips.push(
      'Add a professional summary or profile section to front-load your strongest qualifications.'
    );
  }
  if (summaryPresent && summarySkillHits.length === 0 && normalizedJobSkills.size > 0) {
    otherTips.push(
      'Tweak your summary/headline to feature the same hard skills and themes the job description emphasizes.'
    );
  }
  if (!otherTips.length) {
    otherTips.push(
      'Good alignment with the job description—keep updating certifications and tools as you gain them.'
    );
  }

  return createMetric('Other Quality Metrics', otherScore, otherTips);
}

function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
}

function sanitizeName(name) {
  return name.trim().split(/\s+/).slice(0, 2).join('_').toLowerCase();
}

function sanitizeManualJobDescription(input = '') {
  if (typeof input !== 'string') return '';

  let sanitized = input.replace(/\u0000/g, '').replace(/\r\n/g, '\n');

  const blockedTags = [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'applet',
    'meta',
    'link',
    'base',
    'form',
    'input',
    'button',
    'textarea',
  ];

  for (const tag of blockedTags) {
    const paired = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const single = new RegExp(`<${tag}[^>]*\\/>`, 'gi');
    const opening = new RegExp(`<${tag}[^>]*>`, 'gi');
    sanitized = sanitized.replace(paired, '');
    sanitized = sanitized.replace(single, '');
    sanitized = sanitized.replace(opening, '');
  }

  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  sanitized = sanitized.replace(
    /\s+(href|src)\s*=\s*("|')?\s*(?:javascript|data|vbscript):[^"'\s>]*\2?/gi,
    ''
  );
  sanitized = sanitized.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return sanitized.trim();
}

function extractExperience(source) {
  if (!source) return [];
  const parseEntry = (text) => {
    let company = '';
    let title = '';
    let startDate = '';
    let endDate = '';
    const dateMatch = text.match(/\(([^)]+)\)/);
    if (dateMatch) {
      const parts = dateMatch[1].split(/\s*[-–]\s*/);
      startDate = parts[0]?.trim() || '';
      endDate = parts[1]?.trim() || '';
      text = text.replace(dateMatch[0], '').trim();
    }
    const atMatch = text.match(/(.+?)\s+at\s+(.+)/i);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      title = text.trim();
    }
    return { company, title, startDate, endDate };
  };
  if (Array.isArray(source)) {
    return source
      .map((s) => (typeof s === 'string' ? parseEntry(s) : s))
      .filter((e) => e.company || e.startDate || e.endDate);
  }
  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(work|professional)?\s*experience/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^(education|skills|projects|certifications|summary|objective|awards|interests|languages)/i.test(trimmed)) {
      break;
    }
    if (trimmed === '') {
      continue;
    }
    const jobMatch =
      line.match(/^\s*[-*]\s+(.*)/) || (!line.match(/^\s/) ? [null, trimmed] : null);
    if (jobMatch) {
      const text = jobMatch[1].trim();
      const entry = parseEntry(text);
      const hasCompanyTitleOrDate =
        /\bat\b/i.test(text) ||
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\s+\d{4}\s*[\u2013-]\s*/i.test(text);
      if (hasCompanyTitleOrDate && !(entry.company === '' && entry.startDate === '')) {
        entries.push(entry);
      }
    }
  }
  return entries;
}

function extractEducation(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source.map((s) => String(s));
  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^education/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const match = trimmed.match(/^[-*]\s+(.*)/);
      if (match) {
        entries.push(match[1].trim());
      } else if (trimmed) {
        entries.push(trimmed);
      }
    }
  }
  return entries;
}

function extractCertifications(source) {
  if (!source) return [];

  const parseEntry = (text = '') => {
    const urlMatch = text.match(
      /(https?:\/\/\S+|www\.\S+|(?:[a-z0-9.-]*linkedin\.com|credly\.com)\S*)/i
    );
    let url = '';
    if (urlMatch) {
      url = normalizeUrl(urlMatch[0]);
      text = text.replace(urlMatch[0], '').trim();
    }

    let name = '';
    let provider = '';

    const parenMatch = text.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) {
      name = parenMatch[1].trim();
      provider = parenMatch[2].trim();
    } else {
      const parts = text.split(/[-–—|]/);
      name = parts.shift()?.trim() || '';
      provider = parts.join('-').trim();
    }

    return { name, provider, url };
  };

  if (Array.isArray(source)) {
    return source.map((item) => {
      if (typeof item === 'string') return parseEntry(item);
      const name =
        item.name || item.title || item.certificateName || item.credentialName || '';
      const provider =
        item.provider ||
        item.authority ||
        item.issuingOrganization ||
        item.issuer ||
        item.organization ||
        '';
      let url =
        item.url || item.credentialUrl || item.link || item.certUrl || '';
      if (!url) {
        const found = Object.values(item).find(
          (v) => typeof v === 'string' && /credly\.com/i.test(v)
        );
        if (found) url = found;
      }
      url = normalizeUrl(url);
      if (url || name || provider) return { name, provider, url };
      return parseEntry(String(item));
    });
  }

  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const credly = trimmed.match(/https?:\/\/\S*credly\.com\/\S*/i);
    if (credly) {
      const clean = trimmed.replace(/^[-*]\s+/, '');
      entries.push(parseEntry(clean));
      continue;
    }
    if (/^certifications?/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const match = trimmed.match(/^[-*]\s+(.*)/);
      if (match) entries.push(parseEntry(match[1].trim()));
      else if (trimmed) entries.push(parseEntry(trimmed));
    }
  }
  return entries;
}

function extractJsonBlock(text) {
  const fenced = text.match(/```json[\s\S]*?```/i);
  if (fenced) {
    text = fenced[0].replace(/```json|```/gi, '');
  }
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAiJson(text) {
  const block = extractJsonBlock(text);
  if (!block) {
    logStructured('error', 'ai_response_missing_json', {
      sample: typeof text === 'string' ? text.slice(0, 200) : undefined,
    });
    return null;
  }
  try {
    return JSON5.parse(block);
  } catch (e) {
    logStructured('error', 'ai_json_parse_failed', {
      sample: typeof text === 'string' ? text.slice(0, 200) : undefined,
      error: serializeError(e),
    });
    return null;
  }
}

function removeGuidanceLines(text = '') {
  const guidanceRegex =
    /^\s*(?:-\s*\([^)]*\)|\([^)]*\)|\[[^\]]*\])\s*$|\b(?:consolidate relevant experience|add other relevant experience|list key skills|previous roles summarized|for brevity)\b/i;
  return text
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim()
    )
    .filter((line) => line && !guidanceRegex.test(line))
    .join('\n');
}

function reparseAndStringify(text, options = {}) {
  const data = parseContent(text, options);

  if (options.project) {
    const projectTokens = parseLine(String(options.project));
    if (!projectTokens.some((t) => t.type === 'bullet'))
      projectTokens.unshift({ type: 'bullet' });
    let section = data.sections.find((s) => /projects/i.test(s.heading));
    if (!section) {
      section = { heading: 'Projects', items: [] };
      data.sections.push(section);
    }
    section.items.push(projectTokens);
  }

  const lines = [data.name];
  data.sections.forEach((sec) => {
    lines.push(`# ${sec.heading}`);
    sec.items.forEach((tokens) => {
      lines.push(
        tokens
          .map((t) => (t.type === 'bullet' ? '- ' : t.text || ''))
          .join('')
      );
    });
  });
  return lines.join('\n');
}

function buildSectionPreservationContext(text = '') {
  if (!text) {
    return { sectionOrder: [], sectionFallbacks: [] };
  }
  const parsed = parseContent(text, { skipRequiredSections: true });
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const seenOrder = new Set();
  const sectionOrder = [];
  sections.forEach((sec) => {
    const heading = normalizeHeading(sec.heading || '');
    const key = heading.toLowerCase();
    if (key && key !== 'contact' && !seenOrder.has(key)) {
      seenOrder.add(key);
      sectionOrder.push(heading);
    }
  });
  const sectionFallbacks = sections.map((sec) => ({
    heading: normalizeHeading(sec.heading || ''),
    items: (sec.items || []).map((tokens) =>
      (tokens || []).map((token) => ({ ...token }))
    ),
  }));
  return { sectionOrder, sectionFallbacks };
}

function sanitizeGeneratedText(text, options = {}) {
  if (!text) return text;
  const cleaned = removeGuidanceLines(text);
  if (options.defaultHeading === '') return cleaned;
  const reparsed = reparseAndStringify(cleaned, options);
  const data = parseContent(reparsed, { ...options, skipRequiredSections: true });
  const merged = mergeDuplicateSections(data.sections);
  const pruned = pruneEmptySections(merged);
  let sections = [...pruned];
  const contactLines = Array.isArray(options.contactLines)
    ? options.contactLines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
    : [];
  const hasContactSection = sections.some(
    (sec) => normalizeHeading(sec.heading || '').toLowerCase() === 'contact'
  );
  if (!hasContactSection && contactLines.length) {
    sections.unshift({
      heading: normalizeHeading('Contact'),
      items: contactLines.map((line) => {
        const tokens = parseLine(line);
        if (tokens[0]?.type !== 'bullet') tokens.unshift({ type: 'bullet' });
        return tokens;
      })
    });
  }
  let contactSection = null;
  if (sections.length) {
    const first = sections[0];
    if (normalizeHeading(first.heading || '').toLowerCase() === 'contact') {
      contactSection = {
        heading: normalizeHeading(first.heading || ''),
        items: (first.items || []).map((tokens) =>
          (tokens || []).map((token) => ({ ...token }))
        ),
      };
      sections = sections.slice(1);
    }
  }

  const orderSeen = new Set();
  const normalizedOrder = [];
  if (Array.isArray(options.sectionOrder)) {
    options.sectionOrder.forEach((heading) => {
      const normalized = normalizeHeading(heading || '');
      const key = normalized.toLowerCase();
      if (key && key !== 'contact' && !orderSeen.has(key)) {
        orderSeen.add(key);
        normalizedOrder.push(normalized);
      }
    });
  }

  const cloneSection = (sec = {}) => ({
    heading: normalizeHeading(sec.heading || ''),
    items: (sec.items || []).map((tokens) =>
      (tokens || []).map((token) => ({ ...token }))
    ),
  });

  const fallbackMap = new Map();
  if (Array.isArray(options.sectionFallbacks)) {
    options.sectionFallbacks.forEach((sec) => {
      const fallback = cloneSection(sec);
      const key = fallback.heading.toLowerCase();
      if (key && key !== 'contact' && !fallbackMap.has(key)) {
        fallbackMap.set(key, fallback);
      }
    });
  }

  const sectionLookup = new Map();
  sections.forEach((sec) => {
    const cloned = cloneSection(sec);
    const key = cloned.heading.toLowerCase();
    if (!key) return;
    if (!sectionLookup.has(key)) {
      sectionLookup.set(key, cloned);
    } else {
      const existing = sectionLookup.get(key);
      existing.items.push(...cloned.items);
    }
  });

  const orderedSections = [];
  const seenKeys = new Set();
  const appendSection = (source) => {
    if (!source) return;
    const normalizedHeading = normalizeHeading(source.heading || '');
    const key = normalizedHeading.toLowerCase();
    if (!key || seenKeys.has(key)) return;
    const clonedItems = (source.items || []).map((tokens) =>
      (tokens || []).map((token) => ({ ...token }))
    );
    if (!clonedItems.length) return;
    orderedSections.push({ heading: normalizedHeading, items: clonedItems });
    seenKeys.add(key);
  };

  normalizedOrder.forEach((heading) => {
    const key = heading.toLowerCase();
    const section = sectionLookup.get(key);
    if (section && section.items.length) {
      appendSection(section);
    } else {
      const fallback = fallbackMap.get(key);
      if (fallback) appendSection(fallback);
    }
  });

  sections.forEach((sec) => {
    const normalizedHeading = normalizeHeading(sec.heading || '');
    const key = normalizedHeading.toLowerCase();
    if (seenKeys.has(key)) return;
    const section = sectionLookup.get(key);
    if (section && section.items.length) {
      appendSection(section);
    } else {
      const fallback = fallbackMap.get(key);
      if (fallback) appendSection(fallback);
    }
  });

  fallbackMap.forEach((fallback, key) => {
    if (!seenKeys.has(key)) {
      appendSection(fallback);
    }
  });

  sections = orderedSections;
  if (contactSection) {
    sections.unshift(contactSection);
  }
  const lines = [data.name];
  sections.forEach((sec) => {
    lines.push(`# ${sec.heading}`);
    sec.items.forEach((tokens) => {
      lines.push(
        tokens
          .map((t) => (t.type === 'bullet' ? '- ' : t.text || ''))
          .join('')
      );
    });
  });
  return lines.join('\n');
}

async function verifyResume(
  text = '',
  jobDescription = '',
  generativeModel,
  options = {}
) {
  if (!text || !generativeModel?.generateContent) return text;
  try {
    const prompt = [
      'You are an expert resume editor.',
      'Rework the resume so every experience bullet, skills entry, and highlight or summary line clearly reflects the job description without inventing new history.',
      'Keep the structure polished while emphasising measurable achievements that prove the candidate already covers the JD responsibilities.',
      'Blend relevant keywords naturally; do not dump disconnected keyword lists.',
      '',
      'Resume:',
      text,
      '',
      'Job Description:',
      jobDescription,
    ].join('\n');
    const result = await generativeModel.generateContent(prompt);
    const improved = result?.response?.text?.();
    if (improved) {
      // Run sanitization twice so any guidance bullets introduced by the AI
      // are stripped before the text is reparsed and stringified
      return sanitizeGeneratedText(sanitizeGeneratedText(improved, options), options);
    }
  } catch {
    /* ignore */
  }
  return text;
}

function relocateProfileLinks(text) {
  if (!text) return text;
  const sentenceRegex = /[^.!?\n]*https?:\/\/\S*(?:linkedin\.com|github\.com)\S*[^.!?\n]*[.!?]?/gi;
  const matches = [];
  let remaining = text.replace(sentenceRegex, (m) => {
    matches.push(m.replace(/[()]/g, '').trim());
    return '';
  });
  if (!matches.length) return text;
  remaining = remaining
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +/g, ' ')
    .trim();
  const paragraph = matches.join(' ');
  if (/\nSincerely/i.test(remaining)) {
    return remaining.replace(/\nSincerely/i, `\n\n${paragraph}\n\nSincerely`);
  }
  return `${remaining}\n\n${paragraph}`;
}

function assignJobContext(req, res, next) {
  const jobId = createIdentifier();
  req.jobId = jobId;
  res.locals.jobId = jobId;
  next();
}

function extractDiffLines(text = '') {
  const seen = new Set();
  const lines = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const normalized = line.replace(/^[•*-]\s*/, '').replace(/\s+/g, ' ').trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lines.push(normalized);
    });
  return lines;
}

function extractReasonsList(explanation = '') {
  const cleaned = String(explanation || '').trim();
  if (!cleaned) {
    return [];
  }

  const bulletLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[•*-]\s*/, '').trim())
    .filter(Boolean);

  const reasonLines = bulletLines.length > 1 ? bulletLines : cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  reasonLines.forEach((line) => {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(line);
    }
  });
  return deduped.length ? deduped : [cleaned];
}

function buildImprovementSummary(
  beforeText = '',
  afterText = '',
  explanation = '',
  changeDetails = []
) {
  if (Array.isArray(changeDetails) && changeDetails.length) {
    return changeDetails.map((detail) => {
      const before = typeof detail?.before === 'string' ? detail.before : '';
      const after = typeof detail?.after === 'string' ? detail.after : '';
      const beforeLines = extractDiffLines(before);
      const afterLines = extractDiffLines(after);
      const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
      const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));
      const added = afterLines.filter((line) => !beforeSet.has(line.toLowerCase()));
      const removed = beforeLines.filter((line) => !afterSet.has(line.toLowerCase()));
      const providedReasons = Array.isArray(detail?.reasons)
        ? detail.reasons.filter(Boolean)
        : [];
      const fallbackReasons = extractReasonsList(explanation);
      const reasons = providedReasons.length
        ? providedReasons
        : fallbackReasons.length
          ? fallbackReasons
          : [
              detail?.section
                ? `${detail.section} updated to align with the job description.`
                : 'Update applied to align with the job description.',
            ];

      return {
        section: detail?.section || detail?.label || detail?.key || '',
        added,
        removed,
        reason: reasons,
      };
    });
  }

  const added = [];
  const removed = [];
  const beforeLines = extractDiffLines(beforeText);
  const afterLines = extractDiffLines(afterText);
  const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
  const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));

  afterLines.forEach((line) => {
    if (!beforeSet.has(line.toLowerCase())) {
      added.push(line);
    }
  });

  beforeLines.forEach((line) => {
    if (!afterSet.has(line.toLowerCase())) {
      removed.push(line);
    }
  });

  const reason = extractReasonsList(explanation);

  return [
    {
      added,
      removed,
      reason,
    },
  ];
}

async function handleImprovementRequest(type, req, res) {
  const jobId = req.jobId || createIdentifier();
  res.locals.jobId = jobId;
  captureUserContext(req, res);
  const requestId = res.locals.requestId;
  const logContext = { requestId, jobId, type };

  const payload = req.body || {};
  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : '';
  const jobDescription = typeof payload.jobDescription === 'string' ? payload.jobDescription : '';

  if (!resumeText.trim() || !jobDescription.trim()) {
    return sendError(
      res,
      400,
      'IMPROVEMENT_INPUT_REQUIRED',
      'resumeText and jobDescription are required to generate improvements.',
      { fields: ['resumeText', 'jobDescription'] }
    );
  }

  const parseList = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      return value
        .split(/[,\n;]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const jobSkills = parseList(payload.jobSkills);
  const resumeSkills = parseList(payload.resumeSkills).length
    ? parseList(payload.resumeSkills)
    : extractResumeSkills(resumeText);
  const missingSkills = parseList(payload.missingSkills).length
    ? parseList(payload.missingSkills)
    : computeSkillGap(jobSkills, resumeSkills);

  const knownCertificates = Array.isArray(payload.knownCertificates)
    ? dedupeCertificates(payload.knownCertificates)
    : dedupeCertificates(parseManualCertificates(payload.knownCertificates));
  const manualCertificates = Array.isArray(payload.manualCertificates)
    ? payload.manualCertificates
    : parseManualCertificates(payload.manualCertificates);

  try {
    const result = await runTargetedImprovement(type, {
      resumeText,
      jobDescription,
      jobTitle: payload.jobTitle || payload.targetTitle || '',
      currentTitle: payload.currentTitle || payload.originalTitle || '',
      originalTitle: payload.originalTitle || '',
      jobSkills,
      resumeSkills,
      missingSkills,
      knownCertificates,
      manualCertificates,
    });
    const sectionPatterns = {
      'improve-summary': /^#\s*summary/i,
      'add-missing-skills': /^#\s*skills/i,
      'align-experience': /^#\s*(work\s+)?experience/i,
    };
    const excerptPattern = sectionPatterns[type];
    const normalizedBeforeExcerpt = excerptPattern
      ? normalizeSectionExcerpt(resumeText, excerptPattern, result.beforeExcerpt)
      : result.beforeExcerpt;
    const normalizedAfterExcerpt = excerptPattern
      ? normalizeSectionExcerpt(result.updatedResume, excerptPattern, result.afterExcerpt)
      : result.afterExcerpt;
    logStructured('info', 'targeted_improvement_completed', {
      ...logContext,
      confidence: result.confidence,
      appliedSkills: missingSkills.length,
    });
    return res.json({
      success: true,
      type,
      title: IMPROVEMENT_CONFIG[type]?.title || '',
      beforeExcerpt: normalizedBeforeExcerpt,
      afterExcerpt: normalizedAfterExcerpt,
      explanation: result.explanation,
      confidence: result.confidence,
      updatedResume: result.updatedResume,
      missingSkills,
      improvementSummary: buildImprovementSummary(
        normalizedBeforeExcerpt,
        normalizedAfterExcerpt,
        result.explanation,
        result.changeDetails
      ),
    });
  } catch (err) {
    logStructured('error', 'targeted_improvement_failed', {
      ...logContext,
      error: serializeError(err),
    });
    const details =
      err?.message && err.message !== CV_GENERATION_ERROR_MESSAGE
        ? { reason: err.message }
        : undefined;
    return sendError(
      res,
      500,
      'IMPROVEMENT_FAILED',
      CV_GENERATION_ERROR_MESSAGE,
      details
    );
  }
}

app.get('/api/published-cloudfront', async (req, res) => {
  try {
    const metadata = await loadPublishedCloudfrontMetadata();
    if (!metadata?.url) {
      return sendError(
        res,
        404,
        'PUBLISHED_CLOUDFRONT_UNAVAILABLE',
        'No CloudFront URL has been published yet. Run npm run publish:cloudfront-url after deploying.'
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      cloudfront: metadata,
    });
  } catch (err) {
    logStructured('error', 'published_cloudfront_lookup_failed', {
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'PUBLISHED_CLOUDFRONT_LOOKUP_FAILED',
      'Unable to load the published CloudFront metadata.'
    );
  }
});

app.get(['/redirect/latest', '/go/cloudfront'], async (req, res) => {
  try {
    const metadata = await loadPublishedCloudfrontMetadata();
    if (!metadata?.url) {
      return sendError(
        res,
        404,
        'PUBLISHED_CLOUDFRONT_UNAVAILABLE',
        'No CloudFront URL has been published yet. Run npm run publish:cloudfront-url after deploying.'
      );
    }

    let location = metadata.url;
    const rawPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (rawPath) {
      try {
        if (/^https?:\/\//i.test(rawPath)) {
          location = rawPath;
        } else {
          const normalizedTarget = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          const base = new URL(metadata.url);
          location = new URL(normalizedTarget, base).toString();
        }
      } catch (err) {
        logStructured('warn', 'published_cloudfront_redirect_path_invalid', {
          path: rawPath,
          error: serializeError(err),
        });
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(308, location);
  } catch (err) {
    logStructured('error', 'published_cloudfront_redirect_failed', {
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'PUBLISHED_CLOUDFRONT_LOOKUP_FAILED',
      'Unable to load the published CloudFront metadata.'
    );
  }
});

app.get('/', async (req, res) => {
  try {
    const html = await getClientIndexHtml();
    res.type('html').send(html);
  } catch (err) {
    logStructured('error', 'client_ui_load_failed', {
      error: serializeError(err),
    });
    res
      .status(500)
      .json({
        status: 'error',
        message:
          'Client application is unavailable. Please try again later or contact support.',
      });
  }
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

const improvementRoutes = [
  { path: '/api/improve-summary', type: 'improve-summary' },
  { path: '/api/add-missing-skills', type: 'add-missing-skills' },
  { path: '/api/change-designation', type: 'change-designation' },
  { path: '/api/align-experience', type: 'align-experience' },
  { path: '/api/enhance-all', type: 'enhance-all' },
];

improvementRoutes.forEach(({ path: routePath, type }) => {
  app.post(routePath, assignJobContext, async (req, res) => {
    await handleImprovementRequest(type, req, res);
  });
});

app.post('/api/rescore-improvement', assignJobContext, async (req, res) => {
  const jobId = req.jobId || createIdentifier();
  res.locals.jobId = jobId;
  const requestId = res.locals.requestId;
  const logContext = { requestId, jobId, route: 'rescore-improvement' };

  const payload = req.body || {};
  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : '';
  const jobDescriptionText =
    typeof payload.jobDescriptionText === 'string' ? payload.jobDescriptionText : '';
  if (!resumeText.trim()) {
    return sendError(
      res,
      400,
      'RESCORE_INPUT_REQUIRED',
      'resumeText is required to recalculate scores.'
    );
  }

  try {
    const normalizeSkillList = (value) =>
      (Array.isArray(value) ? value : [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);

    let jobSkills = normalizeSkillList(payload.jobSkills);
    if (!jobSkills.length && jobDescriptionText.trim()) {
      try {
        const analysis = analyzeJobDescription(jobDescriptionText);
        jobSkills = normalizeSkillList(analysis?.skills);
      } catch (err) {
        logStructured('warn', 'rescore_job_skill_fallback_failed', {
          ...logContext,
          error: serializeError(err),
        });
      }
    }
    const resumeSkills = extractResumeSkills(resumeText);
    const matchResult = calculateMatchScore(jobSkills, resumeSkills);
    const scoreBreakdown = buildScoreBreakdown(resumeText, {
      jobText: jobDescriptionText,
      jobSkills,
      resumeSkills,
    });
    const atsSubScores = scoreBreakdownToArray(scoreBreakdown);

    const previousMissingSkills = normalizeSkillList(payload.previousMissingSkills);
    const missingLower = new Set(
      matchResult.newSkills.map((skill) => skill.toLowerCase())
    );
    const coveredSkills = previousMissingSkills.filter(
      (skill) => !missingLower.has(skill.toLowerCase())
    );

    const baselineScoreInput = payload.baselineScore;
    const baselineScore =
      typeof baselineScoreInput === 'number'
        ? baselineScoreInput
        : typeof baselineScoreInput === 'string' && baselineScoreInput.trim()
          ? Number.parseFloat(baselineScoreInput)
          : null;
    const hasBaseline = Number.isFinite(baselineScore);
    const scoreDelta = hasBaseline
      ? matchResult.score - baselineScore
      : null;

    logStructured('info', 'improvement_rescored', {
      ...logContext,
      enhancedScore: matchResult.score,
      coveredSkills: coveredSkills.length,
    });

    return res.json({
      success: true,
      enhancedScore: matchResult.score,
      table: matchResult.table,
      missingSkills: matchResult.newSkills,
      resumeSkills,
      atsSubScores,
      scoreBreakdown,
      coveredSkills,
      scoreDelta,
    });
  } catch (err) {
    logStructured('error', 'rescore_improvement_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'RESCORE_FAILED',
      err.message || 'Unable to recalculate scores after applying the improvement.'
    );
  }
});

app.post(
  '/api/process-cv',
  assignJobContext,
  (req, res, next) => {
    uploadResume(req, res, (err) => {
      if (err) {
        logStructured('warn', 'resume_upload_failed', {
          requestId: res.locals.requestId,
          jobId: res.locals.jobId,
          error: serializeError(err),
        });
        return sendError(
          res,
          400,
          'UPLOAD_VALIDATION_FAILED',
          err.message || 'Upload validation failed.',
          {
            field: 'resume',
            originalName: req.file?.originalname,
          }
        );
      }
      next();
    });
  },
  async (req, res) => {
  const jobId = req.jobId || createIdentifier();
  res.locals.jobId = jobId;
  captureUserContext(req, res);
  const requestId = res.locals.requestId;
  const logContext = res.locals.userId
    ? { requestId, jobId, userId: res.locals.userId }
    : { requestId, jobId };
  const date = new Date().toISOString().slice(0, 10);
  const s3 = s3Client;
  let bucket;
  let secrets;
  try {
    secrets = getSecrets();
    bucket = secrets.S3_BUCKET;
  } catch (err) {
    const missing = extractMissingConfig(err);
    logStructured('error', 'configuration_load_failed', {
      ...logContext,
      error: serializeError(err),
      missing,
    });
    return sendError(
      res,
      500,
      'CONFIGURATION_ERROR',
      describeConfigurationError(err),
      missing.length ? { missing } : undefined
    );
  }

  const dynamo = new DynamoDBClient({ region });
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';
  const tablePollInterval = Math.max(
    1,
    Math.min(DYNAMO_TABLE_POLL_INTERVAL_MS, DYNAMO_TABLE_MAX_WAIT_MS)
  );
  let tableEnsured = false;

  const waitForTableActive = async (ignoreNotFound = false) => {
    const startedAt = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const desc = await dynamo.send(
          new DescribeTableCommand({ TableName: tableName })
        );
        if (desc.Table && desc.Table.TableStatus === 'ACTIVE') {
          return;
        }
      } catch (err) {
        if (!ignoreNotFound || err.name !== 'ResourceNotFoundException') {
          throw err;
        }
      }

      if (Date.now() - startedAt >= DYNAMO_TABLE_MAX_WAIT_MS) {
        throw new Error(
          `DynamoDB table ${tableName} did not become ACTIVE within ${DYNAMO_TABLE_MAX_WAIT_MS} ms`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, tablePollInterval));
    }
  };

  const ensureTableExists = async () => {
    if (tableEnsured) {
      return;
    }
    try {
      await waitForTableActive(false);
      tableEnsured = true;
      return;
    } catch (err) {
      if (err.name !== 'ResourceNotFoundException') {
        throw err;
      }
    }

    try {
      await dynamo.send(
        new CreateTableCommand({
          TableName: tableName,
          AttributeDefinitions: [
            { AttributeName: 'linkedinProfileUrl', AttributeType: 'S' }
          ],
          KeySchema: [
            { AttributeName: 'linkedinProfileUrl', KeyType: 'HASH' }
          ],
          BillingMode: 'PAY_PER_REQUEST'
        })
      );
    } catch (createErr) {
      if (createErr.name !== 'ResourceInUseException') throw createErr;
    }

    await waitForTableActive(true);
    tableEnsured = true;
  };

  const { jobDescriptionUrl, linkedinProfileUrl, credlyProfileUrl } = req.body;
  logStructured('info', 'process_cv_started', {
    ...logContext,
    jobDescriptionHost: getUrlHost(jobDescriptionUrl),
    linkedinHost: getUrlHost(linkedinProfileUrl),
    credlyHost: getUrlHost(credlyProfileUrl),
  });
  const defaultCvTemplate =
    req.body.template || req.query.template || CV_TEMPLATES[0];
  const defaultClTemplate =
    req.body.coverTemplate || req.query.coverTemplate || CL_TEMPLATES[0];
  const selection = selectTemplates({
    defaultCvTemplate,
    defaultClTemplate,
    template1: req.body.template1 || req.query.template1,
    template2: req.body.template2 || req.query.template2,
    coverTemplate1: req.body.coverTemplate1 || req.query.coverTemplate1,
    coverTemplate2: req.body.coverTemplate2 || req.query.coverTemplate2,
    cvTemplates: req.body.templates || req.query.templates,
    clTemplates: req.body.coverTemplates || req.query.coverTemplates
  });
  const templateParamConfig = parseTemplateParamsConfig(
    req.body.templateParams ||
      req.query.templateParams ||
      req.body.templateParam ||
      req.query.templateParam
  );
  let { template1, template2, coverTemplate1, coverTemplate2 } = selection;
  logStructured('info', 'template_selection', {
    ...logContext,
    template1,
    template2,
    coverTemplate1,
    coverTemplate2,
  });
  if (!req.file) {
    logStructured('warn', 'resume_missing', logContext);
    return sendError(
      res,
      400,
      'RESUME_FILE_REQUIRED',
      'resume file required',
      { field: 'resume' }
    );
  }
  if (!jobDescriptionUrl) {
    logStructured('warn', 'job_description_missing', logContext);
    return sendError(
      res,
      400,
      'JOB_DESCRIPTION_URL_REQUIRED',
      'jobDescriptionUrl required'
    );
  }
  const ext = (path.extname(req.file.originalname) || '').toLowerCase();
  const normalizedExt = ext || '.pdf';
  const storedFileType =
    req.file.mimetype || (normalizedExt.startsWith('.') ? normalizedExt.slice(1) : normalizedExt) || 'unknown';
  const temporaryPrefix = `${jobId}/incoming/${date}/`;
  let originalUploadKey = `${temporaryPrefix}original${normalizedExt}`;
  let logKey = `${temporaryPrefix}logs/processing.jsonl`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: originalUploadKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
      })
    );
    logStructured('info', 'initial_upload_completed', {
      ...logContext,
      bucket,
      key: originalUploadKey,
    });
  } catch (e) {
    logStructured('error', 'initial_upload_failed', {
      ...logContext,
      bucket,
      error: serializeError(e),
    });
    const message = e.message || 'initial S3 upload failed';
    try {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'initial_upload_failed',
        level: 'error',
        message: `Failed to upload to bucket ${bucket}: ${message}`
      });
    } catch (logErr) {
      logStructured('error', 's3_log_failure', {
        ...logContext,
        error: serializeError(logErr),
      });
    }
    return sendError(
      res,
      500,
      'INITIAL_UPLOAD_FAILED',
      `Initial S3 upload to bucket ${bucket} failed: ${message}`,
      { bucket }
    );
  }

  const ipAddress =
    (req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const locationMeta = extractLocationMetadata(req);
  const { browser, os, device } = await parseUserAgent(userAgent);

  let text;
  try {
    text = await extractText(req.file);
  } catch (err) {
    logStructured('error', 'resume_text_extraction_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      400,
      'TEXT_EXTRACTION_FAILED',
      err.message,
      { stage: 'extract_text' }
    );
  }
  logStructured('info', 'resume_text_extracted', {
    ...logContext,
    characters: text.length,
  });
  const classification = await classifyDocument(text);
  logStructured('info', 'resume_classified', {
    ...logContext,
    isResume: classification.isResume,
    description: classification.description,
    confidence: classification.confidence,
  });
  if (!classification.isResume) {
    logStructured('warn', 'resume_validation_failed', {
      ...logContext,
      reason: 'not_identified_as_resume',
      description: classification.description,
      confidence: classification.confidence,
    });
    const rawDescription =
      typeof classification.description === 'string'
        ? classification.description.trim()
        : 'non-resume';
    const includesDocument = /document/i.test(rawDescription);
    const shortDescriptor = includesDocument
      ? rawDescription
      : `${rawDescription || 'non-resume'}${rawDescription.endsWith(' document') ? '' : ' document'}`;
    const descriptorWithArticle = /^(a|an)\s/i.test(shortDescriptor)
      ? shortDescriptor
      : /^[aeiou]/i.test(shortDescriptor)
        ? `an ${shortDescriptor}`
        : `a ${shortDescriptor}`;
    const reasonText =
      typeof classification.reason === 'string' ? classification.reason.trim() : '';
    const fallbackReason =
      'The document content does not include the sections typically required in a CV.';
    const detailReason = reasonText || fallbackReason;
    const reasonSentence = detailReason.endsWith('.')
      ? detailReason
      : `${detailReason}.`;
    const validationMessage = `You have uploaded ${descriptorWithArticle}. ${reasonSentence} Please upload a correct CV.`;
    return sendError(
      res,
      400,
      'INVALID_RESUME_CONTENT',
      validationMessage,
      {
        description: classification.description,
        confidence: classification.confidence,
        reason: detailReason,
      }
    );
  }
  if (!linkedinProfileUrl) {
    logStructured('warn', 'linkedin_profile_missing', logContext);
    return sendError(
      res,
      400,
      'LINKEDIN_PROFILE_URL_REQUIRED',
      'linkedinProfileUrl required'
    );
  }
  const applicantName = extractName(text);
  const sanitizedName = sanitizeName(applicantName) || 'candidate';
  const anonymizedApplicantName = anonymizePersonalData(applicantName);
  const anonymizedLinkedIn = anonymizePersonalData(linkedinProfileUrl);
  const anonymizedIp = anonymizePersonalData(ipAddress);
  const anonymizedUserAgent = anonymizePersonalData(userAgent);
  const anonymizedCredly = anonymizePersonalData(credlyProfileUrl);
  const prefix = `${sanitizedName}/cv/${date}/`;
  const finalUploadKey = `${prefix}${sanitizedName}${normalizedExt}`;
  const finalLogKey = `${prefix}logs/processing.jsonl`;

  if (finalUploadKey !== originalUploadKey) {
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: buildCopySource(bucket, originalUploadKey),
          Key: finalUploadKey,
          MetadataDirective: 'COPY'
        })
      );
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: originalUploadKey })
      );
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'raw_upload_relocated',
        message: `Relocated raw upload from ${originalUploadKey} to ${finalUploadKey}`
      });
      logStructured('info', 'raw_upload_relocated', {
        ...logContext,
        bucket,
        fromKey: originalUploadKey,
        toKey: finalUploadKey,
      });
      originalUploadKey = finalUploadKey;
    } catch (err) {
      logStructured('error', 'raw_upload_relocation_failed', {
        ...logContext,
        bucket,
        error: serializeError(err),
      });
      try {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'raw_upload_relocation_failed',
          level: 'error',
          message: err.message || 'Failed to relocate raw upload to final key',
        });
      } catch (logErr) {
        logStructured('error', 's3_log_failure', {
          ...logContext,
          error: serializeError(logErr),
        });
      }
      return sendError(
        res,
        500,
        'RAW_UPLOAD_RELOCATION_FAILED',
        'Uploaded file could not be prepared for processing. Please try again later.'
      );
    }
  }

  logKey = finalLogKey;
  const s3Location = `s3://${bucket}/${originalUploadKey}`;
  const locationLabel = locationMeta.label || 'Unknown';

  const safeRequestId =
    typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : String(requestId || '');
  const jobDescriptionUrlValue =
    typeof jobDescriptionUrl === 'string' ? jobDescriptionUrl : '';

  try {
    await ensureTableExists();
    const timestamp = new Date().toISOString();
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          linkedinProfileUrl: { S: anonymizedLinkedIn },
          candidateName: { S: anonymizedApplicantName },
          timestamp: { S: timestamp },
          uploadedAt: { S: timestamp },
          requestId: { S: safeRequestId },
          jobId: { S: jobId },
          jobDescriptionUrl: { S: jobDescriptionUrlValue },
          credlyProfileUrl: { S: anonymizedCredly },
          cv1Url: { S: '' },
          cv2Url: { S: '' },
          coverLetter1Url: { S: '' },
          coverLetter2Url: { S: '' },
          ipAddress: { S: anonymizedIp },
          userAgent: { S: anonymizedUserAgent },
          os: { S: os },
          browser: { S: browser },
          device: { S: device },
          location: { S: locationLabel },
          locationCity: { S: locationMeta.city || '' },
          locationRegion: { S: locationMeta.region || '' },
          locationCountry: { S: locationMeta.country || '' },
          s3Bucket: { S: bucket },
          s3Key: { S: originalUploadKey },
          s3Url: { S: s3Location },
          fileType: { S: storedFileType },
          status: { S: 'uploaded' }
        }
      })
    );
    logStructured('info', 'dynamo_initial_record_written', {
      ...logContext,
      bucket,
      key: originalUploadKey,
    });
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'dynamodb_initial_record_written'
    });
  } catch (err) {
    logStructured('error', 'dynamo_initial_record_failed', {
      ...logContext,
      error: serializeError(err),
    });
    try {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'dynamodb_initial_record_failed',
        level: 'error',
        message: err.message || 'Failed to write initial DynamoDB record'
      });
    } catch (logErr) {
      logStructured('error', 'dynamo_initial_record_log_failed', {
        ...logContext,
        error: serializeError(logErr),
      });
    }
    return sendError(
      res,
      500,
      'INITIAL_METADATA_WRITE_FAILED',
      'Failed to record upload metadata. Please try again later.'
    );
  }

  try {
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'request_received',
      message: `jobDescriptionUrl=${jobDescriptionUrl}; linkedinProfileUrl=${linkedinProfileUrl}; credlyProfileUrl=${credlyProfileUrl || ''}`
    });
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'selected_templates',
      message: `template1=${template1}; template2=${template2}`
    });

    const manualJobDescriptionInput =
      typeof req.body.manualJobDescription === 'string'
        ? req.body.manualJobDescription
        : typeof req.body.jobDescriptionText === 'string'
          ? req.body.jobDescriptionText
          : '';
    const manualJobDescription = sanitizeManualJobDescription(
      manualJobDescriptionInput
    );

    let jobDescriptionHtml;
    if (manualJobDescription) {
      jobDescriptionHtml = manualJobDescription;
      logStructured('info', 'job_description_supplied_manually', {
        ...logContext,
        characters: manualJobDescription.length,
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'job_description_supplied_manually'
      });
    } else {
      try {
        jobDescriptionHtml = await scrapeJobDescription(jobDescriptionUrl);
        logStructured('info', 'job_description_fetched', {
          ...logContext,
          url: jobDescriptionUrl,
          bytes: jobDescriptionHtml.length,
        });
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'fetched_job_description'
        });
      } catch (err) {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'job_description_fetch_failed',
          level: 'error',
          message: err.message
        });
        logStructured('error', 'job_description_fetch_failed', {
          ...logContext,
          error: serializeError(err),
        });
        return sendError(
          res,
          400,
          'JOB_DESCRIPTION_FETCH_FAILED',
          'Unable to fetch JD from this URL. Please paste full job description below.',
          { url: jobDescriptionUrl, manualInputRequired: true }
        );
      }
    }
    const {
      title: jobTitle,
      skills: jobSkills,
      text: jobDescription
    } = analyzeJobDescription(jobDescriptionHtml);
    logStructured('info', 'job_description_analyzed', {
      ...logContext,
      jobTitle,
      jobSkills: jobSkills.length,
    });
    const resumeSkills = extractResumeSkills(text);
    const scoreBreakdown = buildScoreBreakdown(text, {
      jobSkills,
      resumeSkills,
      jobText: jobDescription,
    });
    const originalMatch = calculateMatchScore(jobSkills, resumeSkills);
    logStructured('info', 'resume_skills_analyzed', {
      ...logContext,
      resumeSkills: resumeSkills.length,
      originalMatchScore: originalMatch.score,
    });

    let linkedinData = {};
    try {
      linkedinData = await fetchLinkedInProfile(linkedinProfileUrl);
      logStructured('info', 'linkedin_profile_fetched', {
        ...logContext,
        experience: linkedinData.experience?.length || 0,
        education: linkedinData.education?.length || 0,
        certifications: linkedinData.certifications?.length || 0,
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'fetched_linkedin_profile'
      });
    } catch (err) {
      logStructured('warn', 'linkedin_profile_fetch_failed', {
        ...logContext,
        error: serializeError(err),
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'linkedin_profile_fetch_failed',
        level: 'error',
        message: err.message
      });
    }

    const manualCertificates = parseManualCertificates(req.body.manualCertificates);
    if (manualCertificates.length) {
      logStructured('info', 'manual_certificates_received', {
        ...logContext,
        manualCount: manualCertificates.length,
      });
    }

    let credlyCertifications = [];
    let credlyStatus = {
      attempted: Boolean(credlyProfileUrl),
      success: false,
      manualEntryRequired: false,
      message: '',
    };
    if (credlyProfileUrl) {
      try {
        credlyCertifications = await fetchCredlyProfile(credlyProfileUrl);
        logStructured('info', 'credly_profile_fetched', {
          ...logContext,
          certifications: credlyCertifications.length,
        });
        credlyStatus = {
          attempted: true,
          success: true,
          manualEntryRequired: false,
          count: credlyCertifications.length,
        };
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'fetched_credly_profile'
        });
      } catch (err) {
        logStructured('warn', 'credly_profile_fetch_failed', {
          ...logContext,
          error: serializeError(err),
        });
        credlyStatus = {
          attempted: true,
          success: false,
          manualEntryRequired: err.code === 'CREDLY_AUTH_REQUIRED',
          message: err.message,
        };
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'credly_profile_fetch_failed',
          level: 'error',
          message: err.message
        });
      }
    }

    const aggregatedCertifications = [
      ...credlyCertifications,
      ...manualCertificates,
    ];

    const resumeExperience = extractExperience(text);
    const linkedinExperience = extractExperience(linkedinData.experience || []);
    const resumeEducation = extractEducation(text);
    const linkedinEducation = extractEducation(linkedinData.education || []);
    const resumeCertifications = extractCertifications(text);
    const linkedinCertifications = extractCertifications(
      linkedinData.certifications || []
    );

    const knownCertificates = dedupeCertificates([
      ...resumeCertifications,
      ...linkedinCertifications,
      ...aggregatedCertifications,
    ]);
    const certificateSuggestions = suggestRelevantCertifications(
      jobDescription,
      jobSkills,
      knownCertificates
    );
    const manualCertificatesRequired =
      credlyStatus.manualEntryRequired && manualCertificates.length === 0;

    const originalTitle =
      resumeExperience[0]?.title || linkedinExperience[0]?.title || '';

    const originalResumeText = text;
    const sectionPreservation = buildSectionPreservationContext(originalResumeText);
    const contactDetails = extractContactDetails(originalResumeText, linkedinProfileUrl);

      // Use GEMINI_API_KEY from validated runtime configuration
    const geminiApiKey = secrets.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let projectText = '';
    let modifiedTitle = '';
    let geminiAddedSkills = [];
    if (process.env.NODE_ENV !== 'test') {
      try {
        const sectionTexts = collectSectionText(
          text,
          linkedinData,
          aggregatedCertifications
        );
        const enhanced = await rewriteSectionsWithGemini(
          applicantName,
          sectionTexts,
          jobDescription,
          jobSkills,
          generativeModel,
          {
            resumeExperience,
            linkedinExperience,
            resumeEducation,
            linkedinEducation,
            resumeCertifications,
            linkedinCertifications,
            credlyCertifications: aggregatedCertifications,
            credlyProfileUrl,
            contactLines: contactDetails.contactLines,
            ...sectionPreservation,
          }
        );
        text = enhanced.text;
        projectText = enhanced.project;
        modifiedTitle = enhanced.modifiedTitle || '';
        geminiAddedSkills = enhanced.addedSkills || [];
        logStructured('info', 'section_rewrite_completed', {
          ...logContext,
          modifiedTitle: modifiedTitle || '',
          addedSkills: geminiAddedSkills.length,
        });
      } catch (e) {
        logStructured('error', 'section_rewrite_failed', {
          ...logContext,
          error: serializeError(e),
        });
      }
    }

    const combinedProfile = text;

    const versionsSchema = {
      version1: 'string resume that preserves and enhances the original CV structure',
      version2: 'string resume that preserves and enhances the original CV structure',
    };
    const versionsContext = {
      cvText: combinedProfile,
      jobDescription,
      jobTitle,
      jobSkills,
      note: 'The candidate performed duties matching the job description in their last role.',
    };
    const versionsPrompt = [
      'You are an elite resume architect tasked with producing two targeted resume versions for Gemini/OpenAI.',
      'Requirements:',
      '- Never degrade CV structure; maintain clear sections, chronology, and formatting cues.',
      '- Maximize ATS alignment using the job description and skill signals.',
      '- Reflect the official job title exactly in the most recent role.',
      '- Mirror critical responsibilities and highlight relevant projects, fabricating emphasis only when contextually implied.',
      '- Preserve all original URLs.',
      '- Respond ONLY with JSON adhering to the schema below.',
      '',
      'OUTPUT_SCHEMA:',
      JSON.stringify(versionsSchema, null, 2),
      '',
      'INPUT_CONTEXT:',
      JSON.stringify(versionsContext, null, 2),
    ].join('\n');

    logStructured('info', 'resume_versions_prompt_generated', {
      ...logContext,
      jobTitle,
      jobSkillsCount: jobSkills.length,
    });

    let versionData = {};
    let parsedVersions = false;
    let lastAiResponse;
    try {
      logStructured('info', 'resume_versions_generation_started', logContext);
      const result = await generativeModel.generateContent(versionsPrompt);
      const responseText = result?.response?.text?.();
      lastAiResponse = responseText;
      logStructured('info', 'resume_versions_response_received', {
        ...logContext,
        hasResponseText: Boolean(responseText),
        responsePreview:
          typeof responseText === 'string'
            ? responseText.slice(0, 200)
            : undefined,
      });
      const parsed = parseAiJson(responseText);
      if (parsed && typeof parsed.version1 === 'string' && typeof parsed.version2 === 'string') {
        parsedVersions = true;
        const projectField =
          parsed.project || parsed.projects || parsed.Projects;
        projectText = Array.isArray(projectField)
          ? projectField[0]
          : projectField;
        if (!projectText) {
          projectText = await generateProjectSummary(
            jobDescription,
            resumeSkills,
            jobSkills,
            generativeModel
          );
        }
        const sanitizeOptions = {
          resumeExperience,
          linkedinExperience,
          resumeEducation,
          linkedinEducation,
          resumeCertifications,
          linkedinCertifications,
          credlyCertifications,
          credlyProfileUrl,
          jobTitle,
          project: projectText,
          contactLines: contactDetails.contactLines,
          ...sectionPreservation,
        };
        versionData.version1 = await verifyResume(
          sanitizeGeneratedText(parsed.version1, sanitizeOptions),
          jobDescription,
          generativeModel,
          sanitizeOptions
        );
        versionData.version2 = await verifyResume(
          sanitizeGeneratedText(parsed.version2, sanitizeOptions),
          jobDescription,
          generativeModel,
          sanitizeOptions
        );
      } else {
        logStructured('error', 'resume_versions_parsing_failed', {
          ...logContext,
          reason: 'missing_or_invalid_versions',
          responsePreview:
            typeof lastAiResponse === 'string'
              ? lastAiResponse.slice(0, 200)
              : undefined,
        });
        try {
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'resume_versions_parsing_failed',
            level: 'error',
            message: 'AI response missing required resume versions',
          });
        } catch (logErr) {
          logStructured('error', 's3_log_failure', {
            ...logContext,
            error: serializeError(logErr),
          });
        }
      }
    } catch (e) {
      logStructured('error', 'resume_versions_generation_failed', {
        ...logContext,
        error: serializeError(e),
      });
    }

    if (parsedVersions && (!versionData.version1 || !versionData.version2)) {
      const fallbackOptions = {
        resumeExperience,
        linkedinExperience,
        resumeEducation,
        linkedinEducation,
        resumeCertifications,
        linkedinCertifications,
        credlyCertifications,
        credlyProfileUrl,
        jobTitle,
        project: projectText,
        contactLines: contactDetails.contactLines,
      };
      const fallbackResume = sanitizeGeneratedText(combinedProfile, fallbackOptions);
      if (fallbackResume && fallbackResume.trim()) {
        let usedFallback = false;
        if (!versionData.version1) {
          versionData.version1 = fallbackResume;
          usedFallback = true;
        }
        if (!versionData.version2) {
          versionData.version2 = fallbackResume;
          usedFallback = true;
        }
        if (usedFallback) {
          logStructured('warn', 'resume_versions_fallback_used', {
            ...logContext,
            reason: 'partial_versions_generated',
          });
          try {
            await logEvent({
              s3,
              bucket,
              key: logKey,
              jobId,
              event: 'resume_versions_fallback_used',
              level: 'warn',
              message: 'Partial AI response, using sanitized resume copy',
            });
          } catch (logErr) {
            logStructured('error', 's3_log_failure', {
              ...logContext,
              error: serializeError(logErr),
            });
          }
        }
      }
    }

    if (!versionData.version1 || !versionData.version2) {
      const fallbackOptions = {
        resumeExperience,
        linkedinExperience,
        resumeEducation,
        linkedinEducation,
        resumeCertifications,
        linkedinCertifications,
        credlyCertifications,
        credlyProfileUrl,
        jobTitle,
        project: projectText,
        contactLines: contactDetails.contactLines,
      };
      const fallbackResume = sanitizeGeneratedText(combinedProfile, fallbackOptions);
      if (fallbackResume && fallbackResume.trim()) {
        let usedFallback = false;
        if (!versionData.version1) {
          versionData.version1 = fallbackResume;
          usedFallback = true;
        }
        if (!versionData.version2) {
          versionData.version2 = fallbackResume;
          usedFallback = true;
        }
        if (usedFallback) {
          logStructured('warn', 'resume_versions_fallback_used', {
            ...logContext,
            reason: 'ai_response_invalid',
          });
          try {
            await logEvent({
              s3,
              bucket,
              key: logKey,
              jobId,
              event: 'resume_versions_fallback_used',
              level: 'warn',
              message: 'AI response invalid, reverting to sanitized resume',
            });
          } catch (logErr) {
            logStructured('error', 's3_log_failure', {
              ...logContext,
              error: serializeError(logErr),
            });
          }
        }
      } else {
        logStructured('error', 'resume_versions_fallback_failed', {
          ...logContext,
          reason: 'empty_fallback_resume',
          hadAiResponse: Boolean(lastAiResponse),
        });
      }
    }

    if (!versionData.version1 || !versionData.version2) {
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'invalid_ai_response', level: 'error', message: 'AI response invalid' });
      return sendError(res, 500, 'AI_RESPONSE_INVALID', 'AI response invalid');
    }

    const version1Skills = extractResumeSkills(versionData.version1);
    const match1 = calculateMatchScore(jobSkills, version1Skills);
    const version2Skills = extractResumeSkills(versionData.version2);
    const match2 = calculateMatchScore(jobSkills, version2Skills);
    const bestMatch = match1.score >= match2.score ? match1 : match2;

    const coverSchema = {
      cover_letter1: 'string cover letter tailored to the job description',
      cover_letter2: 'string cover letter tailored to the job description',
    };
    const coverContext = {
      jobTitle,
      jobSkills,
      resume: combinedProfile,
      jobDescription,
    };
    const coverPrompt = [
      'You are an elite career copywriter supporting Gemini/OpenAI workflows.',
      'Instructions:',
      '- Produce exactly two distinct, ATS-aware cover letters.',
      '- Mirror critical language from the job description and respect accomplishments from the resume.',
      '- Preserve every URL appearing in the resume text.',
      '- Maintain professional tone and structure without degrading the CV context referenced.',
      '- Respond ONLY with JSON conforming to the schema below.',
      '',
      'OUTPUT_SCHEMA:',
      JSON.stringify(coverSchema, null, 2),
      '',
      'INPUT_CONTEXT:',
      JSON.stringify(coverContext, null, 2),
    ].join('\n');

    let coverData = {};
    try {
      const coverResult = await generativeModel.generateContent(coverPrompt);
      const coverText = coverResult.response.text();
      const parsed = parseAiJson(coverText);
      if (parsed) coverData = parsed;
      logStructured('info', 'cover_letter_generation_completed', {
        ...logContext,
        variants: Object.keys(coverData).length,
      });
    } catch (e) {
      logStructured('error', 'cover_letter_generation_failed', {
        ...logContext,
        error: serializeError(e),
      });
    }

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'generated_outputs' });

    const generatedPrefix = `${prefix}generated/`;
    const outputs = {
      cover_letter1: coverData.cover_letter1,
      cover_letter2: coverData.cover_letter2,
      version1: versionData.version1,
      version2: versionData.version2
    };
    const urls = [];

    if (originalUploadKey) {
      try {
        const originalSignedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: originalUploadKey }),
          { expiresIn: URL_EXPIRATION_SECONDS }
        );
        const expiresAt = new Date(
          Date.now() + URL_EXPIRATION_SECONDS * 1000
        ).toISOString();
        urls.push({
          type: 'original_upload',
          url: originalSignedUrl,
          expiresAt
        });
      } catch (err) {
        logStructured('warn', 'original_download_url_failed', {
          ...logContext,
          error: serializeError(err)
        });
      }
    }
    for (const [name, text] of Object.entries(outputs)) {
      if (!text) continue;
      const isCvDocument = name === 'version1' || name === 'version2';
      const isCoverLetter = name === 'cover_letter1' || name === 'cover_letter2';
      let fileName;
      if (name === 'version1') {
        fileName = sanitizedName;
      } else if (name === 'version2') {
        fileName = `${sanitizedName}_2`;
      } else {
        fileName = name;
      }
      const subdir = isCvDocument
        ? 'cv/'
        : isCoverLetter
        ? 'cover_letter/'
        : '';
      const key = `${generatedPrefix}${subdir}${fileName}.pdf`;
      const primaryTemplate = isCvDocument
        ? name === 'version1'
          ? template1
          : template2
        : isCoverLetter
        ? name === 'cover_letter1'
          ? coverTemplate1
          : coverTemplate2
        : template1;

      const baseCvOptions = isCvDocument
        ? {
            resumeExperience,
            linkedinExperience,
            resumeEducation,
            linkedinEducation,
            resumeCertifications,
            linkedinCertifications,
            credlyCertifications,
            credlyProfileUrl,
            jobTitle,
            jobSkills,
            project: projectText,
            linkedinProfileUrl,
            applicantName,
            email: contactDetails.email,
            phone: contactDetails.phone,
          }
        : null;
      const baseCoverOptions = isCoverLetter
        ? { skipRequiredSections: true, defaultHeading: '' }
        : null;

      const inputText = isCoverLetter
        ? relocateProfileLinks(
            sanitizeGeneratedText(text, { ...baseCoverOptions })
          )
        : text;

      logStructured('debug', 'pdf_input_prepared', {
        ...logContext,
        documentType: name,
        primaryTemplate,
        characters: inputText.length,
      });

      const candidateTemplates = isCvDocument
        ? [primaryTemplate, ...CV_TEMPLATES]
        : isCoverLetter
        ? [primaryTemplate, ...CL_TEMPLATES]
        : [primaryTemplate];

      const { buffer: pdfBuffer, template: usedTemplate } =
        await generatePdfWithFallback({
          documentType: name,
          templates: candidateTemplates,
          inputText,
          generativeModel,
          logContext,
          buildOptionsForTemplate: (templateId) => {
            if (isCvDocument) {
              const options = { ...baseCvOptions };
              const params = resolveTemplateParamsConfig(
                templateParamConfig,
                templateId,
                name
              );
              if (params && typeof params === 'object' && Object.keys(params).length) {
                options.templateParams = {
                  ...(options.templateParams || {}),
                  ...params,
                };
              }
              return options;
            }
            if (isCoverLetter) {
              const options = { ...baseCoverOptions };
              const params = resolveTemplateParamsConfig(
                templateParamConfig,
                templateId,
                name
              );
              if (params && typeof params === 'object' && Object.keys(params).length) {
                options.templateParams = {
                  ...(options.templateParams || {}),
                  ...params,
                };
              }
              return options;
            }
            const params = resolveTemplateParamsConfig(
              templateParamConfig,
              templateId,
              name
            );
            if (params && typeof params === 'object' && Object.keys(params).length) {
              return { templateParams: { ...params } };
            }
            return {};
          },
        });

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf'
        })
      );
      logStructured('info', 'pdf_uploaded', {
        ...logContext,
        documentType: name,
        template: usedTemplate,
        key,
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: `uploaded_${name}_pdf`,
        message: `template=${usedTemplate}`,
      });
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: URL_EXPIRATION_SECONDS }
      );
      const expiresAt = new Date(
        Date.now() + URL_EXPIRATION_SECONDS * 1000
      ).toISOString();
      urls.push({ type: name, url: signedUrl, expiresAt });
    }

    if (urls.length === 0) {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'invalid_ai_response',
        level: 'error',
        message: 'AI response invalid'
      });
      logStructured('error', 'no_outputs_generated', logContext);
      return sendError(res, 500, 'AI_RESPONSE_INVALID', 'AI response invalid');
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}log.json`,
        Body: JSON.stringify({ jobDescriptionUrl, linkedinProfileUrl, applicantName }),
        ContentType: 'application/json'
      })
    );
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'uploaded_metadata' });

    await logEvent({ s3, bucket, key: logKey, jobId, event: 'completed' });
    const originalScore = originalMatch.score;
    const enhancedScore = bestMatch.score;
    const { table, newSkills: missingSkills } = bestMatch;
    const addedSkills = Array.from(
      new Set(
        table
          .filter(
            (r) =>
              r.matched &&
              originalMatch.table.some(
                (o) => o.skill === r.skill && !o.matched
              )
          )
          .map((r) => r.skill)
          .concat(geminiAddedSkills)
      )
    );
    const selectionInsights = buildSelectionInsights({
      jobTitle,
      originalTitle,
      modifiedTitle: modifiedTitle || originalTitle,
      jobDescriptionText: jobDescription,
      bestMatch,
      originalMatch,
      missingSkills,
      addedSkills,
      scoreBreakdown,
      resumeExperience,
      linkedinExperience,
      knownCertificates,
      certificateSuggestions,
      manualCertificatesRequired,
    });

    await ensureTableExists();
    const urlMap = Object.fromEntries(urls.map((u) => [u.type, u.url]));
    const completedAt = new Date().toISOString();
    const missingSkillList = missingSkills.map((skill) => ({ S: String(skill) }));
    const addedSkillList = addedSkills.map((skill) => ({ S: String(skill) }));
    const updateParts = [
      'cv1Url = :cv1',
      'cv2Url = :cv2',
      'coverLetter1Url = :cl1',
      'coverLetter2Url = :cl2',
      '#status = :status',
      'analysisCompletedAt = :completedAt',
      'missingSkills = :missingSkills',
      'addedSkills = :addedSkills'
    ];
    const expressionValues = {
      ':cv1': { S: urlMap.version1 || '' },
      ':cv2': { S: urlMap.version2 || '' },
      ':cl1': { S: urlMap.cover_letter1 || '' },
      ':cl2': { S: urlMap.cover_letter2 || '' },
      ':status': { S: 'completed' },
      ':completedAt': { S: completedAt },
      ':missingSkills': { L: missingSkillList },
      ':addedSkills': { L: addedSkillList },
      ':jobId': { S: jobId }
    };

    if (Number.isFinite(originalScore)) {
      updateParts.push('originalScore = :originalScore');
      expressionValues[':originalScore'] = { N: String(originalScore) };
    }
    if (Number.isFinite(enhancedScore)) {
      updateParts.push('enhancedScore = :enhancedScore');
      expressionValues[':enhancedScore'] = { N: String(enhancedScore) };
    }
    if (typeof selectionInsights?.probability === 'number') {
      updateParts.push('selectionProbability = :probability');
      expressionValues[':probability'] = {
        N: String(selectionInsights.probability)
      };
    }

    await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: anonymizedLinkedIn } },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
        ExpressionAttributeNames: { '#status': 'status' },
        ConditionExpression: 'jobId = :jobId'
      })
    );

    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'dynamodb_metadata_updated'
    });
    logStructured('info', 'selection_insights_computed', {
      ...logContext,
      probability: selectionInsights.probability,
      level: selectionInsights.level,
      flags: selectionInsights.flags?.length || 0,
    });
    logStructured('info', 'match_scores_calculated', {
      ...logContext,
      originalScore,
      enhancedScore,
      missingSkills: missingSkills.length,
      addedSkills: addedSkills.length,
    });
    logStructured('info', 'process_cv_completed', {
      ...logContext,
      applicantName,
      outputsGenerated: urls.length,
    });
    return res.json({
      success: true,
      requestId,
      jobId,
      urlExpiresInSeconds: URL_EXPIRATION_SECONDS,
      urls,
      applicantName,
      originalScore,
      enhancedScore,
      table,
      addedSkills,
      missingSkills,
      originalTitle,
      modifiedTitle: modifiedTitle || originalTitle,
      scoreBreakdown,
      atsSubScores: scoreBreakdownToArray(scoreBreakdown),
      resumeText: combinedProfile,
      originalResumeText,
      jobDescriptionText: jobDescription,
      jobSkills,
      resumeSkills,
      certificateInsights: {
        known: knownCertificates,
        suggestions: certificateSuggestions,
        manualEntryRequired: manualCertificatesRequired,
        credlyStatus,
      },
      manualCertificates,
      selectionProbability: selectionInsights?.probability ?? null,
      selectionInsights,
    });
  } catch (err) {
    const failureMessage = describeProcessingFailure(err);
    logStructured('error', 'process_cv_failed', {
      ...logContext,
      error: serializeError(err),
      failureMessage,
    });
    if (bucket) {
      try {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'error',
          level: 'error',
          message: failureMessage,
        });
      } catch (e) {
        logStructured('error', 's3_log_failure', {
          ...logContext,
          error: serializeError(e),
        });
      }
    }
    const details = {};
    if (err?.code) details.code = err.code;
    if (err?.message && err.message !== failureMessage) {
      details.reason = err.message;
    }
    return sendError(
      res,
      500,
      'PROCESSING_FAILED',
      failureMessage,
      Object.keys(details).length ? details : undefined
    );
  }
});

const port = process.env.PORT || 3000;
const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === currentFilePath;

if (!isLambda && !isTestEnvironment && isDirectRun) {
  app.listen(port, () => {
    logStructured('info', 'server_started', { port });
  });
}

export default app;
export {
  extractText,
  generatePdf,
  setGeneratePdf,
  setChromiumLauncher,
  parseContent,
  parseLine,
  ensureRequiredSections,
  extractExperience,
  extractEducation,
  extractCertifications,
  splitSkills,
  fetchLinkedInProfile,
  fetchCredlyProfile,
  mergeResumeWithLinkedIn,
  collectSectionText,
  rewriteSectionsWithGemini,
  scrapeJobDescription,
  analyzeJobDescription,
  extractResumeSkills,
  generateProjectSummary,
  calculateMatchScore,
  estimateExperienceYears,
  extractRequiredExperience,
  buildSelectionInsights,
  TEMPLATE_IDS,
  CV_TEMPLATES,
  CL_TEMPLATES,
  CV_TEMPLATE_GROUPS,
  CONTRASTING_PAIRS,
  selectTemplates,
  removeGuidanceLines,
  sanitizeGeneratedText,
  relocateProfileLinks,
  verifyResume,
  purgeExpiredSessions,
  handleDataRetentionEvent,
  classifyDocument,
  buildScoreBreakdown,
  enforceTargetedUpdate,
};
