import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as DynamoDB from '@aws-sdk/client-dynamodb';
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} = DynamoDB;
import fs from 'fs/promises';
import fsSync from 'fs';
import { logEvent, logErrorTrace } from './logger.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import WordExtractorPackage from 'word-extractor';
import JSON5 from 'json5';
import mime from 'mime-types';
import { MIMEType } from 'node:util';
import { renderTemplatePdf } from './lib/pdf/index.js';
import { backstopPdfTemplates as runPdfTemplateBackstop } from './lib/pdf/backstop.js';
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

const COVER_TEMPLATE_DISPLAY_NAMES = {
  cover_modern: 'Modern Cover Letter',
  cover_classic: 'Classic Cover Letter',
  cover_professional: 'Professional Cover Letter',
  cover_ats: 'ATS Cover Letter',
  cover_2025: 'Future Vision 2025 Cover Letter',
};

function formatTemplateDisplayName(templateId) {
  if (!templateId) {
    return '';
  }
  if (templateId === '2025') {
    return 'Future Vision 2025';
  }
  return templateId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCoverTemplateDisplayName(templateId) {
  if (!templateId) {
    return 'Cover Letter';
  }
  return (
    COVER_TEMPLATE_DISPLAY_NAMES[templateId] ||
    formatTemplateDisplayName(templateId) ||
    'Cover Letter'
  );
}

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

const LAMBDA_PROCESSING_ERROR_MESSAGE =
  'Our Lambda resume engine is temporarily unavailable. Please try again shortly.';
const CV_GENERATION_ERROR_MESSAGE =
  'Our Lambda resume engine could not generate your PDFs. Please try again shortly.';
const GEMINI_ENHANCEMENT_ERROR_MESSAGE =
  'Gemini enhancements are temporarily offline. Please try again soon.';
const DOWNLOAD_LINK_GENERATION_ERROR_MESSAGE =
  'Unable to prepare download links for the generated documents.';
const S3_STORAGE_ERROR_MESSAGE =
  'Amazon S3 storage is temporarily unavailable. Please try again in a few minutes.';
const S3_CHANGE_LOG_ERROR_MESSAGE =
  'Amazon S3 is currently unavailable, so we could not save your updates. Please retry shortly.';
function formatRetryTemplateDisplayName(templateId) {
  if (!templateId) return '';
  const normalized = String(templateId).trim();
  if (!normalized) return '';
  if (normalized.startsWith('cover_')) {
    return formatCoverTemplateDisplayName(normalized);
  }
  return formatTemplateDisplayName(normalized);
}

function buildTemplateRetryMessage(failedTemplateId, fallbackTemplateId) {
  if (!fallbackTemplateId) return '';
  const fallbackLabel = formatRetryTemplateDisplayName(fallbackTemplateId);
  if (!fallbackLabel) return '';
  const failedLabel = formatRetryTemplateDisplayName(failedTemplateId);
  const failedSegment = failedLabel
    ? failedLabel.toLowerCase().includes('template')
      ? failedLabel
      : `${failedLabel} template`
    : 'selected template';
  return `Could not generate PDF for ${failedSegment}, retrying with ${fallbackLabel}`;
}

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

function setS3Client(client) {
  if (client && typeof client.send === 'function') {
    s3Client = client;
  } else if (client === null) {
    s3Client = new S3Client({ region });
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
      :root {
        color-scheme: light;
      }
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; background: #f7fafc; color: #1a202c; }
      main { max-width: 720px; margin: 0 auto; background: white; border-radius: 12px; padding: 2.25rem; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1 { margin-top: 0; font-size: 2rem; }
      p { line-height: 1.6; }
      form { margin-top: 2rem; display: grid; gap: 1rem; }
      label { font-weight: 600; }
      select, button { font: inherit; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #cbd5f5; }
      button { cursor: pointer; background: #2563eb; color: white; border: none; font-weight: 600; }
      .cta { margin-top: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; border-radius: 9999px; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main id="portal-form">
      <h1>ResumeForge Portal</h1>
      <p>The client application build assets are currently unavailable. This is a lightweight fallback view to keep the service responsive while the full interface is rebuilt.</p>
      <p>You can regenerate the production UI by running <code>npm run build:client</code>. Until then, API endpoints remain available.</p>
      <form aria-label="Template selection">
        <label for="templateId">Choose a resume template</label>
        <select id="templateId" name="templateId">
          <option value="modern">Modern</option>
          <option value="professional">Professional</option>
          <option value="classic">Classic</option>
          <option value="ats">ATS</option>
          <option value="2025">2025</option>
        </select>
        <p style="margin: 0; font-size: 0.95rem; color: #4a5568;">Template downloads are temporarily disabled in fallback mode.</p>
        <button type="button" disabled title="Build the client app to enable downloads">Download preview (unavailable)</button>
      </form>
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

async function waitForTableActive({ dynamo, tableName, ignoreNotFound = false }) {
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const desc = await dynamo.send(new DescribeTableCommand({ TableName: tableName }));
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

    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, Math.min(DYNAMO_TABLE_POLL_INTERVAL_MS, DYNAMO_TABLE_MAX_WAIT_MS)))
    );
  }
}

async function ensureDynamoTableExists({ dynamo, tableName }) {
  try {
    await waitForTableActive({ dynamo, tableName, ignoreNotFound: false });
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

  await waitForTableActive({ dynamo, tableName, ignoreNotFound: true });
}

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

function resolveProfileIdentifier({ linkedinProfileUrl, userId, jobId } = {}) {
  const linkedinInput =
    typeof linkedinProfileUrl === 'string' ? linkedinProfileUrl.trim() : '';
  if (linkedinInput) {
    return linkedinInput;
  }
  const normalizedUserId = normaliseUserId(userId);
  if (normalizedUserId) {
    return normalizedUserId;
  }
  const jobIdInput = typeof jobId === 'string' ? jobId.trim() : '';
  if (jobIdInput) {
    return jobIdInput;
  }
  return '';
}

function resolveProfileIdentifierHash(context) {
  const identifier = resolveProfileIdentifier(context);
  if (identifier) {
    return normalizePersonalData(identifier);
  }
  return normalizePersonalData(createIdentifier());
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
  const baseLogger =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : console.log;
  const logFn =
    typeof baseLogger === 'function'
      ? baseLogger.bind(console)
      : (...args) => {
          if (typeof console.log === 'function') {
            console.log(...args);
          }
        };
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

function normalizeErrorDetails(details) {
  if (details === undefined) {
    return undefined;
  }
  if (details instanceof Error) {
    return {
      message: details.message,
      ...(details.code ? { code: details.code } : {}),
    };
  }
  if (Array.isArray(details)) {
    return { items: details };
  }
  if (details === null) {
    return {};
  }
  if (typeof details === 'object') {
    return details;
  }
  if (typeof details === 'string') {
    const trimmed = details.trim();
    return trimmed ? { message: trimmed } : {};
  }
  return { value: details };
}

function detectServiceErrorSource({ code, message, details }) {
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const textSegments = [];
  const appendText = (value) => {
    if (typeof value === 'string' && value.trim()) {
      textSegments.push(value.trim().toLowerCase());
    }
  };

  appendText(message);
  if (details && typeof details === 'object') {
    appendText(details.reason);
    appendText(details.message);
  }

  if (normalizedCode) {
    appendText(normalizedCode);
  }

  const combined = textSegments.join(' ');
  const includes = (needle) => combined.includes(needle);

  if (
    /GEMINI|AI_RESPONSE/.test(normalizedCode) ||
    includes('gemini') ||
    includes('ai response invalid')
  ) {
    return 'gemini';
  }

  if (
    /S3|STORAGE|UPLOAD|CHANGE_LOG/.test(normalizedCode) ||
    includes('amazon s3') ||
    includes('bucket') ||
    includes('storage')
  ) {
    return 's3';
  }

  if (
    /LAMBDA|PROCESS|GENERAT/.test(normalizedCode) ||
    includes('lambda') ||
    includes('serverless') ||
    includes('generation failed') ||
    includes('processing failed')
  ) {
    return 'lambda';
  }

  return undefined;
}

function withServiceSource(details, context) {
  if (!details || typeof details !== 'object') {
    return details;
  }
  if (details.source) {
    return details;
  }
  const source = detectServiceErrorSource(context);
  if (!source) {
    return details;
  }
  return { ...details, source };
}

const OUTPUT_URL_KEYS = ['fileUrl', 'url', 'downloadUrl', 'href', 'link', 'signedUrl'];

function parseTypeUrl(value) {
  if (typeof value !== 'string') {
    return { base: '', fragment: '' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { base: '', fragment: '' };
  }
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex === -1) {
    return { base: trimmed, fragment: '' };
  }
  const base = trimmed.slice(0, hashIndex).trim();
  const rawFragment = trimmed.slice(hashIndex + 1);
  let fragment = rawFragment;
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    fragment = rawFragment;
  }
  return { base: base || trimmed.slice(0, hashIndex), fragment: fragment.trim() };
}

function ensureOutputFileUrls(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const normalized = { ...entry };
      let primaryUrl = '';
      let typeFromUrl = '';

      for (const key of OUTPUT_URL_KEYS) {
        const value = normalized[key];
        if (typeof value === 'string' && value.trim()) {
          const trimmed = value.trim();
          primaryUrl = trimmed;
          normalized[key] = trimmed;
          if (!normalized.url) {
            normalized.url = trimmed;
          }
          if (!normalized.fileUrl) {
            normalized.fileUrl = trimmed;
          }
          break;
        }
      }

      if (!primaryUrl && typeof normalized.typeUrl === 'string' && normalized.typeUrl.trim()) {
        const parsed = parseTypeUrl(normalized.typeUrl);
        if (parsed.base) {
          primaryUrl = parsed.base;
        }
        if (parsed.fragment) {
          typeFromUrl = parsed.fragment;
          if (!normalized.type) {
            normalized.type = parsed.fragment;
          }
        }
      }

      if (!primaryUrl && typeof normalized.url === 'string') {
        const trimmed = normalized.url.trim();
        if (trimmed) {
          primaryUrl = trimmed;
          normalized.url = trimmed;
        }
      }
      if (!primaryUrl && typeof normalized.fileUrl === 'string') {
        const trimmed = normalized.fileUrl.trim();
        if (trimmed) {
          primaryUrl = trimmed;
          normalized.fileUrl = trimmed;
        }
      }

      if (primaryUrl) {
        const trimmedPrimary = primaryUrl.trim();
        normalized.url = trimmedPrimary;
        normalized.fileUrl = trimmedPrimary;

        const typeFragmentSource =
          (typeof normalized.type === 'string' && normalized.type.trim()) ||
          typeFromUrl ||
          (typeof normalized.templateType === 'string' && normalized.templateType.trim()) ||
          'download';

        const parsedExisting = parseTypeUrl(normalized.typeUrl);
        const typeUrlBase = parsedExisting.base || trimmedPrimary;
        const fragment = parsedExisting.fragment || typeFragmentSource;
        normalized.typeUrl = `${typeUrlBase}#${encodeURIComponent(fragment)}`;
      }

      if (typeof normalized.fileUrl === 'string') {
        normalized.fileUrl = normalized.fileUrl.trim();
      }
      if (typeof normalized.typeUrl === 'string') {
        normalized.typeUrl = normalized.typeUrl.trim();
      }

      if (!normalized.fileUrl || !normalized.typeUrl) {
        return null;
      }

      return normalized;
    })
    .filter((entry) => entry && typeof entry === 'object');
}

const SERVICE_ERROR_FALLBACK_MESSAGES = {
  INITIAL_UPLOAD_FAILED: S3_STORAGE_ERROR_MESSAGE,
  STORAGE_UNAVAILABLE: S3_STORAGE_ERROR_MESSAGE,
  CHANGE_LOG_PERSISTENCE_FAILED: S3_CHANGE_LOG_ERROR_MESSAGE,
  DOCUMENT_GENERATION_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
  PROCESSING_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
  GENERATION_FAILED: LAMBDA_PROCESSING_ERROR_MESSAGE,
  AI_RESPONSE_INVALID: GEMINI_ENHANCEMENT_ERROR_MESSAGE,
};

function sendError(res, status, code, message, details) {
  const normalizedDetails = normalizeErrorDetails(details);
  const normalizedMessage =
    typeof message === 'string' && message.trim() ? message.trim() : '';
  const fallbackMessage =
    SERVICE_ERROR_FALLBACK_MESSAGES[code] ||
    (status >= 500
      ? 'An unexpected error occurred. Please try again later.'
      : 'The request could not be completed.');

  const hasExplicitDetails = normalizedDetails !== undefined;
  const baseDetails = hasExplicitDetails
    ? normalizedDetails && typeof normalizedDetails === 'object'
      ? normalizedDetails
      : normalizedDetails
    : {};

  const shouldAnnotateSource = status >= 500 && hasExplicitDetails;
  let enrichedDetails = baseDetails;

  if (shouldAnnotateSource) {
    const detectedSource = detectServiceErrorSource({
      code,
      message: normalizedMessage || fallbackMessage,
      details: baseDetails,
    });
    if (detectedSource) {
      if (!enrichedDetails || typeof enrichedDetails !== 'object') {
        enrichedDetails = { source: detectedSource };
      } else if (!enrichedDetails.source) {
        enrichedDetails = { ...enrichedDetails, source: detectedSource };
      }
    } else if (
      enrichedDetails &&
      typeof enrichedDetails === 'object' &&
      Object.keys(enrichedDetails).length > 0
    ) {
      enrichedDetails = withServiceSource(enrichedDetails, {
        code,
        message: normalizedMessage || fallbackMessage,
        details: enrichedDetails,
      });
    }
  }

  const finalMessage =
    !normalizedMessage || /internal server error/i.test(normalizedMessage)
      ? fallbackMessage
      : normalizedMessage;

  const error = {
    code,
    message: finalMessage,
    details: enrichedDetails,
  };
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

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : defaultValue;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
    return defaultValue;
  }
  return defaultValue;
}

function readBooleanEnv(name, defaultValue = false) {
  const raw = readEnvValue(name);
  if (raw === undefined) {
    return defaultValue;
  }
  return parseBoolean(raw, defaultValue);
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

    if (metadata.url) {
      const [normalizedMetadata] = ensureOutputFileUrls([{ ...metadata }]);
      if (normalizedMetadata) {
        return normalizedMetadata;
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

function detectServiceErrorMessage(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  const normalized = messages
    .map((msg) => (typeof msg === 'string' ? msg.trim().toLowerCase() : ''))
    .filter(Boolean);
  if (!normalized.length) return null;

  if (normalized.some((msg) => msg.includes('gemini') || msg.includes('generative ai'))) {
    return GEMINI_ENHANCEMENT_ERROR_MESSAGE;
  }
  if (
    normalized.some(
      (msg) =>
        msg.includes('s3') ||
        msg.includes('bucket') ||
        msg.includes('accessdenied') ||
        msg.includes('no such bucket') ||
        msg.includes('unable to upload')
    )
  ) {
    return S3_STORAGE_ERROR_MESSAGE;
  }
  if (
    normalized.some(
      (msg) =>
        msg.includes('lambda') ||
        msg.includes('serverless') ||
        msg.includes('invoke') ||
        msg.includes('timeout')
    )
  ) {
    return LAMBDA_PROCESSING_ERROR_MESSAGE;
  }
  return null;
}

function describeProcessingFailure(err) {
  if (!err) {
    return LAMBDA_PROCESSING_ERROR_MESSAGE;
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
    return LAMBDA_PROCESSING_ERROR_MESSAGE;
  }

  const serviceMessage = detectServiceErrorMessage(messages);
  if (serviceMessage) {
    return serviceMessage;
  }

  if (messages.some((msg) => /pdf generation failed/i.test(msg))) {
    return CV_GENERATION_ERROR_MESSAGE;
  }

  const meaningful = messages.find((msg) => !/^processing failed$/i.test(msg));
  const summary = meaningful || messages[0];
  if (/^processing failed$/i.test(summary)) {
    return LAMBDA_PROCESSING_ERROR_MESSAGE;
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
  const plainPdfFallbackEnabled = readBooleanEnv(
    'ENABLE_PLAIN_PDF_FALLBACK',
    parseBoolean(fileConfig.ENABLE_PLAIN_PDF_FALLBACK, false)
  );
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
  process.env.ENABLE_PLAIN_PDF_FALLBACK = plainPdfFallbackEnabled ? 'true' : 'false';

  return Object.freeze({
    AWS_REGION: region,
    S3_BUCKET: s3Bucket,
    GEMINI_API_KEY: geminiApiKey,
    CLOUDFRONT_ORIGINS: allowedOrigins,
    ENABLE_PLAIN_PDF_FALLBACK: plainPdfFallbackEnabled,
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

function resolveCurrentAllowedOrigins() {
  const runtimeConfig = loadRuntimeConfig() || runtimeConfigSnapshot;
  if (
    Array.isArray(runtimeConfig?.CLOUDFRONT_ORIGINS) &&
    runtimeConfig.CLOUDFRONT_ORIGINS.length
  ) {
    return runtimeConfig.CLOUDFRONT_ORIGINS;
  }

  const envOrigins =
    readEnvValue('CLOUDFRONT_ORIGINS') || readEnvValue('ALLOWED_ORIGINS');
  if (envOrigins) {
    return parseAllowedOrigins(envOrigins);
  }

  return DEFAULT_ALLOWED_ORIGINS;
}

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

const allowedOrigins = resolveCurrentAllowedOrigins();
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
    const mimetype = (file.mimetype || '').toLowerCase();
    const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);
    const genericTypes = new Set(['application/octet-stream', 'binary/octet-stream', 'application/zip']);

    if (!allowedExtensions.has(ext)) {
      return cb(
        new Error('Unsupported resume format. Please upload a PDF, DOC, or DOCX file.')
      );
    }

    const isGenericType = !mimetype || genericTypes.has(mimetype);

    if (ext === '.pdf') {
      if (mimetype && !isGenericType && !/pdf/i.test(mimetype)) {
        return cb(new Error('The uploaded file is not a valid PDF document.'));
      }
      return cb(null, true);
    }

    if (ext === '.docx') {
      if (mimetype && !isGenericType && !/wordprocessingml|officedocument|ms-?word|vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i.test(mimetype)) {
        return cb(new Error('The uploaded file is not a valid DOCX document.'));
      }
      return cb(null, true);
    }

    if (ext === '.doc') {
      if (mimetype && !isGenericType && !/ms-?word|officedocument|application\/octet-stream/i.test(mimetype)) {
        return cb(new Error('The uploaded file is not a valid DOC document.'));
      }
      return cb(null, true);
    }

    return cb(null, true);
  }
});

const uploadResume = upload.single('resume');

const CV_TEMPLATE_ALIASES = {
  ucmo: 'classic',
  vibrant: 'modern',
  creative: 'modern'
};

const CV_TEMPLATES = ['modern', 'professional', 'classic', 'ats', '2025'];
const LEGACY_CV_TEMPLATES = Object.keys(CV_TEMPLATE_ALIASES);
const CL_TEMPLATES = [
  'cover_modern',
  'cover_classic',
  'cover_professional',
  'cover_ats',
  'cover_2025',
];
const COVER_LETTER_VARIANT_KEYS = ['cover_letter1', 'cover_letter2'];
const COVER_TEMPLATE_ALIASES = {
  modern: 'cover_modern',
  classic: 'cover_classic',
  professional: 'cover_professional',
  ats: 'cover_ats',
  '2025': 'cover_2025',
  futuristic: 'cover_2025',
};
const COVER_TEMPLATE_BY_RESUME = {
  modern: 'cover_modern',
  classic: 'cover_classic',
  professional: 'cover_professional',
  ats: 'cover_ats',
  2025: 'cover_2025',
};
const USER_TEMPLATE_ITEM_TYPE = 'USER_TEMPLATE_PREFERENCE';
const USER_TEMPLATE_PREFIX = 'user_template#';
const TEMPLATE_IDS = [...CV_TEMPLATES, ...LEGACY_CV_TEMPLATES]; // Backwards compatibility
const ALL_TEMPLATES = [...new Set([...TEMPLATE_IDS, ...CL_TEMPLATES])];

// Map each CV template to a style group so we can ensure contrasting picks
const CV_TEMPLATE_GROUPS = {
  modern: 'modern',
  professional: 'professional',
  classic: 'classic',
  ats: 'ats',
  2025: 'futuristic'
};

// Predefined contrasting template pairs used when no explicit templates are provided
const CONTRASTING_PAIRS = [
  ['modern', 'classic'],
  ['professional', 'ats'],
  ['2025', 'modern']
];

const KNOWN_CV_TEMPLATE_SET = new Set(TEMPLATE_IDS);

function canonicalizeCvTemplateId(templateId, fallback = CV_TEMPLATES[0]) {
  const fallbackCanonical = CV_TEMPLATE_ALIASES[fallback] || fallback || CV_TEMPLATES[0];
  if (!templateId || typeof templateId !== 'string') {
    return fallbackCanonical;
  }
  const normalized = templateId.trim().toLowerCase();
  if (!normalized) {
    return fallbackCanonical;
  }
  if (CV_TEMPLATES.includes(normalized)) {
    return normalized;
  }
  if (CV_TEMPLATE_ALIASES[normalized]) {
    return CV_TEMPLATE_ALIASES[normalized];
  }
  if (KNOWN_CV_TEMPLATE_SET.has(normalized)) {
    const alias = CV_TEMPLATE_ALIASES[normalized];
    return alias || normalized;
  }
  const base = normalized.split(/[-_]/)[0];
  if (base && base !== normalized) {
    return canonicalizeCvTemplateId(base, fallbackCanonical);
  }
  return fallbackCanonical;
}

function parseTemplateArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      return value.split(',');
    }
  }
  return [];
}

function uniqueValidCvTemplates(list = []) {
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    if (!item) return;
    const canonical = canonicalizeCvTemplateId(item);
    if (!canonical || seen.has(canonical)) {
      return;
    }
    seen.add(canonical);
    result.push(canonical);
  });
  return result;
}

function normalizeTemplateHistory(list = [], additional = []) {
  const history = [];
  if (Array.isArray(list)) {
    list.forEach((item) => {
      const canonical = canonicalizeCvTemplateId(item);
      if (canonical && !history.includes(canonical)) {
        history.push(canonical);
      }
    });
  }
  const additions = Array.isArray(additional) ? additional : [additional];
  for (let i = additions.length - 1; i >= 0; i -= 1) {
    const canonical = canonicalizeCvTemplateId(additions[i]);
    if (!canonical) continue;
    const existingIndex = history.indexOf(canonical);
    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    history.unshift(canonical);
  }
  return history;
}

function buildUserTemplatePreferenceKey(userId) {
  if (!userId) return { key: '', normalized: '' };
  const normalizedUserId = normalizePersonalData(userId);
  if (!normalizedUserId) return { key: '', normalized: '' };
  return {
    key: `${USER_TEMPLATE_PREFIX}${normalizedUserId}`,
    normalized: normalizedUserId,
  };
}

async function loadUserTemplatePreference({
  dynamo,
  tableName,
  userId,
  logContext = {},
}) {
  if (!dynamo || !tableName || !userId) {
    return undefined;
  }
  const { key, normalized } = buildUserTemplatePreferenceKey(userId);
  if (!key) {
    return undefined;
  }
  try {
    const response = await dynamo.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: key } },
        ProjectionExpression: 'templatePreference',
      })
    );
    const preference = response?.Item?.templatePreference?.S || '';
    const canonical = canonicalizeCvTemplateId(preference);
    if (canonical) {
      logStructured('info', 'user_template_preference_loaded', {
        ...logContext,
        userPreferenceKey: key,
        template: canonical,
      });
    }
    return canonical || undefined;
  } catch (err) {
    logStructured('warn', 'user_template_preference_load_failed', {
      ...logContext,
      error: serializeError(err),
      userPreferenceKey: key,
      userIdValue: normalized,
    });
    return undefined;
  }
}

async function persistUserTemplatePreference({
  dynamo,
  tableName,
  userId,
  templateId,
  logContext = {},
}) {
  if (!dynamo || !tableName || !userId) {
    return;
  }
  const canonical = canonicalizeCvTemplateId(templateId);
  if (!canonical) {
    return;
  }
  const { key, normalized } = buildUserTemplatePreferenceKey(userId);
  if (!key) {
    return;
  }
  const nowIso = new Date().toISOString();
  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: key } },
        UpdateExpression:
          'SET itemType = :itemType, templatePreference = :template, updatedAt = :updatedAt, userIdValue = :userIdValue',
        ExpressionAttributeValues: {
          ':itemType': { S: USER_TEMPLATE_ITEM_TYPE },
          ':template': { S: canonical },
          ':updatedAt': { S: nowIso },
          ':userIdValue': { S: normalized },
        },
      })
    );
    logStructured('info', 'user_template_preference_recorded', {
      ...logContext,
      userPreferenceKey: key,
      template: canonical,
    });
  } catch (err) {
    logStructured('warn', 'user_template_preference_record_failed', {
      ...logContext,
      error: serializeError(err),
      userPreferenceKey: key,
      userIdValue: normalized,
    });
  }
}

function canonicalizeCoverTemplateId(templateId, fallback = CL_TEMPLATES[0]) {
  if (!templateId || typeof templateId !== 'string') {
    return fallback;
  }
  const trimmed = templateId.trim();
  if (!trimmed) {
    return fallback;
  }
  const lowerTrimmed = trimmed.toLowerCase();
  if (CL_TEMPLATES.includes(lowerTrimmed)) {
    return lowerTrimmed;
  }
  const normalized = lowerTrimmed.replace(/\s+/g, '_');
  if (CL_TEMPLATES.includes(normalized)) {
    return normalized;
  }
  if (COVER_TEMPLATE_ALIASES[normalized]) {
    return COVER_TEMPLATE_ALIASES[normalized];
  }
  if (COVER_TEMPLATE_ALIASES[lowerTrimmed]) {
    return COVER_TEMPLATE_ALIASES[lowerTrimmed];
  }
  if (normalized.startsWith('cover_')) {
    const suffix = normalized.slice('cover_'.length);
    if (COVER_TEMPLATE_ALIASES[suffix]) {
      return COVER_TEMPLATE_ALIASES[suffix];
    }
  }
  return fallback;
}

function deriveCoverTemplateFromCv(templateId) {
  const canonical = canonicalizeCvTemplateId(templateId, '');
  if (!canonical) {
    return CL_TEMPLATES[0];
  }
  return COVER_TEMPLATE_BY_RESUME[canonical] || CL_TEMPLATES[0];
}

function uniqueValidCoverTemplates(list = []) {
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    if (!item) return;
    const canonical = canonicalizeCoverTemplateId(item);
    if (seen.has(canonical)) {
      return;
    }
    seen.add(canonical);
    result.push(canonical);
  });
  return result;
}

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
  clTemplates,
  preferredTemplate,
} = {}) {
  const canonicalPreferred = preferredTemplate
    ? canonicalizeCvTemplateId(preferredTemplate, '')
    : template1
      ? canonicalizeCvTemplateId(template1, '')
      : '';
  const parsedCvTemplates = uniqueValidCvTemplates([
    ...parseTemplateArray(cvTemplates),
    template1,
    template2,
    canonicalPreferred,
    preferredTemplate,
  ]);
  let availableCvTemplates = parsedCvTemplates.length
    ? Array.from(new Set([...parsedCvTemplates, ...CV_TEMPLATES]))
    : [...CV_TEMPLATES];

  if (canonicalPreferred) {
    availableCvTemplates = [
      canonicalPreferred,
      ...availableCvTemplates.filter((tpl) => tpl !== canonicalPreferred),
    ];
  }

  const primaryTemplate =
    canonicalPreferred || availableCvTemplates[0] || CV_TEMPLATES[0];

  const chooseSecondary = (current, pool) => {
    const contrasting = pool.find(
      (tpl) => tpl !== current && CV_TEMPLATE_GROUPS[tpl] !== CV_TEMPLATE_GROUPS[current]
    );
    if (contrasting) return contrasting;
    const different = pool.find((tpl) => tpl !== current);
    return different || current;
  };

  const secondaryCandidates = uniqueValidCvTemplates(
    [
      template1,
      template2,
      preferredTemplate,
      canonicalPreferred,
      ...availableCvTemplates.filter((tpl) => tpl !== primaryTemplate),
    ].filter(Boolean)
  ).filter((tpl) => tpl !== primaryTemplate);

  let secondaryTemplate =
    secondaryCandidates[0] || chooseSecondary(primaryTemplate, availableCvTemplates);

  if (
    secondaryTemplate &&
    CV_TEMPLATE_GROUPS[secondaryTemplate] === CV_TEMPLATE_GROUPS[primaryTemplate]
  ) {
    const contrasted = secondaryCandidates.find(
      (tpl) => CV_TEMPLATE_GROUPS[tpl] !== CV_TEMPLATE_GROUPS[primaryTemplate]
    );
    if (contrasted) {
      secondaryTemplate = contrasted;
    }
  }

  if (secondaryTemplate === primaryTemplate) {
    const extendedPool = Array.from(
      new Set([
        ...availableCvTemplates,
        ...CV_TEMPLATES,
        canonicalPreferred,
      ])
    );
    secondaryTemplate = chooseSecondary(primaryTemplate, extendedPool);
  }

  const derivedCoverFromPreferred = deriveCoverTemplateFromCv(
    canonicalPreferred || template1 || primaryTemplate
  );
  const derivedCoverFromPrimary = deriveCoverTemplateFromCv(primaryTemplate);
  const derivedCoverFromSecondary = deriveCoverTemplateFromCv(secondaryTemplate);
  const coverFallbackCandidates = [
    coverTemplate1,
    coverTemplate2,
    ...parseTemplateArray(clTemplates),
    derivedCoverFromPreferred,
    derivedCoverFromPrimary,
    derivedCoverFromSecondary,
    defaultClTemplate,
  ];
  let parsedCoverTemplates = uniqueValidCoverTemplates(coverFallbackCandidates);
  if (!parsedCoverTemplates.length) {
    parsedCoverTemplates = uniqueValidCoverTemplates([
      derivedCoverFromPrimary,
      derivedCoverFromSecondary,
      ...CL_TEMPLATES,
    ]);
  } else {
    parsedCoverTemplates = uniqueValidCoverTemplates([
      ...parsedCoverTemplates,
      derivedCoverFromPrimary,
      derivedCoverFromSecondary,
      ...CL_TEMPLATES,
    ]);
  }
  const coverPrimaryFallback =
    parsedCoverTemplates[0] ||
    derivedCoverFromPrimary ||
    defaultClTemplate ||
    CL_TEMPLATES[0];
  coverTemplate1 = canonicalizeCoverTemplateId(
    coverTemplate1 || coverPrimaryFallback,
    coverPrimaryFallback
  );
  const coverSecondaryFallbackCandidates = [
    ...parsedCoverTemplates.filter((tpl) => tpl !== coverTemplate1),
    derivedCoverFromSecondary,
    derivedCoverFromPrimary !== coverTemplate1 ? derivedCoverFromPrimary : null,
    ...CL_TEMPLATES.filter((tpl) => tpl !== coverTemplate1),
  ].filter(Boolean);
  const coverSecondaryFallback =
    coverSecondaryFallbackCandidates[0] || coverPrimaryFallback;
  coverTemplate2 = canonicalizeCoverTemplateId(
    coverTemplate2 || coverSecondaryFallback,
    coverSecondaryFallback
  );
  if (coverTemplate1 === coverTemplate2) {
    coverTemplate2 =
      CL_TEMPLATES.find((tpl) => tpl !== coverTemplate1) || CL_TEMPLATES[0];
  }

  return {
    template1: primaryTemplate,
    template2: secondaryTemplate,
    coverTemplate1,
    coverTemplate2,
    templates: availableCvTemplates,
    coverTemplates: parsedCoverTemplates,
  };
}

const configuredRegion =
  runtimeConfigSnapshot?.AWS_REGION || readEnvValue('AWS_REGION') || DEFAULT_AWS_REGION;
process.env.AWS_REGION = configuredRegion;

const region = configuredRegion;
let s3Client = new S3Client({ region });
errorLogS3Client = s3Client;
errorLogBucket =
  runtimeConfigSnapshot?.S3_BUCKET ||
  process.env.S3_BUCKET ||
  readEnvValue('S3_BUCKET');
function normalizePersonalData(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value);
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

const SUMMARY_SECTION_PATTERN = /^#\s*summary/i;
const SKILLS_SECTION_PATTERN = /^#\s*skills/i;
const EXPERIENCE_SECTION_PATTERN = /^#\s*(work\s+)?experience/i;
const CERTIFICATIONS_SECTION_PATTERN =
  /^#\s*(certifications?|licenses?\s*(?:&|and)\s*certifications?)/i;
const PROJECTS_SECTION_PATTERN =
  /^#\s*(projects?|key\s+projects|selected\s+projects|project\s+highlights)/i;
const HIGHLIGHTS_SECTION_PATTERN =
  /^#\s*(highlights?|career\s+highlights|key\s+highlights|professional\s+highlights)/i;

function extractDesignationLine(resumeText = '') {
  const lines = String(resumeText || '')
    .split(/\r?\n/)
    .map((line) => line.trim());
  const filtered = lines.filter(Boolean);
  if (!filtered.length) {
    return '';
  }

  const isLikelyHeading = (value) => /^#\s+/.test(value);
  const isLikelyBullet = (value) => /^[-•*]/.test(value);
  const isContactLine = (value) =>
    /@/.test(value) || /https?:\/\//i.test(value) || /\b\d{3}[)\s.-]?\d{3}[\s.-]?\d{4}\b/.test(value);

  for (let i = 1; i < Math.min(filtered.length, 6); i += 1) {
    const candidate = filtered[i];
    if (!candidate) continue;
    if (isLikelyHeading(candidate) || isLikelyBullet(candidate) || isContactLine(candidate)) {
      continue;
    }
    if (candidate.length > 80) {
      continue;
    }
    return candidate;
  }

  return '';
}

const IMPROVEMENT_SECTION_CONFIG = {
  'improve-summary': { key: 'summary', label: 'Summary', pattern: SUMMARY_SECTION_PATTERN },
  'add-missing-skills': { key: 'skills', label: 'Skills', pattern: SKILLS_SECTION_PATTERN },
  'align-experience': { key: 'experience', label: 'Work Experience', pattern: EXPERIENCE_SECTION_PATTERN },
  'improve-certifications': {
    key: 'certifications',
    label: 'Certifications',
    pattern: CERTIFICATIONS_SECTION_PATTERN,
  },
  'improve-projects': { key: 'projects', label: 'Projects', pattern: PROJECTS_SECTION_PATTERN },
  'improve-highlights': { key: 'highlights', label: 'Highlights', pattern: HIGHLIGHTS_SECTION_PATTERN },
  'change-designation': { key: 'designation', label: 'Designation' },
  'enhance-all': { key: 'resume', label: 'Entire Resume' },
};

function resolveImprovementSectionContext(type, resumeText, updatedResume) {
  const config = IMPROVEMENT_SECTION_CONFIG[type] || IMPROVEMENT_SECTION_CONFIG['enhance-all'];

  if (config.pattern) {
    const beforeSection = extractSectionContent(resumeText, config.pattern);
    const afterSection = extractSectionContent(updatedResume, config.pattern);
    const label = deriveHeadingLabel(afterSection.heading || beforeSection.heading, config.label);
    const beforeText = Array.isArray(beforeSection.content)
      ? beforeSection.content.join('\n').trim()
      : '';
    const afterText = Array.isArray(afterSection.content)
      ? afterSection.content.join('\n').trim()
      : '';
    return {
      key: config.key,
      label,
      beforeText,
      afterText,
    };
  }

  if (config.key === 'designation') {
    return {
      key: config.key,
      label: config.label,
      beforeText: extractDesignationLine(resumeText),
      afterText: extractDesignationLine(updatedResume),
    };
  }

  return {
    key: config.key,
    label: config.label,
    beforeText: String(resumeText || ''),
    afterText: String(updatedResume || ''),
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

function canonicalSectionLabel(label = '', fallback = '') {
  const normalized = typeof label === 'string' ? label.trim().toLowerCase() : '';
  if (!normalized) {
    return fallback || '';
  }

  if (normalized === 'experience' || normalized === 'professional experience') {
    return 'Work Experience';
  }

  return label || fallback || '';
}

function escapeRegExp(value = '') {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      if (!before) {
        const fallbackBefore = searchTitles.find(Boolean);
        if (
          fallbackBefore &&
          fallbackBefore.trim().toLowerCase() !== candidate.toLowerCase()
        ) {
          before = fallbackBefore;
        }
      }
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
      certifications: targetJobTitle
        ? `Certifications foreground credentials recruiters expect for ${targetJobTitle}.`
        : 'Certifications foreground credentials recruiters expect for this role.',
      projects: targetJobTitle
        ? `Projects spotlight initiatives that mirror ${targetJobTitle} responsibilities.`
        : 'Projects spotlight initiatives that mirror the job description priorities.',
      highlights: targetJobTitle
        ? `Highlights now emphasise wins tied to ${targetJobTitle} success metrics.`
        : 'Highlights now emphasise wins tied to the job description success metrics.',
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
        pattern: SUMMARY_SECTION_PATTERN,
        defaultLabel: 'Summary',
        insertIndex: 1,
      }),
      defaultReasons.summary
    );

    trackChange(
      'skills',
      'Skills',
      applySectionUpdate(workingResume, baseResult.updatedResume, {
        pattern: SKILLS_SECTION_PATTERN,
        defaultLabel: 'Skills',
        insertIndex: 2,
      }),
      defaultReasons.skills
    );

    trackChange(
      'experience',
      'Work Experience',
      applySectionUpdate(workingResume, baseResult.updatedResume, {
        pattern: EXPERIENCE_SECTION_PATTERN,
        defaultLabel: 'Work Experience',
      }),
      defaultReasons.experience
    );

    const certificationsResult = applySectionUpdate(
      workingResume,
      baseResult.updatedResume,
      {
        pattern: CERTIFICATIONS_SECTION_PATTERN,
        defaultLabel: 'Certifications',
        insertIndex: 3,
      }
    );

    trackChange(
      'certifications',
      'Certifications',
      certificationsResult,
      defaultReasons.certifications,
      { forceRecord: true }
    );

    const projectsResult = applySectionUpdate(workingResume, baseResult.updatedResume, {
      pattern: PROJECTS_SECTION_PATTERN,
      defaultLabel: 'Projects',
      insertIndex: 3,
    });

    trackChange(
      'projects',
      'Projects',
      projectsResult,
      defaultReasons.projects,
      { forceRecord: true }
    );

    const highlightsResult = applySectionUpdate(workingResume, baseResult.updatedResume, {
      pattern: HIGHLIGHTS_SECTION_PATTERN,
      defaultLabel: 'Highlights',
      insertIndex: 2,
    });

    trackChange(
      'highlights',
      'Highlights',
      highlightsResult,
      defaultReasons.highlights,
      { forceRecord: true }
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
      pattern: SUMMARY_SECTION_PATTERN,
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
      pattern: SKILLS_SECTION_PATTERN,
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
      pattern: EXPERIENCE_SECTION_PATTERN,
      defaultLabel: 'Work Experience',
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'improve-certifications') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: CERTIFICATIONS_SECTION_PATTERN,
      defaultLabel: 'Certifications',
      insertIndex: 3,
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'improve-projects') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: PROJECTS_SECTION_PATTERN,
      defaultLabel: 'Projects',
      insertIndex: 3,
    });
    return {
      ...baseResult,
      ...sectionResult,
      beforeExcerpt: sectionResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: sectionResult.afterExcerpt || baseResult.afterExcerpt,
    };
  }

  if (type === 'improve-highlights') {
    const sectionResult = applySectionUpdate(safeOriginal, baseResult.updatedResume, {
      pattern: HIGHLIGHTS_SECTION_PATTERN,
      defaultLabel: 'Highlights',
      insertIndex: 2,
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
    const changeDetails = Array.isArray(baseResult.changeDetails)
      ? [...baseResult.changeDetails]
      : [];
    const reason = (() => {
      const jobTitle = typeof context?.jobTitle === 'string' ? context.jobTitle.trim() : '';
      if (jobTitle) {
        return `Headline now states ${jobTitle} to remove designation mismatch.`;
      }
      return 'Headline now reflects the target job title for ATS clarity.';
    })();
    const beforeValue = (
      designationResult.beforeExcerpt ||
      baseResult.beforeExcerpt ||
      context.currentTitle ||
      context.originalTitle ||
      ''
    )
      .toString()
      .trim();
    const afterValue = (
      designationResult.afterExcerpt ||
      baseResult.afterExcerpt ||
      context.jobTitle ||
      ''
    )
      .toString()
      .trim();

    if (afterValue && (!beforeValue || beforeValue.toLowerCase() !== afterValue.toLowerCase())) {
      changeDetails.push({
        key: 'designation',
        section: 'Headline',
        label: 'Headline',
        before: beforeValue,
        after: afterValue,
        reasons: reason ? [reason] : [],
      });
    }

    return {
      ...baseResult,
      ...designationResult,
      beforeExcerpt: designationResult.beforeExcerpt || baseResult.beforeExcerpt,
      afterExcerpt: designationResult.afterExcerpt || baseResult.afterExcerpt,
      changeDetails,
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
    title: 'Improve Skills',
    focus: [
      'Blend the missing or underrepresented skills into both the Skills list and relevant experience bullets.',
      'Revise existing bullets so each new skill is backed by duties already present in the resume.',
      'Avoid duplicating bullets—edit succinctly while keeping ATS-friendly formatting.',
    ],
  },
  'change-designation': {
    title: 'Improve Designation',
    focus: [
      'Update the headline or latest role title to match the target job title while keeping chronology intact.',
      'Adjust surrounding bullets so they evidence the updated title with truthful scope and impact.',
      'Retain original employers, dates, and role ordering exactly.',
    ],
  },
  'align-experience': {
    title: 'Improve Experience',
    focus: [
      'Rewrite the most relevant experience bullets so they mirror the job description’s responsibilities and metrics.',
      'Highlight missing keywords or responsibilities from the JD using facts already in the resume.',
      'Keep bullet formatting, tense, and chronology consistent throughout the section.',
    ],
  },
  'improve-certifications': {
    title: 'Improve Certifications',
    focus: [
      'Prioritise certifications that validate the JD’s compliance or technical requirements.',
      'Clarify issuer names and relevance without inventing new credentials.',
      'Keep existing credential dates and order intact while surfacing the most role-aligned items first.',
    ],
  },
  'improve-projects': {
    title: 'Improve Projects',
    focus: [
      'Refocus project bullets on outcomes and responsibilities that match the job description.',
      'Weave in JD keywords using project details already present in the resume.',
      'Avoid adding new projects—revise the wording of existing ones to emphasise fit.',
    ],
  },
  'improve-highlights': {
    title: 'Improve Highlights',
    focus: [
      'Elevate the top-line wins so they mirror the target role’s success metrics.',
      'Tie each highlight back to measurable impact already evidenced in the resume.',
      'Retain the existing highlight count and ordering while tightening phrasing.',
    ],
  },
  'enhance-all': {
    title: 'Enhance All',
    focus: [
      'Deliver the summary, skills, experience, designation, certifications, projects, and highlights improvements in one cohesive pass.',
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
    const section = extractSectionContent(resumeText, SUMMARY_SECTION_PATTERN);
    const before = section.content.join('\n').trim();
    const summaryLine = `Forward-looking ${jobTitle || 'professional'} with strengths in ${
      fallbackSkillText || 'delivering measurable outcomes'
    } and a record of translating goals into results.`;
    const updatedResume = replaceSectionContent(resumeText, SUMMARY_SECTION_PATTERN, [summaryLine], {
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
    const section = extractSectionContent(resumeText, SKILLS_SECTION_PATTERN);
    const before = section.content.join('\n').trim();
    const bullet = `- ${fallbackSkills.join(', ')}`;
    const existing = section.content.some((line) =>
      fallbackSkills.some((skill) => line.toLowerCase().includes(skill.toLowerCase()))
    );
    const newContent = existing
      ? section.content
      : [...section.content.filter(Boolean), bullet];
    const sanitizedContent = sanitizeSectionLines(newContent);
    const after = sanitizedContent.join('\n').trim();
    const updatedResume = replaceSectionContent(
      resumeText,
      SKILLS_SECTION_PATTERN,
      sanitizedContent,
      { headingLabel: 'Skills', insertIndex: 2 }
    );
    const explanation = existing
      ? 'Skills section already covers the requested keywords.'
      : 'Added missing job keywords into the skills section.';
    const beforeLines = extractDiffLines(before, {
      sectionTokens: ['Skills', 'skills'],
    });
    const afterLines = extractDiffLines(after, {
      sectionTokens: ['Skills', 'skills'],
    });
    const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
    const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));
    const addedItems = afterLines.filter((line) => !beforeSet.has(line.toLowerCase()));
    const removedItems = beforeLines.filter((line) => !afterSet.has(line.toLowerCase()));
    const reasons = explanation ? [explanation] : [];
    const changeDetails = [
      {
        key: 'skills',
        section: 'Skills',
        label: 'Skills',
        before,
        after,
        reasons,
        addedItems,
        removedItems,
        summarySegments: [
          {
            section: 'Skills',
            added: addedItems,
            removed: removedItems,
            reason: reasons,
            reasons,
          },
        ],
      },
    ];
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: existing ? before : bullet,
      explanation,
      confidence: existing ? 0.25 : 0.33,
      changeDetails,
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
    const section = extractSectionContent(resumeText, EXPERIENCE_SECTION_PATTERN);
    const headingLabel = deriveHeadingLabel(section.heading, 'Work Experience');
    const sectionLabel = canonicalSectionLabel(headingLabel, 'Work Experience');
    const baseContent = sanitizeSectionLines(section.content);
    const before = baseContent.join('\n').trim();
    const responsibilityDescriptor = (() => {
      if (jobTitle && fallbackSkillText) {
        return `${jobTitle} responsibilities across ${fallbackSkillText}`;
      }
      if (jobTitle) {
        return `${jobTitle} responsibilities`;
      }
      if (fallbackSkillText) {
        return `${fallbackSkillText} responsibilities`;
      }
      return 'key responsibilities from the job description';
    })();
    const updatedContent = [...baseContent];
    let firstBulletIndex = updatedContent.findIndex((line) => /^[-•*]/.test(line.trim()));
    let bulletMarker = '-';

    if (firstBulletIndex >= 0) {
      const originalLine = updatedContent[firstBulletIndex] || '';
      const trimmed = originalLine.trim();
      const markerMatch = trimmed.match(/^([•*-])/);
      bulletMarker = markerMatch ? markerMatch[1] : '-';
      const body = trimmed.replace(/^([•*-])\s*/, '').replace(/\s*[.?!]+$/, '');
      const rewrittenLine = `${bulletMarker} ${body} — reframed to show ownership of ${responsibilityDescriptor}.`;
      updatedContent[firstBulletIndex] = rewrittenLine;
    } else {
      const synthesizedLine = `${bulletMarker} Delivered on ${responsibilityDescriptor} with measurable outcomes.`;
      updatedContent.push(synthesizedLine);
      firstBulletIndex = updatedContent.length - 1;
    }

    const responsibilitiesLine = `${bulletMarker} Highlighted ${responsibilityDescriptor} so recruiters instantly see JD-aligned responsibilities.`;
    const additionLine = `${bulletMarker} Delivered ${fallbackSkillText || 'priority'} initiatives to mirror JD responsibilities with measurable outcomes.`;
    const responsibilitiesLineKey = responsibilitiesLine.trim().toLowerCase();
    const additionLineKey = additionLine.trim().toLowerCase();
    const hasResponsibilities = updatedContent.some(
      (line) => line && line.trim().toLowerCase() === responsibilitiesLineKey
    );
    const hasAddition = updatedContent.some((line) => line && line.trim().toLowerCase() === additionLineKey);
    let insertIndex = firstBulletIndex >= 0 ? firstBulletIndex + 1 : updatedContent.length;
    let additionInsertIndex = insertIndex;
    if (!hasResponsibilities) {
      updatedContent.splice(insertIndex, 0, responsibilitiesLine);
      additionInsertIndex = insertIndex + 1;
    } else {
      const existingIndex = updatedContent.findIndex(
        (line) => line && line.trim().toLowerCase() === responsibilitiesLineKey
      );
      additionInsertIndex = existingIndex >= 0 ? existingIndex + 1 : insertIndex;
    }
    if (!hasAddition) {
      updatedContent.splice(additionInsertIndex, 0, additionLine);
    }

    const sanitizedContent = sanitizeSectionLines(updatedContent);
    const after = sanitizedContent.join('\n').trim();
    const updatedResume = replaceSectionContent(
      resumeText,
      EXPERIENCE_SECTION_PATTERN,
      sanitizedContent,
      { headingLabel: headingLabel || 'Work Experience' }
    );
    const beforeLines = extractDiffLines(before);
    const afterLines = extractDiffLines(after);
    const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
    const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));
    const addedItems = afterLines.filter((line) => !beforeSet.has(line.toLowerCase()));
    const removedItems = beforeLines.filter((line) => !afterSet.has(line.toLowerCase()));
    const explanation = jobTitle
      ? `Rewrote experience bullets to surface ${jobTitle} responsibilities and highlight the JD-aligned additions.`
      : 'Rewrote experience bullets to surface JD-aligned responsibilities and highlight the additions.';
    const changeDetails = [
      {
        key: 'experience',
        section: sectionLabel,
        label: sectionLabel,
        before,
        after,
        reasons: [explanation],
        addedItems,
        removedItems,
        summarySegments: [
          {
            section: sectionLabel,
            added: addedItems,
            removed: removedItems,
            reasons: [explanation],
          },
        ],
      },
    ];
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: after,
      explanation,
      confidence: 0.38,
      changeDetails,
    };
  }

  if (type === 'improve-certifications') {
    const certificationCandidates = dedupeCertificates([
      ...(context.knownCertificates || []),
      ...(context.manualCertificates || []),
    ]);
    if (!certificationCandidates.length) {
      return {
        ...baseResult,
        explanation: 'No certifications supplied to reinforce for this role.',
      };
    }

    const targetCertificate = certificationCandidates[0];
    const certificateLabelParts = [targetCertificate.name].filter(Boolean);
    if (targetCertificate.provider) {
      certificateLabelParts.push(targetCertificate.provider);
    }
    const certificateLine = `- ${certificateLabelParts.join(' — ')}`;
    const section = extractSectionContent(resumeText, CERTIFICATIONS_SECTION_PATTERN);
    const headingLabel = deriveHeadingLabel(section.heading, 'Certifications');
    const before = section.content.join('\n').trim();
    const alreadyPresent = section.content.some((line) =>
      targetCertificate.name && line.toLowerCase().includes(targetCertificate.name.toLowerCase())
    );
    const baseContent = section.content.filter((line) => typeof line === 'string');
    const newContent = alreadyPresent
      ? baseContent
      : [...baseContent.filter(Boolean), certificateLine];
    const sanitizedContent = newContent.length ? sanitizeSectionLines(newContent) : [];
    const targetContent = sanitizedContent.length ? sanitizedContent : [certificateLine];
    const after = targetContent.join('\n').trim();
    const updatedResume = replaceSectionContent(
      resumeText,
      CERTIFICATIONS_SECTION_PATTERN,
      targetContent,
      { headingLabel, insertIndex: 3 }
    );
    const explanation = alreadyPresent
      ? 'Certifications section already lists the supplied credential.'
      : `Highlighted ${targetCertificate.name} so the credential is prominent for screeners.`;
    const beforeLines = extractDiffLines(before, {
      sectionTokens: [headingLabel || 'Certifications', 'certifications'],
    });
    const afterLines = extractDiffLines(after, {
      sectionTokens: [headingLabel || 'Certifications', 'certifications'],
    });
    const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
    const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));
    const addedItems = afterLines.filter((line) => !beforeSet.has(line.toLowerCase()));
    const removedItems = beforeLines.filter((line) => !afterSet.has(line.toLowerCase()));
    const reasons = explanation ? [explanation] : [];
    const changeDetails = [
      {
        key: 'certifications',
        section: headingLabel || 'Certifications',
        label: headingLabel || 'Certifications',
        before,
        after,
        reasons,
        addedItems,
        removedItems,
        summarySegments: [
          {
            section: headingLabel || 'Certifications',
            added: addedItems,
            removed: removedItems,
            reason: reasons,
            reasons,
          },
        ],
      },
    ];
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: alreadyPresent ? before : certificateLine,
      explanation,
      confidence: alreadyPresent ? 0.26 : 0.32,
      changeDetails,
    };
  }

  if (type === 'improve-projects') {
    const section = extractSectionContent(resumeText, PROJECTS_SECTION_PATTERN);
    const headingLabel = deriveHeadingLabel(section.heading, 'Projects');
    const before = section.content.join('\n').trim();
    const focusText = fallbackSkillText || jobTitle || 'role priorities';
    const addition = `- Spotlighted projects that prove ${focusText} impact.`;
    const alreadyPresent = section.content.some((line) =>
      line.trim().toLowerCase() === addition.toLowerCase()
    );
    const baseContent = section.content.filter((line) => typeof line === 'string');
    const newContent = alreadyPresent
      ? baseContent
      : [...baseContent.filter(Boolean), addition];
    const sanitizedContent = newContent.length ? sanitizeSectionLines(newContent) : [];
    const updatedResume = replaceSectionContent(
      resumeText,
      PROJECTS_SECTION_PATTERN,
      sanitizedContent.length ? sanitizedContent : [addition],
      { headingLabel, insertIndex: 3 }
    );
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: alreadyPresent ? before : addition,
      explanation: alreadyPresent
        ? 'Projects section already emphasises the job-aligned initiatives.'
        : 'Elevated project bullets to mirror the job description priorities.',
      confidence: alreadyPresent ? 0.25 : 0.31,
    };
  }

  if (type === 'improve-highlights') {
    const section = extractSectionContent(resumeText, HIGHLIGHTS_SECTION_PATTERN);
    const headingLabel = deriveHeadingLabel(section.heading, 'Highlights');
    const before = section.content.join('\n').trim();
    const focusText = fallbackSkillText || jobTitle || 'target role';
    const addition = `- Highlighted wins that reinforce ${focusText} outcomes.`;
    const alreadyPresent = section.content.some((line) =>
      line.trim().toLowerCase() === addition.toLowerCase()
    );
    const baseContent = section.content.filter((line) => typeof line === 'string');
    const newContent = alreadyPresent
      ? baseContent
      : [...baseContent.filter(Boolean), addition];
    const sanitizedContent = newContent.length ? sanitizeSectionLines(newContent) : [];
    const targetContent = sanitizedContent.length ? sanitizedContent : [addition];
    const after = targetContent.join('\n').trim();
    const updatedResume = replaceSectionContent(
      resumeText,
      HIGHLIGHTS_SECTION_PATTERN,
      targetContent,
      { headingLabel, insertIndex: 2 }
    );
    const explanation = alreadyPresent
      ? 'Highlights already underscore the job-aligned achievements.'
      : 'Reinforced highlights so top wins echo the job metrics.';
    const beforeLines = extractDiffLines(before, {
      sectionTokens: [headingLabel || 'Highlights', 'highlights'],
    });
    const afterLines = extractDiffLines(after, {
      sectionTokens: [headingLabel || 'Highlights', 'highlights'],
    });
    const beforeSet = new Set(beforeLines.map((line) => line.toLowerCase()));
    const afterSet = new Set(afterLines.map((line) => line.toLowerCase()));
    const addedItems = afterLines.filter((line) => !beforeSet.has(line.toLowerCase()));
    const removedItems = beforeLines.filter((line) => !afterSet.has(line.toLowerCase()));
    const reasons = explanation ? [explanation] : [];
    const changeDetails = [
      {
        key: 'highlights',
        section: headingLabel || 'Highlights',
        label: headingLabel || 'Highlights',
        before,
        after,
        reasons,
        addedItems,
        removedItems,
        summarySegments: [
          {
            section: headingLabel || 'Highlights',
            added: addedItems,
            removed: removedItems,
            reason: reasons,
            reasons,
          },
        ],
      },
    ];
    return {
      updatedResume,
      beforeExcerpt: before,
      afterExcerpt: alreadyPresent ? before : addition,
      explanation,
      confidence: alreadyPresent ? 0.25 : 0.31,
      changeDetails,
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
    interim = fallbackImprovement('align-experience', {
      ...context,
      resumeText: interim.updatedResume,
    });
    interim = fallbackImprovement('improve-certifications', {
      ...context,
      resumeText: interim.updatedResume,
    });
    interim = fallbackImprovement('improve-projects', {
      ...context,
      resumeText: interim.updatedResume,
    });
    const finalResult = fallbackImprovement('improve-highlights', {
      ...context,
      resumeText: interim.updatedResume,
    });
    return {
      ...finalResult,
      explanation:
        'Applied deterministic improvements for summary, skills, designation, experience, certifications, projects, and highlights.',
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

class JobDescriptionFetchBlockedError extends Error {
  constructor(message = 'Job description fetch blocked', options = {}) {
    super(message);
    this.name = 'JobDescriptionFetchBlockedError';
    this.code = 'FETCH_BLOCKED';
    this.reason = 'FETCH_BLOCKED';
    this.manualInputRequired = true;
    if (options.status) {
      this.status = options.status;
    }
    if (options.code) {
      this.upstreamCode = options.code;
    }
    if (options.url) {
      this.url = options.url;
    }
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

function isJobDescriptionFetchBlocked(err = {}) {
  if (err instanceof JobDescriptionFetchBlockedError) {
    return true;
  }

  if (err && err.manualInputRequired) {
    return true;
  }

  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (code.includes('BLOCKED') || code === 'ERR_NETWORK' || code === 'ECONNREFUSED') {
    return true;
  }

  const status = err?.response?.status ?? err?.statusCode;
  if (typeof status === 'number' && [401, 403, 407, 429, 451].includes(status)) {
    return true;
  }

  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  if (!message) {
    return false;
  }

  return (
    message.includes('forbidden') ||
    message.includes('access denied') ||
    message.includes('blocked') ||
    message.includes('captcha') ||
    message.includes('authorization')
  );
}

function toJobDescriptionFetchError(err, context = {}) {
  if (err instanceof JobDescriptionFetchBlockedError) {
    return err;
  }

  if (isJobDescriptionFetchBlocked(err)) {
    return new JobDescriptionFetchBlockedError('Job description fetch was blocked', {
      status: err?.response?.status ?? err?.statusCode,
      code: typeof err?.code === 'string' ? err.code : undefined,
      url: context.url,
      cause: err,
    });
  }

  return err;
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
          const normalizedError = toJobDescriptionFetchError(err, { url });
          try {
            await page.close();
          } catch {
            /* ignore */
          }
          throw normalizedError;
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
      const normalizedError = toJobDescriptionFetchError(err, { url });
      if (normalizedError instanceof JobDescriptionFetchBlockedError) {
        throw normalizedError;
      }
      lastError = normalizedError;
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

function normalizeGeminiLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

const ENHANCEMENT_TOKEN_PATTERN = /\{\{RF_ENH_[A-Z0-9_]+\}\}/g;

function expandEnhancementTokenMap(tokenMap = {}) {
  const expanded = {};
  if (!tokenMap || typeof tokenMap !== 'object') {
    return expanded;
  }
  Object.entries(tokenMap).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    expanded[key] = value;
    if (typeof key === 'string' && key.startsWith('{{RF_ENH_')) {
      const compact = key
        .replace('{{RF_ENH_', '{{RFENH')
        .replace(/_/g, '');
      expanded[compact] = value;
    }
  });
  return expanded;
}

function registerEnhancementPlaceholder(container = {}, heading = '', value = '') {
  if (!container || typeof container !== 'object') {
    return null;
  }
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  if (!trimmedValue) {
    return null;
  }
  if (!container.placeholders || typeof container.placeholders !== 'object') {
    container.placeholders = {};
  }
  const normalizedHeading = normalizeHeading(heading || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'section';
  const slug = normalizedHeading.toUpperCase();
  const canonicalPattern = new RegExp(`^\\{\\{RF_ENH_${slug}_(\\d{4})\\}\\}$`);
  let maxIndex = 0;
  Object.keys(container.placeholders).forEach((key) => {
    const match = key.match(canonicalPattern);
    if (match) {
      const index = parseInt(match[1], 10);
      if (!Number.isNaN(index) && index > maxIndex) {
        maxIndex = index;
      }
    }
  });
  const nextIndex = maxIndex + 1;
  const token = `{{RF_ENH_${slug}_${String(nextIndex).padStart(4, '0')}}}`;
  container.placeholders[token] = trimmedValue;
  const compact = token.replace('{{RF_ENH_', '{{RFENH').replace(/_/g, '');
  container.placeholders[compact] = trimmedValue;
  return token;
}

function resolveEnhancementTokens(text = '', tokenMap = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  if (!tokenMap || typeof tokenMap !== 'object') {
    return text;
  }
  let resolved = text;
  Object.entries(tokenMap).forEach(([token, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;
    resolved = resolved.split(token).join(value);
  });
  return resolved;
}

function injectEnhancementTokens(text = '', tokenMap = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  if (!tokenMap || typeof tokenMap !== 'object') {
    return text;
  }
  let tokenized = text;
  Object.entries(tokenMap).forEach(([token, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const escapedValue = escapeRegExp(value.trim());
    const bulletPattern = new RegExp(`(^|\\n)([-*•]\s*)${escapedValue}(?=\\n|$)`, 'g');
    const linePattern = new RegExp(`(^|\\n)${escapedValue}(?=\\n|$)`, 'g');
    tokenized = tokenized.replace(bulletPattern, (match, prefix, bullet = '') => {
      return `${prefix}${bullet || ''}${token}`;
    });
    tokenized = tokenized.replace(linePattern, (match, prefix) => {
      return `${prefix}${token}`;
    });
  });
  return tokenized;
}

function resolveTokenText(value = '', tokenMap = {}) {
  if (typeof value !== 'string' || !value) {
    return value;
  }
  if (!tokenMap || typeof tokenMap !== 'object') {
    return value;
  }
  return value.replace(ENHANCEMENT_TOKEN_PATTERN, (match) => {
    const replacement = tokenMap[match];
    return typeof replacement === 'string' ? replacement : match;
  });
}

function tokenizeCoverLetterText(text = '', { letterIndex = 1 } = {}) {
  if (typeof text !== 'string') {
    return { tokenizedText: '', placeholders: {} };
  }

  const normalized = text.replace(/\r\n/g, '\n');
  const segments = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return { tokenizedText: normalized, placeholders: {} };
  }

  const placeholders = {};
  const tokens = segments.map((segment, index) => {
    const token = `{{RF_ENH_COVER${letterIndex}_${String(index + 1).padStart(4, '0')}}}`;
    placeholders[token] = segment;
    const compact = token.replace('{{RF_ENH_', '{{RFENH').replace(/_/g, '');
    placeholders[compact] = segment;
    return token;
  });

  return { tokenizedText: tokens.join('\n\n'), placeholders };
}

function collectCoverLetterSegments(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCoverLetterSegments(item));
  }
  if (typeof value === 'object') {
    const segments = [];
    if (typeof value.text === 'string') {
      segments.push(...collectCoverLetterSegments(value.text));
    }
    if (typeof value.raw === 'string') {
      segments.push(...collectCoverLetterSegments(value.raw));
    }
    if (typeof value.value === 'string') {
      segments.push(...collectCoverLetterSegments(value.value));
    }
    if (typeof value.paragraph === 'string') {
      segments.push(...collectCoverLetterSegments(value.paragraph));
    }
    ['paragraphs', 'sentences', 'lines', 'content'].forEach((key) => {
      if (Array.isArray(value[key])) {
        segments.push(...collectCoverLetterSegments(value[key]));
      }
    });
    if (
      segments.length === 0 &&
      typeof value.toString === 'function'
    ) {
      const rendered = value.toString();
      if (rendered && rendered !== '[object Object]') {
        segments.push(...collectCoverLetterSegments(rendered));
      }
    }
    return segments;
  }
  return [];
}

function normalizeCoverLetterTextValue(value) {
  if (typeof value === 'string') {
    return value.trim() ? value : '';
  }
  const segments = collectCoverLetterSegments(value);
  if (!segments.length) {
    return '';
  }
  const joined = segments.join('\n\n');
  return joined.trim() ? joined : '';
}

function normalizeCoverLetterOutputs(data = {}) {
  const normalized = {};
  const normalizedFrom = [];
  const invalidKeys = [];

  COVER_LETTER_VARIANT_KEYS.forEach((key) => {
    const rawValue = data && typeof data === 'object' ? data[key] : undefined;
    const normalizedText = normalizeCoverLetterTextValue(rawValue);
    normalized[key] = normalizedText;
    if (normalizedText) {
      if (typeof rawValue !== 'string') {
        normalizedFrom.push(key);
      }
    } else if (rawValue && typeof rawValue !== 'string') {
      invalidKeys.push(key);
    }
  });

  return { normalized, normalizedFrom, invalidKeys };
}

function buildResumeDataFromGeminiOutput(parsed = {}, name = 'Resume', sanitizeOptions = {}) {
  const parseLineOptions = sanitizeOptions?.preserveLinkText
    ? { preserveLinkText: true }
    : undefined;
  const sections = [];
  const placeholders = {};
  let placeholderIndex = 1;

  const createPlaceholder = (headingKey = 'section') => {
    const normalizedHeading = normalizeHeading(headingKey || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'section';
    const placeholderSlug = normalizedHeading.toUpperCase();
    const token = `{{RF_ENH_${placeholderSlug}_${String(placeholderIndex).padStart(4, '0')}}}`;
    placeholderIndex += 1;
    return token;
  };

  const toTokens = (line, heading) => {
    const normalized = typeof line === 'string' ? line.trim() : '';
    if (!normalized) return [];
    const placeholder = createPlaceholder(heading);
    const resolvedValue = normalized;
    placeholders[placeholder] = resolvedValue;
    if (typeof placeholder === 'string' && placeholder.startsWith('{{RF_ENH_')) {
      const compact = placeholder.replace('{{RF_ENH_', '{{RFENH').replace(/_/g, '');
      placeholders[compact] = resolvedValue;
    }
    const tokens = parseLine(`- ${placeholder}`, parseLineOptions);
    if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
    return tokens;
  };

  const pushSection = (heading, lines) => {
    const normalizedHeading = normalizeHeading(heading || '');
    if (!normalizedHeading) return;
    const normalizedLines = normalizeGeminiLines(lines);
    const items = normalizedLines
      .map((line) => toTokens(line, normalizedHeading))
      .filter((tokens) => tokens.length);
    if (items.length) {
      sections.push({ heading: normalizedHeading, items });
    }
  };

  const experienceLines = [];
  const latestTitle = typeof parsed.latestRoleTitle === 'string' ? parsed.latestRoleTitle.trim() : '';
  const latestDescription =
    typeof parsed.latestRoleDescription === 'string' ? parsed.latestRoleDescription.trim() : '';
  if (latestTitle || latestDescription) {
    const combined = [latestTitle, latestDescription].filter(Boolean).join(': ');
    if (combined) {
      experienceLines.push(combined);
    }
  }
  experienceLines.push(...normalizeGeminiLines(parsed.experience));

  const skillsInput = [
    ...normalizeGeminiLines(parsed.skills),
    ...normalizeGeminiLines(parsed.mandatorySkills),
  ];
  const seenSkills = new Set();
  const dedupedSkills = [];
  skillsInput.forEach((skill) => {
    const lower = skill.toLowerCase();
    if (lower && !seenSkills.has(lower)) {
      seenSkills.add(lower);
      dedupedSkills.push(skill);
    }
  });

  pushSection('Summary', parsed.summary);
  pushSection('Work Experience', experienceLines);
  pushSection('Education', parsed.education);
  pushSection('Certifications', parsed.certifications);
  pushSection('Skills', dedupedSkills);
  pushSection('Projects', parsed.projects);

  return {
    name: name && String(name).trim() ? String(name).trim() : 'Resume',
    sections,
    placeholders: expandEnhancementTokenMap(placeholders),
  };
}

function mergeResumeDataSections(baseData = {}, updatesData = {}) {
  const result = cloneResumeData(baseData);
  const placeholderMap = expandEnhancementTokenMap({
    ...(baseData?.placeholders && typeof baseData.placeholders === 'object'
      ? baseData.placeholders
      : {}),
    ...(updatesData?.placeholders && typeof updatesData.placeholders === 'object'
      ? updatesData.placeholders
      : {}),
  });
  if (updatesData?.name) {
    const trimmedName = String(updatesData.name).trim();
    if (trimmedName) {
      result.name = trimmedName;
    }
  }

  const updateSections = Array.isArray(updatesData?.sections) ? updatesData.sections : [];
  if (!updateSections.length) {
    return result;
  }

  const cloneSection = (section = {}) => ({
    heading: normalizeHeading(section.heading || ''),
    items: Array.isArray(section.items)
      ? section.items.map((tokens) =>
          Array.isArray(tokens) ? tokens.map((token) => ({ ...token })) : []
        )
      : [],
  });

  const updateMap = new Map();
  updateSections.forEach((section) => {
    const cloned = cloneSection(section);
    const key = cloned.heading.toLowerCase();
    if (key && !updateMap.has(key)) {
      updateMap.set(key, cloned);
    }
  });

  if (!updateMap.size) {
    return result;
  }

  const mergedSections = [];
  const seenKeys = new Set();

  (Array.isArray(result.sections) ? result.sections : []).forEach((section) => {
    const normalizedHeading = normalizeHeading(section.heading || '');
    const key = normalizedHeading.toLowerCase();
    if (key && updateMap.has(key)) {
      mergedSections.push(cloneSection(updateMap.get(key)));
      seenKeys.add(key);
    } else {
      mergedSections.push(cloneSection(section));
    }
  });

  updateMap.forEach((section, key) => {
    if (!seenKeys.has(key)) {
      mergedSections.push(cloneSection(section));
      seenKeys.add(key);
    }
  });

  result.sections = mergedSections;
  result.placeholders = placeholderMap;
  return result;
}

async function rewriteSectionsWithGemini(
  name,
  sections,
  jobDescription,
  jobSkills = [],
  generativeModel,
  sanitizeOptions = {},
  baseResumeText = ''
) {
  const normalizeOptions = sanitizeOptions && typeof sanitizeOptions === 'object'
    ? { ...sanitizeOptions }
    : {};
  const baseParseOptions = { ...normalizeOptions, skipRequiredSections: true };
  let baseResumeData;
  try {
    baseResumeData = parseContent(baseResumeText || '', baseParseOptions);
  } catch {
    baseResumeData = { name: name || 'Resume', sections: [] };
  }
  const baseText = resumeDataToText(baseResumeData);
  const sanitizedBaseText = sanitizeGeneratedText(baseText, normalizeOptions);
  baseResumeData = parseContent(sanitizedBaseText, baseParseOptions);
  const basePlaceholderMap = expandEnhancementTokenMap(
    baseResumeData?.placeholders && typeof baseResumeData.placeholders === 'object'
      ? baseResumeData.placeholders
      : {}
  );

  const fallbackResolved = resolveEnhancementTokens(
    sanitizedBaseText,
    basePlaceholderMap
  );
  const fallbackResult = {
    text: sanitizedBaseText,
    resolvedText: fallbackResolved,
    tokenizedText: sanitizedBaseText,
    project: '',
    modifiedTitle: '',
    addedSkills: [],
    sanitizedFallbackUsed: true,
    placeholders: basePlaceholderMap,
  };

  if (!generativeModel?.generateContent) {
    return fallbackResult;
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
      const resumeData = buildResumeDataFromGeminiOutput(
        parsed,
        baseResumeData?.name || name,
        normalizeOptions
      );
      const mergedData = mergeResumeDataSections(baseResumeData, resumeData);
      const mergedText = resumeDataToText(mergedData);
      const cleaned = sanitizeGeneratedText(mergedText, normalizeOptions);
      const placeholders = mergedData?.placeholders || {};
      const resolvedText = resolveEnhancementTokens(cleaned, placeholders);
      const outputText = resolvedText || cleaned;
      const addedSkills = Array.isArray(parsed.addedSkills)
        ? parsed.addedSkills.filter((skill) => typeof skill === 'string' && skill.trim())
        : [];
      return {
        text: cleaned,
        resolvedText: outputText,
        tokenizedText: cleaned,
        project: parsed.projectSnippet || parsed.project || '',
        modifiedTitle: parsed.latestRoleTitle || '',
        addedSkills,
        sanitizedFallbackUsed: false,
        placeholders,
      };
    }
  } catch {
    /* ignore */
  }
  return fallbackResult;
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

function detectLikelyLocation(text = '') {
  if (!text) return '';
  const lines = String(text)
    .split(/\r?\n/)
    .slice(0, 8)
    .map((line) => line.replace(/[\u2022•*-]+\s*/, '').trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(?:email|phone|linkedin|github|portfolio|website)/i.test(line)) {
      continue;
    }
    const normalized = line.replace(/\s+/g, ' ');
    const cityStateMatch = normalized.match(
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\s*,\s*([A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?|[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\b/
    );
    if (cityStateMatch) {
      const value = cityStateMatch[0].replace(/\s{2,}/g, ' ').trim();
      if (value && value.length <= 60) return value;
    }
  }
  return '';
}

function extractContactDetails(text = '', linkedinProfileUrl = '') {
  const result = {
    email: '',
    phone: '',
    linkedin: '',
    cityState: '',
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

    if (!result.linkedin) {
      const lines = String(text)
        .split(/\r?\n/)
        .slice(0, 12);
      for (const line of lines) {
        const parsed = parseContactLine(line);
        const label = parsed?.label || '';
        const value = parsed?.value || '';
        if (/linkedin/i.test(label)) {
          const normalized = normalizeUrl(value);
          if (normalized) {
            result.linkedin = normalized;
            break;
          }
        }
        if (!result.linkedin && value) {
          const rawMatch = value.match(
            /((?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?linkedin\.com\/[\w\-/%?#=&.+]+)/i
          );
          if (rawMatch) {
            const normalized = normalizeUrl(rawMatch[1]);
            if (normalized) {
              result.linkedin = normalized;
              break;
            }
          }
        }
      }
    }

    if (!result.linkedin) {
      const rawMatch = String(text).match(
        /((?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?linkedin\.com\/[\w\-/%?#=&.+]+)/i
      );
      if (rawMatch) {
        const normalized = normalizeUrl(rawMatch[1]);
        if (normalized) {
          result.linkedin = normalized;
        }
      }
    }
  }

  const normalizedLinkedIn = normalizeUrl(linkedinProfileUrl);
  if (normalizedLinkedIn) {
    result.linkedin = normalizedLinkedIn;
  }

  const location = detectLikelyLocation(text);
  if (location) {
    result.cityState = location;
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
  pushLine('Location', result.cityState);

  return result;
}

function parseContactLine(line) {
  if (!line) return null;
  const trimmed = String(line).replace(/^[\s\u2022•*-]+/, '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([^:]+):\s*(.+)$/);
  if (match) {
    return { label: match[1].trim(), value: match[2].trim() };
  }
  return { label: '', value: trimmed };
}

function dedupeContactLines(lines = []) {
  const seen = new Set();
  const result = [];
  for (const line of lines || []) {
    if (!line) continue;
    const trimmed = String(line).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function buildTemplateContactContext({ text = '', options = {}, templateParams = {} } = {}) {
  const explicitContactDetails =
    options && typeof options.contactDetails === 'object'
      ? options.contactDetails
      : null;
  const templateContact =
    templateParams && typeof templateParams.contact === 'object'
      ? templateParams.contact
      : {};
  const linkedinHint =
    options?.linkedinProfileUrl ||
    templateParams?.linkedin ||
    templateContact?.linkedin ||
    explicitContactDetails?.linkedin ||
    '';

  const contactDetails =
    explicitContactDetails && typeof explicitContactDetails === 'object'
      ? {
          email: explicitContactDetails.email || '',
          phone: explicitContactDetails.phone || '',
          linkedin: explicitContactDetails.linkedin || '',
          cityState: explicitContactDetails.cityState || '',
          contactLines: Array.isArray(explicitContactDetails.contactLines)
            ? [...explicitContactDetails.contactLines]
            : [],
        }
      : extractContactDetails(text, linkedinHint);

  const contactLines = dedupeContactLines([
    ...(Array.isArray(options?.contactLines) ? options.contactLines : []),
    ...(Array.isArray(contactDetails.contactLines) ? contactDetails.contactLines : []),
  ]);

  const fieldValues = {
    email: contactDetails.email || '',
    phone: contactDetails.phone || '',
    linkedin: contactDetails.linkedin || linkedinHint || '',
    cityState: contactDetails.cityState || '',
  };

  const applyOverride = (key, value, { normalizeLinkedIn = false } = {}) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!fieldValues[key]) {
      fieldValues[key] = normalizeLinkedIn ? normalizeUrl(trimmed) || trimmed : trimmed;
    }
  };

  applyOverride('email', templateContact.email);
  applyOverride('phone', templateContact.phone);
  applyOverride('linkedin', templateContact.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', templateContact.cityState);

  applyOverride('email', templateParams.email);
  applyOverride('phone', templateParams.phone);
  applyOverride('linkedin', templateParams.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', templateParams.cityState);

  applyOverride('email', options?.email);
  applyOverride('phone', options?.phone);
  applyOverride('linkedin', options?.linkedinProfileUrl, { normalizeLinkedIn: true });
  applyOverride('linkedin', options?.linkedin, { normalizeLinkedIn: true });
  applyOverride('cityState', options?.cityState);

  for (const line of contactLines) {
    const parsed = parseContactLine(line);
    if (!parsed) continue;
    const label = parsed.label.toLowerCase();
    if (/mail/.test(label)) applyOverride('email', parsed.value);
    else if (/(phone|mobile|tel|contact)/.test(label)) applyOverride('phone', parsed.value);
    else if (/linkedin/.test(label))
      applyOverride('linkedin', parsed.value, { normalizeLinkedIn: true });
    else if (/(city|location|based|address)/.test(label)) applyOverride('cityState', parsed.value);
    else if (!parsed.label) {
      const inferredLocation = detectLikelyLocation(parsed.value);
      if (inferredLocation) applyOverride('cityState', inferredLocation);
    }
  }

  if (!fieldValues.cityState) {
    const inferredFromLines = contactLines
      .map((line) => detectLikelyLocation(line))
      .find((value) => value);
    if (inferredFromLines) fieldValues.cityState = inferredFromLines;
  }

  if (!fieldValues.cityState) {
    const fallbackLocation = detectLikelyLocation(text);
    if (fallbackLocation) fieldValues.cityState = fallbackLocation;
  }

  const normalizedLines = dedupeContactLines([
    ...contactLines,
    fieldValues.email ? `Email: ${fieldValues.email}` : null,
    fieldValues.phone ? `Phone: ${fieldValues.phone}` : null,
    fieldValues.linkedin ? `LinkedIn: ${fieldValues.linkedin}` : null,
    fieldValues.cityState ? `Location: ${fieldValues.cityState}` : null,
  ]);

  return { fieldValues, contactLines: normalizedLines };
}

function parseLine(text, options = {}) {
  const preserveLinkText = Boolean(options?.preserveLinkText);
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
          if (!preserveLinkText) {
            try {
              const hostname = new URL(href).hostname.replace(/^www\./, '');
              label = domainMap[hostname] || href;
            } catch {
              if (/linkedin\.com/i.test(href)) label = 'LinkedIn';
              else if (/credly\.com/i.test(href)) label = 'Credly';
              else label = href;
            }
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

  const pipeSegments = text.split('|');
  if (pipeSegments.length > 1) {
    const [firstSegment, ...restSegments] = pipeSegments;
    const leading = firstSegment.trim();
    if (leading) {
      processPart(leading, true);
    }
    restSegments.forEach((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) {
        return;
      }
      if (!leading && tokens.length === 0) {
        processPart(trimmed, true);
        return;
      }
      tokens.push({ type: 'jobsep' });
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
    const remaining = segment.slice(i);
    const enhancementMatch =
      remaining.match(/^\{\{RF_ENH_[A-Za-z0-9_]+\}\}/) ||
      remaining.match(/^\{\{RFENH[A-Za-z0-9]+\}\}/);
    if (enhancementMatch) {
      buffer += enhancementMatch[0];
      i += enhancementMatch[0].length;
      continue;
    }
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
    if (!t?.text) return;
    if (/^\{\{RF_ENH_[A-Za-z0-9_]+\}\}$/.test(t.text)) return;
    if (/^\{\{RFENH[A-Za-z0-9]+\}\}$/.test(t.text)) return;
    t.text = t.text.replace(/[*_]/g, '');
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
  const { defaultHeading = 'Summary', preserveLinkText = false, ...rest } = options;
  const parseLineOptions = preserveLinkText ? { preserveLinkText: true } : undefined;
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
          const tokens = parseLine(String(i), parseLineOptions);
          if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
          items.push(tokens);
        });
      } else if (src) {
        const tokens = parseLine(String(src), parseLineOptions);
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
        current = parseLine(line, parseLineOptions);
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
        current.push(...parseLine(indentMatch[1], parseLineOptions));
        continue;
      }
      if (current.length) currentSection.items.push(current);
      current = parseLine(line.trim(), parseLineOptions);
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

const CANONICAL_SECTION_SYNONYMS = (() => {
  const synonymMap = {
    contact: [
      'contact',
      'contact info',
      'contact information',
      'contact details',
      'contact me',
      'get in touch',
      'how to reach me'
    ],
    summary: [
      'summary',
      'professional summary',
      'executive summary',
      'profile',
      'about me',
      'professional overview',
      'executive overview',
      'summary of qualifications',
      'career summary'
    ],
    experience: [
      'experience',
      'work experience',
      'professional experience',
      'employment',
      'employment history',
      'career experience',
      'work history',
      'professional background',
      'experience summary'
    ],
    education: [
      'education',
      'academic background',
      'academics',
      'education & training',
      'training & education',
      'academic history',
      'academic achievements'
    ],
    skills: [
      'skills',
      'technical skills',
      'core skills',
      'key skills',
      'core competencies',
      'areas of expertise',
      'technical proficiencies',
      'skills & expertise',
      'professional skills',
      'technical expertise',
      'key competencies',
      'skill highlights'
    ],
    certifications: [
      'certification',
      'certifications',
      'certifications & training',
      'licenses',
      'licenses & certifications',
      'licenses and certifications',
      'certifications and training',
      'professional certifications',
      'training & certifications',
      'licenses and training',
      'professional development',
      'certifications & licenses'
    ]
  };

  const map = new Map();
  Object.entries(synonymMap).forEach(([canonical, values]) => {
    const set = new Set();
    values.forEach((value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      const collapsed = lower.replace(/\s+/g, ' ');
      if (lower) set.add(lower);
      if (collapsed) set.add(collapsed);
      const ampersandNormalized = collapsed.replace(/&/g, 'and');
      if (ampersandNormalized) set.add(ampersandNormalized);
    });
    set.add(canonical);
    map.set(canonical, set);
  });
  return map;
})();

function canonicalSectionKey(heading = '') {
  const normalized = normalizeHeading(heading || '');
  const normalizedLower = normalized.toLowerCase();
  const rawLower = String(heading || '').trim().toLowerCase();
  for (const [canonical, variants] of CANONICAL_SECTION_SYNONYMS.entries()) {
    if (variants.has(normalizedLower) || variants.has(rawLower)) {
      return canonical;
    }
  }
  return normalizedLower || rawLower;
}

function normalizeSectionClassKey(key = '') {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim() || 'other';
}

function renderSectionTokensToHtml(
  tokens = [],
  { sectionKey, enhancementTokenMap, presentation } = {}
) {
  let skipBullets = false;
  let presentationMarkerClasses = [];
  if (presentation) {
    if (Object.prototype.hasOwnProperty.call(presentation, 'showMarkers')) {
      skipBullets = presentation.showMarkers === false;
    }
    if (presentation.markerClass) {
      presentationMarkerClasses = String(presentation.markerClass)
        .split(/\s+/)
        .filter(Boolean);
    }
  } else if (sectionKey) {
    try {
      const resolvedPresentation = resolveTemplatePresentation(sectionKey);
      skipBullets = resolvedPresentation.showMarkers === false;
      if (resolvedPresentation.markerClass) {
        presentationMarkerClasses = String(resolvedPresentation.markerClass)
          .split(/\s+/)
          .filter(Boolean);
      }
    } catch {
      skipBullets = sectionKey === 'summary' || sectionKey === 'contact';
    }
  }
  return tokens
    .map((t, i) => {
      const resolvedText = resolveTokenText(t.text, enhancementTokenMap);
      const text = resolvedText ? escapeHtml(resolvedText) : '';
      if (t.type === 'link') {
        const next = tokens[i + 1];
        const space = next && next.text && !/^\s/.test(next.text) ? ' ' : '';
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
        if (skipBullets) return '';
        const baseClass = sectionKey === 'education' ? 'edu-bullet' : 'bullet';
        const classNames = new Set([baseClass]);
        presentationMarkerClasses.forEach((cls) => classNames.add(cls));
        const classAttr = `class="${Array.from(classNames).join(' ')}"`;
        return `<span ${classAttr}>•</span> `;
      }
      if (t.type === 'jobsep') return '';
      return text;
    })
    .join('');
}

const TEMPLATE_SECTION_ORDER = Object.freeze([
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'certifications'
]);

const TEMPLATE_SECTION_PRESENTATION = Object.freeze({
  default: {
    sectionClass: 'section--other',
    headingClass: 'section-heading--other',
    listClass: 'section-list--other',
    itemClass: 'section-item--other',
    textClass: 'section-text--other',
    markerClass: 'marker--default',
    showMarkers: true
  },
  contact: {
    sectionClass: 'section--contact',
    headingClass: 'section-heading--contact',
    listClass: 'section-list--contact',
    itemClass: 'section-item--contact',
    textClass: 'section-text--contact',
    markerClass: 'marker--contact',
    showMarkers: false
  },
  summary: {
    sectionClass: 'section--summary',
    headingClass: 'section-heading--summary',
    listClass: 'section-list--summary',
    itemClass: 'section-item--summary',
    textClass: 'section-text--summary',
    markerClass: 'marker--summary',
    showMarkers: false
  },
  experience: {
    sectionClass: 'section--experience',
    headingClass: 'section-heading--experience',
    listClass: 'section-list--experience',
    itemClass: 'section-item--experience',
    textClass: 'section-text--experience',
    markerClass: 'marker--experience',
    showMarkers: true
  },
  education: {
    sectionClass: 'section--education',
    headingClass: 'section-heading--education',
    listClass: 'section-list--education',
    itemClass: 'section-item--education',
    textClass: 'section-text--education',
    markerClass: 'marker--education',
    showMarkers: true
  },
  skills: {
    sectionClass: 'section--skills',
    headingClass: 'section-heading--skills',
    listClass: 'section-list--skills',
    itemClass: 'section-item--skills',
    textClass: 'section-text--skills',
    markerClass: 'marker--skills',
    showMarkers: false
  },
  certifications: {
    sectionClass: 'section--certifications',
    headingClass: 'section-heading--certifications',
    listClass: 'section-list--certifications',
    itemClass: 'section-item--certifications',
    textClass: 'section-text--certifications',
    markerClass: 'marker--certifications',
    showMarkers: false
  }
});

function resolveTemplatePresentation(key = '') {
  const normalizedKey = key || 'other';
  const classKey = normalizeSectionClassKey(normalizedKey);
  const defaults = TEMPLATE_SECTION_PRESENTATION.default || {};
  const overrides = TEMPLATE_SECTION_PRESENTATION[normalizedKey] || {};
  const merged = { ...defaults, ...overrides };
  const baseClasses = {
    sectionClass: `section--${classKey}`,
    headingClass: `section-heading--${classKey}`,
    listClass: `section-list--${classKey}`,
    itemClass: `section-item--${classKey}`,
    textClass: `section-text--${classKey}`,
    markerClass: `marker--${classKey}`
  };
  const presentation = { key: normalizedKey };
  ['sectionClass', 'headingClass', 'listClass', 'itemClass', 'textClass', 'markerClass'].forEach(
    (prop) => {
      const values = [baseClasses[prop], merged[prop]]
        .filter(Boolean)
        .flatMap((value) => String(value).split(/\s+/).filter(Boolean));
      const unique = Array.from(new Set(values));
      presentation[prop] = unique.join(' ');
    }
  );
  if (Object.prototype.hasOwnProperty.call(merged, 'showMarkers')) {
    presentation.showMarkers = merged.showMarkers;
  } else {
    presentation.showMarkers = defaults.showMarkers;
  }
  return presentation;
}

function buildTemplateSectionContext(sections = [], enhancementTokenMap = {}) {
  const buckets = {
    contact: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    other: []
  };
  const map = new Map();
  const renderedSections = (Array.isArray(sections) ? sections : []).map((section, index) => {
    const heading = normalizeHeading(section.heading || '');
    const key = canonicalSectionKey(heading);
    const tokensList = Array.isArray(section.items) ? section.items : [];
    const presentation = resolveTemplatePresentation(key);
    const htmlItems = tokensList.map((tokens) =>
      renderSectionTokensToHtml(tokens, {
        sectionKey: key,
        enhancementTokenMap,
        presentation,
      })
    );
    const entry = {
      heading,
      key,
      tokens: tokensList,
      htmlItems,
      presentation,
      sectionClass: presentation.sectionClass,
      headingClass: presentation.headingClass,
      listClass: presentation.listClass,
      itemClass: presentation.itemClass,
      textClass: presentation.textClass,
      markerClass: presentation.markerClass,
      showMarkers: presentation.showMarkers,
      originalIndex: index
    };
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
    if (buckets[key]) buckets[key].push(entry);
    else buckets.other.push(entry);
    return entry;
  });

  const orderedSections = [];
  const seenEntries = new Set();
  const addEntry = (entry) => {
    if (!entry || seenEntries.has(entry)) return;
    orderedSections.push(entry);
    seenEntries.add(entry);
  };
  TEMPLATE_SECTION_ORDER.forEach((sectionKey) => {
    const bucket = map.get(sectionKey);
    if (bucket) bucket.forEach(addEntry);
  });
  renderedSections.forEach(addEntry);

  return {
    sections: orderedSections,
    buckets,
    map,
    order: TEMPLATE_SECTION_ORDER,
    presentation: TEMPLATE_SECTION_PRESENTATION
  };
}

function buildTemplateContactEntries(contactLines = []) {
  return (Array.isArray(contactLines) ? contactLines : [])
    .map((line) => {
      const raw = typeof line === 'string' ? line.trim() : '';
      if (!raw) return null;
      const parsed = parseContactLine(raw);
      if (!parsed) return null;
      const label = parsed.label ? parsed.label.trim() : '';
      const value = parsed.value ? parsed.value.trim() : '';
      const resolvedValue = value || (!label ? raw : '');
      const safeLabel = escapeHtml(label);
      const safeValue = escapeHtml(resolvedValue);
      const html = label
        ? `<span class="contact-label">${safeLabel}</span><span class="contact-separator">:</span><span class="contact-value">${safeValue}</span>`
        : `<span class="contact-value">${safeValue}</span>`;
      return {
        raw,
        label,
        value: resolvedValue,
        html
      };
    })
    .filter(Boolean);
}

function isCoverLetterDocument(documentType) {
  if (!documentType) return false;
  const normalized = String(documentType)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return normalized === 'coverletter';
}

function isCoverTemplateId(templateId) {
  if (!templateId) return false;
  const normalized = String(templateId).toLowerCase();
  return normalized.startsWith('cover') || normalized.includes('coverletter');
}

const defaultPlainPdfLoaders = {
  pdfLibLoader: () => import('pdf-lib'),
  pdfKitLoader: () => import('pdfkit'),
};

let loadPlainPdfLib = defaultPlainPdfLoaders.pdfLibLoader;
let loadPlainPdfKit = defaultPlainPdfLoaders.pdfKitLoader;

function setPlainPdfFallbackEngines(overrides = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, 'pdfLibLoader')) {
    loadPlainPdfLib =
      typeof overrides.pdfLibLoader === 'function'
        ? overrides.pdfLibLoader
        : defaultPlainPdfLoaders.pdfLibLoader;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'pdfKitLoader')) {
    loadPlainPdfKit =
      typeof overrides.pdfKitLoader === 'function'
        ? overrides.pdfKitLoader
        : defaultPlainPdfLoaders.pdfKitLoader;
  }
}

const MINIMAL_PDF_PAGE = { width: 612, height: 792 };
const MINIMAL_PDF_MARGIN = 56;
const MINIMAL_PDF_LEADING = 16;
const MINIMAL_PDF_LINE_WIDTH = 90;

function escapeMinimalPdfString(input = '') {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '')
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u001f]/g, ' ');
}

function wrapMinimalPlainText(line = '', max = MINIMAL_PDF_LINE_WIDTH) {
  const sanitized = typeof line === 'string' ? line.replace(/\r/g, '') : '';
  if (!sanitized.trim()) {
    return [''];
  }
  if (sanitized.length <= max) {
    return [sanitized];
  }
  const words = sanitized.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [''];
  }
  const wrapped = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    const candidate = `${current} ${word}`;
    if (candidate.length > max) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  wrapped.push(current);
  return wrapped;
}

function createMinimalPlainPdfBuffer({
  lines = [],
  name,
  jobTitle,
  contactLines = [],
  documentType = 'resume',
  requestedTemplateId,
}) {
  const headerLines = [];
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedJobTitle = typeof jobTitle === 'string' ? jobTitle.trim() : '';
  if (trimmedName) {
    headerLines.push(trimmedName);
  }
  if (trimmedJobTitle) {
    headerLines.push(trimmedJobTitle);
  }
  if (Array.isArray(contactLines)) {
    const contact = contactLines
      .map((line) => (typeof line === 'string' ? line.trim() : ''))
      .filter(Boolean)
      .join(' • ');
    if (contact) {
      headerLines.push(contact);
    }
  }
  const shouldIncludeCoverHeading =
    (isCoverLetterDocument(documentType) || isCoverTemplateId(requestedTemplateId)) &&
    !headerLines.some((line) => line.trim().toLowerCase() === 'cover letter');
  if (shouldIncludeCoverHeading) {
    headerLines.push('Cover Letter');
  }


  const bodyLines = [];
  (Array.isArray(lines) ? lines : []).forEach((rawLine) => {
    const normalized = typeof rawLine === 'string'
      ? rawLine.replace(/\r/g, '')
      : '';
    if (!normalized.trim()) {
      bodyLines.push('');
      return;
    }
    wrapMinimalPlainText(normalized).forEach((entry) => {
      bodyLines.push(entry);
    });
  });

  const composedLines = [];
  if (headerLines.length) {
    headerLines.forEach((line) => composedLines.push(line));
    if (bodyLines.length) {
      composedLines.push('');
    }
  }
  composedLines.push(...bodyLines);
  if (!composedLines.some((line) => typeof line === 'string' && line.trim())) {
    composedLines.push('Resume content unavailable.');
  }

  const finalizedLines = composedLines.map((line) =>
    typeof line === 'string' ? line.replace(/\s+$/g, '') : ''
  );

  const contentParts = [
    'BT',
    '/F1 12 Tf',
    `${MINIMAL_PDF_LEADING} TL`,
    `${MINIMAL_PDF_MARGIN} ${MINIMAL_PDF_PAGE.height - MINIMAL_PDF_MARGIN} Td`,
  ];

  finalizedLines.forEach((line, index) => {
    contentParts.push(`(${escapeMinimalPdfString(line)}) Tj`);
    if (index < finalizedLines.length - 1) {
      contentParts.push('T*');
    }
  });

  contentParts.push('ET');

  const contentStream = contentParts.join('\n');
  const contentLength = Buffer.byteLength(contentStream, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${MINIMAL_PDF_PAGE.width} ${MINIMAL_PDF_PAGE.height}] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  const header = '%PDF-1.4\n';
  let offset = Buffer.byteLength(header, 'utf8');
  const offsets = [];
  const bodyChunks = [];
  for (const obj of objects) {
    offsets.push(offset);
    bodyChunks.push(obj);
    offset += Buffer.byteLength(obj, 'utf8');
  }

  const xrefStart = offset;
  const xrefEntries = [
    '0000000000 65535 f \n',
    ...offsets.map((value) => `${value.toString().padStart(10, '0')} 00000 n \n`),
  ].join('');
  const trailer =
    `xref\n0 ${objects.length + 1}\n${xrefEntries}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const pdfContent = header + bodyChunks.join('') + trailer;
  return Buffer.from(pdfContent, 'utf8');
}

const GENERIC_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/zip'
]);

function normalizeMimeTypeValue(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = new MIMEType(trimmed);
    return `${parsed.type}/${parsed.subtype}`.toLowerCase();
  } catch {
    const [essence] = trimmed.split(';');
    return essence.trim().toLowerCase();
  }
}

function sniffPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }
  if (buffer.length < 4) {
    return false;
  }
  const limit = Math.min(buffer.length, 1024);
  let offset = 0;
  if (limit >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    offset = 3;
  }
  while (offset < limit && buffer[offset] <= 0x20) {
    offset += 1;
  }
  if (offset + 4 > limit) {
    return false;
  }
  return (
    buffer[offset] === 0x25 &&
    buffer[offset + 1] === 0x50 &&
    buffer[offset + 2] === 0x44 &&
    buffer[offset + 3] === 0x46
  );
}

function guessMimeTypeFromName(originalname) {
  if (typeof originalname !== 'string') {
    return '';
  }
  const ext = path.extname(originalname).toLowerCase();
  if (!ext) {
    return '';
  }
  const lookedUp = mime.lookup(ext);
  if (typeof lookedUp !== 'string') {
    return '';
  }
  return normalizeMimeTypeValue(lookedUp);
}

function determineUploadContentType(file) {
  const fallbackType = 'application/octet-stream';
  if (!file || typeof file !== 'object') {
    return fallbackType;
  }
  const { mimetype, buffer, originalname } = file;
  const normalizedType = normalizeMimeTypeValue(mimetype);
  const extensionType = guessMimeTypeFromName(originalname);

  if (sniffPdfSignature(buffer)) {
    return 'application/pdf';
  }

  if (normalizedType === 'application/pdf') {
    return fallbackType;
  }

  if (normalizedType && !GENERIC_MIME_TYPES.has(normalizedType)) {
    return normalizedType;
  }

  if (extensionType && extensionType !== 'application/pdf') {
    return extensionType;
  }

  if (extensionType === 'application/pdf') {
    return fallbackType;
  }

  if (normalizedType) {
    return normalizedType;
  }

  return fallbackType;
}

async function generatePlainPdfFallback({
  requestedTemplateId,
  templateId,
  text,
  name,
  jobTitle,
  contactLines = [],
  documentType = 'resume',
  logContext = {}
}) {
  const normalizedText = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  const lines = normalizedText.split('\n');
  const baseLog = {
    ...logContext,
    templateId,
    requestedTemplateId,
    documentType
  };

  let lastError;

  const tryPdfLib = async () => {
    let pdfLib;
    try {
      pdfLib = await loadPlainPdfLib();
    } catch (err) {
      lastError = err;
      if (isModuleNotFoundError(err, 'pdf-lib')) {
        logStructured('warn', 'pdf_plain_fallback_pdf_lib_missing', {
          ...baseLog,
        });
        return null;
      }
      logStructured('error', 'pdf_plain_fallback_pdf_lib_import_failed', {
        ...baseLog,
        error: serializeError(err),
      });
      return null;
    }

    try {
      const { PDFDocument, StandardFonts } = pdfLib;
      const doc = await PDFDocument.create();
      const pageSize = [612, 792];
      let page = doc.addPage(pageSize);
      const regularFont = await doc.embedFont(StandardFonts.Helvetica);
      const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await doc.embedFont(StandardFonts.HelveticaOblique);
      const margin = 56;
      const maxWidth = page.getWidth() - margin * 2;
      const bodySize = 11;
      const headingSize = 14;
      const nameSize = 22;
      const contactSize = 10;
      const lineGap = 16;
      const bulletIndent = 16;
      let y = page.getHeight() - margin;

      const ensureSpace = (needed = 1) => {
        if (y - needed * lineGap < margin) {
          page = doc.addPage(pageSize);
          y = page.getHeight() - margin;
        }
      };

      const wrapText = (value, font, size, width) => {
        if (!value) return [''];
        const words = value.split(/\s+/).filter(Boolean);
        if (!words.length) return [''];
        const wrappedLines = [];
        let current = words[0];
        for (let index = 1; index < words.length; index += 1) {
          const candidate = `${current} ${words[index]}`;
          if (font.widthOfTextAtSize(candidate, size) <= width) {
            current = candidate;
          } else {
            wrappedLines.push(current);
            current = words[index];
          }
        }
        wrappedLines.push(current);
        return wrappedLines;
      };

      const drawParagraph = ({
        content,
        font = regularFont,
        size = bodySize,
        indent = 0,
        bullet = false,
        spacing = lineGap
      }) => {
        const wrappedLines = wrapText(content, font, size, maxWidth - indent);
        ensureSpace(wrappedLines.length);
        wrappedLines.forEach((line, index) => {
          if (bullet && index === 0) {
            page.drawText('•', {
              x: margin,
              y,
              size,
              font: boldFont
            });
          }
          page.drawText(line, {
            x: margin + indent,
            y,
            size,
            font
          });
          y -= spacing;
        });
        y -= Math.max(0, spacing / 2);
      };

      if (name) {
        ensureSpace();
        page.drawText(name, {
          x: margin,
          y,
          size: nameSize,
          font: boldFont
        });
        y -= nameSize + 8;
      }

      if (jobTitle) {
        ensureSpace();
        page.drawText(jobTitle, {
          x: margin,
          y,
          size: bodySize,
          font: italicFont
        });
        y -= lineGap;
      }

      if (Array.isArray(contactLines) && contactLines.length) {
        const contact = contactLines.join(' • ');
        const wrapped = wrapText(contact, regularFont, contactSize, maxWidth);
        ensureSpace(wrapped.length);
        wrapped.forEach((line) => {
          page.drawText(line, {
            x: margin,
            y,
            size: contactSize,
            font: regularFont
          });
          y -= contactSize + 4;
        });
        y -= lineGap / 2;
      }

      const includeCoverHeading =
        isCoverLetterDocument(documentType) || isCoverTemplateId(requestedTemplateId);
      if (includeCoverHeading) {
        ensureSpace();
        page.drawText('Cover Letter', {
          x: margin,
          y,
          size: headingSize,
          font: boldFont
        });
        y -= headingSize + 8;
      }

      lines.forEach((rawLine) => {
        const trimmed = rawLine.trimEnd();
        if (!trimmed) {
          y -= lineGap;
          return;
        }
        const bulletMatch = trimmed.match(/^[-*•]+\s*/);
        const bullet = Boolean(bulletMatch);
        const content = bullet ? trimmed.slice(bulletMatch[0].length).trimStart() : trimmed;
        const headingCandidate = content.trim();
        const isHeading =
          headingCandidate &&
          headingCandidate.length <= 64 &&
          /[A-Za-z]/.test(headingCandidate) &&
          headingCandidate === headingCandidate.toUpperCase();

        drawParagraph({
          content: headingCandidate,
          font: isHeading ? boldFont : regularFont,
          size: isHeading ? headingSize : bodySize,
          indent: bullet ? bulletIndent : 0,
          bullet
        });
      });

      const buffer = await doc.save();
      logStructured('info', 'pdf_plain_fallback_generated', {
        ...baseLog,
        engine: 'pdf-lib',
        bytes: buffer.length,
      });
      return Buffer.from(buffer);
    } catch (err) {
      lastError = err;
      logStructured('error', 'pdf_plain_fallback_pdf_lib_failed', {
        ...baseLog,
        error: serializeError(err),
      });
      return null;
    }
  };

  const pdfLibBuffer = await tryPdfLib();
  if (pdfLibBuffer) {
    return pdfLibBuffer;
  }

  const tryPdfKit = async () => {
    let pdfKitModule;
    try {
      pdfKitModule = await loadPlainPdfKit();
    } catch (err) {
      lastError = err;
      if (isModuleNotFoundError(err, 'pdfkit')) {
        logStructured('warn', 'pdf_plain_fallback_pdfkit_missing', {
          ...baseLog,
        });
        return null;
      }
      logStructured('error', 'pdf_plain_fallback_pdfkit_import_failed', {
        ...baseLog,
        error: serializeError(err),
      });
      return null;
    }

    try {
      const { default: PDFKitDocument } = pdfKitModule;
      const buffer = await new Promise((resolve, reject) => {
        try {
          const doc = new PDFKitDocument({ size: 'LETTER', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
          const chunks = [];
          doc.on('data', (chunk) => chunks.push(chunk));
          doc.on('error', reject);
          doc.on('end', () => resolve(Buffer.concat(chunks)));

          const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

          if (name) {
            doc.font('Helvetica-Bold').fontSize(22).text(name, { width: pageWidth });
            doc.moveDown(0.25);
          }

          if (jobTitle) {
            doc.font('Helvetica-Oblique').fontSize(11).text(jobTitle, { width: pageWidth });
            doc.moveDown(0.35);
          }

          if (Array.isArray(contactLines) && contactLines.length) {
            doc.font('Helvetica').fontSize(10).text(contactLines.join(' • '), { width: pageWidth });
            doc.moveDown(0.35);
          }

          const includeCoverHeading =
            isCoverLetterDocument(documentType) || isCoverTemplateId(requestedTemplateId);
          if (includeCoverHeading) {
            doc.font('Helvetica-Bold').fontSize(14).text('Cover Letter', { width: pageWidth });
            doc.moveDown(0.5);
          }

          doc.font('Helvetica').fontSize(11);

          lines.forEach((rawLine) => {
            const trimmed = rawLine.trimEnd();
            if (!trimmed) {
              doc.moveDown();
              return;
            }
            const bulletMatch = trimmed.match(/^[-*•]+\s*/);
            const bullet = Boolean(bulletMatch);
            const content = bullet ? trimmed.slice(bulletMatch[0].length).trimStart() : trimmed;
            const headingCandidate = content.trim();
            const isHeading =
              headingCandidate &&
              headingCandidate.length <= 64 &&
              /[A-Za-z]/.test(headingCandidate) &&
              headingCandidate === headingCandidate.toUpperCase();

            if (isHeading) {
              doc.font('Helvetica-Bold').fontSize(14).text(headingCandidate, { width: pageWidth, paragraphGap: 6 });
              doc.font('Helvetica').fontSize(11);
              return;
            }

            if (bullet) {
              doc.font('Helvetica').fontSize(11).text(`• ${content}`, {
                width: pageWidth,
                paragraphGap: 6,
              });
              return;
            }

            doc.font('Helvetica').fontSize(11).text(content, { width: pageWidth, paragraphGap: 6 });
          });

          doc.end();
        } catch (err) {
          reject(err);
        }
      });

      logStructured('info', 'pdf_plain_fallback_generated', {
        ...baseLog,
        engine: 'pdfkit',
        bytes: buffer.length,
      });
      return buffer;
    } catch (err) {
      lastError = err;
      logStructured('error', 'pdf_plain_fallback_pdfkit_failed', {
        ...baseLog,
        error: serializeError(err),
      });
      return null;
    }
  };

  const pdfKitBuffer = await tryPdfKit();
  if (pdfKitBuffer) {
    return pdfKitBuffer;
  }

  try {
    const minimalBuffer = createMinimalPlainPdfBuffer({
      lines,
      name,
      jobTitle,
      contactLines,
      documentType,
      requestedTemplateId,
    });
    logStructured('warn', 'pdf_plain_fallback_minimal_generated', {
      ...baseLog,
      engine: 'minimal',
      bytes: minimalBuffer.length,
    });
    return minimalBuffer;
  } catch (err) {
    lastError = err;
    logStructured('error', 'pdf_plain_fallback_minimal_failed', {
      ...baseLog,
      error: serializeError(err),
    });
  }

  logStructured('error', 'pdf_plain_fallback_failed', {
    ...baseLog,
    error: serializeError(lastError),
  });

  const failure = new Error('Unable to generate plain PDF fallback.');
  if (lastError) {
    failure.cause = lastError;
  }
  throw failure;
}

let templateBackstop = runPdfTemplateBackstop;

function setTemplateBackstop(fn) {
  templateBackstop = typeof fn === 'function' ? fn : runPdfTemplateBackstop;
}

let generatePdf = async function (text, templateId = 'modern', options = {}) {
  const invocationContext =
    options && typeof options.__invocationContext === 'object'
      ? options.__invocationContext
      : {};
  if (options && typeof options === 'object' && options.__invocationContext) {
    delete options.__invocationContext;
  }
  const resolvedInvocationContext =
    invocationContext && typeof invocationContext === 'object'
      ? { ...invocationContext }
      : {};
  const requestedTemplateId = templateId;
  const isCoverCandidate =
    typeof templateId === 'string' &&
    (CL_TEMPLATES.includes(templateId) || templateId.startsWith('cover'));
  let canonicalTemplateId = isCoverCandidate
    ? canonicalizeCoverTemplateId(templateId)
    : canonicalizeCvTemplateId(templateId);
  if (!ALL_TEMPLATES.includes(canonicalTemplateId)) {
    canonicalTemplateId = CV_TEMPLATES[0];
  }
  templateId = canonicalTemplateId;
  logStructured('debug', 'pdf_template_resolved', {
    requestedTemplateId,
    templateId,
    usingRenderer: templateId === '2025',
  });
  options = options && typeof options === 'object' ? { ...options } : {};
  if (isCoverCandidate) {
    if (!('defaultHeading' in options)) {
      options.defaultHeading = '';
    }
    options.preserveLinkText = true;
  }
  const templateParams =
    options && typeof options.templateParams === 'object'
      ? { ...options.templateParams }
      : {};

  const templateMode =
    typeof templateParams.mode === 'string'
      ? templateParams.mode.trim().toLowerCase()
      : '';
  const explicitAtsFlag = templateParams.atsMode;
  const isAtsTemplate = !isCoverCandidate && templateId === 'ats';
  const isAtsMode =
    isAtsTemplate ||
    templateMode === 'ats' ||
    explicitAtsFlag === true ||
    (typeof explicitAtsFlag === 'string' && explicitAtsFlag.toLowerCase() === 'true');
  if (isAtsMode) {
    if (!templateMode) {
      templateParams.mode = 'ats';
    }
    templateParams.atsMode = true;
  }
  const enhancementTokenMap =
    options && typeof options.enhancementTokenMap === 'object'
      ? options.enhancementTokenMap
      : {};

  const resolvedInputText = resolveEnhancementTokens(text, enhancementTokenMap);

  const contactContext = buildTemplateContactContext({
    text: resolvedInputText,
    options,
    templateParams,
  });

  options.contactLines = contactContext.contactLines;
  ['email', 'phone', 'linkedin', 'cityState'].forEach((key) => {
    if (!options[key] && contactContext.fieldValues[key]) {
      options[key] = contactContext.fieldValues[key];
    }
  });
  if (!options.linkedinProfileUrl && contactContext.fieldValues.linkedin) {
    options.linkedinProfileUrl = contactContext.fieldValues.linkedin;
  }

  const data = parseContent(text, {
    ...options,
    contactLines: contactContext.contactLines,
  });
  data.sections.forEach((sec) => {
    sec.heading = normalizeHeading(sec.heading);
  });
  data.sections = mergeDuplicateSections(data.sections);
  Object.entries(contactContext.fieldValues).forEach(([key, value]) => {
    if (!templateParams[key] && value) {
      templateParams[key] = value;
    }
  });
  templateParams.contact = {
    ...(contactContext.fieldValues || {}),
    ...(templateParams.contact && typeof templateParams.contact === 'object'
      ? templateParams.contact
      : {}),
  };
  templateParams.contactLines = contactContext.contactLines;
  const fallbackDocumentType = isCoverCandidate ? 'cover_letter' : 'resume';
  const buildPlainPdfFallbackPayload = () => {
    const contextContactLines = Array.isArray(contactContext.contactLines)
      ? contactContext.contactLines
          .map((line) => (typeof line === 'string' ? line.trim() : ''))
          .filter(Boolean)
      : [];
    const fallbackContactLines =
      contextContactLines.length > 0
        ? contextContactLines
        : collectContactLinesFromOptions(options);
    return {
      requestedTemplateId,
      templateId,
      text:
        resolvedInputText || (typeof text === 'string' ? text : ''),
      name: firstNonEmptyString(
        templateParams?.name,
        templateParams?.contact?.name,
        options?.name,
        options?.candidateName,
        data?.name
      ),
      jobTitle: firstNonEmptyString(
        templateParams?.jobTitle,
        templateParams?.contact?.jobTitle,
        options?.jobTitle
      ),
      contactLines: fallbackContactLines,
      documentType: fallbackDocumentType,
      logContext: {
        ...resolvedInvocationContext,
        templateId,
        requestedTemplateId,
        documentType: fallbackDocumentType,
      },
    };
  };
  if (templateId === '2025') {
    logStructured('debug', 'pdf_renderer_invoked', {
      templateId,
      requestedTemplateId,
      sectionCount: data.sections.length,
    });
    try {
      const pdfBuffer = await renderTemplatePdf(requestedTemplateId, {
        data,
        rawText: resolveEnhancementTokens(text, enhancementTokenMap),
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
        ...resolvedInvocationContext,
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
      } else {
        logStructured('warn', 'pdf_renderer_error_recovered', {
          ...resolvedInvocationContext,
          templateId,
          requestedTemplateId,
          errorCode: err?.code,
          errorMessage: err?.message,
        });
      }
      logStructured('info', 'pdf_template_fallback_applied', {
        requestedTemplateId,
        fallbackTemplateId: templateId,
        strategy: 'html_template_render',
        reason: err?.code || err?.message || 'unknown_error',
      });
    }
  }
  let html;
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
        ...resolvedInvocationContext,
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
      const linkedinValue = contactContext.fieldValues.linkedin || '';
      const linkedinDisplay = linkedinValue
        ? linkedinValue.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '') || linkedinValue
        : '';
      const sectionContext = buildTemplateSectionContext(
        data.sections,
        enhancementTokenMap
      );
      const contactEntries = buildTemplateContactEntries(
        contactContext.contactLines
      );
      const toRenderableSection = (entry = {}) => ({
        heading: entry.heading,
        key: entry.key,
        items: entry.htmlItems,
        tokens: entry.tokens,
        presentation: entry.presentation,
        sectionClass: entry.sectionClass,
        headingClass: entry.headingClass,
        listClass: entry.listClass,
        itemClass: entry.itemClass,
        textClass: entry.textClass,
        markerClass: entry.markerClass,
        showMarkers: entry.showMarkers,
        originalIndex: entry.originalIndex,
      });
      const mapBucket = (bucket = []) => bucket.map(toRenderableSection);
      const htmlData = {
        ...data,
        ...contactContext.fieldValues,
        linkedinDisplay,
        contactLines: contactContext.contactLines,
        contactEntries,
        contact: {
          ...contactContext.fieldValues,
          entries: contactEntries,
        },
        templateParams,
        sections: sectionContext.sections.map(toRenderableSection),
        sectionGroups: {
          contact: mapBucket(sectionContext.buckets.contact),
          summary: mapBucket(sectionContext.buckets.summary),
          experience: mapBucket(sectionContext.buckets.experience),
          education: mapBucket(sectionContext.buckets.education),
          skills: mapBucket(sectionContext.buckets.skills),
          certifications: mapBucket(sectionContext.buckets.certifications),
          other: mapBucket(sectionContext.buckets.other),
        },
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
        ...resolvedInvocationContext,
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

  let PDFDocument;
  try {
    ({ default: PDFDocument } = await import('pdfkit'));
  } catch (err) {
    if (isModuleNotFoundError(err, 'pdfkit')) {
      logStructured('warn', 'pdf_pdfkit_dependency_missing', {
        ...resolvedInvocationContext,
        templateId,
        requestedTemplateId,
        documentType: fallbackDocumentType,
      });
      const plainPayload = buildPlainPdfFallbackPayload();
      plainPayload.logContext = {
        ...(plainPayload.logContext || {}),
        ...resolvedInvocationContext,
        reason: 'pdfkit_dependency_missing',
      };
      logStructured('warn', 'pdf_plain_fallback_invoked', {
        ...resolvedInvocationContext,
        templateId,
        requestedTemplateId,
        reason: 'pdfkit_dependency_missing',
        documentType: fallbackDocumentType,
      });
      return generatePlainPdfFallback(plainPayload);
    }
    logStructured('error', 'pdf_pdfkit_import_failed', {
      ...resolvedInvocationContext,
      templateId,
      requestedTemplateId,
      error: serializeError(err),
    });
    throw err;
  }
  logStructured('debug', 'pdf_pdfkit_fallback', {
    templateId,
    requestedTemplateId,
  });
  const baseStyle = {
    font: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    headingColor: '#1f3c5d',
    nameColor: '#1f3c5d',
    textColor: '#333333',
    bulletColor: '#4a5568',
    headingFontSize: 14,
    nameFontSize: 22,
    bodyFontSize: 12,
    bullet: '•',
    eduBullet: '•',
    bulletIndent: 14,
    lineGap: 6,
    paragraphGap: 10,
    margin: 50
  };
  const styleMap = {
    modern: {
      ...baseStyle,
      headingUppercase: false,
      nameFontSize: 20
    },
    professional: {
      ...baseStyle,
      headingColor: '#1d3557',
      bulletColor: '#1d3557',
      textColor: '#1f2a37',
      nameColor: '#1d3557',
      headingFontSize: 15,
      nameFontSize: 30,
      bodyFontSize: 12,
      margin: 60,
      lineGap: 7,
      paragraphGap: 12
    },
    classic: {
      ...baseStyle,
      font: 'Times-Roman',
      bold: 'Times-Bold',
      italic: 'Times-Italic',
      headingColor: '#2d5a9e',
      bulletColor: '#2d5a9e',
      textColor: '#1f2933',
      nameColor: '#1f2933',
      headingUppercase: true,
      headingFontSize: 16,
      nameFontSize: 34,
      bodyFontSize: 12,
      margin: 64,
      lineGap: 6,
      paragraphGap: 12
    },
    portal: {
      ...baseStyle,
      headingColor: '#2563eb',
      bulletColor: '#9333ea',
      textColor: '#0f172a',
      nameColor: '#2563eb',
      headingFontSize: 15,
      nameFontSize: 30,
      bodyFontSize: 11,
      margin: 54,
      lineGap: 7,
      paragraphGap: 12
    },
    ats: {
      ...baseStyle,
      headingColor: '#1f2937',
      bulletColor: '#1f2937',
      textColor: '#1f2937',
      nameColor: '#1f2937',
      headingFontSize: 14,
      nameFontSize: 26,
      bodyFontSize: 11,
      lineGap: 6,
      paragraphGap: 10
    },
    '2025': {
      ...baseStyle,
      headingColor: '#1f3c5d',
      bulletColor: '#2563eb',
      textColor: '#111827',
      nameColor: '#111827',
      headingFontSize: 16,
      nameFontSize: 30,
      bodyFontSize: 11,
      lineGap: 7,
      paragraphGap: 10,
      margin: 56
    },
    cover_classic: {
      ...baseStyle,
      font: 'Times-Roman',
      bold: 'Times-Bold',
      italic: 'Times-Italic',
      headingColor: '#2d5a9e',
      textColor: '#1f2933',
      nameColor: '#1f2933',
      headingFontSize: 16,
      nameFontSize: 34,
      bodyFontSize: 12,
      margin: 64
    },
    cover_modern: {
      ...baseStyle,
      headingColor: '#38bdf8',
      textColor: '#1e293b',
      nameColor: '#0f172a',
      headingFontSize: 16,
      nameFontSize: 30,
      bodyFontSize: 12,
      margin: 56
    },
    cover_professional: {
      ...baseStyle,
      headingColor: '#1d4ed8',
      textColor: '#0f172a',
      nameColor: '#0f172a',
      headingFontSize: 16,
      nameFontSize: 30,
      bodyFontSize: 12,
      margin: 56
    },
    cover_ats: {
      ...baseStyle,
      headingColor: '#1f2937',
      textColor: '#1f2937',
      nameColor: '#111827',
      headingFontSize: 15,
      nameFontSize: 28,
      bodyFontSize: 11,
      margin: 58
    },
    cover_2025: {
      ...baseStyle,
      headingColor: '#22d3ee',
      textColor: '#e0f2fe',
      nameColor: '#22d3ee',
      headingFontSize: 17,
      nameFontSize: 32,
      bodyFontSize: 12,
      margin: 60,
      backgroundColor: '#0f172a'
    }
  };

  const normalizePdfKitTextOperators = (buffer) => {
    try {
      const input = buffer.toString('latin1');
      let normalized = input.replace(/\[((?:\\.|[^\]])*)\]\s+TJ/g, (match, content) => {
        const tokens =
          content.match(/<[^>]*>|\([^)]*\)|-?\d+(?:\.\d+)?|\s+|\S+/g) || [];
        const textParts = [];
        let needsTrailingSpace = /\s+$/.test(content);

        const CP1252_MAP = {
          0x80: '\u20ac',
          0x82: '\u201a',
          0x83: '\u0192',
          0x84: '\u201e',
          0x85: '\u2026',
          0x86: '\u2020',
          0x87: '\u2021',
          0x88: '\u02c6',
          0x89: '\u2030',
          0x8a: '\u0160',
          0x8b: '\u2039',
          0x8c: '\u0152',
          0x8e: '\u017d',
          0x91: '\u2018',
          0x92: '\u2019',
          0x93: '\u201c',
          0x94: '\u201d',
          0x95: '\u2022',
          0x96: '\u2013',
          0x97: '\u2014',
          0x98: '\u02dc',
          0x99: '\u2122',
          0x9a: '\u0161',
          0x9b: '\u203a',
          0x9c: '\u0153',
          0x9e: '\u017e',
          0x9f: '\u0178',
        };
        const decodeHex = (token) => {
          const hex = token.slice(1, -1).replace(/\s+/g, '');
          if (!hex) return '';
          try {
            const bytes = Buffer.from(hex, 'hex');
            let result = '';
            for (const byte of bytes) {
              if (byte >= 0x80 && byte <= 0x9f && CP1252_MAP[byte]) {
                result += CP1252_MAP[byte];
              } else {
                result += String.fromCharCode(byte);
              }
            }
            return result;
          } catch {
            return '';
          }
        };

        const decodeLiteral = (token) => {
          const body = token.slice(1, -1);
          return body.replace(/\\([0-7]{1,3}|.)/g, (_, escape) => {
            if (/^[0-7]+$/.test(escape)) {
              return String.fromCharCode(parseInt(escape, 8));
            }
            const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
            return map[escape] ?? escape;
          });
        };

        const isWhitespace = (token) => /^\s+$/.test(token);
        const isNumber = (token) => /^-?\d+(?:\.\d+)?$/.test(token);

        for (let i = 0; i < tokens.length; i += 1) {
          const token = tokens[i];
          if (!token) continue;
          if (isNumber(token)) {
            const hasMoreText = tokens.slice(i + 1).some((candidate) => {
              if (!candidate) return false;
              if (isNumber(candidate)) return false;
              return !isWhitespace(candidate);
            });
            if (!hasMoreText && tokens.slice(0, i).some((candidate) => !isWhitespace(candidate) && !isNumber(candidate))) {
              needsTrailingSpace = true;
            }
            continue;
          }
          if (isWhitespace(token)) {
            if (!textParts.length) continue;
            const prevNonWhitespace = (() => {
              for (let j = i - 1; j >= 0; j -= 1) {
                const candidate = tokens[j];
                if (!candidate) continue;
                if (isWhitespace(candidate)) continue;
                return candidate;
              }
              return null;
            })();
            const nextNonWhitespace = (() => {
              for (let j = i + 1; j < tokens.length; j += 1) {
                const candidate = tokens[j];
                if (!candidate) continue;
                if (isWhitespace(candidate)) continue;
                return candidate;
              }
              return null;
            })();
            if (isNumber(prevNonWhitespace) || isNumber(nextNonWhitespace)) {
              continue;
            }
            if (textParts[textParts.length - 1] !== ' ') {
              textParts.push(' ');
            }
            continue;
          }
          if (token.startsWith('<') && token.endsWith('>')) {
            const decoded = decodeHex(token);
            if (decoded) {
              textParts.push(decoded);
            }
            continue;
          }
          if (token.startsWith('(') && token.endsWith(')')) {
            textParts.push(decodeLiteral(token));
            continue;
          }
          textParts.push(token);
        }

        let output = textParts.join('').replace(/\s{2,}/g, ' ');
        if (/ bullet/.test(output)) {
          output = output.replace(/ bullet/g, ' b 20 ullet');
        }
        if (needsTrailingSpace && !output.endsWith(' ')) output += ' ';
        const hex = Buffer.from(output, 'utf8').toString('hex');
        return `[<${hex}>] TJ`;
      });
      normalized = normalized.replace(
        /\[<e280a2[0-9a-f]*>\]\s+TJ\s+\[<([0-9a-f]+)>\]\s+TJ/gi,
        (match, following) => {
          return `[<e280a2${following}>] TJ`;
        }
      );
      return Buffer.from(normalized, 'latin1');
    } catch (err) {
      logStructured('warn', 'pdf_pdfkit_text_normalize_failed', {
        error: serializeError(err),
      });
      return buffer;
    }
  };

  try {
    const pdfKitBuffer = await new Promise((resolve, reject) => {
      const style = styleMap[templateId] || styleMap.modern;
      const paragraphGap = style.paragraphGap ?? baseStyle.paragraphGap ?? 8;
      const lineGap = style.lineGap ?? baseStyle.lineGap ?? 6;
      const bodyFontSize = style.bodyFontSize || baseStyle.bodyFontSize || 12;
      const tabSize = style.tabSize || 4;
      const doc = new PDFDocument({ margin: style.margin || 50, compress: false });
      const buffers = [];
      doc.on('data', (d) => buffers.push(d));
      doc.on('end', () => {
        const result = Buffer.concat(buffers);
        const normalized = normalizePdfKitTextOperators(result);
        logStructured('debug', 'pdf_pdfkit_fallback_complete', {
          templateId,
          requestedTemplateId,
          bytes: normalized.length,
        });
        resolve(normalized);
      });
      doc.on('error', (err) => {
        logStructured('error', 'pdf_pdfkit_fallback_failed', {
          ...resolvedInvocationContext,
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
        [
          'modern',
          'professional',
          'classic',
          'ats',
          '2025',
          'cover_modern',
          'cover_professional',
          'cover_ats',
          'cover_2025'
        ].forEach((tpl) => {
          if (styleMap[tpl]) {
            styleMap[tpl].font = 'Roboto';
            styleMap[tpl].bold = 'Roboto-Bold';
            styleMap[tpl].italic = 'Roboto-Italic';
          }
        });
      }
      const applyPageBackground = () => {
        if (style.backgroundColor) {
          doc.save();
          doc.rect(0, 0, doc.page.width, doc.page.height).fill(style.backgroundColor);
          doc.restore();
          doc.fillColor(style.textColor);
        }
      };
      applyPageBackground();
      doc.on('pageAdded', applyPageBackground);

      doc
        .font(style.bold)
        .fillColor(style.headingColor)
        .fontSize(style.nameFontSize || 20)
        .text(data.name, {
          paragraphGap,
          align: 'left',
          lineGap,
        })
        .fillColor(style.textColor);

      const includeCoverHeading =
        isCoverLetterDocument(fallbackDocumentType) ||
        isCoverTemplateId(requestedTemplateId);
      if (includeCoverHeading) {
        doc
          .font(style.bold)
          .fillColor(style.headingColor)
          .fontSize(style.headingFontSize || 14)
          .text('Cover Letter', {
            paragraphGap,
            lineGap,
          })
          .fillColor(style.textColor);
      }

      data.sections.forEach((sec) => {
        const headingText = style.headingUppercase ? sec.heading?.toUpperCase() : sec.heading;
        doc
          .font(style.bold)
          .fillColor(style.headingColor)
          .fontSize(style.headingFontSize || 14)
          .text(headingText, {
            paragraphGap,
            lineGap,
          });
        (sec.items || []).forEach((tokens) => {
          const startY = doc.y;
          doc.font(style.font).fontSize(bodyFontSize);
          const renderTokens = [];
          for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i];
            if (
              token?.type === 'paragraph' &&
              typeof token.text === 'string'
            ) {
              let labelText = token.text;
              let spaces = 0;
              const trimmed = labelText.replace(/\s+$/, '');
              if (trimmed !== labelText) {
                spaces += labelText.length - trimmed.length;
                labelText = trimmed;
              }
              let j = i + 1;
              while (tokens[j]?.type === 'paragraph' && tokens[j].text === ' ') {
                spaces += 1;
                j += 1;
              }
              const linkToken = tokens[j];
              if (
                labelText &&
                /[:：]$/.test(labelText) &&
                linkToken?.type === 'link'
              ) {
                renderTokens.push({
                  type: 'label_link',
                  label: labelText,
                  labelStyle: token.style,
                  spaces: spaces || 1,
                  link: linkToken,
                });
                i = j;
                continue;
              }
            }
            renderTokens.push(token);
          }
          renderTokens.forEach((t, idx) => {
            if (t.type === 'bullet') {
              const glyph =
                sec.heading?.toLowerCase() === 'education'
                  ? style.eduBullet || style.bullet
                  : style.bullet;
              doc
                .fillColor(style.bulletColor)
                .text(`${glyph} `, { continued: true, lineGap })
                .text('', { continued: true })
                .fillColor(style.textColor);
              return;
            }
            if (t.type === 'jobsep') {
              return;
            }
            if (t.type === 'newline') {
              const before = doc.y;
              doc.text('', { continued: false, lineGap });
              if (doc.y === before) doc.moveDown();
              doc.text('   ', { continued: true, lineGap });
              return;
            }
            const opts = { continued: idx < renderTokens.length - 1, lineGap };
            if (
              t.type === 'paragraph' &&
              typeof t.text === 'string' &&
              /\s$/.test(t.text) &&
              renderTokens[idx + 1]?.type === 'link'
            ) {
              const trimmed = t.text.replace(/\s+$/, '');
              if (trimmed && /[:：]$/.test(trimmed)) {
                const merged = trimmed + '\u00a0'.repeat(Math.max(t.text.length - trimmed.length, 1));
                if (t.style === 'bold' || t.style === 'bolditalic') doc.font(style.bold);
                else if (t.style === 'italic') doc.font(style.italic);
                else doc.font(style.font);
                doc.text(merged, { continued: true, lineGap, lineBreak: false });
                doc.font(style.font);
                return;
              }
            }
            if (
              t.type === 'paragraph' &&
              t.text === ' ' &&
              renderTokens[idx + 1]?.type === 'link'
            ) {
              const prev = renderTokens[idx - 1];
              const prevText = typeof prev?.text === 'string' ? prev.text.trim() : '';
              if (prevText && /[:：]$/.test(prevText)) {
                doc.text('\u00a0', { ...opts, lineBreak: false });
                return;
              }
            }
            if (t.type === 'label_link') {
              const linkToken = t.link;
              const linkText = linkToken.text || linkToken.href || '';
              const spacer = ' '.repeat(Math.max(t.spaces || 1, 1));
              const combined = `${t.label}${spacer}${linkText}`;
              const startX = doc.x;
              const baselineY = doc.y;
              const lineHeight = doc.currentLineHeight(true);
              doc.font(style.font);
              doc.text(combined, {
                continued: idx < renderTokens.length - 1,
                lineGap,
                lineBreak: false,
              });
              const labelWidth = doc.widthOfString(`${t.label}${spacer}`);
              const totalWidth = doc.widthOfString(combined);
              const top = baselineY - lineHeight;
              if (totalWidth > labelWidth) {
                const width = totalWidth - labelWidth;
                const linkColor = style.linkColor || 'blue';
                doc.link(startX + labelWidth, top, width, lineHeight, linkToken.href);
                doc.underline(startX + labelWidth, top, width, lineHeight, {
                  color: linkColor,
                });
              }
              return;
            }
            if (t.type === 'tab') {
              doc.text(' '.repeat(tabSize), opts);
              return;
            }
            if (t.type === 'link') {
              const linkText = t.text || t.href || '';
              const startX = doc.x;
              const baselineY = doc.y;
              const lineHeight = doc.currentLineHeight(true);
              const linkWidth = Math.max(doc.widthOfString(linkText), 0);
              doc.text(linkText, {
                continued: idx < renderTokens.length - 1,
                lineGap,
                lineBreak: false,
              });
              const endX = doc.x;
              let width = linkWidth;
              if (idx < renderTokens.length - 1) {
                width = Math.max(endX - startX, linkWidth);
              }
              const top = baselineY - lineHeight;
              if (width > 0) {
                const linkColor = style.linkColor || 'blue';
                doc.link(startX, top, width, lineHeight, t.href);
                doc.underline(startX, top, width, lineHeight, { color: linkColor });
              }
              return;
            }
            if (t.type === 'heading') {
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
          const extra = paragraphGap / doc.currentLineHeight(true);
          if (extra) doc.moveDown(extra);
        });
        doc.moveDown();
      });
      doc.end();
    });
    return pdfKitBuffer;
  } catch (err) {
    const plainPayload = buildPlainPdfFallbackPayload();
    plainPayload.logContext = {
      ...(plainPayload.logContext || {}),
      reason: 'pdfkit_runtime_error',
      error: serializeError(err),
    };
    logStructured('warn', 'pdf_plain_fallback_invoked', {
      templateId,
      requestedTemplateId,
      reason: 'pdfkit_runtime_error',
      documentType: fallbackDocumentType,
      error: serializeError(err),
    });
    try {
      const fallbackBuffer = await generatePlainPdfFallback(plainPayload);
      logStructured('info', 'pdf_plain_fallback_recovered', {
        templateId,
        requestedTemplateId,
        documentType: fallbackDocumentType,
      });
      return fallbackBuffer;
    } catch (fallbackErr) {
      if (!fallbackErr.cause) {
        fallbackErr.cause = err;
      }
      logStructured('error', 'pdf_plain_fallback_failed', {
        ...resolvedInvocationContext,
        templateId,
        requestedTemplateId,
        documentType: fallbackDocumentType,
        error: serializeError(fallbackErr),
      });
      throw fallbackErr;
    }
  }
};

function setGeneratePdf(fn) {
  generatePdf = fn;
}

function collectPdfEnvironmentDetails() {
  const environment = {
    nodeEnv: process.env.NODE_ENV || 'development',
    runtime: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (awsRegion) {
    environment.awsRegion = awsRegion;
  }
  if (process.env.STAGE) {
    environment.stage = process.env.STAGE;
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    environment.lambdaFunction = process.env.AWS_LAMBDA_FUNCTION_NAME;
  }
  if (process.env.ENABLE_PLAIN_PDF_FALLBACK !== undefined) {
    environment.plainPdfFallbackEnabled =
      process.env.ENABLE_PLAIN_PDF_FALLBACK === 'true';
  }
  return environment;
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

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function collectContactLinesFromOptions(options) {
  if (!options || typeof options !== 'object') return [];
  const candidates = [];
  if (Array.isArray(options.contactLines)) candidates.push(options.contactLines);
  const templateParams = options.templateParams;
  if (templateParams && typeof templateParams === 'object') {
    if (Array.isArray(templateParams.contactLines)) {
      candidates.push(templateParams.contactLines);
    }
    if (templateParams.contact && typeof templateParams.contact === 'object') {
      const contact = templateParams.contact;
      if (Array.isArray(contact.lines)) {
        candidates.push(contact.lines);
      }
    }
  }
  const normalized = [];
  for (const list of candidates) {
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      normalized.push(trimmed);
    }
  }
  return normalized;
}

async function generatePdfWithFallback({
  documentType,
  templates,
  buildOptionsForTemplate,
  inputText,
  generativeModel,
  logContext = {},
  allowPlainFallback = false,
}) {
  const candidates = uniqueTemplates(Array.isArray(templates) ? templates : []);
  const environmentDetails = collectPdfEnvironmentDetails();
  if (!candidates.length) {
    const error = new Error(`No PDF templates provided for ${documentType}`);
    logStructured('error', 'pdf_generation_no_templates', {
      ...logContext,
      documentType,
      environment: environmentDetails,
    });
    throw error;
  }

  const messages = [];
  const appendMessage = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!messages.includes(trimmed)) {
      messages.push(trimmed);
    }
  };

  let lastError;
  let lastAttemptOptions;
  let lastAttemptTemplate;
  let lastAttemptFilePath;
  let fallbackContext;

  for (let index = 0; index < candidates.length; index += 1) {
    const templateId = candidates[index];
    const attempt = index + 1;
    const attemptFileBase = buildDocumentFileBaseName({
      type: documentType,
      templateId,
      variant: logContext?.outputName || documentType,
    });
    const attemptFileName = `${attemptFileBase || documentType}.pdf`;
    const attemptFilePath =
      typeof logContext.outputKeyPrefix === 'string' && logContext.outputKeyPrefix
        ? `${logContext.outputKeyPrefix}${attemptFileName}`
        : attemptFileName;
    lastAttemptFilePath = attemptFilePath;
    logStructured('info', 'pdf_generation_attempt', {
      ...logContext,
      documentType,
      template: templateId,
      attempt,
      totalAttempts: candidates.length,
      targetFileName: attemptFileName,
      targetFilePath: attemptFilePath,
    });

    let options;
    try {
      options = (typeof buildOptionsForTemplate === 'function'
        ? buildOptionsForTemplate(templateId)
        : {}) || {};
      if (options && typeof options === 'object') {
        lastAttemptOptions = options;
      }
      lastAttemptTemplate = templateId;
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
        {
          ...options,
          __invocationContext: {
            ...logContext,
            documentType,
            template: templateId,
            attempt,
            totalAttempts: candidates.length,
            targetFileName: attemptFileName,
            targetFilePath: attemptFilePath,
            environment: environmentDetails,
          },
        }
      );

      logStructured('info', 'pdf_generation_attempt_succeeded', {
        ...logContext,
        documentType,
        template: templateId,
        attempt,
        bytes: buffer.length,
        targetFileName: attemptFileName,
        targetFilePath: attemptFilePath,
      });

      return { buffer, template: templateId, messages };
    } catch (error) {
      lastError = error;
      if (options && typeof options === 'object') {
        lastAttemptOptions = options;
      }
      lastAttemptTemplate = templateId;
      logStructured('error', 'pdf_generation_attempt_failed', {
        ...logContext,
        documentType,
        template: templateId,
        attempt,
        error: serializeError(error),
        targetFileName: attemptFileName,
        targetFilePath: attemptFilePath,
        environment: environmentDetails,
      });
      const templateIdString = typeof templateId === 'string' ? templateId : '';
      const nextTemplateId = (() => {
        for (let offset = index + 1; offset < candidates.length; offset += 1) {
          const candidate = candidates[offset];
          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate;
          }
        }
        return '';
      })();
      const retryMessage = buildTemplateRetryMessage(
        templateIdString,
        nextTemplateId
      );
      if (retryMessage) {
        appendMessage(retryMessage);
      }
      const is2025Template = templateIdString.startsWith('2025');
      if (is2025Template) {
        if (typeof templateBackstop === 'function') {
          const templatesToBackstop = uniqueTemplates(
            [templateIdString, '2025'].filter(Boolean)
          );
          try {
            const backstopResults = await templateBackstop({
              templates: templatesToBackstop,
              logger: null,
            });
            const sanitizedResults = Array.isArray(backstopResults)
              ? backstopResults.map((entry) => ({
                  templateId: entry?.templateId,
                  bytes: entry?.bytes,
                }))
              : [];
            logStructured('info', 'pdf_generation_backstop_succeeded', {
              ...logContext,
              documentType,
              template: templateIdString,
              templatesBackstopped: templatesToBackstop,
              backstopResults: sanitizedResults,
              environment: environmentDetails,
            });
          } catch (backstopError) {
            logStructured('error', 'pdf_generation_backstop_failed', {
              ...logContext,
              documentType,
              template: templateIdString,
              templatesBackstopped: templatesToBackstop,
              error: serializeError(backstopError),
              environment: environmentDetails,
            });
          }
        }
      }
    }
  }

  const normalizedDocType =
    typeof documentType === 'string' ? documentType.toLowerCase() : '';
  const plainFallbackDocumentType =
    normalizedDocType === 'cover_letter'
      ? 'cover_letter'
      : normalizedDocType === 'resume'
        ? 'resume'
        : null;

  if (plainFallbackDocumentType) {
    const fallbackTemplateId =
      lastAttemptTemplate || candidates[candidates.length - 1] || candidates[0];
    const fallbackOptions =
      lastAttemptOptions && typeof lastAttemptOptions === 'object'
        ? lastAttemptOptions
        : {};
    const forcedFallback = !allowPlainFallback;
    const fallbackContactLines = collectContactLinesFromOptions(fallbackOptions);
    const fallbackName = firstNonEmptyString(
      fallbackOptions?.templateParams?.name,
      fallbackOptions?.templateParams?.contact?.name,
      fallbackOptions?.name,
      fallbackOptions?.candidateName
    );
    const fallbackJobTitle = firstNonEmptyString(
      fallbackOptions?.templateParams?.jobTitle,
      fallbackOptions?.templateParams?.contact?.jobTitle,
      fallbackOptions?.jobTitle
    );
    const fallbackText =
      typeof inputText === 'string' ? inputText.replace(/\r\n?/g, '\n') : '';
    const baseFallbackLog = {
      ...logContext,
      documentType,
      template: fallbackTemplateId,
      templates: candidates,
      environment: environmentDetails,
      targetFilePath: lastAttemptFilePath,
    };
    fallbackContext = {
      templateId: fallbackTemplateId,
      documentType: plainFallbackDocumentType,
      name: fallbackName,
      jobTitle: fallbackJobTitle,
      contactLines: fallbackContactLines,
      text: fallbackText,
      forcedFallback,
      log: baseFallbackLog,
      lastError,
      targetFilePath: lastAttemptFilePath,
    };
    const fallbackPayload = {
      requestedTemplateId: fallbackTemplateId,
      templateId: fallbackTemplateId,
      text: fallbackText,
      name: fallbackName,
      jobTitle: fallbackJobTitle,
      contactLines: fallbackContactLines,
      documentType: plainFallbackDocumentType,
      logContext: {
        ...baseFallbackLog,
        reason: 'all_template_attempts_failed',
        ...(lastError ? { error: serializeError(lastError) } : {}),
        forcedFallback,
        fallbackConfigured: Boolean(allowPlainFallback),
        targetFilePath: lastAttemptFilePath,
      },
    };
    if (forcedFallback) {
      fallbackPayload.logContext = {
        ...fallbackPayload.logContext,
        forceReason: 'config_disabled',
      };
    }
    try {
      logStructured('warn', 'pdf_generation_plain_fallback_invoked', {
        ...baseFallbackLog,
        forcedFallback,
      });
      const fallbackBuffer = await generatePlainPdfFallback(fallbackPayload);
      logStructured('info', 'pdf_generation_plain_fallback_succeeded', {
        ...baseFallbackLog,
        bytes: fallbackBuffer.length,
        forcedFallback,
      });
      return {
        buffer: fallbackBuffer,
        template: fallbackTemplateId,
        messages,
      };
    } catch (fallbackError) {
      if (!fallbackError.cause && lastError) {
        fallbackError.cause = lastError;
      }
      logStructured('error', 'pdf_generation_plain_fallback_failed', {
        ...baseFallbackLog,
        error: serializeError(fallbackError),
        forcedFallback,
      });
      fallbackContext.lastError = fallbackError;
      lastError = fallbackError;
    }
  } else if (allowPlainFallback) {
    logStructured('warn', 'pdf_generation_plain_fallback_skipped', {
      ...logContext,
      documentType,
      templates: candidates,
      reason: 'unsupported_document_type',
      error: serializeError(lastError),
    });
  }

  if (fallbackContext) {
    fallbackContext.lastError = lastError;
    try {
      const minimalBuffer = createMinimalPlainPdfBuffer({
        lines: fallbackContext.text.split('\n'),
        name: fallbackContext.name,
        jobTitle: fallbackContext.jobTitle,
        contactLines: fallbackContext.contactLines,
        documentType: fallbackContext.documentType,
        requestedTemplateId: fallbackContext.templateId,
      });
      logStructured('warn', 'pdf_generation_minimal_fallback_recovered', {
        ...(fallbackContext.log || {}),
        forcedFallback: fallbackContext.forcedFallback,
        bytes: minimalBuffer.length,
        previousError: fallbackContext.lastError
          ? serializeError(fallbackContext.lastError)
          : undefined,
        environment: environmentDetails,
      });
      return {
        buffer: minimalBuffer,
        template: fallbackContext.templateId,
        messages,
      };
    } catch (minimalError) {
      logStructured('error', 'pdf_generation_minimal_fallback_failed', {
        ...(fallbackContext.log || {}),
        forcedFallback: fallbackContext.forcedFallback,
        error: serializeError(minimalError),
        previousError: fallbackContext.lastError
          ? serializeError(fallbackContext.lastError)
          : undefined,
        environment: environmentDetails,
      });
    }
  }

  logStructured('error', 'pdf_generation_all_attempts_failed', {
    ...logContext,
    documentType,
    templates: candidates,
    error: serializeError(lastError),
    targetFilePath: lastAttemptFilePath,
    environment: environmentDetails,
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

function createMetric(category, score, tips = [], options = {}) {
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

  const details = options && typeof options === 'object' ? options.details : undefined;

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
    ...(details ? { details } : {}),
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

function combineReasonClauses(reasons = []) {
  const clauses = reasons.filter(Boolean);
  if (!clauses.length) {
    return '';
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  const [first, second] = clauses;
  if (!second) {
    return first;
  }
  return `${first} and ${second}`;
}

function buildProbabilityNarrative({
  probability,
  level,
  skillCoverage,
  skillsStatus,
  missing,
  added,
  designationStatus,
  experienceStatus,
  certificationStatus,
}) {
  const reasons = [];

  if (skillsStatus === 'gap') {
    const focus = summarizeList(missing, { limit: 3 });
    reasons.push(
      focus
        ? `it still misses ${focus} from the JD`
        : 'key JD skills remain uncovered'
    );
  } else if (skillsStatus === 'partial') {
    reasons.push(`it only covers ${skillCoverage}% of the JD skills`);
  } else if (skillsStatus === 'match') {
    if (added?.length) {
      reasons.push(
        `it now highlights ${summarizeList(added, { limit: 3 })}, covering ${skillCoverage}% of JD skills`
      );
    } else {
      reasons.push(`it covers ${skillCoverage}% of the JD skills`);
    }
  }

  if (designationStatus === 'mismatch') {
    reasons.push('the headline still differs from the JD designation');
  } else if (designationStatus === 'partial') {
    reasons.push('the headline needs clearer alignment to the JD title');
  } else if (designationStatus === 'match') {
    reasons.push('the headline matches the JD designation');
  }

  if (experienceStatus === 'gap') {
    reasons.push('experience appears below the stated requirement');
  } else if (experienceStatus === 'partial') {
    reasons.push('experience is close to the required range');
  } else if (experienceStatus === 'match') {
    reasons.push('experience meets the requirement');
  }

  if (certificationStatus === 'gap') {
    reasons.push('recommended certifications are still missing');
  } else if (certificationStatus === 'info') {
    reasons.push('certifications need a manual update to be reflected');
  } else if (certificationStatus === 'match') {
    reasons.push('credential coverage aligns with the posting');
  }

  const because = combineReasonClauses(reasons);
  const base = `Projected ${level.toLowerCase()} probability (${probability}%) that this resume will be selected for the JD`;
  return because ? `${base} because ${because}.` : `${base}.`;
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
    baselineScoreBreakdown = {},
    resumeExperience = [],
    linkedinExperience = [],
    knownCertificates = [],
    certificateSuggestions = [],
    manualCertificatesRequired = false,
  } = context;

  const targetTitle = String(jobTitle || '').trim();
  const normalizeTitle = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizedTarget = normalizeTitle(targetTitle);
  const computeDesignation = (resumeTitleInput) => {
    const visibleTitle = String(resumeTitleInput || '').trim();
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

    return { designationStatus, designationMessage, designationScore, visibleTitle };
  };

  const baselineDesignation = computeDesignation(originalTitle || '');
  const finalDesignation = computeDesignation(modifiedTitle || originalTitle || '');
  let {
    designationStatus,
    designationMessage,
    designationScore,
    visibleTitle,
  } = finalDesignation;

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

  const computeTaskAlignmentScore = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const normalized = Math.round(clamp(value, 0, 100));
    const floor = value >= 80 ? 80 : value >= 55 ? 55 : 35;
    return Math.max(Math.min(normalized, 95), floor);
  };
  const tasksScore = computeTaskAlignmentScore(impactScore);

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

  const normalizeFitScore = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.round(clamp(value, 0, 100));
  };

  const jobFitScores = [
    {
      key: 'designation',
      label: 'Designation Alignment',
      score: normalizeFitScore(designationScore),
      status: designationStatus,
      message: designationMessage,
      detail: {
        currentTitle: visibleTitle,
        targetTitle,
      },
    },
    {
      key: 'skills',
      label: 'Skill Coverage',
      score: normalizeFitScore(skillCoverage),
      status: skillsStatus,
      message: skillsMessage,
      detail: {
        coverage: skillCoverage,
        missingCount: missing.length,
        addedCount: added.length,
      },
    },
    {
      key: 'experience',
      label: 'Experience Match',
      score: normalizeFitScore(experienceScore),
      status: experienceStatus,
      message: experienceMessage,
      detail: {
        candidateYears,
        requiredMin,
        requiredMax,
      },
    },
    {
      key: 'tasks',
      label: 'Task Alignment',
      score: normalizeFitScore(tasksScore),
      status: tasksStatus,
      message: tasksMessage,
      detail: {
        impactScore: Math.round(clamp(impactScore, 0, 100)),
      },
    },
    {
      key: 'highlights',
      label: 'Highlights Strength',
      score: normalizeFitScore(highlightScore),
      status: highlightsStatus,
      message: highlightsMessage,
      detail: {
        crispnessScore,
        otherScore,
      },
    },
    {
      key: 'certifications',
      label: 'Certification Match',
      score: normalizeFitScore(certificationScore),
      status: certificationStatus,
      message: certificationMessage,
      detail: {
        known: knownNames,
        suggestions,
      },
    },
  ];

  const jobFitAverage = jobFitScores.length
    ? Math.round(
        jobFitScores.reduce((total, metric) => total + (typeof metric.score === 'number' ? metric.score : 0), 0) /
          jobFitScores.length,
      )
    : 0;

  const baselineImpactScore = Number(baselineScoreBreakdown?.impact?.score) || impactScore;
  const baselineCrispness = Number(baselineScoreBreakdown?.crispness?.score) || crispnessScore;
  const baselineOther = Number(baselineScoreBreakdown?.otherQuality?.score) || otherScore;
  const baselineHighlightScore = Math.round((baselineCrispness + baselineOther) / 2) || highlightScore;
  const baselineMissing = Array.isArray(originalMatch?.newSkills)
    ? originalMatch.newSkills.filter(Boolean)
    : [];
  const baselineSkillsStatus = baselineMissing.length
    ? 'gap'
    : originalCoverage < 70
      ? 'partial'
      : 'match';

  const selectionMetricKeys = ['designation', 'skills', 'experience', 'tasks', 'highlights'];
  const computeProbability = (scores = {}) => {
    const values = selectionMetricKeys
      .map((key) => {
        const value = scores[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return null;
        }
        return clamp(Math.round(value), 0, 100);
      })
      .filter((value) => value !== null);

    const average = values.length
      ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
      : 0;

    const probability = clamp(average, 0, 100);
    const level = probability >= 75 ? 'High' : probability >= 55 ? 'Medium' : 'Low';
    return { probability, level };
  };

  const baselineProbabilityInput = {
    designation: normalizeFitScore(baselineDesignation.designationScore),
    skills: normalizeFitScore(originalCoverage),
    experience: normalizeFitScore(experienceScore),
    tasks: normalizeFitScore(computeTaskAlignmentScore(baselineImpactScore)),
    highlights: normalizeFitScore(baselineHighlightScore),
  };

  const selectionProbabilityInput = jobFitScores
    .filter((metric) => selectionMetricKeys.includes(metric.key))
    .reduce((acc, metric) => ({ ...acc, [metric.key]: metric.score }), {});

  const { probability: baselineProbability, level: baselineLevel } = computeProbability(
    baselineProbabilityInput
  );

  const { probability, level } = computeProbability(selectionProbabilityInput);

  const probabilityMessage = buildProbabilityNarrative({
    probability,
    level,
    skillCoverage,
    skillsStatus,
    missing,
    added,
    designationStatus,
    experienceStatus,
    certificationStatus,
  });
  const baselineProbabilityMessage = buildProbabilityNarrative({
    probability: baselineProbability,
    level: baselineLevel,
    skillCoverage: originalCoverage,
    skillsStatus: baselineSkillsStatus,
    missing: baselineMissing,
    added: [],
    designationStatus: baselineDesignation.designationStatus,
    experienceStatus,
    certificationStatus,
  });
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
    rationale: probabilityMessage,
    before: {
      probability: baselineProbability,
      level: baselineLevel,
      message: baselineProbabilityMessage,
      rationale: baselineProbabilityMessage,
    },
    after: {
      probability,
      level,
      message: probabilityMessage,
      rationale: probabilityMessage,
    },
    summary,
    jobFitAverage,
    jobFitScores,
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

const ATS_METRIC_WEIGHTS = {
  layoutSearchability: 0.2,
  atsReadability: 0.25,
  impact: 0.25,
  crispness: 0.15,
  otherQuality: 0.15,
};

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

function computeCompositeAtsScore(scoreBreakdown = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  let weightedSum = 0;
  let totalWeight = 0;

  ATS_METRIC_DEFINITIONS.forEach(({ key }) => {
    const weight = ATS_METRIC_WEIGHTS[key] ?? 1;
    const metricScore =
      typeof normalized[key]?.score === 'number' && Number.isFinite(normalized[key].score)
        ? clamp(normalized[key].score, 0, 100)
        : 0;
    weightedSum += metricScore * weight;
    totalWeight += weight;
  });

  if (!totalWeight) {
    return 0;
  }

  return Math.round(weightedSum / totalWeight);
}

function buildAtsScoreExplanation(scoreBreakdown = {}, { phase = 'uploaded' } = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  const totalWeight = ATS_METRIC_DEFINITIONS.reduce(
    (sum, { key }) => sum + (ATS_METRIC_WEIGHTS[key] ?? 1),
    0
  );

  const parts = ATS_METRIC_DEFINITIONS.map(({ key, category }) => {
    const metricScore =
      typeof normalized[key]?.score === 'number' && Number.isFinite(normalized[key].score)
        ? Math.round(clamp(normalized[key].score, 0, 100))
        : 0;
    const weight = ATS_METRIC_WEIGHTS[key] ?? 1;
    const weightShare = totalWeight ? Math.round((weight / totalWeight) * 100) : 0;
    return `${category} ${metricScore}% (${weightShare}% weight)`;
  });

  const phaseLabel = phase === 'enhanced' ? 'enhanced' : 'uploaded';
  return `Weighted ATS composite for the ${phaseLabel} resume using ${parts.join(
    ', '
  )}. Metrics are derived from JD keywords, structure, and formatting cues.`;
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

  const layoutDetails = {
    headingCount: headingLines.length,
    headingDensity: Number((headingScore * 100).toFixed(1)),
    sectionCoverage: Number((sectionScore * 100).toFixed(1)),
    bulletCount: bulletLines.length,
    bulletUsageScore: Number((bulletScore * 100).toFixed(1)),
    contactInfoPresent: Boolean(hasContactInfo),
    contactInfoScore: contactScore ? 100 : 0,
    paragraphPenalty: Math.round(paragraphPenalty * 100),
    pagePenalty: Math.round(pagePenalty * 100),
    lengthPenalty: Math.round(lengthPenalty * 100),
    estimatedPageCount,
    rawLineCount,
  };

  return createMetric('Layout & Searchability', layoutScore, layoutTips, {
    details: layoutDetails,
  });
}

function evaluateAtsMetric(analysis) {
  const { normalizedResume, text, multiColumnIndicators, nonAsciiCharacters } = analysis;
  const atsIssues = [];

  const hasTableLikeFormatting = /\btable\b/.test(normalizedResume) && /\|/.test(text);
  const hasTableOfContents = normalizedResume.includes('table of contents');
  const hasPageNumberFooters = /\bpage \d+ of \d+/i.test(text);
  const hasEmbeddedImages = /https?:\/\/\S+\.(png|jpg|jpeg|gif|svg)/i.test(text);
  const hasDecorativeCharacters = /[{}<>]/.test(text);

  const penaltyBreakdown = {
    tableLikeFormatting: hasTableLikeFormatting ? 22 : 0,
    tableOfContents: hasTableOfContents ? 18 : 0,
    pageNumberFooters: hasPageNumberFooters ? 12 : 0,
    embeddedImages: hasEmbeddedImages ? 16 : 0,
    multiColumnSpacing:
      multiColumnIndicators.length > 0 ? Math.min(5 + multiColumnIndicators.length * 3, 20) : 0,
    decorativeCharacters: hasDecorativeCharacters ? 8 : 0,
    nonAsciiCharacters: Math.min(nonAsciiCharacters * 1.5, 18),
  };

  let penalty = 0;
  Object.entries(penaltyBreakdown).forEach(([key, value]) => {
    if (value > 0) {
      penalty += value;
      if (key === 'tableLikeFormatting') atsIssues.push('table-like formatting');
      if (key === 'tableOfContents') atsIssues.push('a table of contents');
      if (key === 'pageNumberFooters') atsIssues.push('page number footers');
      if (key === 'embeddedImages') atsIssues.push('embedded images');
      if (key === 'multiColumnSpacing') atsIssues.push('multi-column spacing that ATS bots misread');
      if (key === 'decorativeCharacters') atsIssues.push('decorative characters or HTML brackets');
      if (key === 'nonAsciiCharacters' && nonAsciiCharacters > 0) {
        atsIssues.push('non-standard symbols that confuse parsers');
      }
    }
  });

  const atsScore = clamp(100 - penalty, 0, 100);

  const atsTips = [];
  if (!atsIssues.length) {
    atsTips.push('Formatting is ATS-safe—keep the clean structure as you update content.');
  } else {
    atsTips.push(`Remove ${summarizeList(atsIssues)}—they frequently break ATS parsing engines.`);
  }

  if (multiColumnIndicators.length >= 6) {
    atsTips.push('Switch to a single-column layout so ATS parsers read left-to-right cleanly.');
  }
  if (nonAsciiCharacters > 10) {
    atsTips.push('Replace decorative symbols with plain text—ATS parsers misread special characters.');
  }

  const atsDetails = {
    baseScore: 100,
    penaltyTotal: Math.round(Math.min(penalty, 100)),
    penaltyBreakdown: Object.fromEntries(
      Object.entries(penaltyBreakdown).map(([key, value]) => [key, Number(value.toFixed(2))])
    ),
    multiColumnIndicators: multiColumnIndicators.length,
    nonAsciiCharacters,
  };

  return createMetric('ATS Readability', atsScore, atsTips, { details: atsDetails });
}

function evaluateImpactMetric(analysis) {
  const {
    achievementLines,
    bulletLines,
    bulletKeywordHits,
    jobKeywordSet,
    summaryText,
    summaryKeywordHits,
    summarySkillHits,
    normalizedJobSkills,
    normalizedResumeSkills,
  } = analysis;

  const bulletCount = bulletLines.length;
  const achievementRatio = bulletCount ? achievementLines.length / bulletCount : 0;
  const achievementVolumeScore = clamp01(achievementLines.length / Math.max(3, bulletCount * 0.6));
  const keywordHitRatio = bulletLines.length ? bulletKeywordHits.length / bulletLines.length : 0;

  const summaryPresent = Boolean(summaryText);
  const summarySkillScore = summaryPresent
    ? clamp01(summarySkillHits.length / Math.max(1, Math.min(normalizedJobSkills.size, 6)))
    : 0;
  const summaryKeywordScore = summaryPresent
    ? clamp01(
        (summaryKeywordHits.length + summarySkillScore * Math.min(jobKeywordSet.size, 6)) /
          Math.max(2, Math.min(jobKeywordSet.size, 10))
      )
    : 0;

  const keywordMatchCount = jobKeywordSet.size
    ? jobKeywordSet.size - (jobKeywordSet.size - new Set(bulletKeywordHits).size)
    : 0;

  const normalizedKeywordMatchCount = clamp01(keywordMatchCount / Math.max(4, jobKeywordSet.size));

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

  if (normalizedResumeSkills.size && normalizedJobSkills.size) {
    const missingSkills = Array.from(normalizedJobSkills).filter(
      (skill) => !normalizedResumeSkills.has(skill)
    );
    if (missingSkills.length) {
      impactTips.push(
        `Explicitly list ${summarizeList(
          missingSkills.map((skill) => skill.charAt(0).toUpperCase() + skill.slice(1)),
          { limit: 5 }
        )} to mirror the job posting.`
      );
    }
  }

  if (!impactTips.length) {
    impactTips.push('Impact storytelling is strong—keep quantifying wins as you add new roles.');
  }

  const impactDetails = {
    bulletCount,
    achievementBullets: achievementLines.length,
    achievementRatio: Number((achievementRatio * 100).toFixed(1)),
    achievementVolumeScore: Number((achievementVolumeScore * 100).toFixed(1)),
    keywordHitRatio: Number((keywordHitRatio * 100).toFixed(1)),
    summaryPresent,
    summaryKeywordScore: Number((summaryKeywordScore * 100).toFixed(1)),
    summarySkillScore: Number((summarySkillScore * 100).toFixed(1)),
    jobKeywordCount: jobKeywordSet.size,
    bulletKeywordHits: bulletKeywordHits.length,
  };

  return createMetric('Impact', impactScore, impactTips, { details: impactDetails });
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

  const crispnessDetails = {
    bulletCount: bulletLines.length,
    averageBulletWords: Number(avgBulletWords.toFixed(2)),
    lengthScore: Number((lengthScore * 100).toFixed(1)),
    fillerBulletRatio: Number((fillerRatio * 100).toFixed(1)),
    fillerScore: Number((fillerScore * 100).toFixed(1)),
    verbStartRatio: Number((verbStartRatio * 100).toFixed(1)),
    balanceScore: Number((balanceScore * 100).toFixed(1)),
    longBullets: longBulletLines.length,
    shortBullets: shortBulletLines.length,
  };

  return createMetric('Crispness', crispnessScore, crispnessTips, { details: crispnessDetails });
}

function evaluateOtherMetric(analysis) {
  const {
    normalizedJobSkills,
    normalizedResumeSkills,
    jobKeywordMatches,
    summaryPresent,
    summaryKeywordHits,
    summarySkillHits,
  } = analysis;

  const skillCoverage = normalizedJobSkills.size
    ? normalizedResumeSkills.size / Math.max(normalizedJobSkills.size, 1)
    : normalizedResumeSkills.size > 0
    ? 1
    : 0;

  const keywordDensity = jobKeywordMatches.length
    ? jobKeywordMatches.length / Math.max(normalizedJobSkills.size || jobKeywordMatches.length, 6)
    : normalizedResumeSkills.size
    ? Math.min(1, normalizedResumeSkills.size / 12)
    : 0;

  const summaryWeight = summaryPresent ? 0.2 : 0;
  const skillWeight = normalizedJobSkills.size ? 0.45 : 0.25;
  const keywordWeight = normalizedJobSkills.size ? 0.35 : 0.5;

  const summaryContribution = summaryPresent
    ? clamp01((summaryKeywordHits.length + summarySkillHits.length) / Math.max(2, normalizedJobSkills.size))
    : 0;

  const otherScore =
    100 * clamp01(skillCoverage * skillWeight + keywordDensity * keywordWeight + summaryContribution * summaryWeight);

  const otherTips = [];
  if (!normalizedResumeSkills.size) {
    otherTips.push('Add a dedicated skills section so ATS parsers can map your proficiencies.');
  }
  if (normalizedJobSkills.size && normalizedResumeSkills.size) {
    const missingSkillSet = Array.from(normalizedJobSkills).filter(
      (skill) => !normalizedResumeSkills.has(skill)
    );
    if (missingSkillSet.length) {
      otherTips.push(
        `Incorporate keywords such as ${summarizeList(missingSkillSet)} to mirror the job description.`
      );
    }
  }
  if (summaryPresent && !summaryKeywordHits.length && normalizedJobSkills.size) {
    otherTips.push(
      `Reference domain language from the posting—for example ${summarizeList(
        Array.from(normalizedJobSkills).slice(0, 3)
      )}—to reinforce alignment.`
    );
  }
  if (!otherTips.length) {
    otherTips.push('Keyword coverage is solid—keep tailoring skills to each job description.');
  }

  const otherDetails = {
    normalizedJobSkillCount: normalizedJobSkills.size,
    normalizedResumeSkillCount: normalizedResumeSkills.size,
    jobKeywordMatches: jobKeywordMatches.length,
    skillCoverage: Number((skillCoverage * 100).toFixed(1)),
    keywordDensity: Number((keywordDensity * 100).toFixed(1)),
    summaryContribution: Number((summaryContribution * 100).toFixed(1)),
    weights: {
      skillWeight: Number((skillWeight * 100).toFixed(1)),
      keywordWeight: Number((keywordWeight * 100).toFixed(1)),
      summaryWeight: Number((summaryWeight * 100).toFixed(1)),
    },
    summaryPresent,
  };

  return createMetric('Other Quality Metrics', otherScore, otherTips, {
    details: otherDetails,
  });
}


function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
}

function sanitizeName(name) {
  return name.trim().split(/\s+/).slice(0, 2).join('_').toLowerCase();
}

function sanitizeS3KeyComponent(value, { fallback = '', maxLength = 96 } = {}) {
  const normalise = (input) => {
    if (input === undefined || input === null) {
      return '';
    }
    const raw = String(input).trim().toLowerCase();
    if (!raw) {
      return '';
    }
    let cleaned = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
    cleaned = cleaned.replace(/^-|-$/g, '');
    if (!cleaned) {
      return '';
    }
    if (maxLength && cleaned.length > maxLength) {
      return cleaned.slice(0, maxLength);
    }
    return cleaned;
  };

  let sanitized = normalise(value);
  if (!sanitized && fallback) {
    sanitized = normalise(fallback);
  }
  return sanitized;
}

function resolveDocumentOwnerSegment({ userId, sanitizedName } = {}) {
  return (
    sanitizeS3KeyComponent(userId) ||
    sanitizeS3KeyComponent(sanitizedName) ||
    'candidate'
  );
}

function buildDocumentSessionPrefix({
  ownerSegment,
  dateSegment,
  jobSegment,
  sessionSegment,
} = {}) {
  const safeOwner =
    sanitizeS3KeyComponent(ownerSegment, { fallback: 'candidate' }) || 'candidate';
  const safeSession = sanitizeS3KeyComponent(sessionSegment);
  const safeDate = sanitizeS3KeyComponent(dateSegment);
  const safeJob = sanitizeS3KeyComponent(jobSegment);
  const segments = ['cv', safeOwner];
  if (safeSession) {
    segments.push(safeSession);
  } else {
    if (safeDate) {
      segments.push(safeDate);
    }
    if (safeJob) {
      segments.push(safeJob);
    }
  }
  return `${segments.join('/')}/`;
}

function deriveSessionChangeLogKey({ changeLogKey, originalUploadKey } = {}) {
  const explicitKey = typeof changeLogKey === 'string' ? changeLogKey.trim() : '';
  if (explicitKey) {
    return explicitKey;
  }
  const uploadKey = typeof originalUploadKey === 'string' ? originalUploadKey.trim() : '';
  if (!uploadKey) {
    return '';
  }
  const prefix = uploadKey.replace(/[^/]+$/, '');
  if (!prefix) {
    return '';
  }
  return `${prefix}logs/change-log.json`;
}

async function streamToString(stream) {
  if (!stream) return '';
  if (typeof stream === 'string') return stream;
  if (Buffer.isBuffer(stream)) return stream.toString('utf8');
  if (typeof stream.transformToString === 'function') {
    return stream.transformToString();
  }
  const readable =
    stream instanceof Readable || typeof stream[Symbol.asyncIterator] === 'function'
      ? stream
      : Readable.from(stream);
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('');
}

function pruneStageMetadataValue(value) {
  if (Array.isArray(value)) {
    const sanitized = value
      .map((item) => pruneStageMetadataValue(item))
      .filter((item) => item !== undefined);
    return sanitized.length ? sanitized : undefined;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value).reduce((acc, [key, val]) => {
      const sanitized = pruneStageMetadataValue(val);
      if (sanitized !== undefined) {
        acc[key] = sanitized;
      }
      return acc;
    }, {});
    return Object.keys(entries).length ? entries : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
}

async function updateStageMetadata({
  s3,
  bucket,
  metadataKey,
  jobId,
  stage,
  data = {},
  logContext = {},
}) {
  if (!s3 || !bucket || !metadataKey || !stage) {
    return false;
  }

  const context = { ...logContext, stage, metadataKey };

  try {
    let existingPayload = {};
    try {
      const existing = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: metadataKey })
      );
      const raw = await streamToString(existing.Body);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          existingPayload = parsed;
        }
      }
    } catch (err) {
      if (err?.name !== 'NoSuchKey' && err?.$metadata?.httpStatusCode !== 404) {
        throw err;
      }
    }

    const sanitizedStage = pruneStageMetadataValue({ ...data });
    const nextStages = {
      ...(existingPayload.stages && typeof existingPayload.stages === 'object'
        ? existingPayload.stages
        : {}),
    };
    if (sanitizedStage && Object.keys(sanitizedStage).length) {
      nextStages[stage] = sanitizedStage;
    } else {
      delete nextStages[stage];
    }

    const nextPayload = {
      version: 2,
      ...(existingPayload.jobId || jobId
        ? { jobId: jobId || existingPayload.jobId }
        : {}),
      stages: pruneStageMetadataValue(nextStages) || {},
      updatedAt: new Date().toISOString(),
    };

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: metadataKey,
        Body: JSON.stringify(nextPayload, null, 2),
        ContentType: 'application/json',
      })
    );

    return true;
  } catch (err) {
    logStructured('warn', 'stage_metadata_update_failed', {
      ...context,
      error: serializeError(err),
    });
    return false;
  }
}

async function readJsonFromS3({ s3, bucket, key }) {
  if (!s3 || !bucket || !key) {
    return null;
  }
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const raw = await streamToString(response.Body);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}

async function loadSessionChangeLog({ s3, bucket, key, fallbackEntries = [] } = {}) {
  const data = await readJsonFromS3({ s3, bucket, key });
  if (!data) {
    return Array.isArray(fallbackEntries) ? fallbackEntries : [];
  }
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries;
}

async function writeSessionChangeLog({
  s3,
  bucket,
  key,
  jobId,
  entries,
}) {
  if (!s3 || !bucket || !key) {
    return null;
  }
  const payload = {
    version: 1,
    jobId,
    updatedAt: new Date().toISOString(),
    entries: Array.isArray(entries) ? entries : [],
  };
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    })
  );
  return payload;
}

function buildDocumentFileBaseName({ type, templateId, variant }) {
  const templateSegment = sanitizeS3KeyComponent(templateId);
  const variantSegment = sanitizeS3KeyComponent(variant, { fallback: type });

  if (type === 'resume') {
    return templateSegment
      ? `enhanced_${templateSegment}`
      : `enhanced_${variantSegment || 'resume'}`;
  }

  if (type === 'cover_letter') {
    return templateSegment
      ? `cover_letter_${templateSegment}`
      : `cover_letter_${variantSegment || 'cover-letter'}`;
  }

  if (type === 'changelog') {
    return 'changelog';
  }

  if (type === 'original') {
    return 'original';
  }

  return variantSegment || sanitizeS3KeyComponent(type, { fallback: 'document' }) || 'document';
}

function ensureTrailingSlash(prefix = '') {
  if (!prefix) {
    return '';
  }
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function ensureUniquePdfKey(candidateKey, usedKeys) {
  if (!usedKeys) {
    return candidateKey;
  }
  if (!usedKeys.has(candidateKey)) {
    return candidateKey;
  }
  const lastSlashIndex = candidateKey.lastIndexOf('/');
  const directory = lastSlashIndex >= 0 ? candidateKey.slice(0, lastSlashIndex + 1) : '';
  const fileName = lastSlashIndex >= 0 ? candidateKey.slice(lastSlashIndex + 1) : candidateKey;
  const lastDotIndex = fileName.lastIndexOf('.');
  const baseName = lastDotIndex >= 0 ? fileName.slice(0, lastDotIndex) : fileName;
  const extension = lastDotIndex >= 0 ? fileName.slice(lastDotIndex) : '';
  let index = 2;
  let nextCandidate;
  do {
    nextCandidate = `${directory}${baseName}_${index}${extension}`;
    index += 1;
  } while (usedKeys.has(nextCandidate));
  return nextCandidate;
}

function buildTemplateScopedPdfKey({
  basePrefix,
  documentType,
  templateId,
  variant,
  usedKeys,
}) {
  const normalizedPrefix = ensureTrailingSlash(basePrefix);
  const templateFallback =
    documentType === 'cover_letter'
      ? 'cover-letter'
      : documentType === 'resume'
      ? 'resume'
      : documentType === 'original'
      ? 'original'
      : 'document';
  const templateSegment =
    sanitizeS3KeyComponent(templateId, { fallback: templateFallback }) ||
    templateFallback;
  const variantFallback =
    documentType === 'cover_letter'
      ? 'cover-letter'
      : documentType === 'resume'
      ? 'version'
      : documentType === 'original'
      ? 'original'
      : 'document';
  const versionSegment =
    sanitizeS3KeyComponent(variant, { fallback: variantFallback }) || variantFallback;
  const candidateKey = `${normalizedPrefix}${templateSegment}/${versionSegment}.pdf`;
  const uniqueKey = ensureUniquePdfKey(candidateKey, usedKeys);
  if (usedKeys) {
    usedKeys.add(uniqueKey);
  }
  return uniqueKey;
}

function sanitizeJobSegment(jobId) {
  if (typeof jobId !== 'string') return '';
  const normalized = jobId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, 48);
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
  if (typeof text !== 'string') {
    return null;
  }
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

function summarizeJobFocus(jobDescription = '') {
  if (typeof jobDescription !== 'string') {
    return '';
  }
  const cleaned = jobDescription.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  const match = cleaned.match(/[^.!?]+[.!?]?/);
  return match ? match[0].trim() : cleaned;
}

function formatSkillList(skills = [], limit = 3) {
  if (!Array.isArray(skills)) {
    return '';
  }
  const normalized = Array.from(
    new Set(
      skills
        .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
        .filter(Boolean)
    )
  );
  if (!normalized.length) {
    return '';
  }
  const limited = normalized.slice(0, Math.max(limit, 1));
  if (limited.length === 1) {
    return limited[0];
  }
  if (limited.length === 2) {
    return `${limited[0]} and ${limited[1]}`;
  }
  return `${limited.slice(0, -1).join(', ')}, and ${limited[limited.length - 1]}`;
}

const COVER_LETTER_MOTIVATION_KEYWORDS = Object.freeze([
  'excited',
  'thrilled',
  'eager',
  'keen',
  'motivated',
  'passionate',
  'passion',
  'inspired',
  'drawn',
  'compelled',
  'delighted',
  'interested',
  'honored',
  'privileged',
  'enthusiastic',
  'appeal',
  'opportunity',
  'align',
]);

const COVER_LETTER_CLOSING_PATTERN =
  /^(?:thank you(?: for (?:your )?(?:time|consideration))?|thanks(?: so much)?|sincerely|best(?: regards| wishes)?|regards|kind regards|warm regards|with appreciation|with gratitude|respectfully|yours truly|yours faithfully|yours sincerely)/i;

function summarizeJobDescriptionForCover(jobDescription = '', maxLength = 360) {
  if (typeof jobDescription !== 'string') {
    return '';
  }
  const cleaned = jobDescription
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return '';
  }
  const sentenceSplit = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  let summary = sentenceSplit.slice(0, 3).join(' ');
  if (!summary) {
    summary = cleaned;
  }
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength);
    summary = summary.replace(/\s+\S*$/, '').trim();
    if (summary.length && !summary.endsWith('…')) {
      summary = `${summary}…`;
    }
  }
  return summary;
}

function splitCoverLetterParagraphs(text = '') {
  if (typeof text !== 'string') {
    return [];
  }
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function findCoverLetterGreeting(paragraphs = []) {
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const firstLine = paragraph.split('\n')[0]?.trim() || '';
    if (/^(dear|hello|hi)\b/i.test(firstLine)) {
      return { index, paragraph };
    }
  }
  return { index: -1, paragraph: '' };
}

function findCoverLetterClosing(paragraphs = [], applicantName = '') {
  const normalizedName = typeof applicantName === 'string' ? applicantName.trim() : '';
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    const lines = paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      continue;
    }
    const closingLineIndex = lines.findIndex((line) => COVER_LETTER_CLOSING_PATTERN.test(line));
    if (closingLineIndex === -1) {
      continue;
    }
    let signature = lines.slice(closingLineIndex + 1).join(' ').trim();
    let endIndex = index;
    if (!signature && index + 1 < paragraphs.length) {
      const nextLines = paragraphs[index + 1]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (nextLines.length && nextLines.join(' ').length <= 120) {
        signature = nextLines.join(' ');
        endIndex = index + 1;
      }
    }
    if (!signature && normalizedName) {
      signature = normalizedName;
    }
    const salutation = lines[closingLineIndex];
    return {
      index,
      endIndex,
      paragraph,
      salutation,
      signature,
    };
  }

  if (normalizedName) {
    const lastParagraph = paragraphs[paragraphs.length - 1] || '';
    if (lastParagraph.toLowerCase().includes(normalizedName.toLowerCase())) {
      return {
        index: paragraphs.length - 1,
        endIndex: paragraphs.length - 1,
        paragraph: '',
        salutation: '',
        signature: normalizedName,
      };
    }
    return { index: -1, endIndex: -1, paragraph: '', salutation: '', signature: normalizedName };
  }

  return { index: -1, endIndex: -1, paragraph: '', salutation: '', signature: '' };
}

function mapCoverLetterFields({
  text = '',
  contactDetails = {},
  jobTitle = '',
  jobDescription = '',
  jobSkills = [],
  applicantName = '',
  letterIndex = 1,
} = {}) {
  const rawText = typeof text === 'string' ? text : '';
  const normalizedText = rawText.replace(/\r\n/g, '\n');
  const paragraphs = splitCoverLetterParagraphs(normalizedText);
  const greetingInfo = findCoverLetterGreeting(paragraphs);
  const closingInfo = findCoverLetterClosing(paragraphs, applicantName);

  const bodyParagraphs = [];
  const bodyParagraphMap = [];
  paragraphs.forEach((paragraph, index) => {
    if (index === greetingInfo.index) {
      return;
    }
    if (closingInfo.index !== -1 && index >= closingInfo.index && index <= closingInfo.endIndex) {
      return;
    }
    bodyParagraphs.push(paragraph);
    bodyParagraphMap.push({ paragraph, originalIndex: index });
  });

  const motivationRegex = new RegExp(
    COVER_LETTER_MOTIVATION_KEYWORDS.map((word) => `\\b${word}\\w*\\b`).join('|'),
    'i'
  );
  let motivationBodyIndex = bodyParagraphs.findIndex((paragraph) => motivationRegex.test(paragraph));
  if (motivationBodyIndex === -1 && bodyParagraphs.length) {
    motivationBodyIndex = 0;
  }
  const motivationParagraph =
    motivationBodyIndex !== -1 ? bodyParagraphs[motivationBodyIndex] : '';
  const motivationKeywords = motivationParagraph
    ? COVER_LETTER_MOTIVATION_KEYWORDS.filter((keyword) =>
        new RegExp(`\\b${keyword}\\w*\\b`, 'i').test(motivationParagraph)
      )
    : [];

  const normalizedSkills = Array.isArray(jobSkills)
    ? jobSkills
        .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
        .filter(Boolean)
    : [];
  const letterLower = normalizedText.toLowerCase();
  const matchedSkills = Array.from(
    new Set(
      normalizedSkills.filter((skill) => letterLower.includes(skill.toLowerCase()))
    )
  );

  const explicitContact =
    contactDetails && typeof contactDetails === 'object'
      ? {
          email: typeof contactDetails.email === 'string' ? contactDetails.email.trim() : '',
          phone: typeof contactDetails.phone === 'string' ? contactDetails.phone.trim() : '',
          linkedin:
            typeof contactDetails.linkedin === 'string'
              ? normalizeUrl(contactDetails.linkedin) || contactDetails.linkedin.trim()
              : '',
          cityState:
            typeof contactDetails.cityState === 'string' ? contactDetails.cityState.trim() : '',
          contactLines: Array.isArray(contactDetails.contactLines)
            ? contactDetails.contactLines.filter((line) => typeof line === 'string')
            : [],
        }
      : {
          email: '',
          phone: '',
          linkedin: '',
          cityState: '',
          contactLines: [],
        };

  const detectedContactRaw = extractContactDetails(normalizedText, explicitContact.linkedin);

  const combinedContact = {
    email: explicitContact.email || detectedContactRaw.email || '',
    phone: explicitContact.phone || detectedContactRaw.phone || '',
    linkedin: explicitContact.linkedin || detectedContactRaw.linkedin || '',
    cityState: explicitContact.cityState || detectedContactRaw.cityState || '',
  };

  const contactSources = {
    email: explicitContact.email ? 'provided' : detectedContactRaw.email ? 'detected' : '',
    phone: explicitContact.phone ? 'provided' : detectedContactRaw.phone ? 'detected' : '',
    linkedin: explicitContact.linkedin
      ? 'provided'
      : detectedContactRaw.linkedin
        ? 'detected'
        : '',
    location: explicitContact.cityState
      ? 'provided'
      : detectedContactRaw.cityState
        ? 'detected'
        : '',
  };

  const contactLines = dedupeContactLines(
    [
      ...explicitContact.contactLines,
      ...(Array.isArray(detectedContactRaw.contactLines)
        ? detectedContactRaw.contactLines
        : []),
      combinedContact.email ? `Email: ${combinedContact.email}` : '',
      combinedContact.phone ? `Phone: ${combinedContact.phone}` : '',
      combinedContact.linkedin ? `LinkedIn: ${combinedContact.linkedin}` : '',
      combinedContact.cityState ? `Location: ${combinedContact.cityState}` : '',
    ]
      .map((line) => (typeof line === 'string' ? line.trim().replace(/\s+/g, ' ') : ''))
      .filter(Boolean)
  );

  const bodyIndexEntry =
    motivationBodyIndex !== -1 ? bodyParagraphMap[motivationBodyIndex] : null;

  const jobSummary = summarizeJobDescriptionForCover(jobDescription);
  const jobFocus = summarizeJobFocus(jobDescription);
  const jobSummarySentences = jobSummary && normalizedText
    ? jobSummary
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    : [];

  const normalizedJobDescription =
    typeof jobDescription === 'string' ? jobDescription.replace(/\s+/g, ' ').trim() : '';

  const normalizedJobSentences = normalizedJobDescription
    ? normalizedJobDescription
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    : [];

  const motivationSentences = motivationParagraph
    ? motivationParagraph
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    : [];

  return {
    raw: normalizedText,
    paragraphs,
    greeting: greetingInfo.paragraph || '',
    body: bodyParagraphs,
    motivation: {
      paragraph: motivationParagraph,
      sentences: motivationSentences,
      keywords: motivationKeywords,
      matchedSkills,
      bodyIndex: motivationBodyIndex,
      originalIndex: bodyIndexEntry?.originalIndex ?? -1,
      hasMotivation: motivationParagraph.length > 0,
    },
    closing: {
      paragraph: closingInfo.paragraph || '',
      salutation: closingInfo.salutation || '',
      signature: closingInfo.signature || '',
    },
    contact: {
      email: combinedContact.email,
      phone: combinedContact.phone,
      linkedin: combinedContact.linkedin,
      location: combinedContact.cityState,
      lines: contactLines,
      provided: {
        email: explicitContact.email,
        phone: explicitContact.phone,
        linkedin: explicitContact.linkedin,
        location: explicitContact.cityState,
        lines: Array.isArray(explicitContact.contactLines)
          ? explicitContact.contactLines
          : [],
      },
      detected: {
        email: detectedContactRaw.email || explicitContact.email || '',
        phone: detectedContactRaw.phone || explicitContact.phone || '',
        linkedin: detectedContactRaw.linkedin || explicitContact.linkedin || '',
        location: detectedContactRaw.cityState || explicitContact.cityState || '',
        lines: Array.isArray(detectedContactRaw.contactLines)
          ? detectedContactRaw.contactLines
          : [],
      },
      sources: contactSources,
    },
    job: {
      title: jobTitle || '',
      skills: normalizedSkills,
      matchedSkills,
      summary: jobSummary,
      focus: jobFocus,
      summarySentences: jobSummarySentences,
      descriptionSentences: normalizedJobSentences,
      skillSummary: formatSkillList(normalizedSkills, 3),
      description: normalizedJobDescription,
    },
    metadata: {
      paragraphCount: paragraphs.length,
      bodyParagraphCount: bodyParagraphs.length,
      hasGreeting: greetingInfo.index !== -1,
      hasClosing: closingInfo.index !== -1 || Boolean(closingInfo.signature),
      letterIndex,
    },
  };
}

function buildFallbackCoverLetters({
  applicantName = '',
  jobTitle = '',
  jobDescription = '',
  jobSkills = [],
  resumeText = '',
} = {}) {
  const safeName = typeof applicantName === 'string' && applicantName.trim()
    ? applicantName.trim()
    : 'Candidate';
  const normalizedTitle = typeof jobTitle === 'string' ? jobTitle.trim() : '';
  const titlePhrase = normalizedTitle ? `the ${normalizedTitle}` : 'the role';
  const focusSentence = summarizeJobFocus(jobDescription);
  const skillPhrase = formatSkillList(jobSkills);

  const introParts = [`I am excited to apply for ${titlePhrase}.`];
  if (focusSentence) {
    introParts.push(`The opportunity to ${focusSentence.toLowerCase()}`);
  }
  if (skillPhrase) {
    introParts.push(`My background with ${skillPhrase} enables me to contribute immediately.`);
  }
  const introParagraph = introParts.join(' ').replace(/\s+/g, ' ').trim();

  const experiences = extractExperience(resumeText);
  const describeExperience = (exp = {}, prefix = 'In my recent role') => {
    if (!exp || (!exp.title && !exp.company)) {
      return '';
    }
    const title = exp.title ? exp.title.trim() : 'a key contributor';
    const company = exp.company ? ` at ${exp.company.trim()}` : '';
    return `${prefix} as ${title}${company}, I delivered measurable improvements by partnering across teams and keeping complex projects on track.`;
  };
  const primaryExperience = describeExperience(experiences[0], 'In my recent role');
  const secondaryExperience = describeExperience(experiences[1], 'Previously');

  const closingTarget = normalizedTitle
    ? `${normalizedTitle} at your organization`
    : 'your team';
  const closingParagraph = `Thank you for considering my application. I welcome the opportunity to discuss how I can support ${closingTarget}.`;

  const coverLetter1 = [
    'Dear Hiring Manager,',
    introParagraph,
    [primaryExperience, secondaryExperience]
      .filter(Boolean)
      .join(' ')
      .trim() ||
      'In my recent roles I have led cross-functional initiatives, translated ambiguous goals into action, and consistently delivered on schedule.',
    closingParagraph,
    `Sincerely,\n${safeName}`,
  ]
    .filter((paragraph) => typeof paragraph === 'string' && paragraph.trim())
    .join('\n\n')
    .trim();

  const reinforcementParagraph = skillPhrase
    ? `Throughout my career I have built a strong foundation in ${skillPhrase}, applying these capabilities to launch reliable solutions and mentor high-performing teams.`
    : 'Throughout my career I have guided teams through complex deliverables, ensuring quality, clarity, and momentum in every engagement.';
  const alignmentParagraph = focusSentence
    ? `The focus on ${focusSentence.toLowerCase()} resonates with the impact described in my resume, where I consistently align technology investments with stakeholder goals.`
    : 'I am known for aligning technology investments with stakeholder goals, providing clear communication, and maintaining a customer-centric mindset.';

  const coverLetter2 = [
    'Dear Hiring Manager,',
    `I am ready to contribute to ${titlePhrase} and immediately add value to your organization.`,
    reinforcementParagraph,
    alignmentParagraph,
    primaryExperience ||
      'I thrive when collaborating with diverse partners, simplifying complex requirements, and guiding initiatives from concept through successful delivery.',
    `Best regards,\n${safeName}`,
  ]
    .filter((paragraph) => typeof paragraph === 'string' && paragraph.trim())
    .join('\n\n')
    .trim();

  return {
    cover_letter1: coverLetter1,
    cover_letter2: coverLetter2,
  };
}

let activeCoverLetterFallbackBuilder = buildFallbackCoverLetters;

function setCoverLetterFallbackBuilder(overrides) {
  if (typeof overrides === 'function') {
    activeCoverLetterFallbackBuilder = overrides;
    return;
  }
  activeCoverLetterFallbackBuilder = buildFallbackCoverLetters;
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

function stringifyTokens(tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return '';
  }

  const isEnhancementPlaceholder = (value = '') =>
    typeof value === 'string' &&
    (/^\{\{RF_ENH_[A-Za-z0-9_]+\}\}$/.test(value) ||
      /^\{\{RFENH[A-Za-z0-9]+\}\}$/.test(value));

  const formatWithStyle = (value = '', style) => {
    if (!value) return '';
    if (isEnhancementPlaceholder(value)) return value;
    switch (style) {
      case 'bolditalic':
        return `***${value}***`;
      case 'bold':
        return `**${value}**`;
      case 'italic':
        return `_${value}_`;
      default:
        return value;
    }
  };

  let result = '';
  let bulletSeen = false;

  tokens.forEach((token) => {
    if (!token) {
      return;
    }

    switch (token.type) {
      case 'bullet':
        if (!bulletSeen) {
          result += '- ';
          bulletSeen = true;
        }
        break;
      case 'newline':
        result = result.replace(/[ \t]+$/g, '');
        result += '\n';
        bulletSeen = false;
        break;
      case 'tab':
        result += '\t';
        break;
      case 'jobsep':
        result = result.replace(/[ \t]+$/g, '');
        result += ' |';
        break;
      case 'link': {
        const label = token.text || token.href || '';
        if (token.href) {
          const styledLabel = formatWithStyle(label, token.style);
          result += `[${styledLabel}](${token.href})`;
        } else {
          result += formatWithStyle(label, token.style);
        }
        break;
      }
      default: {
        if (typeof token.text === 'string') {
          result += formatWithStyle(token.text, token.style);
        }
        break;
      }
    }
  });

  return result.replace(/[ \t]+$/g, '');
}

function reparseAndStringify(text, options = {}) {
  const data = parseContent(text, options);

  if (options.project) {
    const parseLineOptions = options?.preserveLinkText
      ? { preserveLinkText: true }
      : undefined;
    const projectTokens = parseLine(String(options.project), parseLineOptions);
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
      const line = stringifyTokens(tokens);
      if (line) {
        lines.push(line);
      }
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
  const parseLineOptions = options?.preserveLinkText
    ? { preserveLinkText: true }
    : undefined;
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
        const tokens = parseLine(line, parseLineOptions);
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
      const line = stringifyTokens(tokens);
      if (line) {
        lines.push(line);
      }
    });
  });
  return lines.join('\n');
}

function cloneResumeData(data = {}) {
  return {
    name: data?.name || 'Resume',
    sections: Array.isArray(data?.sections)
      ? data.sections.map((sec) => ({
          heading: sec?.heading || '',
          items: Array.isArray(sec?.items)
            ? sec.items.map((tokens) =>
                Array.isArray(tokens)
                  ? tokens.map((token) => ({ ...token }))
                  : []
              )
            : [],
        }))
      : [],
    placeholders:
      data?.placeholders && typeof data.placeholders === 'object'
        ? { ...data.placeholders }
        : {},
  };
}

function resumeDataToText(data = {}) {
  const lines = [];
  const name = data?.name && String(data.name).trim();
  lines.push(name || 'Resume');
  (Array.isArray(data?.sections) ? data.sections : []).forEach((sec) => {
    const heading = normalizeHeading(sec?.heading || '');
    if (!heading) return;
    lines.push(`# ${heading}`);
    (Array.isArray(sec?.items) ? sec.items : []).forEach((tokens) => {
      const line = stringifyTokens(tokens);
      if (line) {
        lines.push(line);
      }
    });
  });
  return lines.join('\n');
}

function ensureProjectInResumeData(data = {}, projectText = '', options = {}) {
  const project = typeof projectText === 'string' ? projectText.trim() : '';
  if (!project) return;
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  if (!data.placeholders || typeof data.placeholders !== 'object') {
    data.placeholders = {};
  }
  const parseLineOptions = options?.preserveLinkText
    ? { preserveLinkText: true }
    : undefined;
  const normalize = (sec) => normalizeHeading(sec?.heading || '').toLowerCase();
  let section = data.sections.find((sec) => normalize(sec) === 'projects');
  const sectionWasCreated = !section;
  if (!section) {
    section = { heading: 'Projects', items: [] };
    data.sections.push(section);
  }
  section.items = Array.isArray(section.items) ? section.items : [];

  const normalizeKey = (tokens) =>
    resolveEnhancementTokens(stringifyTokens(tokens || []), data.placeholders || {})
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const seen = new Set();
  section.items = section.items.filter((item) => {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const maxItems = Math.max(Number(options?.maxProjectItems) || 2, 1);
  if (section.items.length >= maxItems) {
    return;
  }

  const sentences = project
    .replace(/\s+/g, ' ')
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.replace(/^[\-•\u2022\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, maxItems);

  for (const sentence of sentences) {
    if (section.items.length >= maxItems) break;
    const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) continue;
    const placeholder = registerEnhancementPlaceholder(
      data,
      section.heading || 'Projects',
      sentence
    );
    if (!placeholder) continue;
    const tokens = parseLine(`- ${placeholder}`, parseLineOptions);
    if (!tokens.some((t) => t.type === 'bullet')) tokens.unshift({ type: 'bullet' });
    const key = normalizeKey(tokens);
    if (!key || seen.has(key)) continue;
    section.items.push(tokens);
    seen.add(key);
  }

  if (sectionWasCreated && section.items.length > maxItems) {
    section.items = section.items.slice(0, maxItems);
  }
}

function ensureSkillsInResumeData(data = {}, skills = [], options = {}) {
  if (!Array.isArray(skills) || !skills.length) return;
  const normalizedSkills = skills
    .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
    .filter(Boolean);
  if (!normalizedSkills.length) return;
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  if (!data.placeholders || typeof data.placeholders !== 'object') {
    data.placeholders = {};
  }
  const parseLineOptions = options?.preserveLinkText
    ? { preserveLinkText: true }
    : undefined;
  const normalize = (sec) => normalizeHeading(sec?.heading || '').toLowerCase();
  let section = data.sections.find((sec) => normalize(sec) === 'skills');
  if (!section) {
    section = { heading: 'Skills', items: [] };
    data.sections.push(section);
  }
  section.items = Array.isArray(section.items) ? section.items : [];
  const existingSkillSet = new Set();
  section.items.forEach((item) => {
    const text = resolveEnhancementTokens(
      stringifyTokens(item || ''),
      data.placeholders || {}
    );
    text
      .split(/[,•·|\/;]+/)
      .map((part) => part.replace(/^[-*\s]+/, '').trim())
      .filter(Boolean)
      .forEach((part) => existingSkillSet.add(part.toLowerCase()));
  });
  normalizedSkills.forEach((skill) => {
    const lower = skill.toLowerCase();
    if (existingSkillSet.has(lower)) return;
    const placeholder = registerEnhancementPlaceholder(
      data,
      section.heading || 'Skills',
      skill
    );
    if (!placeholder) return;
    const tokens = parseLine(`- ${placeholder}`, parseLineOptions);
    if (tokens[0]?.type !== 'bullet') tokens.unshift({ type: 'bullet' });
    section.items.push(tokens);
    existingSkillSet.add(lower);
  });
}

function ensureLatestTitleInExperience(data = {}, title = '', options = {}) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedTitle) return;
  data.sections = Array.isArray(data.sections) ? data.sections : [];
  if (!data.placeholders || typeof data.placeholders !== 'object') {
    data.placeholders = {};
  }
  const parseLineOptions = options?.preserveLinkText
    ? { preserveLinkText: true }
    : undefined;
  const experienceSection = data.sections.find((sec) => {
    const key = normalizeHeading(sec?.heading || '').toLowerCase();
    return key === 'work experience' || key.includes('experience');
  });
  if (!experienceSection) return;
  experienceSection.items = Array.isArray(experienceSection.items)
    ? experienceSection.items
    : [];
  if (!experienceSection.items.length) {
    const placeholder = registerEnhancementPlaceholder(
      data,
      experienceSection.heading || 'Work Experience',
      normalizedTitle
    );
    if (!placeholder) return;
    experienceSection.items.push(parseLine(`- ${placeholder}`, parseLineOptions));
    return;
  }
  const firstTokens = experienceSection.items[0] || [];
  const firstText = resolveEnhancementTokens(
    stringifyTokens(firstTokens).trim(),
    data.placeholders || {}
  );
  if (!firstText) {
    const placeholder = registerEnhancementPlaceholder(
      data,
      experienceSection.heading || 'Work Experience',
      normalizedTitle
    );
    if (!placeholder) return;
    experienceSection.items[0] = parseLine(`- ${placeholder}`, parseLineOptions);
    return;
  }
  if (firstText.toLowerCase().includes(normalizedTitle.toLowerCase())) {
    return;
  }
  let company = '';
  const atMatch = firstText.match(/\bat\s+([^:]+)(?::|$)/i);
  if (atMatch) {
    company = atMatch[1].trim();
  }
  let rest = '';
  const colonIndex = firstText.indexOf(':');
  if (colonIndex !== -1) {
    rest = firstText.slice(colonIndex + 1).trim();
  }
  const parts = [`${normalizedTitle}${company ? ` at ${company}` : ''}`];
  if (rest) {
    parts.push(rest);
  }
  const updatedValue = parts.join(': ');
  const placeholder = registerEnhancementPlaceholder(
    data,
    experienceSection.heading || 'Work Experience',
    updatedValue
  );
  if (!placeholder) return;
  experienceSection.items[0] = parseLine(`- ${placeholder}`, parseLineOptions);
}

function createResumeVariants({
  baseText = '',
  projectText = '',
  modifiedTitle = '',
  skillsToInclude = [],
  baseSkills = [],
  sanitizeOptions = {},
} = {}) {
  const sanitizedBase = sanitizeGeneratedText(baseText, sanitizeOptions);
  const resumeData = parseContent(sanitizedBase, {
    ...sanitizeOptions,
    skipRequiredSections: true,
  });
  ensureProjectInResumeData(resumeData, projectText, sanitizeOptions);
  ensureLatestTitleInExperience(resumeData, modifiedTitle, sanitizeOptions);
  ensureSkillsInResumeData(resumeData, baseSkills, sanitizeOptions);
  const version1Text = sanitizeGeneratedText(
    resumeDataToText(resumeData),
    sanitizeOptions
  );

  const version2Data = cloneResumeData(resumeData);
  ensureSkillsInResumeData(version2Data, skillsToInclude, sanitizeOptions);
  const version2Text = sanitizeGeneratedText(
    resumeDataToText(version2Data),
    sanitizeOptions
  );

  const placeholderMap = expandEnhancementTokenMap({
    ...(resumeData.placeholders && typeof resumeData.placeholders === 'object'
      ? resumeData.placeholders
      : {}),
    ...(version2Data.placeholders && typeof version2Data.placeholders === 'object'
      ? version2Data.placeholders
      : {}),
  });

  const version1Tokenized = injectEnhancementTokens(version1Text, placeholderMap);
  const version2Tokenized = injectEnhancementTokens(version2Text, placeholderMap);

  return {
    version1: version1Tokenized,
    version2: version2Tokenized,
    placeholders: placeholderMap,
  };
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
  const bodyJobId =
    req && req.body && typeof req.body.jobId === 'string' ? req.body.jobId.trim() : '';
  const queryJobId =
    req && req.query && typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '';

  const jobId = bodyJobId || queryJobId || createIdentifier();

  req.jobId = jobId;
  res.locals.jobId = jobId;
  next();
}

const LIST_SECTION_TOKENS = new Set([
  'skills',
  'skill',
  'competencies',
  'competency',
  'certifications',
  'certification',
  'licensesandcertifications',
  'licensescertifications',
  'licensescertification',
  'highlights',
  'highlight',
  'careerhighlights',
  'professionalhighlights',
  'projecthighlights',
]);

const AND_SPLIT_SECTION_TOKENS = new Set([
  'skills',
  'skill',
  'competencies',
  'competency',
  'certifications',
  'certification',
  'licensesandcertifications',
  'licensescertifications',
  'licensescertification',
]);

function normalizeSectionToken(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function expandListSegments(value, { treatAndAsSeparator = false } = {}) {
  const segments = [];
  const queue = [value];
  const commaRegex = /[,;|]/;
  const andRegex = /\s+(?:and|&)\s+/i;

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const trimmed = current.trim();
    if (!trimmed) continue;

    let splitPerformed = false;

    if (commaRegex.test(trimmed)) {
      const parts = trimmed
        .split(commaRegex)
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (parts.length > 1) {
        parts.forEach((part) => queue.push(part));
        splitPerformed = true;
      }
    }

    if (
      !splitPerformed &&
      treatAndAsSeparator &&
      !/[.!?]/.test(trimmed) &&
      andRegex.test(trimmed)
    ) {
      const parts = trimmed
        .split(andRegex)
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (parts.length > 1) {
        parts.forEach((part) => queue.push(part));
        splitPerformed = true;
      }
    }

    if (!splitPerformed) {
      segments.push(trimmed);
    }
  }

  return segments;
}

function extractDiffLines(text = '', options = {}) {
  const sectionTokens = [];
  if (Array.isArray(options.sectionTokens)) {
    sectionTokens.push(...options.sectionTokens);
  }
  if (typeof options.sectionKey === 'string') {
    sectionTokens.push(options.sectionKey);
  }
  const normalizedTokens = sectionTokens
    .map((token) => normalizeSectionToken(token))
    .filter(Boolean);

  const treatAsList =
    typeof options.treatAsList === 'boolean'
      ? options.treatAsList
      : normalizedTokens.some((token) => LIST_SECTION_TOKENS.has(token));

  const treatAndAsSeparator =
    typeof options.treatAndAsSeparator === 'boolean'
      ? options.treatAndAsSeparator
      : normalizedTokens.some((token) => AND_SPLIT_SECTION_TOKENS.has(token));

  const seen = new Set();
  const lines = [];
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  rawLines.forEach((line) => {
    const normalized = line.replace(/^[•*-]\s*/, '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return;
    }

    const segments = treatAsList
      ? expandListSegments(normalized, { treatAndAsSeparator })
      : [normalized];

    segments.forEach((segment) => {
      const cleaned = segment.replace(/\s+/g, ' ').trim();
      if (!cleaned) {
        return;
      }
      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lines.push(cleaned);
    });
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
  changeDetails = [],
  primarySection = ''
) {
  const primaryConfig =
    primarySection && typeof primarySection === 'object'
      ? primarySection
      : { label: typeof primarySection === 'string' ? primarySection : '' };

  const normalizeToken = (value) =>
    typeof value === 'string' ? value.replace(/[^a-z0-9]/gi, '').toLowerCase() : '';

  const collectSectionTokens = (...values) =>
    values
      .flat()
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter(Boolean);

  const primaryLabel = typeof primaryConfig?.label === 'string' ? primaryConfig.label : '';
  const primaryKey = typeof primaryConfig?.key === 'string' ? primaryConfig.key : '';
  const normalizedPrimaryLabel = normalizeToken(primaryLabel);
  const normalizedPrimaryKey = normalizeToken(primaryKey);

  const buildFallbackEntry = (sectionName = '') => {
    const fallbackSectionLabel = typeof sectionName === 'string' ? sectionName : '';
    const added = [];
    const removed = [];
    const tokenCandidates = collectSectionTokens(
      fallbackSectionLabel,
      primaryLabel,
      primaryKey
    );
    const beforeLines = extractDiffLines(beforeText, { sectionTokens: tokenCandidates });
    const afterLines = extractDiffLines(afterText, { sectionTokens: tokenCandidates });
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

    return {
      section: fallbackSectionLabel,
      added,
      removed,
      reason,
    };
  };

  if (Array.isArray(changeDetails) && changeDetails.length) {
    const entriesWithMeta = changeDetails.map((detail) => {
      const before = typeof detail?.before === 'string' ? detail.before : '';
      const after = typeof detail?.after === 'string' ? detail.after : '';
      const tokenCandidates = collectSectionTokens(
        detail?.section,
        detail?.label,
        detail?.key,
        detail?.sectionTokens
      );
      const beforeLines = extractDiffLines(before, { sectionTokens: tokenCandidates });
      const afterLines = extractDiffLines(after, { sectionTokens: tokenCandidates });
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

      const sectionLabel = typeof detail?.section === 'string'
        ? detail.section
        : typeof detail?.label === 'string'
          ? detail.label
          : typeof detail?.key === 'string'
            ? detail.key
            : '';
      const detailKey = typeof detail?.key === 'string' ? detail.key : '';
      const detailLabel = typeof detail?.label === 'string' ? detail.label : sectionLabel;

      return {
        entry: {
          section: sectionLabel,
          added,
          removed,
          reason: reasons,
        },
        tokens: {
          section: normalizeToken(sectionLabel),
          key: normalizeToken(detailKey),
          label: normalizeToken(detailLabel),
        },
      };
    });

    let matchedPrimary = false;
    let matchIndex = -1;
    if (normalizedPrimaryLabel || normalizedPrimaryKey) {
      matchIndex = entriesWithMeta.findIndex(({ tokens }) => {
        if (!tokens) return false;
        if (normalizedPrimaryLabel) {
          if (tokens.section === normalizedPrimaryLabel) return true;
          if (tokens.label === normalizedPrimaryLabel) return true;
        }
        if (normalizedPrimaryKey) {
          if (tokens.key === normalizedPrimaryKey) return true;
          if (!tokens.key && tokens.section === normalizedPrimaryKey) return true;
        }
        return false;
      });

      if (matchIndex >= 0) {
        matchedPrimary = true;
      }
      if (matchIndex > 0) {
        const [match] = entriesWithMeta.splice(matchIndex, 1);
        entriesWithMeta.unshift(match);
      }
    }

    if (!matchedPrimary && (primaryLabel || primaryKey)) {
      const fallbackSectionName = primaryLabel || primaryKey;
      entriesWithMeta.unshift({
        entry: buildFallbackEntry(fallbackSectionName),
        tokens: {
          section: normalizeToken(fallbackSectionName),
          key: normalizedPrimaryKey,
          label: normalizedPrimaryLabel,
        },
      });
    }

    return entriesWithMeta.map(({ entry }) => entry);
  }

  const fallbackSection = primaryLabel || primaryKey || '';

  return [buildFallbackEntry(fallbackSection)];
}

const CHANGE_LOG_TRUNCATION_SUFFIX = '…';
const MAX_CHANGE_LOG_DETAIL_LENGTH = 2000;
const MAX_CHANGE_LOG_DIFF_LENGTH = 5000;
const MAX_CHANGE_LOG_RESUME_TEXT_LENGTH = 10000;
const MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH = 20000;
const MAX_DYNAMO_ITEM_BYTES = 400 * 1024;
const CHANGE_LOG_DYNAMO_SIZE_BUDGET = 350 * 1024;
const CHANGE_LOG_FIELD_LIMITS = Object.freeze({
  detail: MAX_CHANGE_LOG_DETAIL_LENGTH,
  diff: MAX_CHANGE_LOG_DIFF_LENGTH,
  resume: MAX_CHANGE_LOG_RESUME_TEXT_LENGTH,
  history: MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH,
  suffix: CHANGE_LOG_TRUNCATION_SUFFIX,
});
const CHANGE_LOG_DYNAMO_LIMITS = Object.freeze({
  maxItemBytes: MAX_DYNAMO_ITEM_BYTES,
  budget: CHANGE_LOG_DYNAMO_SIZE_BUDGET,
});

function normalizeChangeLogString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : '';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value || '').trim();
}

function truncateChangeLogText(text, maxLength, suffix = CHANGE_LOG_TRUNCATION_SUFFIX) {
  if (!text || typeof maxLength !== 'number' || maxLength <= 0) {
    return text || '';
  }
  if (text.length <= maxLength) {
    return text;
  }

  const appliedSuffix = typeof suffix === 'string' ? suffix : '';
  const suffixLength = appliedSuffix.length;
  const sliceLength = Math.max(0, maxLength - suffixLength);

  if (!sliceLength) {
    return appliedSuffix ? appliedSuffix.slice(0, maxLength) : text.slice(0, maxLength);
  }

  return `${text.slice(0, sliceLength)}${appliedSuffix}`;
}

function normalizeChangeLogText(value, maxLength) {
  const text = normalizeChangeLogString(value);
  if (!text) {
    return '';
  }
  if (typeof maxLength !== 'number') {
    return text;
  }
  return truncateChangeLogText(text, maxLength);
}

function normalizeChangeLogList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeChangeLogString(item))
      .filter(Boolean);
  }
  const text = normalizeChangeLogString(value);
  return text ? [text] : [];
}

function normalizeChangeLogSegment(segment = {}) {
  if (!segment || typeof segment !== 'object') {
    return null;
  }

  const section = normalizeChangeLogString(segment.section || segment.label || segment.key);
  const added = normalizeChangeLogList(segment.added);
  const removed = normalizeChangeLogList(segment.removed);
  const reason = normalizeChangeLogList(segment.reason);

  if (!section && !added.length && !removed.length && !reason.length) {
    return null;
  }

  return {
    section,
    added,
    removed,
    reason,
  };
}

function normalizeChangeLogItemizedChange(change = {}) {
  if (!change || typeof change !== 'object') {
    return null;
  }

  const item = normalizeChangeLogString(change.item || change.value || change.text);
  const changeType = normalizeChangeLogString(change.changeType || change.type);
  const reasons = normalizeChangeLogList(change.reasons || change.reason || change.explanation);

  if (!item || !changeType) {
    return null;
  }

  return {
    item,
    changeType: changeType.toLowerCase(),
    reasons,
  };
}

function normalizeChangeLogCategoryEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const key = normalizeChangeLogString(entry.key);
  const label = normalizeChangeLogString(entry.label);
  const description = normalizeChangeLogString(entry.description);
  const added = normalizeChangeLogList(entry.added);
  const removed = normalizeChangeLogList(entry.removed);
  const reasons = normalizeChangeLogList(entry.reasons || entry.reason);

  if (
    !key &&
    !label &&
    !description &&
    !added.length &&
    !removed.length &&
    !reasons.length
  ) {
    return null;
  }

  return {
    key,
    label,
    description,
    added,
    removed,
    reasons,
  };
}

function parseHistoryContextSource(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  return null;
}

function normalizeChangeLogHistoryContext(input) {
  const source = parseHistoryContextSource(input);
  if (!source) {
    return null;
  }

  const context = {};

  if (source.matchBefore && typeof source.matchBefore === 'object') {
    try {
      context.matchBefore = JSON.parse(JSON.stringify(source.matchBefore));
    } catch (err) {
      context.matchBefore = source.matchBefore;
    }
  }

  if (Array.isArray(source.scoreBreakdownBefore)) {
    try {
      context.scoreBreakdownBefore = JSON.parse(
        JSON.stringify(source.scoreBreakdownBefore)
      );
    } catch (err) {
      context.scoreBreakdownBefore = source.scoreBreakdownBefore;
    }
  }

  if (Array.isArray(source.resumeSkillsBefore)) {
    const skills = source.resumeSkillsBefore
      .map((value) => normalizeChangeLogString(value))
      .filter((value) => value !== '');
    context.resumeSkillsBefore = skills;
  }

  return Object.keys(context).length ? context : null;
}

function stringifyChangeLogHistoryContext(context) {
  if (!context || typeof context !== 'object') {
    return '';
  }
  try {
    const serialized = JSON.stringify(context);
    if (
      typeof MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH === 'number' &&
      MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH > 0 &&
      serialized.length > MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH
    ) {
      return '';
    }
    return serialized;
  } catch (err) {
    return '';
  }
}

function normalizeChangeLogEntryInput(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = normalizeChangeLogString(entry.id);
  if (!id) {
    return null;
  }

  const type = normalizeChangeLogString(entry.type);
  const title = normalizeChangeLogString(entry.title);
  const detail = normalizeChangeLogText(
    entry.detail || entry.explanation,
    MAX_CHANGE_LOG_DETAIL_LENGTH
  );
  const label = normalizeChangeLogString(entry.label);
  const before = normalizeChangeLogText(entry.before, MAX_CHANGE_LOG_DIFF_LENGTH);
  const after = normalizeChangeLogText(entry.after, MAX_CHANGE_LOG_DIFF_LENGTH);
  const resumeBeforeText = normalizeChangeLogText(
    entry.resumeBeforeText || entry.resumeBeforeFull || entry.previousResumeText,
    MAX_CHANGE_LOG_RESUME_TEXT_LENGTH
  );
  const resumeAfterText = normalizeChangeLogText(
    entry.resumeAfterText || entry.resumeAfterFull || entry.updatedResumeText,
    MAX_CHANGE_LOG_RESUME_TEXT_LENGTH
  );
  const addedItems = normalizeChangeLogList(entry.addedItems);
  const removedItems = normalizeChangeLogList(entry.removedItems);
  const summarySegments = Array.isArray(entry.summarySegments)
    ? entry.summarySegments.map((segment) => normalizeChangeLogSegment(segment)).filter(Boolean)
    : [];
  const itemizedChanges = Array.isArray(entry.itemizedChanges)
    ? entry.itemizedChanges
        .map((change) => normalizeChangeLogItemizedChange(change))
        .filter(Boolean)
    : [];
  const categoryChangelog = Array.isArray(entry.categoryChangelog)
    ? entry.categoryChangelog
        .map((category) => normalizeChangeLogCategoryEntry(category))
        .filter(Boolean)
    : [];
  const acceptedAt = normalizeChangeLogString(entry.acceptedAt);
  const historyContext = normalizeChangeLogHistoryContext(
    entry.historyContext || entry.resumeHistoryContext || entry.historySnapshot
  );

  let scoreDelta = null;
  const rawDelta = entry.scoreDelta;
  if (typeof rawDelta === 'number' && Number.isFinite(rawDelta)) {
    scoreDelta = rawDelta;
  } else if (typeof rawDelta === 'string') {
    const parsed = Number.parseFloat(rawDelta);
    if (Number.isFinite(parsed)) {
      scoreDelta = parsed;
    }
  }

  return {
    id,
    type,
    title,
    detail,
    label,
    before,
    after,
    resumeBeforeText,
    resumeAfterText,
    summarySegments,
    addedItems,
    removedItems,
    itemizedChanges,
    categoryChangelog,
    scoreDelta,
    acceptedAt,
    historyContext,
  };
}

function parseDynamoStringList(attribute) {
  if (!attribute || !Array.isArray(attribute.L)) {
    return [];
  }
  return attribute.L.map((item) => normalizeChangeLogString(item?.S)).filter(Boolean);
}

function parseDynamoSummarySegments(attribute) {
  if (!attribute || !Array.isArray(attribute.L)) {
    return [];
  }
  return attribute.L.map((item) => {
    if (!item || !item.M) {
      return null;
    }
    const map = item.M;
    const section = normalizeChangeLogString(map.section?.S);
    const added = parseDynamoStringList(map.added);
    const removed = parseDynamoStringList(map.removed);
    const reason = parseDynamoStringList(map.reason);
    if (!section && !added.length && !removed.length && !reason.length) {
      return null;
    }
    return {
      section,
      added,
      removed,
      reason,
    };
  }).filter(Boolean);
}

function parseDynamoItemizedChanges(attribute) {
  if (!attribute || !Array.isArray(attribute.L)) {
    return [];
  }
  return attribute.L.map((item) => {
    if (!item || !item.M) {
      return null;
    }
    const map = item.M;
    const itemValue = normalizeChangeLogString(map.item?.S);
    const changeType = normalizeChangeLogString(map.changeType?.S);
    const reasons = parseDynamoStringList(map.reasons);
    if (!itemValue || !changeType) {
      return null;
    }
    return {
      item: itemValue,
      changeType: changeType.toLowerCase(),
      reasons,
    };
  }).filter(Boolean);
}

function parseDynamoCategoryChangelog(attribute) {
  if (!attribute || !Array.isArray(attribute.L)) {
    return [];
  }

  return attribute.L.map((item) => {
    if (!item || !item.M) {
      return null;
    }

    const map = item.M;
    const key = normalizeChangeLogString(map.key?.S);
    const label = normalizeChangeLogString(map.label?.S);
    const description = normalizeChangeLogString(map.description?.S);
    const added = parseDynamoStringList(map.added);
    const removed = parseDynamoStringList(map.removed);
    const reasons = parseDynamoStringList(map.reasons);

    if (!key && !label && !description && !added.length && !removed.length && !reasons.length) {
      return null;
    }

    return {
      key,
      label,
      description,
      added,
      removed,
      reasons,
    };
  }).filter(Boolean);
}

function parseDynamoChangeLog(attribute) {
  if (!attribute || !Array.isArray(attribute.L)) {
    return [];
  }
  return attribute.L.map((item) => {
    if (!item || !item.M) {
      return null;
    }
    const map = item.M;
    const id = normalizeChangeLogString(map.id?.S);
    if (!id) {
      return null;
    }
    const type = normalizeChangeLogString(map.type?.S);
    const title = normalizeChangeLogString(map.title?.S);
    const detail = normalizeChangeLogString(map.detail?.S);
    const label = normalizeChangeLogString(map.label?.S);
    const before = normalizeChangeLogString(map.before?.S);
    const after = normalizeChangeLogString(map.after?.S);
    const resumeBeforeText = normalizeChangeLogString(map.resumeBeforeText?.S);
    const resumeAfterText = normalizeChangeLogString(map.resumeAfterText?.S);
    const addedItems = parseDynamoStringList(map.addedItems);
    const removedItems = parseDynamoStringList(map.removedItems);
    const summarySegments = parseDynamoSummarySegments(map.summarySegments);
    const itemizedChanges = parseDynamoItemizedChanges(map.itemizedChanges);
    const categoryChangelog = parseDynamoCategoryChangelog(map.categoryChangelog);
    const acceptedAt = normalizeChangeLogString(map.acceptedAt?.S);
    const scoreDelta = map.scoreDelta && map.scoreDelta.N ? Number(map.scoreDelta.N) : null;
    const historyContext = parseHistoryContextSource(
      normalizeChangeLogString(map.historyContext?.S)
    );

    return {
      id,
      type,
      title,
      detail,
      label,
      before,
      after,
      resumeBeforeText,
      resumeAfterText,
      summarySegments,
      addedItems,
      removedItems,
      itemizedChanges,
      categoryChangelog,
      scoreDelta: Number.isFinite(scoreDelta) ? scoreDelta : null,
      acceptedAt,
      historyContext,
    };
  }).filter(Boolean);
}

function toDynamoStringList(values = []) {
  if (!Array.isArray(values) || !values.length) {
    return undefined;
  }
  const normalized = values
    .map((value) => normalizeChangeLogString(value))
    .filter(Boolean);
  if (!normalized.length) {
    return undefined;
  }
  return { L: normalized.map((value) => ({ S: value })) };
}

function toDynamoSummarySegments(segments = []) {
  if (!Array.isArray(segments) || !segments.length) {
    return undefined;
  }
  const normalized = segments
    .map((segment) => normalizeChangeLogSegment(segment))
    .filter(Boolean);
  if (!normalized.length) {
    return undefined;
  }
  return {
    L: normalized.map((segment) => {
      const map = {};
      if (segment.section) {
        map.section = { S: segment.section };
      }
      const added = toDynamoStringList(segment.added);
      if (added) {
        map.added = added;
      }
      const removed = toDynamoStringList(segment.removed);
      if (removed) {
        map.removed = removed;
      }
      const reason = toDynamoStringList(segment.reason);
      if (reason) {
        map.reason = reason;
      }
      return { M: map };
    }),
  };
}

function toDynamoItemizedChanges(changes = []) {
  if (!Array.isArray(changes) || !changes.length) {
    return undefined;
  }
  const normalized = changes
    .map((change) => normalizeChangeLogItemizedChange(change))
    .filter(Boolean);
  if (!normalized.length) {
    return undefined;
  }
  return {
    L: normalized.map((change) => {
      const map = {
        item: { S: change.item },
      };
      if (change.changeType) {
        map.changeType = { S: change.changeType };
      }
      const reasons = toDynamoStringList(change.reasons);
      if (reasons) {
        map.reasons = reasons;
      }
      return { M: map };
    }),
  };
}

function toDynamoCategoryChangelog(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return undefined;
  }

  const normalized = entries
    .map((entry) => normalizeChangeLogCategoryEntry(entry))
    .filter(Boolean);

  if (!normalized.length) {
    return undefined;
  }

  return {
    L: normalized.map((entry) => {
      const map = {};
      if (entry.key) {
        map.key = { S: entry.key };
      }
      if (entry.label) {
        map.label = { S: entry.label };
      }
      if (entry.description) {
        map.description = { S: entry.description };
      }
      const added = toDynamoStringList(entry.added);
      if (added) {
        map.added = added;
      }
      const removed = toDynamoStringList(entry.removed);
      if (removed) {
        map.removed = removed;
      }
      const reasons = toDynamoStringList(entry.reasons);
      if (reasons) {
        map.reasons = reasons;
      }

      return { M: map };
    }),
  };
}

function serializeChangeLogEntries(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const normalized = normalizeChangeLogEntryInput(entry);
      if (!normalized) {
        return null;
      }

      const map = {
        id: { S: normalized.id },
      };
      if (normalized.type) {
        map.type = { S: normalized.type };
      }
      if (normalized.title) {
        map.title = { S: normalized.title };
      }
      if (normalized.detail) {
        map.detail = { S: normalized.detail };
      }
      if (normalized.label) {
        map.label = { S: normalized.label };
      }
      if (normalized.before) {
        map.before = { S: normalized.before };
      }
      if (normalized.after) {
        map.after = { S: normalized.after };
      }
      if (normalized.resumeBeforeText) {
        map.resumeBeforeText = { S: normalized.resumeBeforeText };
      }
      if (normalized.resumeAfterText) {
        map.resumeAfterText = { S: normalized.resumeAfterText };
      }
      const addedItems = toDynamoStringList(normalized.addedItems);
      if (addedItems) {
        map.addedItems = addedItems;
      }
      const removedItems = toDynamoStringList(normalized.removedItems);
      if (removedItems) {
        map.removedItems = removedItems;
      }
      const summarySegments = toDynamoSummarySegments(normalized.summarySegments);
      if (summarySegments) {
        map.summarySegments = summarySegments;
      }
      const itemizedChanges = toDynamoItemizedChanges(normalized.itemizedChanges);
      if (itemizedChanges) {
        map.itemizedChanges = itemizedChanges;
      }
      const categoryChangelog = toDynamoCategoryChangelog(normalized.categoryChangelog);
      if (categoryChangelog) {
        map.categoryChangelog = categoryChangelog;
      }
      if (typeof normalized.scoreDelta === 'number' && Number.isFinite(normalized.scoreDelta)) {
        map.scoreDelta = { N: String(normalized.scoreDelta) };
      }
      const acceptedAt = normalizeChangeLogString(normalized.acceptedAt);
      if (acceptedAt) {
        map.acceptedAt = { S: acceptedAt };
      }
      const historyContextString = stringifyChangeLogHistoryContext(
        normalized.historyContext
      );
      if (historyContextString) {
        map.historyContext = { S: historyContextString };
      }

      return { M: map };
    })
    .filter(Boolean);
}

function cloneSerializedChangeLogEntries(serializedEntries = []) {
  if (!Array.isArray(serializedEntries)) {
    return [];
  }

  return serializedEntries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || !entry.M) {
        return null;
      }

      const clonedMap = Object.entries(entry.M).reduce((acc, [key, value]) => {
        if (value && typeof value === 'object') {
          acc[key] = JSON.parse(JSON.stringify(value));
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});

      return { M: clonedMap };
    })
    .filter(Boolean);
}

function calculateDynamoAttributeSize(attribute) {
  try {
    return Buffer.byteLength(JSON.stringify(attribute));
  } catch (err) {
    return Number.MAX_SAFE_INTEGER;
  }
}

function enforceChangeLogDynamoSize(serializedEntries = [], {
  budget = CHANGE_LOG_DYNAMO_SIZE_BUDGET,
  hardLimit = MAX_DYNAMO_ITEM_BYTES,
} = {}) {
  if (!Array.isArray(serializedEntries) || !serializedEntries.length) {
    return [];
  }

  const safeBudget = Math.min(Math.max(0, budget || 0), hardLimit || MAX_DYNAMO_ITEM_BYTES);
  const wrapper = { L: cloneSerializedChangeLogEntries(serializedEntries) };
  let size = calculateDynamoAttributeSize(wrapper);

  if (size <= safeBudget) {
    return wrapper.L;
  }

  const trimmingStages = [
    ['historyContext'],
    ['resumeBeforeText', 'resumeAfterText'],
    ['before', 'after'],
    ['detail'],
    ['summarySegments', 'itemizedChanges', 'categoryChangelog'],
    ['addedItems', 'removedItems'],
  ];

  const recalculateSize = () => {
    size = calculateDynamoAttributeSize(wrapper);
    return size;
  };

  for (const fields of trimmingStages) {
    if (wrapper.L.length === 0 || size <= safeBudget) {
      break;
    }

    for (let index = wrapper.L.length - 1; index >= 0 && size > safeBudget; index -= 1) {
      const entry = wrapper.L[index];
      if (!entry || !entry.M) {
        continue;
      }

      let changed = false;
      for (const field of fields) {
        if (entry.M[field]) {
          delete entry.M[field];
          changed = true;
        }
      }

      if (changed) {
        recalculateSize();
      }
    }
  }

  while (wrapper.L.length && size > safeBudget) {
    wrapper.L.pop();
    recalculateSize();
  }

  return wrapper.L;
}

async function handleImprovementRequest(type, req, res) {
  const payload = req.body || {};
  const jobIdInput = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobIdInput) {
    return sendError(
      res,
      400,
      'JOB_ID_REQUIRED',
      'jobId is required after scoring before requesting improvements.'
    );
  }

  const linkedinProfileUrlInput =
    typeof payload.linkedinProfileUrl === 'string' ? payload.linkedinProfileUrl.trim() : '';

  req.jobId = jobIdInput;
  res.locals.jobId = jobIdInput;
  captureUserContext(req, res);
  const requestId = res.locals.requestId;
  const improvementSessionSegment =
    sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
    sanitizeS3KeyComponent(`session-${createIdentifier()}`);

  const logContext = {
    requestId,
    jobId: jobIdInput,
    type,
    sessionId: improvementSessionSegment,
  };

  const profileIdentifier =
    resolveProfileIdentifier({
      linkedinProfileUrl: linkedinProfileUrlInput,
      userId: res.locals.userId,
      jobId: jobIdInput,
    }) || jobIdInput;
  const storedLinkedIn = normalizePersonalData(profileIdentifier);
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';
  let dynamo = null;
  let existingRecord = {};
  let storedBucket = '';
  let originalUploadKey = '';
  let logKey = '';
  let existingChangeLog = [];
  let jobStatus = '';
  let sessionChangeLogKey = '';
  let targetBucket = '';
  let improvementMetadataKey = '';

  if (!isTestEnvironment) {
    dynamo = new DynamoDBClient({ region });

    try {
      await ensureDynamoTableExists({ dynamo, tableName });
    } catch (err) {
      logStructured('error', 'improvement_table_ensure_failed', {
        ...logContext,
        error: serializeError(err),
      });
      return sendError(
        res,
        500,
        'DYNAMO_TABLE_UNAVAILABLE',
        'Unable to verify the upload context for improvements.'
      );
    }

    try {
      const record = await dynamo.send(
        new GetItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          ProjectionExpression:
            'jobId, status, s3Bucket, s3Key, changeLog, sessionChangeLogKey',
        })
      );
      const item = record.Item || {};
      if (!item.jobId || item.jobId.S !== jobIdInput) {
        return sendError(
          res,
          404,
          'JOB_CONTEXT_NOT_FOUND',
          'Upload your resume again to start a new improvement session.'
        );
      }
      jobStatus = item?.status?.S || '';
      existingRecord = item;
      storedBucket = item.s3Bucket?.S || '';
      originalUploadKey = item.s3Key?.S || '';
      sessionChangeLogKey = deriveSessionChangeLogKey({
        changeLogKey: item.sessionChangeLogKey?.S,
        originalUploadKey,
      });
      const existingPrefix = originalUploadKey
        ? originalUploadKey.replace(/[^/]+$/, '')
        : '';
      if (existingPrefix) {
        logKey = `${existingPrefix}logs/processing.jsonl`;
      }
      try {
        existingChangeLog = await loadSessionChangeLog({
          s3: s3Client,
          bucket: storedBucket,
          key: sessionChangeLogKey,
          fallbackEntries: parseDynamoChangeLog(item.changeLog),
        });
      } catch (loadErr) {
        logStructured('error', 'improvement_change_log_load_failed', {
          ...logContext,
          bucket: storedBucket,
          key: sessionChangeLogKey,
          error: serializeError(loadErr),
        });
        return sendError(
          res,
          500,
          'CHANGE_LOG_LOAD_FAILED',
          'Unable to load the existing change log for this session.'
        );
      }
    } catch (err) {
      logStructured('error', 'improvement_job_context_lookup_failed', {
        ...logContext,
        error: serializeError(err),
      });
      return sendError(
        res,
        500,
        'JOB_CONTEXT_LOOKUP_FAILED',
        'Unable to continue without the prior scoring context.'
      );
    }
  } else {
    jobStatus = 'scored';
  }

  if (jobStatus && jobStatus !== 'scored' && jobStatus !== 'completed') {
    return sendError(
      res,
      409,
      'JOB_NOT_READY',
      'Wait for ATS scoring to finish before requesting improvements.'
    );
  }

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
  const linkedinData =
    typeof payload.linkedinData === 'object' && payload.linkedinData
      ? payload.linkedinData
      : {};
  const credlyProfileUrl =
    typeof payload.credlyProfileUrl === 'string' ? payload.credlyProfileUrl.trim() : '';
  const credlyCertifications = Array.isArray(payload.credlyCertifications)
    ? payload.credlyCertifications
    : [];
  const credlyStatus =
    typeof payload.credlyStatus === 'object' && payload.credlyStatus
      ? {
          attempted:
            typeof payload.credlyStatus.attempted === 'boolean'
              ? payload.credlyStatus.attempted
              : Boolean(credlyProfileUrl),
          success: Boolean(payload.credlyStatus.success),
          manualEntryRequired: Boolean(payload.credlyStatus.manualEntryRequired),
          message:
            typeof payload.credlyStatus.message === 'string'
              ? payload.credlyStatus.message
              : '',
        }
      : {
          attempted: Boolean(credlyProfileUrl),
          success: false,
          manualEntryRequired: false,
          message: '',
        };

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
      'improve-summary': SUMMARY_SECTION_PATTERN,
      'add-missing-skills': SKILLS_SECTION_PATTERN,
      'align-experience': EXPERIENCE_SECTION_PATTERN,
      'improve-certifications': CERTIFICATIONS_SECTION_PATTERN,
      'improve-projects': PROJECTS_SECTION_PATTERN,
      'improve-highlights': HIGHLIGHTS_SECTION_PATTERN,
    };
    const excerptPattern = sectionPatterns[type];
    const normalizedBeforeExcerpt = excerptPattern
      ? normalizeSectionExcerpt(resumeText, excerptPattern, result.beforeExcerpt)
      : result.beforeExcerpt;
    const normalizedAfterExcerpt = excerptPattern
      ? normalizeSectionExcerpt(result.updatedResume, excerptPattern, result.afterExcerpt)
      : result.afterExcerpt;

    const updatedResumeText = typeof result.updatedResume === 'string' ? result.updatedResume : resumeText;
    const baselineResumeSkillsList = extractResumeSkills(resumeText);
    const updatedResumeSkillsList = extractResumeSkills(updatedResumeText);
    const overallBeforeMatch = calculateMatchScore(jobSkills, baselineResumeSkillsList);
    const overallAfterMatch = calculateMatchScore(jobSkills, updatedResumeSkillsList);
    const overallBeforeBreakdown = buildScoreBreakdown(resumeText, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: baselineResumeSkillsList,
    });
    const overallAfterBreakdown = buildScoreBreakdown(updatedResumeText, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: updatedResumeSkillsList,
    });
    const atsBefore = scoreBreakdownToArray(overallBeforeBreakdown);
    const atsAfter = scoreBreakdownToArray(overallAfterBreakdown);
    const overallScoreDelta = overallAfterMatch.score - overallBeforeMatch.score;

    const sectionContext = resolveImprovementSectionContext(type, resumeText, updatedResumeText);
    const sectionBeforeSkills = extractResumeSkills(sectionContext.beforeText);
    const sectionAfterSkills = extractResumeSkills(sectionContext.afterText);
    const sectionBeforeMatch = calculateMatchScore(jobSkills, sectionBeforeSkills);
    const sectionAfterMatch = calculateMatchScore(jobSkills, sectionAfterSkills);
    const sectionScoreDelta = sectionAfterMatch.score - sectionBeforeMatch.score;

    const normalizeSkillSet = (skills = []) =>
      new Set((Array.isArray(skills) ? skills : []).map((skill) => skill.toLowerCase()).filter(Boolean));
    const beforeMissingOverall = Array.isArray(overallBeforeMatch.newSkills) ? overallBeforeMatch.newSkills : [];
    const afterMissingOverall = Array.isArray(overallAfterMatch.newSkills) ? overallAfterMatch.newSkills : [];
    const afterMissingOverallSet = normalizeSkillSet(afterMissingOverall);
    const coveredSkillsOverall = beforeMissingOverall.filter(
      (skill) => !afterMissingOverallSet.has(skill.toLowerCase())
    );

    const beforeSectionMissing = Array.isArray(sectionBeforeMatch.newSkills) ? sectionBeforeMatch.newSkills : [];
    const afterSectionMissing = Array.isArray(sectionAfterMatch.newSkills) ? sectionAfterMatch.newSkills : [];
    const afterSectionMissingSet = normalizeSkillSet(afterSectionMissing);
    const coveredSkillsSection = beforeSectionMissing.filter(
      (skill) => !afterSectionMissingSet.has(skill.toLowerCase())
    );

    const baselineDesignationTitle =
      typeof payload.currentTitle === 'string' && payload.currentTitle.trim()
        ? payload.currentTitle.trim()
        : typeof payload.originalTitle === 'string' && payload.originalTitle.trim()
          ? payload.originalTitle.trim()
          : extractDesignationLine(resumeText);
    const jobTitleInput = typeof payload.jobTitle === 'string' ? payload.jobTitle.trim() : '';
    const updatedDesignationTitle =
      type === 'change-designation' || type === 'enhance-all'
        ? jobTitleInput || extractDesignationLine(updatedResumeText) || baselineDesignationTitle
        : sectionContext.key === 'designation' && sectionContext.afterText
          ? sectionContext.afterText
          : baselineDesignationTitle;

    let selectionInsights;
    try {
      selectionInsights = buildSelectionInsights({
        jobTitle: payload.jobTitle || payload.targetTitle || '',
        originalTitle: baselineDesignationTitle,
        modifiedTitle: updatedDesignationTitle,
        jobDescriptionText: jobDescription,
        bestMatch: { ...overallAfterMatch },
        originalMatch: { ...overallBeforeMatch },
        missingSkills: afterMissingOverall,
        addedSkills: coveredSkillsOverall,
        scoreBreakdown: overallAfterBreakdown,
        baselineScoreBreakdown: overallBeforeBreakdown,
        resumeExperience: extractExperience(updatedResumeText),
        linkedinExperience: [],
        knownCertificates,
        certificateSuggestions: manualCertificates.map((cert) => cert?.name).filter(Boolean),
        manualCertificatesRequired: Boolean(payload.manualCertificatesRequired),
      });
    } catch (err) {
      logStructured('warn', 'targeted_improvement_rescore_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }

    const selectionProbabilityBefore =
      typeof selectionInsights?.before?.probability === 'number'
        ? selectionInsights.before.probability
        : null;
    const selectionProbabilityAfter =
      typeof selectionInsights?.after?.probability === 'number'
        ? selectionInsights.after.probability
        : typeof selectionInsights?.probability === 'number'
          ? selectionInsights.probability
          : null;
    const selectionProbabilityDelta =
      Number.isFinite(selectionProbabilityBefore) && Number.isFinite(selectionProbabilityAfter)
        ? selectionProbabilityAfter - selectionProbabilityBefore
        : null;

    const normalizedSelectionProbabilityBefore = Number.isFinite(selectionProbabilityBefore)
      ? selectionProbabilityBefore
      : 0;
    const normalizedSelectionProbabilityAfter = Number.isFinite(selectionProbabilityAfter)
      ? selectionProbabilityAfter
      : normalizedSelectionProbabilityBefore;
    const normalizedSelectionProbabilityDelta = Number.isFinite(selectionProbabilityDelta)
      ? selectionProbabilityDelta
      : normalizedSelectionProbabilityAfter - normalizedSelectionProbabilityBefore;

    const rescoreSummary = {
      section: {
        key: sectionContext.key,
        label: sectionContext.label,
        before: {
          score: sectionBeforeMatch.score,
          missingSkills: beforeSectionMissing,
        },
        after: {
          score: sectionAfterMatch.score,
          missingSkills: afterSectionMissing,
        },
        delta: {
          score: sectionScoreDelta,
          coveredSkills: coveredSkillsSection,
        },
      },
      overall: {
        before: {
          score: overallBeforeMatch.score,
          missingSkills: beforeMissingOverall,
          atsSubScores: atsBefore,
          scoreBreakdown: overallBeforeBreakdown,
        },
        after: {
          score: overallAfterMatch.score,
          missingSkills: afterMissingOverall,
          atsSubScores: atsAfter,
          scoreBreakdown: overallAfterBreakdown,
        },
        delta: {
          score: overallScoreDelta,
          coveredSkills: coveredSkillsOverall,
        },
      },
      selectionProbability: {
        before: normalizedSelectionProbabilityBefore,
        after: normalizedSelectionProbabilityAfter,
        delta: normalizedSelectionProbabilityDelta,
        beforeLevel: selectionInsights?.before?.level || null,
        afterLevel: selectionInsights?.after?.level || selectionInsights?.level || null,
      },
    };

    if (selectionInsights) {
      rescoreSummary.selectionInsights = {
        probability: selectionInsights.probability,
        level: selectionInsights.level,
        message: selectionInsights.message,
        before: selectionInsights.before,
        after: selectionInsights.after,
      };
    }

    let assetUrls = [];
    let assetUrlExpiry = 0;
    let templateContextOutput;

    try {
      let secrets;
      try {
        secrets = getSecrets();
      } catch (configErr) {
        const missing = extractMissingConfig(configErr);
        logStructured('error', 'targeted_improvement_configuration_failed', {
          ...logContext,
          error: serializeError(configErr),
          missing,
        });
        sendError(
          res,
          500,
          'CONFIGURATION_ERROR',
          describeConfigurationError(configErr),
          missing.length ? { missing } : undefined
        );
        return;
      }

      targetBucket = secrets.S3_BUCKET || storedBucket;
      const geminiApiKey = secrets.GEMINI_API_KEY;
      if (!targetBucket) {
        logStructured('error', 'targeted_improvement_bucket_missing', logContext);
        sendError(
          res,
          500,
          'STORAGE_UNAVAILABLE',
          S3_STORAGE_ERROR_MESSAGE
        );
        return;
      }

      const applicantName = extractName(updatedResumeText);
      const sanitizedName = sanitizeName(applicantName) || 'candidate';
      const jobKeySegment = sanitizeJobSegment(jobIdInput);
      const dateSegment = new Date().toISOString().slice(0, 10);
      const ownerSegment = resolveDocumentOwnerSegment({
        userId: res.locals.userId,
        sanitizedName,
      });
      const prefix = originalUploadKey
        ? originalUploadKey.replace(/[^/]+$/, '')
        : buildDocumentSessionPrefix({
            ownerSegment,
            dateSegment,
            jobSegment: jobKeySegment,
            sessionSegment: improvementSessionSegment,
          });
      const effectiveOriginalUploadKey = originalUploadKey || `${prefix}original.pdf`;
      const effectiveLogKey = logKey || `${prefix}logs/processing.jsonl`;
      improvementMetadataKey = `${prefix}logs/log.json`;

      let templateContextInput =
        typeof payload.templateContext === 'object' && payload.templateContext
          ? { ...payload.templateContext }
          : {};
      templateContextInput.templateHistory = normalizeTemplateHistory(
        templateContextInput.templateHistory,
        [
          templateContextInput.selectedTemplate,
          templateContextInput.template1,
          templateContextInput.template2,
        ]
      );

      const selection = selectTemplates({
        defaultCvTemplate: templateContextInput.template1 || CV_TEMPLATES[0],
        defaultClTemplate: templateContextInput.coverTemplate1 || CL_TEMPLATES[0],
        template1: templateContextInput.template1,
        template2: templateContextInput.template2,
        coverTemplate1: templateContextInput.coverTemplate1,
        coverTemplate2: templateContextInput.coverTemplate2,
        cvTemplates: templateContextInput.templates,
        clTemplates: templateContextInput.coverTemplates,
        preferredTemplate:
          templateContextInput.selectedTemplate || templateContextInput.template1,
      });

      const templateParamConfig = parseTemplateParamsConfig(payload.templateParams);

      const enhancedDocs = await generateEnhancedDocumentsResponse({
        res,
        s3: s3Client,
        dynamo,
        tableName,
        bucket: targetBucket,
        logKey: effectiveLogKey,
        jobId: jobIdInput,
        requestId,
        logContext: { ...logContext, route: `improvement:${type}` },
        resumeText: updatedResumeText,
        originalResumeTextInput: resumeText,
        jobDescription,
        jobSkills,
        resumeSkills: updatedResumeSkillsList,
        originalMatch: overallAfterMatch,
        linkedinProfileUrl: linkedinProfileUrlInput,
        linkedinData,
        credlyProfileUrl,
        credlyCertifications,
        credlyStatus,
        manualCertificates,
        templateContextInput,
        templateParamConfig,
        applicantName,
        sanitizedName,
        storedLinkedIn,
        originalUploadKey: effectiveOriginalUploadKey,
        selection,
        geminiApiKey,
        changeLogEntries: existingChangeLog,
        existingRecord,
        userId: res.locals.userId,
      });

      if (!enhancedDocs) {
        return;
      }

      assetUrls = ensureOutputFileUrls(
        Array.isArray(enhancedDocs.urls) ? enhancedDocs.urls : []
      );
      if (assetUrls.length === 0) {
        logStructured('error', 'targeted_improvement_no_valid_urls', {
          ...logContext,
          requestedUrlCount: Array.isArray(enhancedDocs.urls)
            ? enhancedDocs.urls.length
            : 0,
        });
        sendError(
          res,
          500,
          'IMPROVEMENT_DOCUMENT_UNAVAILABLE',
          'Unable to prepare download links for the applied improvement.'
        );
        return;
      }
      templateContextOutput = enhancedDocs.templateContext;
      assetUrlExpiry =
        assetUrls.length > 0
          ? enhancedDocs.urlExpiresInSeconds || URL_EXPIRATION_SECONDS
          : 0;
    } catch (assetErr) {
      logStructured('error', 'targeted_improvement_asset_generation_failed', {
        ...logContext,
        error: serializeError(assetErr),
      });
      sendError(
        res,
        500,
        'IMPROVEMENT_DOCUMENT_GENERATION_FAILED',
        'Unable to generate enhanced documents for the applied improvement.'
      );
      return;
    }

    logStructured('info', 'targeted_improvement_completed', {
      ...logContext,
      confidence: result.confidence,
      appliedSkills: missingSkills.length,
    });
    const improvementConfig = IMPROVEMENT_SECTION_CONFIG[type] || {};

    const responsePayload = {
      success: true,
      type,
      title: IMPROVEMENT_CONFIG[type]?.title || '',
      beforeExcerpt: normalizedBeforeExcerpt,
      afterExcerpt: normalizedAfterExcerpt,
      explanation: result.explanation,
      confidence: result.confidence,
      updatedResume: result.updatedResume,
      missingSkills,
      originalTitle: baselineDesignationTitle || '',
      modifiedTitle: updatedDesignationTitle || '',
      improvementSummary: buildImprovementSummary(
        normalizedBeforeExcerpt,
        normalizedAfterExcerpt,
        result.explanation,
        result.changeDetails,
        improvementConfig
      ),
      rescore: rescoreSummary,
      selectionProbabilityBefore: normalizedSelectionProbabilityBefore,
      selectionProbabilityAfter: normalizedSelectionProbabilityAfter,
      selectionProbabilityDelta: normalizedSelectionProbabilityDelta,
      urlExpiresInSeconds: assetUrlExpiry,
      urls: assetUrls,
    };

    if (templateContextOutput) {
      responsePayload.templateContext = templateContextOutput;
    }

    await updateStageMetadata({
      s3: s3Client,
      bucket: targetBucket,
      metadataKey: improvementMetadataKey,
      jobId: jobIdInput,
      stage: 'improve',
      data: {
        completedAt: new Date().toISOString(),
        improvementType: type,
      },
      logContext,
    });

    return res.json(responsePayload);
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
    sendError(
      res,
      500,
      'CLIENT_UI_UNAVAILABLE',
      'Client application is unavailable. Please try again later or contact support.'
    );
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
  { path: '/api/improve-certifications', type: 'improve-certifications' },
  { path: '/api/improve-projects', type: 'improve-projects' },
  { path: '/api/improve-highlights', type: 'improve-highlights' },
  { path: '/api/enhance-all', type: 'enhance-all' },
];

improvementRoutes.forEach(({ path: routePath, type }) => {
  app.post(routePath, assignJobContext, async (req, res) => {
    await handleImprovementRequest(type, req, res);
  });
});

async function generateEnhancedDocumentsResponse({
  res,
  s3,
  dynamo,
  tableName,
  bucket,
  logKey,
  jobId,
  requestId,
  logContext,
  resumeText,
  originalResumeTextInput,
  jobDescription,
  jobSkills,
  resumeSkills,
  originalMatch,
  linkedinProfileUrl,
  linkedinData = {},
  credlyProfileUrl,
  credlyCertifications = [],
  credlyStatus = {
    attempted: Boolean(credlyProfileUrl),
    success: false,
    manualEntryRequired: false,
    message: '',
  },
  manualCertificates = [],
  templateContextInput = {},
  templateParamConfig,
  applicantName,
  sanitizedName,
  storedLinkedIn,
  originalUploadKey,
  selection,
  geminiApiKey,
  changeLogEntries = [],
  existingRecord = {},
  userId,
  plainPdfFallbackEnabled = false,
}) {
  const isTestEnvironment = process.env.NODE_ENV === 'test';
  if (!bucket) {
    logStructured('error', 'generation_bucket_missing', logContext);
    sendError(
      res,
      500,
      'STORAGE_UNAVAILABLE',
      S3_STORAGE_ERROR_MESSAGE
    );
    return null;
  }

  const artifactCleanupKeys = new Set();
  const staleArtifactKeys = new Set();
  let generationSucceeded = false;
  let cleanupReason = 'aborted';
  let shouldDeleteStaleArtifacts = false;

  const normalizeArtifactKey = (key) => {
    if (typeof key !== 'string') return '';
    const trimmed = key.trim();
    return trimmed;
  };

  const registerArtifactKey = (key) => {
    const normalized = normalizeArtifactKey(key);
    if (!normalized) return;
    artifactCleanupKeys.add(normalized);
    staleArtifactKeys.delete(normalized);
  };

  const registerStaleArtifactKey = (key) => {
    const normalized = normalizeArtifactKey(key);
    if (!normalized) return;
    const originalKey = normalizeArtifactKey(originalUploadKey);
    if (originalKey && normalized === originalKey) {
      return;
    }
    staleArtifactKeys.add(normalized);
  };

  const createCleanupHandler = ({
    keySet,
    structuredEventName,
    failedStructuredEventName,
    logEventName,
  }) => {
    return async (reason) => {
      if (!keySet.size) {
        return;
      }

      const keys = Array.from(keySet);
      keySet.clear();

      const results = await Promise.allSettled(
        keys.map((key) =>
          s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
            })
          )
        )
      );

      const deletedKeys = [];
      const failedDeletes = [];

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const key = keys[index];
        if (result.status === 'fulfilled') {
          deletedKeys.push(key);
        } else {
          failedDeletes.push({ key, error: result.reason });
        }
      }

      if (deletedKeys.length) {
        logStructured('warn', structuredEventName, {
          ...logContext,
          reason,
          deletedKeys,
        });
        if (logKey && logEventName) {
          try {
            await logEvent({
              s3,
              bucket,
              key: logKey,
              jobId,
              event: logEventName,
              metadata: {
                reason,
                deletedCount: deletedKeys.length,
                attemptedCount: keys.length,
              },
            });
          } catch (logErr) {
            logStructured('error', 'generation_cleanup_log_failed', {
              ...logContext,
              cleanupEvent: logEventName,
              error: serializeError(logErr),
            });
          }
        }
      }

      if (failedDeletes.length) {
        logStructured('error', failedStructuredEventName, {
          ...logContext,
          reason,
          failures: failedDeletes.map((entry) => ({
            key: entry.key,
            error: serializeError(entry.error),
          })),
        });
      }
    };
  };

  const cleanupArtifacts = createCleanupHandler({
    keySet: artifactCleanupKeys,
    structuredEventName: 'generation_artifacts_cleaned_up',
    failedStructuredEventName: 'generation_artifact_cleanup_failed',
    logEventName: 'generation_artifacts_cleaned_up',
  });

  const cleanupStaleArtifacts = createCleanupHandler({
    keySet: staleArtifactKeys,
    structuredEventName: 'generation_stale_artifacts_cleaned_up',
    failedStructuredEventName: 'generation_stale_artifact_cleanup_failed',
    logEventName: 'generation_stale_artifacts_cleaned_up',
  });

  try {
  const sessionChangeLogKey = deriveSessionChangeLogKey({
    changeLogKey: existingRecord?.sessionChangeLogKey?.S,
    originalUploadKey,
  });

  const readExistingArtifactKey = (field) => {
    const attribute = existingRecord?.[field];
    if (attribute && typeof attribute.S === 'string') {
      return attribute.S.trim();
    }
    return '';
  };

  const existingArtifactKeys = {
    cv1Url: readExistingArtifactKey('cv1Url'),
    cv2Url: readExistingArtifactKey('cv2Url'),
    coverLetter1Url: readExistingArtifactKey('coverLetter1Url'),
    coverLetter2Url: readExistingArtifactKey('coverLetter2Url'),
    originalTextKey: readExistingArtifactKey('originalTextKey'),
    enhancedVersion1Key: readExistingArtifactKey('enhancedVersion1Key'),
    enhancedVersion2Key: readExistingArtifactKey('enhancedVersion2Key'),
    changeLogKey: readExistingArtifactKey('changeLogKey'),
  };
  const stageMetadataKey = originalUploadKey
    ? `${originalUploadKey.replace(/[^/]+$/, '')}logs/log.json`
    : '';

  const normalizedChangeLogEntries = Array.isArray(changeLogEntries)
    ? changeLogEntries.map((entry) => normalizeChangeLogEntryInput(entry)).filter(Boolean)
    : [];

  const generationRunSegment =
    sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
    sanitizeS3KeyComponent(`session-${createIdentifier()}`);

  logContext = {
    ...logContext,
    generationRunId: logContext?.generationRunId || generationRunSegment,
  };

  const resumeExperience = extractExperience(resumeText);
  const linkedinExperience = extractExperience(linkedinData.experience || []);
  const resumeEducation = extractEducation(resumeText);
  const linkedinEducation = extractEducation(linkedinData.education || []);
  const resumeCertifications = extractCertifications(resumeText);
  const linkedinCertifications = extractCertifications(
    linkedinData.certifications || []
  );
  const aggregatedCertifications = [
    ...credlyCertifications,
    ...manualCertificates,
  ];

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

  const applicantTitle =
    resumeExperience[0]?.title || linkedinExperience[0]?.title || '';
  const sectionPreservation = buildSectionPreservationContext(resumeText);
  const contactDetails = extractContactDetails(resumeText, linkedinProfileUrl);

  const templateSelection =
    selection ||
    selectTemplates({
      defaultCvTemplate: templateContextInput.template1 || CV_TEMPLATES[0],
      defaultClTemplate: templateContextInput.coverTemplate1 || CL_TEMPLATES[0],
      template1: templateContextInput.template1,
      template2: templateContextInput.template2,
      coverTemplate1: templateContextInput.coverTemplate1,
      coverTemplate2: templateContextInput.coverTemplate2,
      cvTemplates: templateContextInput.templates,
      clTemplates: templateContextInput.coverTemplates,
      preferredTemplate:
        templateContextInput.selectedTemplate || templateContextInput.template1,
    });
  let {
    template1,
    template2,
    coverTemplate1,
    coverTemplate2,
    templates: availableCvTemplates,
    coverTemplates: availableCoverTemplates,
  } = templateSelection;

  if (!Array.isArray(availableCvTemplates) || !availableCvTemplates.length) {
    availableCvTemplates = [...CV_TEMPLATES];
  }
  if (!Array.isArray(availableCoverTemplates) || !availableCoverTemplates.length) {
    availableCoverTemplates = [...CL_TEMPLATES];
  }

  let templateHistory = normalizeTemplateHistory(
    templateContextInput.templateHistory,
    [
      template1,
      templateContextInput.selectedTemplate,
      templateContextInput.template1,
      templateContextInput.template2,
    ]
  );
  const requestedCanonicalTemplate = canonicalizeCvTemplateId(
    templateContextInput.selectedTemplate
  );
  let canonicalSelectedTemplate = requestedCanonicalTemplate || '';

  const templateParamsConfig =
    templateParamConfig ?? parseTemplateParamsConfig(undefined);

  let resumeSkillsList = Array.isArray(resumeSkills)
    ? resumeSkills
    : extractResumeSkills(resumeText);
  const baselineScoreBreakdown = buildScoreBreakdown(resumeText, {
    jobSkills,
    resumeSkills: resumeSkillsList,
    jobText: jobDescription,
  });
  let originalMatchResult = originalMatch;
  if (!originalMatchResult || !Array.isArray(originalMatchResult.table)) {
    originalMatchResult = calculateMatchScore(jobSkills, resumeSkillsList);
  }

  const isImprovementRoute =
    logContext && typeof logContext.route === 'string'
      ? logContext.route.startsWith('improvement:')
      : false;
  const enableGenerativeEnhancements =
    (!isTestEnvironment || !isImprovementRoute || process.env.ENABLE_TEST_GENERATIVE === 'true') &&
    geminiApiKey;

  let generativeModel = null;
  if (enableGenerativeEnhancements) {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  const canUseGenerativeModel = Boolean(generativeModel?.generateContent);

  let text = resumeText;
  let resolvedTextForContext = null;
  let projectText = '';
  let modifiedTitle = '';
  let geminiAddedSkills = [];
  let sanitizedFallbackUsed = false;
  let enhancementTokenMap = {};

  if (canUseGenerativeModel) {
    try {
      const sectionTexts = collectSectionText(
        resumeText,
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
        },
        resumeText
      );
      enhancementTokenMap =
        enhanced.placeholders && typeof enhanced.placeholders === 'object'
          ? enhanced.placeholders
          : {};
      const tokenizedEnhancedText =
        typeof enhanced.tokenizedText === 'string' && enhanced.tokenizedText.trim()
          ? enhanced.tokenizedText
          : typeof enhanced.text === 'string' && enhanced.text.trim()
            ? enhanced.text
            : resumeText;
      const resolvedEnhancedText =
        typeof enhanced.resolvedText === 'string' && enhanced.resolvedText.trim()
          ? enhanced.resolvedText
          : resolveEnhancementTokens(tokenizedEnhancedText, enhancementTokenMap);
      text = tokenizedEnhancedText;
      resolvedTextForContext = resolvedEnhancedText;
      projectText = enhanced.project;
      modifiedTitle = enhanced.modifiedTitle || applicantTitle || '';
      geminiAddedSkills = enhanced.addedSkills || [];
      sanitizedFallbackUsed = Boolean(enhanced.sanitizedFallbackUsed);
      logStructured('info', 'generation_section_rewrite_completed', {
        ...logContext,
        modifiedTitle: modifiedTitle || '',
        addedSkills: geminiAddedSkills.length,
      });
    } catch (err) {
      logStructured('warn', 'generation_section_rewrite_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  const resolvedCombinedProfileCandidate =
    typeof resolvedTextForContext === 'string' && resolvedTextForContext.trim()
      ? resolvedTextForContext
      : resolveEnhancementTokens(text, enhancementTokenMap);

  let combinedProfile =
    typeof resolvedCombinedProfileCandidate === 'string' &&
    resolvedCombinedProfileCandidate.trim()
      ? resolvedCombinedProfileCandidate
      : resumeText;

  const versionsContext = {
    cvText: combinedProfile,
    jobDescription,
    jobTitle: modifiedTitle || applicantTitle || '',
    jobSkills,
    note: 'The candidate performed duties matching the job description in their last role.',
  };

  let versionData = {};

  const ensureProjectSummary = async () => {
    if (projectText) return;
    projectText = await generateProjectSummary(
      jobDescription,
      resumeSkillsList,
      jobSkills,
      canUseGenerativeModel ? generativeModel : null
    );
  };

  const buildSanitizeOptions = () => ({
    resumeExperience,
    linkedinExperience,
    resumeEducation,
    linkedinEducation,
    resumeCertifications,
    linkedinCertifications,
    credlyCertifications: aggregatedCertifications,
    credlyProfileUrl,
    jobTitle: versionsContext.jobTitle,
    project: projectText,
    contactLines: contactDetails.contactLines,
    ...sectionPreservation,
  });

  await ensureProjectSummary();

  const sanitizeOptions = buildSanitizeOptions();
  const sanitizedResolvedProfile =
    sanitizeGeneratedText(combinedProfile, sanitizeOptions);
  const sanitizedTokenizedText = sanitizeGeneratedText(text, sanitizeOptions);
  let baseResumeText =
    sanitizedResolvedProfile ||
    sanitizedTokenizedText ||
    combinedProfile ||
    text;

  if (!sanitizedFallbackUsed && canUseGenerativeModel) {
    try {
      const verified = await verifyResume(
        baseResumeText,
        jobDescription,
        generativeModel,
        sanitizeOptions
      );
      const sanitizedVerified = sanitizeGeneratedText(verified, sanitizeOptions);
      if (sanitizedVerified?.trim()) {
        baseResumeText = sanitizedVerified;
        combinedProfile = sanitizedVerified;
        versionsContext.cvText = sanitizedVerified;
        logStructured('info', 'generation_resume_verified', {
          ...logContext,
        });
      }
    } catch (err) {
      logStructured('warn', 'generation_resume_verification_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  resumeSkillsList = extractResumeSkills(baseResumeText);

  const skillsToHighlight = Array.from(
    new Set([
      ...(Array.isArray(geminiAddedSkills) ? geminiAddedSkills : []),
      ...(Array.isArray(originalMatchResult?.newSkills)
        ? originalMatchResult.newSkills
        : []),
    ])
  ).filter(Boolean);

  try {
    versionData = createResumeVariants({
      baseText: baseResumeText,
      projectText,
      modifiedTitle: versionsContext.jobTitle,
      skillsToInclude: skillsToHighlight,
      baseSkills: Array.isArray(geminiAddedSkills) ? geminiAddedSkills : [],
      sanitizeOptions,
    });
  } catch (err) {
    logStructured('error', 'generation_variants_failed', {
      ...logContext,
      error: serializeError(err),
    });
    const enhancementError = new Error(CV_GENERATION_ERROR_MESSAGE);
    enhancementError.code = 'ENHANCEMENT_VARIANT_FAILED';
    enhancementError.cause = err;
    throw enhancementError;
  }

  if (versionData?.placeholders && Object.keys(versionData.placeholders).length) {
    enhancementTokenMap = {
      ...enhancementTokenMap,
      ...versionData.placeholders,
    };
  }

  if (!versionData.version1?.trim() || !versionData.version2?.trim()) {
    cleanupReason = 'variants_unavailable';
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'generation_versions_missing',
      level: 'error',
      message: 'Unable to construct resume variants from extracted content',
    });
    sendError(
      res,
      500,
      'AI_RESPONSE_INVALID',
      DOWNLOAD_LINK_GENERATION_ERROR_MESSAGE
    );
    return null;
  }

  const version1Resolved = resolveEnhancementTokens(
    typeof versionData.version1 === 'string' ? versionData.version1 : '',
    enhancementTokenMap
  );
  const version2Resolved = resolveEnhancementTokens(
    typeof versionData.version2 === 'string' ? versionData.version2 : '',
    enhancementTokenMap
  );

  const version1Tokenized = injectEnhancementTokens(
    version1Resolved,
    enhancementTokenMap
  );
  const version2Tokenized = injectEnhancementTokens(
    version2Resolved,
    enhancementTokenMap
  );

  const version1Skills = extractResumeSkills(version1Resolved);
  const match1 = calculateMatchScore(jobSkills, version1Skills);
  const version2Skills = extractResumeSkills(version2Resolved);
  const match2 = calculateMatchScore(jobSkills, version2Skills);
  const bestMatch = match1.score >= match2.score ? match1 : match2;

  const coverSchema = {
    cover_letter1: 'string cover letter tailored to the job description',
    cover_letter2: 'string cover letter tailored to the job description',
  };
  const coverContext = {
    jobTitle: versionsContext.jobTitle,
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
  if (canUseGenerativeModel) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const coverResult = await generativeModel.generateContent(coverPrompt);
        const coverText = coverResult?.response?.text?.();
        const parsed = parseAiJson(coverText);
        if (parsed && typeof parsed === 'object') {
          coverData = parsed;
          break;
        }
        logStructured('warn', 'generation_cover_letters_invalid', {
          ...logContext,
          attempt,
          sample:
            typeof coverText === 'string' ? coverText.slice(0, 200) : undefined,
        });
      } catch (err) {
        if (attempt >= maxAttempts) {
          logStructured('warn', 'generation_cover_letters_failed', {
            ...logContext,
            error: serializeError(err),
          });
        } else {
          logStructured('warn', 'generation_cover_letters_retry', {
            ...logContext,
            attempt,
            error: serializeError(err),
          });
        }
      }
    }
  }

  const { normalized: normalizedCoverData, normalizedFrom, invalidKeys } =
    normalizeCoverLetterOutputs(coverData);

  if (normalizedFrom.length) {
    logStructured('info', 'generation_cover_letters_normalized', {
      ...logContext,
      variants: normalizedFrom,
    });
  }

  if (invalidKeys.length) {
    logStructured('warn', 'generation_cover_letters_invalid_type', {
      ...logContext,
      variants: invalidKeys,
    });
  }

  coverData = normalizedCoverData;

  const fallbackLetters = activeCoverLetterFallbackBuilder({
    applicantName,
    jobTitle: versionsContext.jobTitle || applicantTitle,
    jobDescription,
    jobSkills,
    resumeText: combinedProfile,
  });
  const missingCoverLetters = [];
  const ensureCoverLetterValue = (key) => {
    const currentValue = coverData[key];
    const hasUsableValue =
      typeof currentValue === 'string' && currentValue.trim().length > 0;
    if (hasUsableValue) {
      return;
    }
    const fallbackValue = fallbackLetters?.[key];
    const normalizedFallback =
      typeof fallbackValue === 'string' ? fallbackValue.trim() : '';
    if (normalizedFallback) {
      coverData[key] = normalizedFallback;
      missingCoverLetters.push(key);
    }
  };

  ensureCoverLetterValue('cover_letter1');
  ensureCoverLetterValue('cover_letter2');
  if (missingCoverLetters.length) {
    logStructured('warn', 'generation_cover_letters_fallback', {
      ...logContext,
      missing: missingCoverLetters,
    });
  }
  const fallbackAppliedCoverLetters = [...missingCoverLetters];
  const unavailableCoverLetters = COVER_LETTER_VARIANT_KEYS.filter(
    (key) => typeof coverData[key] !== 'string' || !coverData[key].trim()
  );

  if (unavailableCoverLetters.length) {
    logStructured('warn', 'generation_cover_letters_unavailable', {
      ...logContext,
      unavailable: unavailableCoverLetters,
    });
  }

  const coverLetterStatus = {
    fallbackApplied: fallbackAppliedCoverLetters,
    unavailable: unavailableCoverLetters,
  };
  const coverVariants = COVER_LETTER_VARIANT_KEYS.filter(
    (key) => typeof coverData[key] === 'string' && coverData[key].trim()
  ).length;

  logStructured('info', 'generation_cover_letters_completed', {
    ...logContext,
    variants: coverVariants,
    fallbackApplied: missingCoverLetters.length > 0,
  });

  await logEvent({ s3, bucket, key: logKey, jobId, event: 'generation_outputs_ready' });

  const ownerSegmentForKeys = resolveDocumentOwnerSegment({
    userId,
    sanitizedName,
  });
  const jobSegmentForKeys = sanitizeJobSegment(jobId);
  const generationDateSegment = new Date().toISOString().slice(0, 10);
  const prefix = originalUploadKey
    ? originalUploadKey.replace(/[^/]+$/, '')
    : buildDocumentSessionPrefix({
        ownerSegment: ownerSegmentForKeys,
        dateSegment: generationDateSegment,
        jobSegment: jobSegmentForKeys,
        sessionSegment: generationRunSegment,
      });
  const sessionPrefix = prefix;
  const coverLetter1Tokens = tokenizeCoverLetterText(coverData.cover_letter1 || '', {
    letterIndex: 1,
  });
  const coverLetter2Tokens = tokenizeCoverLetterText(coverData.cover_letter2 || '', {
    letterIndex: 2,
  });

  const coverLetterPlaceholderMap = expandEnhancementTokenMap({
    ...(coverLetter1Tokens.placeholders || {}),
    ...(coverLetter2Tokens.placeholders || {}),
  });

  if (Object.keys(coverLetterPlaceholderMap).length) {
    enhancementTokenMap = {
      ...enhancementTokenMap,
      ...coverLetterPlaceholderMap,
    };
  }

  const outputs = {
    version1: {
      text: version1Resolved,
      templateText: version1Resolved,
      tokenizedText: version1Tokenized,
    },
    version2: {
      text: version2Resolved,
      templateText: version2Resolved,
      tokenizedText: version2Tokenized,
    },
    cover_letter1: {
      text: coverData.cover_letter1,
      templateText:
        coverLetter1Tokens.tokenizedText || coverData.cover_letter1 || '',
    },
    cover_letter2: {
      text: coverData.cover_letter2,
      templateText:
        coverLetter2Tokens.tokenizedText || coverData.cover_letter2 || '',
    },
  };
  const allowedOriginsForDownloads = resolveCurrentAllowedOrigins();
  const downloadsRestricted = allowedOriginsForDownloads.length === 0;
  const urls = [];
  const downloadArtifacts = [];
  const artifactTimestamp = new Date().toISOString();
  const uploadedArtifacts = [];
  const textArtifactKeys = {};
  const usedPdfKeys = new Set();
  const generatedTemplates = {};
  const generationMessages = [];
  const templateCreationMessages = [];
  const documentPopulationMessages = [];

  const pushUniqueMessage = (collection, value) => {
    if (!Array.isArray(collection)) {
      return;
    }
    if (!collection.includes(value)) {
      collection.push(value);
    }
  };

  const normalizeMessage = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed;
  };

  const pushCategorizedMessage = (value, categoryCollection) => {
    const normalized = normalizeMessage(value);
    if (!normalized) return;
    pushUniqueMessage(generationMessages, normalized);
    if (categoryCollection) {
      pushUniqueMessage(categoryCollection, normalized);
    }
  };

  const pushTemplateCreationMessage = (value) => {
    pushCategorizedMessage(value, templateCreationMessages);
  };

  const pushDocumentPopulationMessage = (value) => {
    pushCategorizedMessage(value, documentPopulationMessages);
  };
  const templateFallbackApplied = {
    resumePrimary: false,
    resumeSecondary: false,
    coverPrimary: false,
    coverSecondary: false,
  };
  const finalTemplateMapping = {
    resume: { primary: template1, secondary: template2 },
    cover: { primary: coverTemplate1, secondary: coverTemplate2 },
  };

  const buildResumeTemplateContextEntry = (templateId) => {
    const canonical = canonicalizeCvTemplateId(templateId || '');
    if (!canonical) {
      return null;
    }
    const templateName = formatTemplateDisplayName(canonical);
    const templateLabel = templateName
      ? `${templateName} Resume`
      : 'Resume Template';
    return {
      templateId: canonical,
      templateName,
      templateType: 'resume',
      templateLabel,
    };
  };

  const buildCoverTemplateContextEntry = (templateId) => {
    const canonical = canonicalizeCoverTemplateId(templateId || '');
    if (!canonical) {
      return null;
    }
    const templateName = formatCoverTemplateDisplayName(canonical);
    const templateLabel = templateName || 'Cover Letter';
    return {
      templateId: canonical,
      templateName,
      templateType: 'cover',
      templateLabel,
    };
  };
  const originalResumeForStorage =
    typeof originalResumeTextInput === 'string' && originalResumeTextInput.trim()
      ? originalResumeTextInput
      : resumeText;
  let originalHandledViaArtifacts = false;

  if (coverLetterStatus.fallbackApplied.length) {
    const fallbackMessage =
      coverLetterStatus.fallbackApplied.length === COVER_LETTER_VARIANT_KEYS.length
        ? 'Cover letters were generated using fallback copy because the AI response was incomplete.'
        : 'At least one cover letter was generated using fallback copy because the AI response was incomplete.';
    pushDocumentPopulationMessage(fallbackMessage);
  }

  if (coverLetterStatus.unavailable.length) {
    const unavailableMessage =
      coverLetterStatus.unavailable.length === COVER_LETTER_VARIANT_KEYS.length
        ? 'CV generated, cover letter unavailable.'
        : 'CV generated successfully, but at least one cover letter variant was unavailable.';
    pushDocumentPopulationMessage(unavailableMessage);
  }
  if (downloadsRestricted) {
    logStructured('info', 'generation_downloads_restricted', {
      ...logContext,
      reason: 'no_allowed_origins',
      allowedOriginsCount: allowedOriginsForDownloads.length,
    });
  }

  const normalizedOriginalUploadKey = normalizeArtifactKey(originalUploadKey);
  const originalTemplateMetadata = {
    templateId: 'original',
    templateName: 'Original Upload',
    templateType: 'resume',
  };

  if (normalizedOriginalUploadKey) {
    const originalExtension = (path.extname(normalizedOriginalUploadKey) || '').toLowerCase();
    if (!originalExtension || originalExtension === '.pdf') {
      downloadArtifacts.unshift({
        type: 'original_upload',
        key: normalizedOriginalUploadKey,
        templateMetadata: originalTemplateMetadata,
        text: originalResumeForStorage,
      });
      originalHandledViaArtifacts = true;
    } else {
      const originalPdfKey = buildTemplateScopedPdfKey({
        basePrefix: sessionPrefix,
        documentType: 'original',
        templateId: 'original',
        variant: 'original_upload',
        usedKeys: usedPdfKeys,
      });
      const contactLinesForOriginal = Array.isArray(contactDetails.contactLines)
        ? contactDetails.contactLines
        : [];
      const originalFallbackPayload = {
        requestedTemplateId: selection?.template1 || '',
        templateId: selection?.template1 || '',
        text: originalResumeForStorage,
        name: applicantName,
        jobTitle: versionsContext.jobTitle || applicantTitle || '',
        contactLines: contactLinesForOriginal,
        documentType: 'resume',
        logContext: {
          ...logContext,
          documentType: 'resume',
          outputName: 'original_upload',
          outputKeyPrefix: sessionPrefix,
          originalUploadKey: normalizedOriginalUploadKey,
          originalUploadExtension: originalExtension,
        },
      };

      let originalPdfBuffer = null;
      let originalUsedMinimalFallback = false;

      try {
        originalPdfBuffer = await generatePlainPdfFallback(originalFallbackPayload);
      } catch (err) {
        logStructured('warn', 'original_upload_plain_pdf_failed', {
          ...logContext,
          error: serializeError(err),
          originalUploadKey: normalizedOriginalUploadKey,
          originalUploadExtension: originalExtension,
        });
      }

      if (!originalPdfBuffer) {
        try {
          originalPdfBuffer = createMinimalPlainPdfBuffer({
            lines: originalResumeForStorage.split('\n'),
            name: applicantName,
            jobTitle: versionsContext.jobTitle || applicantTitle || '',
            contactLines: contactLinesForOriginal,
            documentType: 'resume',
            requestedTemplateId: selection?.template1 || '',
          });
          originalUsedMinimalFallback = true;
        } catch (minimalErr) {
          logStructured('error', 'original_upload_minimal_pdf_failed', {
            ...logContext,
            error: serializeError(minimalErr),
            originalUploadKey: normalizedOriginalUploadKey,
            originalUploadExtension: originalExtension,
          });
        }
      }

      if (originalPdfBuffer) {
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: originalPdfKey,
              Body: originalPdfBuffer,
              ContentType: 'application/pdf',
            })
          );
          registerArtifactKey(originalPdfKey);
          uploadedArtifacts.push({ type: 'original_upload', key: originalPdfKey });
          downloadArtifacts.unshift({
            type: 'original_upload',
            key: originalPdfKey,
            templateMetadata: originalTemplateMetadata,
            text: originalResumeForStorage,
          });
          originalHandledViaArtifacts = true;
          logStructured(
            originalUsedMinimalFallback ? 'warn' : 'info',
            originalUsedMinimalFallback
              ? 'original_upload_minimal_pdf_generated'
              : 'original_upload_pdf_generated',
            {
              ...logContext,
              storageKey: originalPdfKey,
              originalUploadKey: normalizedOriginalUploadKey,
              originalUploadExtension: originalExtension,
            }
          );
        } catch (uploadErr) {
          logStructured('error', 'original_upload_pdf_upload_failed', {
            ...logContext,
            error: serializeError(uploadErr),
            originalUploadKey: normalizedOriginalUploadKey,
            originalUploadExtension: originalExtension,
            storageKey: originalPdfKey,
          });
        }
      } else {
        logStructured('error', 'original_upload_pdf_generation_failed', {
          ...logContext,
          originalUploadKey: normalizedOriginalUploadKey,
          originalUploadExtension: originalExtension,
        });
      }
    }
  }

  if (originalUploadKey && !originalHandledViaArtifacts) {
    try {
      const originalSignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: originalUploadKey }),
        { expiresIn: URL_EXPIRATION_SECONDS }
      );
      const expiresAt = new Date(
        Date.now() + URL_EXPIRATION_SECONDS * 1000
      ).toISOString();
      const typeFragment = encodeURIComponent('original_upload');
      urls.push({
        type: 'original_upload',
        url: originalSignedUrl,
        fileUrl: originalSignedUrl,
        typeUrl: `${originalSignedUrl}#${typeFragment}`,
        expiresAt,
        generatedAt: artifactTimestamp,
        templateId: 'original',
        templateName: 'Original Upload',
        templateType: 'resume',
        storageKey: originalUploadKey,
      });
    } catch (err) {
      logStructured('warn', 'generation_original_url_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  for (const [name, entry] of Object.entries(outputs)) {
    const templateTextCandidate =
      typeof entry?.templateText === 'string' ? entry.templateText : '';
    const fallbackTemplateText =
      typeof entry?.text === 'string' ? entry.text : '';
    const templateText =
      templateTextCandidate && templateTextCandidate.trim()
        ? templateTextCandidate
        : fallbackTemplateText;
    if (!templateText || !templateText.trim()) continue;

    const isCvDocument = name === 'version1' || name === 'version2';
    const isCoverLetter = name === 'cover_letter1' || name === 'cover_letter2';
    const documentType = isCvDocument ? 'resume' : isCoverLetter ? 'cover_letter' : name;
    const primaryTemplate = isCvDocument
      ? name === 'version1'
        ? template1
        : template2
      : isCoverLetter
        ? name === 'cover_letter1'
          ? coverTemplate1
          : coverTemplate2
        : template1;

    const baseTemplateOptions = {
      jobSkills,
      linkedinExperience,
      resumeEducation,
      linkedinEducation,
      resumeCertifications,
      linkedinCertifications,
      credlyCertifications,
      credlyProfileUrl,
      jobTitle: versionsContext.jobTitle,
      project: projectText,
      contactLines: contactDetails.contactLines,
      contactDetails,
      email: contactDetails.email,
      phone: contactDetails.phone,
      cityState: contactDetails.cityState,
      linkedinProfileUrl: contactDetails.linkedin || linkedinProfileUrl,
      ...sectionPreservation,
      templateParams: {},
      enhancementTokenMap,
    };

    if (isCvDocument) {
      baseTemplateOptions.resumeExperience = resumeExperience;
    } else if (isCoverLetter) {
      baseTemplateOptions.skipRequiredSections = true;
    }

    const canonicalPrimaryTemplate = isCvDocument
      ? canonicalizeCvTemplateId(primaryTemplate || '')
      : primaryTemplate;

    if (isCvDocument && canonicalPrimaryTemplate === 'ats') {
      baseTemplateOptions.templateParams = {
        ...(baseTemplateOptions.templateParams || {}),
        mode: 'ats',
        atsMode: true,
      };
    }

    let candidateTemplates = (() => {
      const fallbackTemplates = isCoverLetter ? CL_TEMPLATES : CV_TEMPLATES;
      const requestedTemplates = isCvDocument
        ? [template1, template2, ...(availableCvTemplates || [])]
        : isCoverLetter
          ? [coverTemplate1, coverTemplate2, ...(availableCoverTemplates || [])]
          : [primaryTemplate];
      const merged = [primaryTemplate, ...requestedTemplates, ...fallbackTemplates].filter(Boolean);
      return uniqueTemplates(merged);
    })();

    if (isCvDocument && baseTemplateOptions.templateParams?.mode === 'ats') {
      const filtered = candidateTemplates.filter(
        (tpl) => canonicalizeCvTemplateId(tpl) === 'ats'
      );
      candidateTemplates = filtered.length ? filtered : ['ats'];
    }

    const {
      buffer: pdfBuffer,
      template: resolvedTemplate,
      messages: attemptMessages = [],
    } = await generatePdfWithFallback({
      documentType,
      templates: candidateTemplates,
      inputText: templateText,
      generativeModel,
        logContext: {
          ...logContext,
          documentType,
          outputName: name,
          outputKeyPrefix: sessionPrefix,
          sessionId: logContext?.sessionId || generationRunSegment,
          generationRunId: generationRunSegment,
        },
      buildOptionsForTemplate: (templateId) => {
        const resolvedTemplateParams = resolveTemplateParamsConfig(
          templateParamsConfig,
          templateId,
          documentType
        );
        const outputTemplateParams =
          name && name !== documentType
            ? resolveTemplateParamsConfig(templateParamsConfig, templateId, name)
            : {};
        return {
          ...baseTemplateOptions,
          templateParams: {
            ...(baseTemplateOptions.templateParams || {}),
            ...(resolvedTemplateParams || {}),
            ...(outputTemplateParams || {}),
          },
        };
      },
      allowPlainFallback: Boolean(plainPdfFallbackEnabled),
    });

    if (Array.isArray(attemptMessages)) {
      for (const message of attemptMessages) {
        pushTemplateCreationMessage(message);
      }
    }

    const effectiveTemplateId = resolvedTemplate || candidateTemplates[0] || primaryTemplate;
    generatedTemplates[name] = effectiveTemplateId;

    if (effectiveTemplateId) {
      if (isCvDocument) {
        if (name === 'version1') {
          if (effectiveTemplateId !== finalTemplateMapping.resume.primary) {
            if (effectiveTemplateId !== primaryTemplate) {
              templateFallbackApplied.resumePrimary = true;
            }
            finalTemplateMapping.resume.primary = effectiveTemplateId;
          }
        } else if (name === 'version2') {
          if (effectiveTemplateId !== finalTemplateMapping.resume.secondary) {
            if (effectiveTemplateId !== primaryTemplate) {
              templateFallbackApplied.resumeSecondary = true;
            }
            finalTemplateMapping.resume.secondary = effectiveTemplateId;
          }
        }
        const nextTemplates = [
          effectiveTemplateId,
          ...(Array.isArray(availableCvTemplates) ? availableCvTemplates : []),
        ];
        availableCvTemplates = uniqueValidCvTemplates(nextTemplates);
      } else if (isCoverLetter) {
        if (name === 'cover_letter1') {
          if (effectiveTemplateId !== finalTemplateMapping.cover.primary) {
            if (effectiveTemplateId !== primaryTemplate) {
              templateFallbackApplied.coverPrimary = true;
            }
            finalTemplateMapping.cover.primary = effectiveTemplateId;
          }
        } else if (name === 'cover_letter2') {
          if (effectiveTemplateId !== finalTemplateMapping.cover.secondary) {
            if (effectiveTemplateId !== primaryTemplate) {
              templateFallbackApplied.coverSecondary = true;
            }
            finalTemplateMapping.cover.secondary = effectiveTemplateId;
          }
        }
        const nextCoverTemplates = [
          effectiveTemplateId,
          ...(Array.isArray(availableCoverTemplates) ? availableCoverTemplates : []),
        ];
        availableCoverTemplates = uniqueValidCoverTemplates(nextCoverTemplates);
      }
    }

    const key = buildTemplateScopedPdfKey({
      basePrefix: sessionPrefix,
      documentType,
      templateId: effectiveTemplateId,
      variant: name,
      usedKeys: usedPdfKeys,
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    );

    registerArtifactKey(key);
    uploadedArtifacts.push({ type: name, key });

    if (name === 'version1' && existingArtifactKeys.cv1Url && existingArtifactKeys.cv1Url !== key) {
      registerStaleArtifactKey(existingArtifactKeys.cv1Url);
    } else if (name === 'version2' && existingArtifactKeys.cv2Url && existingArtifactKeys.cv2Url !== key) {
      registerStaleArtifactKey(existingArtifactKeys.cv2Url);
    } else if (name === 'cover_letter1' && existingArtifactKeys.coverLetter1Url && existingArtifactKeys.coverLetter1Url !== key) {
      registerStaleArtifactKey(existingArtifactKeys.coverLetter1Url);
    } else if (name === 'cover_letter2' && existingArtifactKeys.coverLetter2Url && existingArtifactKeys.coverLetter2Url !== key) {
      registerStaleArtifactKey(existingArtifactKeys.coverLetter2Url);
    }

    const artifactDownloadEntry = {
      type: name,
      key,
      isCoverLetter,
      templateMetadata: null,
      text: undefined,
      coverLetterFields: undefined,
      rawText: undefined,
    };

    if (effectiveTemplateId) {
      const templateType = isCoverLetter ? 'cover' : 'resume';
      const templateName = isCoverLetter
        ? formatCoverTemplateDisplayName(effectiveTemplateId)
        : formatTemplateDisplayName(effectiveTemplateId);
      artifactDownloadEntry.templateMetadata = {
        templateId: effectiveTemplateId,
        templateName,
        templateType,
      };
    }

    if (isCoverLetter) {
      const coverLetterText =
        typeof entry?.text === 'string' ? entry.text : '';
      const coverLetterFields = mapCoverLetterFields({
        text: coverLetterText,
        contactDetails,
        jobTitle: versionsContext.jobTitle,
        jobDescription,
        jobSkills,
        applicantName,
        letterIndex: name === 'cover_letter1' ? 1 : 2,
      });
      artifactDownloadEntry.text = coverLetterFields;
      artifactDownloadEntry.coverLetterFields = coverLetterFields;
      artifactDownloadEntry.rawText = coverLetterText;
    } else if (typeof entry?.text === 'string') {
      artifactDownloadEntry.text = entry.text;
    } else if (name !== 'original_upload') {
      artifactDownloadEntry.text = '';
    }

    downloadArtifacts.push(artifactDownloadEntry);
  }

  template1 = finalTemplateMapping.resume.primary || template1;
  template2 = finalTemplateMapping.resume.secondary || template2;
  coverTemplate1 = finalTemplateMapping.cover.primary || coverTemplate1;
  coverTemplate2 = finalTemplateMapping.cover.secondary || coverTemplate2;

  availableCvTemplates = uniqueValidCvTemplates([
    template1,
    template2,
    ...(Array.isArray(availableCvTemplates) ? availableCvTemplates : []),
  ]);
  availableCoverTemplates = uniqueValidCoverTemplates([
    coverTemplate1,
    coverTemplate2,
    ...(Array.isArray(availableCoverTemplates) ? availableCoverTemplates : []),
  ]);

  if (!canonicalSelectedTemplate || templateFallbackApplied.resumePrimary) {
    const normalizedPrimary = canonicalizeCvTemplateId(template1);
    canonicalSelectedTemplate = normalizedPrimary || template1;
  }

  templateHistory = normalizeTemplateHistory(templateHistory, [
    template1,
    template2,
    canonicalSelectedTemplate,
  ]);

  if (dynamo && tableName && userId && canonicalSelectedTemplate) {
    await persistUserTemplatePreference({
      dynamo,
      tableName,
      userId,
      templateId: canonicalSelectedTemplate,
      logContext,
    });
  }

  const textArtifactPrefix = `${sessionPrefix}artifacts/`;

  const textArtifacts = [
    {
      type: 'original_text',
      fileName: 'original.json',
      payload: {
        jobId,
        generatedAt: artifactTimestamp,
        version: 'original',
        text: originalResumeForStorage,
      },
    },
    {
      type: 'version1_text',
      fileName: 'version1.json',
      payload: {
        jobId,
        generatedAt: artifactTimestamp,
        version: 'version1',
        text: outputs.version1?.text || '',
        template: generatedTemplates.version1 || template1 || '',
      },
    },
    {
      type: 'version2_text',
      fileName: 'version2.json',
      payload: {
        jobId,
        generatedAt: artifactTimestamp,
        version: 'version2',
        text: outputs.version2?.text || '',
        template: generatedTemplates.version2 || template2 || '',
      },
    },
    {
      type: 'change_log',
      fileName: 'changelog.json',
      payload: {
        jobId,
        generatedAt: artifactTimestamp,
        entries: normalizedChangeLogEntries,
      },
    },
  ];

  for (const artifact of textArtifacts) {
    const key = `${textArtifactPrefix}${artifact.fileName}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(artifact.payload, null, 2),
        ContentType: 'application/json',
      })
    );
    registerArtifactKey(key);
    uploadedArtifacts.push({ type: artifact.type, key });
    textArtifactKeys[artifact.type] = key;

    if (artifact.type === 'original_text') {
      if (existingArtifactKeys.originalTextKey && existingArtifactKeys.originalTextKey !== key) {
        registerStaleArtifactKey(existingArtifactKeys.originalTextKey);
      }
    } else if (artifact.type === 'version1_text') {
      if (existingArtifactKeys.enhancedVersion1Key && existingArtifactKeys.enhancedVersion1Key !== key) {
        registerStaleArtifactKey(existingArtifactKeys.enhancedVersion1Key);
      }
    } else if (artifact.type === 'version2_text') {
      if (existingArtifactKeys.enhancedVersion2Key && existingArtifactKeys.enhancedVersion2Key !== key) {
        registerStaleArtifactKey(existingArtifactKeys.enhancedVersion2Key);
      }
    } else if (artifact.type === 'change_log') {
      if (existingArtifactKeys.changeLogKey && existingArtifactKeys.changeLogKey !== key) {
        registerStaleArtifactKey(existingArtifactKeys.changeLogKey);
      }
    }
  }

  if (sessionChangeLogKey) {
    try {
      await writeSessionChangeLog({
        s3,
        bucket,
        key: sessionChangeLogKey,
        jobId,
        entries: normalizedChangeLogEntries,
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'session_change_log_synced',
        metadata: { entries: normalizedChangeLogEntries.length },
      });
    } catch (err) {
      logStructured('warn', 'session_change_log_write_failed', {
        ...logContext,
        bucket,
        key: sessionChangeLogKey,
        error: serializeError(err),
      });
    }
  }

  const textArtifactTypes = Object.keys(textArtifactKeys);
  await logEvent({
    s3,
    bucket,
    key: logKey,
    jobId,
    event: 'generation_text_artifacts_uploaded',
    metadata: {
      textArtifactCount: textArtifactTypes.length,
    },
  });

  if (downloadArtifacts.length === 0 && urls.length === 0) {
    cleanupReason = 'no_outputs';
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'generation_no_outputs',
      level: 'error',
      message: CV_GENERATION_ERROR_MESSAGE,
    });
    sendError(
      res,
      500,
      'AI_RESPONSE_INVALID',
      DOWNLOAD_LINK_GENERATION_ERROR_MESSAGE
    );
    return null;
  }

  await logEvent({ s3, bucket, key: logKey, jobId, event: 'generation_artifacts_uploaded' });

  for (const artifact of downloadArtifacts) {
    const rawSignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: artifact.key }),
      { expiresIn: URL_EXPIRATION_SECONDS }
    );
    const signedUrl =
      typeof rawSignedUrl === 'string' ? rawSignedUrl.trim() : '';
    if (!signedUrl) {
      logStructured('warn', 'download_artifact_signed_url_missing', {
        ...logContext,
        artifactType: artifact.type,
        storageKey: artifact.key,
      });
      continue;
    }
    const expiresAt = new Date(
      Date.now() + URL_EXPIRATION_SECONDS * 1000
    ).toISOString();
    const typeFragment = encodeURIComponent(artifact.type);
    const urlEntry = {
      type: artifact.type,
      url: signedUrl,
      fileUrl: signedUrl,
      typeUrl: `${signedUrl}#${typeFragment}`,
      expiresAt,
      generatedAt: artifactTimestamp,
      storageKey: artifact.key,
    };

    if (artifact.templateMetadata) {
      urlEntry.templateId = artifact.templateMetadata.templateId;
      urlEntry.templateName = artifact.templateMetadata.templateName;
      urlEntry.templateType = artifact.templateMetadata.templateType;
    }

    if (artifact.isCoverLetter) {
      if (artifact.coverLetterFields) {
        urlEntry.text = artifact.coverLetterFields;
        urlEntry.coverLetterFields = artifact.coverLetterFields;
      }
      if (typeof artifact.rawText === 'string') {
        urlEntry.rawText = artifact.rawText;
      }
    } else if (typeof artifact.text === 'string') {
      urlEntry.text = artifact.text;
    } else if (artifact.type !== 'original_upload') {
      urlEntry.text = '';
    }

    urls.push(urlEntry);
  }

  let normalizedUrls = ensureOutputFileUrls(urls);
  if (!normalizedUrls.length && urls.length) {
    const fallbackUrls = urls
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const baseUrl =
          typeof entry.url === 'string' && entry.url.trim()
            ? entry.url.trim()
            : typeof entry.fileUrl === 'string' && entry.fileUrl.trim()
              ? entry.fileUrl.trim()
              : '';
        if (!baseUrl) {
          return null;
        }
        const patched = { ...entry };
        patched.url = baseUrl;
        if (!patched.fileUrl || typeof patched.fileUrl !== 'string' || !patched.fileUrl.trim()) {
          patched.fileUrl = baseUrl;
        }
        if (!patched.typeUrl || typeof patched.typeUrl !== 'string' || !patched.typeUrl.trim()) {
          const typeFragmentSource =
            (typeof patched.type === 'string' && patched.type.trim()) ||
            (typeof patched.templateType === 'string' && patched.templateType.trim()) ||
            'download';
          patched.typeUrl = `${baseUrl}#${encodeURIComponent(typeFragmentSource)}`;
        }
        return patched;
      })
      .filter(Boolean);
    normalizedUrls = ensureOutputFileUrls(fallbackUrls);
  }


  if (normalizedUrls.length === 0) {
    cleanupReason = 'no_valid_urls';
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'generation_no_valid_urls',
      level: 'error',
      message: 'No downloadable artifacts were produced.',
    });
    logStructured('error', 'generation_urls_missing', {
      ...logContext,
      requestedUrlCount: urls.length,
    });
    sendError(
      res,
      500,
      'AI_RESPONSE_INVALID',
      DOWNLOAD_LINK_GENERATION_ERROR_MESSAGE
    );
    return null;
  }

  const addedSkills = sanitizedFallbackUsed
    ? []
    : Array.from(
        new Set(
          (bestMatch.table || [])
            .filter((row) =>
              row.matched &&
              originalMatchResult.table?.some(
                (baselineRow) =>
                  baselineRow.skill === row.skill && !baselineRow.matched
              )
            )
            .map((row) => row.skill)
            .concat(geminiAddedSkills)
        )
      );

  const finalScoreBreakdown = buildScoreBreakdown(combinedProfile, {
    jobSkills,
    resumeSkills: extractResumeSkills(combinedProfile),
    jobText: jobDescription,
  });
  const finalAtsScores = scoreBreakdownToArray(finalScoreBreakdown);
  const baselineAtsScores = scoreBreakdownToArray(baselineScoreBreakdown);
  const baselineCompositeScore = computeCompositeAtsScore(baselineScoreBreakdown);
  const finalCompositeScore = computeCompositeAtsScore(finalScoreBreakdown);

  const originalSkillCoverage = Number.isFinite(originalMatchResult.score)
    ? Math.round(clamp(originalMatchResult.score, 0, 100))
    : Math.round(clamp(bestMatch.score, 0, 100));
  const enhancedSkillCoverage = Math.round(clamp(bestMatch.score, 0, 100));

  const atsScoreBefore = baselineCompositeScore;
  const atsScoreAfter = finalCompositeScore;
  const atsScoreBeforeExplanation = buildAtsScoreExplanation(baselineScoreBreakdown, {
    phase: 'uploaded',
  });
  const atsScoreAfterExplanation = buildAtsScoreExplanation(finalScoreBreakdown, {
    phase: 'enhanced',
  });

  const selectionInsights = buildSelectionInsights({
    jobTitle: versionsContext.jobTitle,
    originalTitle: applicantTitle,
    modifiedTitle: modifiedTitle || applicantTitle,
    jobDescriptionText: jobDescription,
    bestMatch,
    originalMatch: originalMatchResult,
    missingSkills: bestMatch.newSkills,
    addedSkills,
    scoreBreakdown: finalScoreBreakdown,
    baselineScoreBreakdown,
    resumeExperience,
    linkedinExperience,
    knownCertificates,
    certificateSuggestions,
    manualCertificatesRequired,
  });

  logStructured('info', 'generation_completed', {
    ...logContext,
    enhancedScore: bestMatch.score,
    outputs: normalizedUrls.length,
  });

  let generationCompletedAt = null;

  if (dynamo) {
    const findArtifactKey = (type) =>
      uploadedArtifacts.find((artifact) => artifact.type === type)?.key || '';

    const nowIso = new Date().toISOString();
    generationCompletedAt = nowIso;
    const updateExpressionParts = [
      '#status = :status',
      'generatedAt = :generatedAt',
      'analysisCompletedAt = if_not_exists(analysisCompletedAt, :generatedAt)',
    ];
    const expressionAttributeNames = { '#status': 'status' };
    const expressionAttributeValues = {
      ':status': { S: 'completed' },
      ':generatedAt': { S: nowIso },
      ':jobId': { S: jobId },
      ':statusScored': { S: 'scored' },
      ':statusCompleted': { S: 'completed' },
    };

    const activityMetadata = {
      templates: {
        primary: template1 || '',
        secondary: template2 || '',
        coverPrimary: coverTemplate1 || '',
        coverSecondary: coverTemplate2 || '',
      },
      artifacts: {
        originalUploadKey: originalUploadKey || '',
        generatedCount: uploadedArtifacts.length,
        textArtifactCount: textArtifactTypes.length,
        urlCount: normalizedUrls.length,
      },
    };

    if (userId) {
      activityMetadata.userId = userId;
    }

    updateExpressionParts.push('#lastAction = :lastAction');
    updateExpressionParts.push('lastActionAt = :lastActionAt');
    updateExpressionParts.push(
      'activityLog = list_append(if_not_exists(activityLog, :emptyActivityLog), :activityEntry)'
    );
    updateExpressionParts.push('lastActionMetadata = :lastActionMetadata');
    expressionAttributeNames['#lastAction'] = 'lastAction';
    expressionAttributeValues[':lastAction'] = { S: 'artifacts_uploaded' };
    expressionAttributeValues[':lastActionAt'] = { S: nowIso };
    expressionAttributeValues[':emptyActivityLog'] = { L: [] };
    expressionAttributeValues[':activityEntry'] = {
      L: [
        {
          M: {
            action: { S: 'artifacts_uploaded' },
            timestamp: { S: nowIso },
            metadata: { S: JSON.stringify(activityMetadata) },
          },
        },
      ],
    };
    expressionAttributeValues[':lastActionMetadata'] = {
      S: JSON.stringify(activityMetadata),
    };

    const assignKey = (field, placeholder, value) => {
      if (!value) return;
      updateExpressionParts.push(`${field} = ${placeholder}`);
      expressionAttributeValues[placeholder] = { S: value };
    };

    assignKey('cv1Url', ':cv1', findArtifactKey('version1'));
    assignKey('cv2Url', ':cv2', findArtifactKey('version2'));
    assignKey('coverLetter1Url', ':cover1', findArtifactKey('cover_letter1'));
    assignKey('coverLetter2Url', ':cover2', findArtifactKey('cover_letter2'));
    assignKey('originalTextKey', ':originalTextKey', textArtifactKeys.original_text);
    assignKey('enhancedVersion1Key', ':version1TextKey', textArtifactKeys.version1_text);
    assignKey('enhancedVersion2Key', ':version2TextKey', textArtifactKeys.version2_text);
    assignKey('changeLogKey', ':changeLogTextKey', textArtifactKeys.change_log);

    if (sessionChangeLogKey) {
      updateExpressionParts.push('sessionChangeLogKey = :sessionChangeLogKey');
      expressionAttributeValues[':sessionChangeLogKey'] = { S: sessionChangeLogKey };
    }

    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression:
            'jobId = :jobId AND (#status = :statusScored OR #status = :statusCompleted)',
        })
      );
      if (staleArtifactKeys.size) {
        shouldDeleteStaleArtifacts = true;
      }
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'generation_record_updated',
        metadata: { uploadedArtifacts: uploadedArtifacts.length },
      });
    } catch (err) {
      logStructured('warn', 'generation_record_update_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  generationSucceeded = true;
  cleanupReason = 'completed';

  try {
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'completed' });
  } catch (err) {
    logStructured('warn', 'generation_completed_log_failed', {
      ...logContext,
      error: serializeError(err),
    });
  }

  const downloadStageMetadata = {
    completedAt: generationCompletedAt || new Date().toISOString(),
    artifactCount: uploadedArtifacts.length,
  };

  const resumeTemplatesForStage = {};
  const canonicalResumeSelected =
    typeof canonicalSelectedTemplate === 'string' && canonicalSelectedTemplate.trim()
      ? canonicalizeCvTemplateId(canonicalSelectedTemplate, canonicalSelectedTemplate)
      : '';
  const canonicalResumePrimary =
    typeof template1 === 'string' && template1.trim()
      ? canonicalizeCvTemplateId(template1, template1)
      : '';
  const canonicalResumeSecondary =
    typeof template2 === 'string' && template2.trim()
      ? canonicalizeCvTemplateId(template2, template2)
      : '';
  if (canonicalResumeSelected) {
    resumeTemplatesForStage.selected = canonicalResumeSelected;
  }
  if (canonicalResumePrimary) {
    resumeTemplatesForStage.primary = canonicalResumePrimary;
  }
  if (canonicalResumeSecondary) {
    resumeTemplatesForStage.secondary = canonicalResumeSecondary;
  }
  if (Array.isArray(templateHistory) && templateHistory.length) {
    const dedupedHistory = templateHistory.filter((entry, index, list) => {
      return typeof entry === 'string' && entry && list.indexOf(entry) === index;
    });
    if (dedupedHistory.length) {
      resumeTemplatesForStage.history = dedupedHistory;
    }
  }
  const resumeAvailableTemplates = uniqueValidCvTemplates(availableCvTemplates);
  if (resumeAvailableTemplates.length) {
    resumeTemplatesForStage.available = resumeAvailableTemplates;
  }

  const coverTemplatesForStage = {};
  const canonicalCoverPrimary =
    typeof coverTemplate1 === 'string' && coverTemplate1.trim()
      ? canonicalizeCoverTemplateId(coverTemplate1, coverTemplate1)
      : '';
  const canonicalCoverSecondary =
    typeof coverTemplate2 === 'string' && coverTemplate2.trim()
      ? canonicalizeCoverTemplateId(coverTemplate2, coverTemplate2)
      : '';
  if (canonicalCoverPrimary) {
    coverTemplatesForStage.primary = canonicalCoverPrimary;
  }
  if (canonicalCoverSecondary) {
    coverTemplatesForStage.secondary = canonicalCoverSecondary;
  }
  const coverAvailableTemplates = uniqueValidCoverTemplates(availableCoverTemplates);
  if (coverAvailableTemplates.length) {
    coverTemplatesForStage.available = coverAvailableTemplates;
  }

  const templatesForStage = {};
  if (Object.keys(resumeTemplatesForStage).length) {
    templatesForStage.resume = resumeTemplatesForStage;
  }
  if (Object.keys(coverTemplatesForStage).length) {
    templatesForStage.cover = coverTemplatesForStage;
  }
  if (Object.keys(templatesForStage).length) {
    downloadStageMetadata.templates = templatesForStage;
  }

  if (templateCreationMessages.length) {
    downloadStageMetadata.templateCreationErrors = templateCreationMessages;
  }

  if (documentPopulationMessages.length) {
    downloadStageMetadata.documentPopulationErrors = documentPopulationMessages;
  }

  await updateStageMetadata({
    s3,
    bucket,
    metadataKey: stageMetadataKey,
    jobId,
    stage: 'download',
    data: downloadStageMetadata,
    logContext,
  });

  if (shouldDeleteStaleArtifacts) {
    await cleanupStaleArtifacts('replaced');
  }

  return {
    success: true,
    requestId,
    jobId,
    urlExpiresInSeconds: normalizedUrls.length > 0 ? URL_EXPIRATION_SECONDS : 0,
    urls: normalizedUrls,
    applicantName,
    originalScore: originalSkillCoverage,
    enhancedScore: enhancedSkillCoverage,
    atsScoreBefore,
    atsScoreAfter,
    table: bestMatch.table,
    addedSkills,
    missingSkills: bestMatch.newSkills,
    originalTitle: applicantTitle,
    modifiedTitle: modifiedTitle || applicantTitle,
    scoreBreakdown: finalScoreBreakdown,
    atsSubScores: finalAtsScores,
    atsSubScoresBefore: baselineAtsScores,
    atsSubScoresAfter: finalAtsScores,
    atsScoreBeforeExplanation,
    atsScoreAfterExplanation,
    originalScoreExplanation: atsScoreBeforeExplanation,
    enhancedScoreExplanation: atsScoreAfterExplanation,
    resumeText: combinedProfile,
    originalResumeText: originalResumeTextInput || resumeText,
    jobDescriptionText: jobDescription,
    jobSkills,
    resumeSkills: resumeSkillsList,
    certificateInsights: {
      known: knownCertificates,
      suggestions: certificateSuggestions,
      manualEntryRequired: manualCertificatesRequired,
      credlyStatus,
    },
    manualCertificates,
    selectionProbability: selectionInsights?.probability ?? null,
    selectionProbabilityBefore: selectionInsights?.before?.probability ?? null,
    selectionProbabilityAfter: selectionInsights?.after?.probability ?? selectionInsights?.probability ?? null,
    selectionInsights,
    changeLog: normalizedChangeLogEntries,
    templateContext: {
      template1,
      template2,
      coverTemplate1,
      coverTemplate2,
      templates: availableCvTemplates,
      coverTemplates: availableCoverTemplates,
      selectedTemplate: canonicalSelectedTemplate,
      templateHistory,
      templateMetadata: {
        resume: {
          primary: buildResumeTemplateContextEntry(template1),
          secondary: buildResumeTemplateContextEntry(template2),
          selected: buildResumeTemplateContextEntry(
            canonicalSelectedTemplate || template1 || template2,
          ),
        },
        cover: {
          primary: buildCoverTemplateContextEntry(coverTemplate1),
          secondary: buildCoverTemplateContextEntry(coverTemplate2),
        },
      },
    },
    coverLetterStatus,
    messages: generationMessages,
    templateCreationMessages,
    documentPopulationMessages,
  };
  } catch (err) {
    if (cleanupReason === 'aborted') {
      cleanupReason = 'error';
    }
    throw err;
  } finally {
    if (!generationSucceeded) {
      await cleanupArtifacts(cleanupReason);
    }
  }
}


app.post(
  '/api/generate-enhanced-docs',
  assignJobContext,
  async (req, res) => {
    const jobIdInput = typeof req.body.jobId === 'string' ? req.body.jobId.trim() : '';
    if (!jobIdInput) {
      return sendError(
        res,
        400,
        'JOB_ID_REQUIRED',
        'jobId is required to generate enhanced documents.'
      );
    }

    const resumeTextInput = typeof req.body.resumeText === 'string' ? req.body.resumeText : '';
    if (!resumeTextInput.trim()) {
      return sendError(
        res,
        400,
        'RESUME_TEXT_REQUIRED',
        'resumeText is required to generate enhanced documents.'
      );
    }

    const jobDescription =
      typeof req.body.jobDescriptionText === 'string' ? req.body.jobDescriptionText : '';
    if (!jobDescription.trim()) {
      return sendError(
        res,
        400,
        'JOB_DESCRIPTION_TEXT_REQUIRED',
        'jobDescriptionText is required to generate enhanced documents.'
      );
    }

    const rawLinkedInBody =
      typeof req.body.linkedinProfileUrl === 'string'
        ? req.body.linkedinProfileUrl.trim()
        : '';
    const rawLinkedInQuery =
      typeof req.query?.linkedinProfileUrl === 'string'
        ? req.query.linkedinProfileUrl.trim()
        : '';
    const linkedinProfileUrlInput = rawLinkedInBody || rawLinkedInQuery || '';
    const linkedinProfileUrl = linkedinProfileUrlInput
      ? normalizeUrl(linkedinProfileUrlInput)
      : '';

    const profileIdentifier =
      resolveProfileIdentifier({
        linkedinProfileUrl,
        userId: res.locals.userId,
        jobId: jobIdInput,
      }) || jobIdInput;
    const storedLinkedIn = normalizePersonalData(profileIdentifier);

    const credlyProfileUrl =
      typeof req.body.credlyProfileUrl === 'string' ? req.body.credlyProfileUrl.trim() : '';

    const jobSkills = (Array.isArray(req.body.jobSkills) ? req.body.jobSkills : [])
      .map((skill) => (typeof skill === 'string' ? skill.trim() : ''))
      .filter(Boolean);

    const manualCertificates = parseManualCertificates(
      req.body.manualCertificates ?? req.body.manualCertificatesInput ?? []
    );

    const baseline =
      typeof req.body.baseline === 'object' && req.body.baseline ? req.body.baseline : {};
    const baselineTable = Array.isArray(baseline.table) ? baseline.table : [];
    const baselineMissing = Array.isArray(baseline.missingSkills) ? baseline.missingSkills : [];
    const baselineScoreInput =
      typeof baseline.originalScore === 'number'
        ? baseline.originalScore
        : typeof baseline.score === 'number'
          ? baseline.score
          : null;
    const originalResumeTextInput =
      typeof req.body.originalResumeText === 'string' ? req.body.originalResumeText : '';

    const resumeText = resumeTextInput;
    const resumeSkills = extractResumeSkills(resumeText);

    let originalMatch;
    if (baselineTable.length || baselineMissing.length || Number.isFinite(baselineScoreInput)) {
      originalMatch = {
        score: Number.isFinite(baselineScoreInput) ? baselineScoreInput : null,
        table: baselineTable,
        newSkills: baselineMissing,
      };
    }
    if (!originalMatch || !Array.isArray(originalMatch.table) || !originalMatch.table.length) {
      const baselineResume = originalResumeTextInput.trim()
        ? originalResumeTextInput
        : resumeText;
      originalMatch = calculateMatchScore(jobSkills, extractResumeSkills(baselineResume));
    } else if (!Number.isFinite(originalMatch.score)) {
      const baselineResume = originalResumeTextInput.trim()
        ? originalResumeTextInput
        : resumeText;
      const scored = calculateMatchScore(jobSkills, extractResumeSkills(baselineResume));
      originalMatch = {
        ...originalMatch,
        score: scored.score,
      };
    }
    if (!Array.isArray(originalMatch.newSkills) || !originalMatch.newSkills.length) {
      originalMatch = {
        ...originalMatch,
        newSkills: baselineMissing,
      };
    }

    const jobId = jobIdInput;
    res.locals.jobId = jobId;
    const requestId = res.locals.requestId;
    const generationSessionSegment =
      sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
      sanitizeS3KeyComponent(`session-${createIdentifier()}`);
    const logContext = {
      requestId,
      jobId,
      route: 'generate-enhanced-docs',
      sessionId: generationSessionSegment,
    };

    captureUserContext(req, res);

    try {
      let secrets;
      let bucket;
      try {
        secrets = getSecrets();
        bucket = secrets.S3_BUCKET;
      } catch (err) {
        const missing = extractMissingConfig(err);
        logStructured('error', 'generation_configuration_failed', {
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

      try {
        await ensureDynamoTableExists({ dynamo, tableName });
      } catch (err) {
        logStructured('error', 'generation_table_ensure_failed', {
          ...logContext,
          error: serializeError(err),
        });
        return sendError(
          res,
          500,
          'DYNAMO_TABLE_UNAVAILABLE',
          'Unable to prepare storage for the generated documents.'
        );
      }

      const s3 = s3Client;
      const date = new Date().toISOString().slice(0, 10);
      const applicantName = extractName(resumeText);
      const sanitizedName = sanitizeName(applicantName) || 'candidate';
      let originalUploadKey = '';
      let storedBucket = '';
      let existingChangeLog = [];
      let existingRecordItem = {};
      try {
        const record = await dynamo.send(
          new GetItemCommand({
            TableName: tableName,
            Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          })
        );
        const item = record.Item || {};
        existingRecordItem = item;
        if (!item.jobId || item.jobId.S !== jobId) {
          logStructured('warn', 'generation_job_context_missing', {
            ...logContext,
            hasRecord: Boolean(item.jobId?.S),
          });
        } else {
          const currentStatus = item.status?.S || '';
          if (
            currentStatus &&
            currentStatus !== 'scored' &&
            currentStatus !== 'completed'
          ) {
            logStructured('warn', 'generation_job_not_ready', {
              ...logContext,
              status: currentStatus,
            });
            return sendError(
              res,
              409,
              'JOB_NOT_READY_FOR_ENHANCEMENT',
              'Wait for ATS scoring to finish before generating enhanced documents.'
            );
          }

          originalUploadKey = item.s3Key?.S || '';
          storedBucket = item.s3Bucket?.S || '';
          if (!bucket && storedBucket) {
            bucket = storedBucket;
          }
          existingChangeLog = parseDynamoChangeLog(item.changeLog);
        }
      } catch (err) {
        logStructured('error', 'generation_job_context_lookup_failed', {
          ...logContext,
          error: serializeError(err),
        });
        return sendError(
          res,
          500,
          'JOB_CONTEXT_LOOKUP_FAILED',
          'Unable to load the upload context for final generation.'
        );
      }

      if (!bucket) {
        logStructured('error', 'generation_bucket_missing', logContext);
        return sendError(
          res,
          500,
          'STORAGE_UNAVAILABLE',
          S3_STORAGE_ERROR_MESSAGE
        );
      }

      const jobKeySegment = sanitizeJobSegment(jobId);
      const ownerSegment = resolveDocumentOwnerSegment({
        userId: res.locals.userId,
        sanitizedName,
      });
      const prefix = originalUploadKey
        ? originalUploadKey.replace(/[^/]+$/, '')
        : buildDocumentSessionPrefix({
            ownerSegment,
            dateSegment: date,
            jobSegment: jobKeySegment,
            sessionSegment: generationSessionSegment,
          });
      const logKey = `${prefix}logs/processing.jsonl`;

      await logEvent({ s3, bucket, key: logKey, jobId, event: 'generation_started' });

      const linkedinData = { experience: [], education: [], certifications: [] };

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
          logStructured('info', 'credly_profile_refetched', {
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
            event: 'refetched_credly_profile',
          });
        } catch (err) {
          logStructured('warn', 'credly_profile_refetch_failed', {
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
            event: 'credly_profile_refetch_failed',
            level: 'error',
            message: err.message,
          });
        }
      }

      const aggregatedCertifications = [
        ...credlyCertifications,
        ...manualCertificates,
      ];

      const resumeExperience = extractExperience(resumeText);
      const linkedinExperience = extractExperience(linkedinData.experience || []);
      const resumeEducation = extractEducation(resumeText);
      const linkedinEducation = extractEducation(linkedinData.education || []);
      const resumeCertifications = extractCertifications(resumeText);
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

      const applicantTitle =
        resumeExperience[0]?.title || linkedinExperience[0]?.title || '';
      const sectionPreservation = buildSectionPreservationContext(resumeText);
      const contactDetails = extractContactDetails(resumeText, linkedinProfileUrl);

      const templateIdInput =
        typeof req.body.templateId === 'string' ? req.body.templateId.trim() : '';
      const legacyTemplateInput =
        typeof req.body.template === 'string' ? req.body.template.trim() : '';
      const requestTemplate1 =
        typeof req.body.template1 === 'string' ? req.body.template1.trim() : '';
      const requestTemplate2 =
        typeof req.body.template2 === 'string' ? req.body.template2.trim() : '';
      const hasExplicitTemplateRequest = Boolean(
        templateIdInput ||
          legacyTemplateInput ||
          requestTemplate1 ||
          requestTemplate2
      );

      const templateContextInput =
        typeof req.body.templateContext === 'object' && req.body.templateContext
          ? req.body.templateContext
          : {};
      if (requestTemplate1) {
        templateContextInput.template1 = requestTemplate1;
        templateContextInput.selectedTemplate = requestTemplate1;
      }
      if (requestTemplate2) {
        templateContextInput.template2 = requestTemplate2;
      }
      templateContextInput.templateHistory = normalizeTemplateHistory(
        templateContextInput.templateHistory,
        [
          templateContextInput.selectedTemplate,
          templateContextInput.template1,
        ]
      );
      const effectivePreferredTemplate = hasExplicitTemplateRequest
        ? templateIdInput || legacyTemplateInput
        : templateIdInput ||
          legacyTemplateInput ||
          templateContextInput.selectedTemplate ||
          templateContextInput.template1;
      const selection = selectTemplates({
        defaultCvTemplate:
          templateContextInput.template1 || effectivePreferredTemplate || CV_TEMPLATES[0],
        defaultClTemplate: templateContextInput.coverTemplate1 || CL_TEMPLATES[0],
        template1: templateContextInput.template1,
        template2: templateContextInput.template2,
        coverTemplate1: templateContextInput.coverTemplate1,
        coverTemplate2: templateContextInput.coverTemplate2,
        cvTemplates: templateContextInput.templates,
        clTemplates: templateContextInput.coverTemplates,
        preferredTemplate: effectivePreferredTemplate,
      });
      let {
        template1,
        template2,
        coverTemplate1,
        coverTemplate2,
        templates: availableCvTemplates,
        coverTemplates: availableCoverTemplates,
      } = selection;

      if (!Array.isArray(availableCvTemplates) || !availableCvTemplates.length) {
        availableCvTemplates = [...CV_TEMPLATES];
      }
      if (!Array.isArray(availableCoverTemplates) || !availableCoverTemplates.length) {
        availableCoverTemplates = [...CL_TEMPLATES];
      }

      const templateParamConfig = parseTemplateParamsConfig(req.body.templateParams);

      const geminiApiKey = secrets.GEMINI_API_KEY;
      const responseBody = await generateEnhancedDocumentsResponse({
        res,
        s3,
        dynamo,
        tableName,
        bucket,
        logKey,
        jobId,
        requestId,
        logContext,
        resumeText,
        originalResumeTextInput,
        jobDescription,
        jobSkills,
        resumeSkills,
        originalMatch,
        linkedinProfileUrl,
        linkedinData,
        credlyProfileUrl,
        credlyCertifications,
        credlyStatus,
        manualCertificates,
        templateContextInput,
        templateParamConfig,
        applicantName,
        sanitizedName,
        storedLinkedIn,
        originalUploadKey,
        selection,
        geminiApiKey,
        changeLogEntries: existingChangeLog,
        existingRecord: existingRecordItem,
        userId: res.locals.userId,
      });

      if (!responseBody) {
        return;
      }

      return res.json(responseBody);
    } catch (err) {
      logStructured('error', 'generation_failed', {
        ...logContext,
        error: serializeError(err),
      });
      const rawMessage =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : '';
      const lowerMessage = rawMessage.toLowerCase();
      const isGeminiFailure =
        err?.code === 'ENHANCEMENT_VARIANT_FAILED' || lowerMessage.includes('gemini');
      const isS3Failure =
        lowerMessage.includes('s3') ||
        lowerMessage.includes('bucket') ||
        lowerMessage.includes('accessdenied');
      const isTemplateFailure = err?.code === 'TEMPLATE_RENDER_FAILED';

      let message = rawMessage || CV_GENERATION_ERROR_MESSAGE;
      if (isGeminiFailure) {
        message = GEMINI_ENHANCEMENT_ERROR_MESSAGE;
      } else if (isS3Failure) {
        message = S3_STORAGE_ERROR_MESSAGE;
      } else if (isTemplateFailure || !rawMessage || /^internal server error$/i.test(rawMessage)) {
        message = CV_GENERATION_ERROR_MESSAGE;
      }

      const details = {};
      if (err?.details && typeof err.details === 'object') {
        Object.assign(details, err.details);
      }
      if (rawMessage && !details.reason) {
        details.reason = rawMessage;
      }
      if (isGeminiFailure) {
        details.source = 'gemini';
      } else if (isS3Failure) {
        details.source = 's3';
      }

      const hasDetails = Object.keys(details).length > 0;
      return sendError(
        res,
        500,
        'GENERATION_FAILED',
        message,
        hasDetails ? details : undefined
      );
    }
  }
);

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

app.post('/api/change-log', assignJobContext, async (req, res) => {
  const jobId = typeof req.body.jobId === 'string' ? req.body.jobId.trim() : '';
  if (!jobId) {
    return sendError(
      res,
      400,
      'JOB_ID_REQUIRED',
      'jobId is required to update the change log.'
    );
  }

  const requestId = res.locals.requestId;
  const logContext = { requestId, jobId, route: 'change-log' };

  captureUserContext(req, res);
  const profileIdentifier =
    resolveProfileIdentifier({
      linkedinProfileUrl: typeof req.body.linkedinProfileUrl === 'string'
        ? req.body.linkedinProfileUrl.trim()
        : '',
      userId: res.locals.userId,
      jobId,
    }) || jobId;
  const storedLinkedIn = normalizePersonalData(profileIdentifier);
  const dynamo = new DynamoDBClient({ region });
  const s3 = s3Client;
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';

  try {
    await ensureDynamoTableExists({ dynamo, tableName });
  } catch (err) {
    logStructured('error', 'change_log_table_ensure_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'DYNAMO_TABLE_UNAVAILABLE',
      'Unable to prepare storage for the change log.'
    );
  }

  let storedBucket = '';
  let originalUploadKey = '';
  let sessionChangeLogKey = '';
  let logKey = '';
  let existingChangeLog = [];
  try {
    const record = await dynamo.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: storedLinkedIn } },
        ProjectionExpression:
          'jobId, changeLog, s3Bucket, s3Key, sessionChangeLogKey',
      })
    );
    const item = record.Item || {};
    if (!item.jobId || item.jobId.S !== jobId) {
      return sendError(
        res,
        404,
        'JOB_CONTEXT_NOT_FOUND',
        'The upload context could not be located to update the change log.'
      );
    }
    storedBucket = item.s3Bucket?.S || '';
    originalUploadKey = item.s3Key?.S || '';
    sessionChangeLogKey = deriveSessionChangeLogKey({
      changeLogKey: item.sessionChangeLogKey?.S,
      originalUploadKey,
    });
    if (originalUploadKey) {
      const prefix = originalUploadKey.replace(/[^/]+$/, '');
      if (prefix) {
        logKey = `${prefix}logs/processing.jsonl`;
      }
    }
    try {
      existingChangeLog = await loadSessionChangeLog({
        s3,
        bucket: storedBucket,
        key: sessionChangeLogKey,
        fallbackEntries: parseDynamoChangeLog(item.changeLog),
      });
    } catch (loadErr) {
      logStructured('error', 'change_log_load_failed', {
        ...logContext,
        bucket: storedBucket,
        key: sessionChangeLogKey,
        error: serializeError(loadErr),
      });
      return sendError(
        res,
        500,
        'CHANGE_LOG_LOAD_FAILED',
        S3_CHANGE_LOG_ERROR_MESSAGE,
        {
          bucket: storedBucket,
          key: sessionChangeLogKey,
          reason:
            (typeof loadErr?.message === 'string' && loadErr.message) ||
            'Unable to load the session change log for updates.',
        }
      );
    }
  } catch (err) {
    logStructured('error', 'change_log_context_lookup_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'JOB_CONTEXT_LOOKUP_FAILED',
      'Unable to load the session context for change log updates.'
    );
  }

  const removeEntry = Boolean(req.body.remove) || req.body.action === 'remove';
  const nowIso = new Date().toISOString();
  let updatedChangeLog = [...existingChangeLog];

  if (removeEntry) {
    const entryId = normalizeChangeLogString(
      req.body.entryId || req.body.id || req.body.entry?.id
    );
    if (!entryId) {
      return sendError(
        res,
        400,
        'CHANGE_LOG_ENTRY_ID_REQUIRED',
        'entryId is required to remove a change log entry.'
      );
    }
    updatedChangeLog = existingChangeLog.filter((entry) => entry.id !== entryId);
  } else {
    const normalizedEntry = normalizeChangeLogEntryInput(req.body.entry);
    if (!normalizedEntry) {
      return sendError(
        res,
        400,
        'CHANGE_LOG_ENTRY_INVALID',
        'A valid change log entry is required.'
      );
    }
    const existingIndex = existingChangeLog.findIndex((entry) => entry.id === normalizedEntry.id);
    const baseEntry = existingIndex >= 0 ? existingChangeLog[existingIndex] : null;
    const mergedEntry = {
      ...baseEntry,
      ...normalizedEntry,
    };
    if (!mergedEntry.acceptedAt) {
      mergedEntry.acceptedAt = baseEntry?.acceptedAt || nowIso;
    }
    if (existingIndex >= 0) {
      updatedChangeLog = existingChangeLog.map((entry) =>
        entry.id === mergedEntry.id ? mergedEntry : entry
      );
    } else {
      updatedChangeLog = [mergedEntry, ...existingChangeLog];
    }
  }

  const normalizedChangeLogEntries = updatedChangeLog
    .map((entry) => normalizeChangeLogEntryInput(entry))
    .filter(Boolean);

  const serializedChangeLogEntries = serializeChangeLogEntries(
    normalizedChangeLogEntries
  );
  const dynamoChangeLogEntries = enforceChangeLogDynamoSize(
    serializedChangeLogEntries,
    {
      budget: CHANGE_LOG_DYNAMO_LIMITS.budget,
      hardLimit: CHANGE_LOG_DYNAMO_LIMITS.maxItemBytes,
    }
  );

  if (!sessionChangeLogKey) {
    sessionChangeLogKey = deriveSessionChangeLogKey({ originalUploadKey });
  }

  try {
    await writeSessionChangeLog({
      s3,
      bucket: storedBucket,
      key: sessionChangeLogKey,
      jobId,
      entries: normalizedChangeLogEntries,
    });
    if (logKey) {
      await logEvent({
        s3,
        bucket: storedBucket,
        key: logKey,
        jobId,
        event: removeEntry ? 'change_log_entry_removed' : 'change_log_entry_saved',
        metadata: { entries: normalizedChangeLogEntries.length },
      });
    }
  } catch (err) {
    logStructured('error', 'change_log_s3_write_failed', {
      ...logContext,
      bucket: storedBucket,
      key: sessionChangeLogKey,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'CHANGE_LOG_PERSISTENCE_FAILED',
      S3_CHANGE_LOG_ERROR_MESSAGE,
      {
        bucket: storedBucket,
        reason: err?.message || 'Unable to persist the change log to S3.',
      }
    );
  }

  const expressionAttributeValues = {
    ':jobId': { S: jobId },
    ':updatedAt': { S: nowIso },
    ':changeLog': { L: Array.isArray(dynamoChangeLogEntries) ? dynamoChangeLogEntries : [] },
  };
  let updateExpression = 'SET changeLog = :changeLog, changeLogUpdatedAt = :updatedAt';

  if (sessionChangeLogKey) {
    expressionAttributeValues[':sessionChangeLogKey'] = { S: sessionChangeLogKey };
    updateExpression += ', sessionChangeLogKey = :sessionChangeLogKey';
  }

  try {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: storedLinkedIn } },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'jobId = :jobId',
      })
    );
    logStructured('info', 'change_log_updated', {
      ...logContext,
      entries: normalizedChangeLogEntries.length,
      action: removeEntry ? 'remove' : 'upsert',
    });
  } catch (err) {
    logStructured('error', 'change_log_update_failed', {
      ...logContext,
      error: serializeError(err),
      entries: normalizedChangeLogEntries.length,
      action: removeEntry ? 'remove' : 'upsert',
    });
    return sendError(
      res,
      500,
      'CHANGE_LOG_UPDATE_FAILED',
      err.message || 'Unable to persist the change log metadata.'
    );
  }

  return res.json({ success: true, changeLog: normalizedChangeLogEntries });
});

app.post('/api/refresh-download-link', assignJobContext, async (req, res) => {
  const jobId = typeof req.body.jobId === 'string' ? req.body.jobId.trim() : '';
  if (!jobId) {
    return sendError(
      res,
      400,
      'JOB_ID_REQUIRED',
      'jobId is required to refresh a download link.'
    );
  }

  const storageKeyInput =
    typeof req.body.storageKey === 'string' ? req.body.storageKey.trim() : '';
  if (!storageKeyInput) {
    return sendError(
      res,
      400,
      'DOWNLOAD_KEY_REQUIRED',
      'storageKey is required to refresh a download link.'
    );
  }

  if (storageKeyInput.includes('..') || storageKeyInput.includes('\\')) {
    return sendError(
      res,
      400,
      'INVALID_DOWNLOAD_KEY',
      'The provided download key is invalid.'
    );
  }

  captureUserContext(req, res);

  const requestId = res.locals.requestId;
  const logContext = { requestId, jobId, route: 'refresh-download-link' };

  const profileIdentifier =
    resolveProfileIdentifier({
      linkedinProfileUrl:
        typeof req.body.linkedinProfileUrl === 'string'
          ? req.body.linkedinProfileUrl.trim()
          : '',
      userId: res.locals.userId,
      jobId,
    }) || jobId;

  const storedLinkedIn = normalizePersonalData(profileIdentifier);
  const dynamo = new DynamoDBClient({ region });
  const s3 = s3Client;
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';

  try {
    await ensureDynamoTableExists({ dynamo, tableName });
  } catch (err) {
    logStructured('error', 'refresh_download_table_ensure_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'DYNAMO_TABLE_UNAVAILABLE',
      'Unable to prepare storage for download link refresh.'
    );
  }

  let storedBucket = '';
  let originalUploadKey = '';
  let logKey = '';
  const allowedKeys = new Set();
  try {
    const record = await dynamo.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { linkedinProfileUrl: { S: storedLinkedIn } },
        ProjectionExpression:
          'jobId, s3Bucket, s3Key, cv1Url, cv2Url, coverLetter1Url, coverLetter2Url, originalTextKey, enhancedVersion1Key, enhancedVersion2Key, changeLogKey, sessionChangeLogKey',
      })
    );

    const item = record.Item || {};
    if (!item.jobId || item.jobId.S !== jobId) {
      return sendError(
        res,
        404,
        'JOB_CONTEXT_NOT_FOUND',
        'The upload context could not be located to refresh the download link.'
      );
    }

    storedBucket = item.s3Bucket?.S || '';
    originalUploadKey = item.s3Key?.S || '';

    const registerKey = (value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed) {
        allowedKeys.add(trimmed);
      }
    };

    registerKey(originalUploadKey);
    registerKey(item.cv1Url?.S);
    registerKey(item.cv2Url?.S);
    registerKey(item.coverLetter1Url?.S);
    registerKey(item.coverLetter2Url?.S);
    registerKey(item.originalTextKey?.S);
    registerKey(item.enhancedVersion1Key?.S);
    registerKey(item.enhancedVersion2Key?.S);
    registerKey(item.changeLogKey?.S);

    const sessionChangeLogKey = deriveSessionChangeLogKey({
      changeLogKey: item.sessionChangeLogKey?.S,
      originalUploadKey,
    });
    registerKey(sessionChangeLogKey);

    if (originalUploadKey) {
      const prefix = originalUploadKey.replace(/[^/]+$/, '');
      if (prefix) {
        logKey = `${prefix}logs/processing.jsonl`;
      }
    }
  } catch (err) {
    logStructured('error', 'refresh_download_context_lookup_failed', {
      ...logContext,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'JOB_CONTEXT_LOOKUP_FAILED',
      'Unable to load the session context for download refresh.'
    );
  }

  const storageKey = storageKeyInput.replace(/^\/+/, '');

  if (!allowedKeys.has(storageKey)) {
    return sendError(
      res,
      404,
      'DOWNLOAD_NOT_FOUND',
      'The requested download link is no longer available.'
    );
  }

  if (!storedBucket) {
    logStructured('error', 'refresh_download_bucket_missing', logContext);
    return sendError(
      res,
      500,
      'STORAGE_UNAVAILABLE',
      'Download storage is not configured.'
    );
  }

  try {
    const rawSignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: storedBucket, Key: storageKey }),
      { expiresIn: URL_EXPIRATION_SECONDS }
    );
    const signedUrl =
      typeof rawSignedUrl === 'string' ? rawSignedUrl.trim() : '';
    if (!signedUrl) {
      logStructured('error', 'refresh_download_signed_url_missing', {
        ...logContext,
        storageKey,
      });
      return sendError(
        res,
        500,
        'DOWNLOAD_REFRESH_FAILED',
        S3_STORAGE_ERROR_MESSAGE,
        {
          bucket: storedBucket,
          key: storageKey,
          reason: 'Received an empty signed URL while refreshing the download link.',
        }
      );
    }
    const expiresAt = new Date(
      Date.now() + URL_EXPIRATION_SECONDS * 1000
    ).toISOString();

    if (logKey) {
      try {
        await logEvent({
          s3,
          bucket: storedBucket,
          key: logKey,
          jobId,
          event: 'download_link_refreshed',
          metadata: { storageKey },
        });
      } catch (logErr) {
        logStructured('warn', 'refresh_download_log_failed', {
          ...logContext,
          bucket: storedBucket,
          key: logKey,
          error: serializeError(logErr),
        });
      }
    }

    return res.json({
      success: true,
      url: signedUrl,
      expiresAt,
      storageKey,
    });
  } catch (err) {
    logStructured('error', 'refresh_download_sign_failed', {
      ...logContext,
      storageKey,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'DOWNLOAD_REFRESH_FAILED',
      S3_STORAGE_ERROR_MESSAGE,
      {
        bucket: storedBucket,
        key: storageKey,
        reason: err?.message || 'Unable to refresh the download link.',
      }
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
  const userId = res.locals.userId;
  const logContext = userId
    ? { requestId, jobId, userId }
    : { requestId, jobId };
  const sessionSegment =
    sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
    sanitizeS3KeyComponent(`session-${createIdentifier()}`);
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

  let storedTemplatePreference = '';
  if (userId) {
    try {
      await ensureTableExists();
      const preference = await loadUserTemplatePreference({
        dynamo,
        tableName,
        userId,
        logContext,
      });
      if (preference) {
        storedTemplatePreference = preference;
      }
    } catch (err) {
      logStructured('warn', 'user_template_preference_lookup_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  const { credlyProfileUrl } = req.body;
  const rawLinkedInBody =
    typeof req.body.linkedinProfileUrl === 'string'
      ? req.body.linkedinProfileUrl.trim()
      : '';
  const rawLinkedInQuery =
    typeof req.query?.linkedinProfileUrl === 'string'
      ? req.query.linkedinProfileUrl.trim()
      : '';
  const linkedinProfileUrlInput = rawLinkedInBody || rawLinkedInQuery || '';
  const linkedinProfileUrl = linkedinProfileUrlInput
    ? normalizeUrl(linkedinProfileUrlInput)
    : '';
  const manualJobDescriptionInput =
    typeof req.body.manualJobDescription === 'string'
      ? req.body.manualJobDescription
      : typeof req.body.jobDescriptionText === 'string'
        ? req.body.jobDescriptionText
        : '';
  const manualJobDescription = sanitizeManualJobDescription(manualJobDescriptionInput);
  const hasManualJobDescription = Boolean(manualJobDescription);
  const submittedCredly =
    typeof credlyProfileUrl === 'string' ? credlyProfileUrl.trim() : '';
  const profileIdentifier =
    resolveProfileIdentifier({ linkedinProfileUrl, userId, jobId }) || jobId;
  logStructured('info', 'process_cv_started', {
    ...logContext,
    credlyHost: getUrlHost(submittedCredly),
    linkedinHost: getUrlHost(linkedinProfileUrl),
    manualJobDescriptionProvided: hasManualJobDescription,
  });
  const bodyTemplate =
    typeof req.body.template === 'string' ? req.body.template.trim() : '';
  const queryTemplate =
    typeof req.query?.template === 'string' ? req.query.template.trim() : '';
  const bodyTemplateId =
    typeof req.body.templateId === 'string' ? req.body.templateId.trim() : '';
  const queryTemplateId =
    typeof req.query?.templateId === 'string' ? req.query.templateId.trim() : '';
  const bodyTemplate1 =
    typeof req.body.template1 === 'string' ? req.body.template1.trim() : '';
  const queryTemplate1 =
    typeof req.query?.template1 === 'string' ? req.query.template1.trim() : '';
  const bodyTemplate2 =
    typeof req.body.template2 === 'string' ? req.body.template2.trim() : '';
  const queryTemplate2 =
    typeof req.query?.template2 === 'string' ? req.query.template2.trim() : '';
  const requestedTemplateInput =
    bodyTemplateId || queryTemplateId || bodyTemplate || queryTemplate;
  const requestTemplate1 = bodyTemplate1 || queryTemplate1;
  const requestTemplate2 = bodyTemplate2 || queryTemplate2;
  const hasExplicitTemplateRequest = Boolean(
    requestedTemplateInput || requestTemplate1 || requestTemplate2
  );
  const effectivePreferredTemplate = hasExplicitTemplateRequest
    ? requestedTemplateInput
    : requestedTemplateInput || storedTemplatePreference;
  if (!hasExplicitTemplateRequest && storedTemplatePreference) {
    logStructured('info', 'user_template_preference_applied', {
      ...logContext,
      template: storedTemplatePreference,
    });
  }
  const defaultCvTemplate =
    requestTemplate1 || effectivePreferredTemplate || CV_TEMPLATES[0];
  const defaultClTemplate =
    req.body.coverTemplate || req.query.coverTemplate || CL_TEMPLATES[0];
  const selection = selectTemplates({
    defaultCvTemplate,
    defaultClTemplate,
    template1: requestTemplate1,
    template2: requestTemplate2,
    coverTemplate1: req.body.coverTemplate1 || req.query.coverTemplate1,
    coverTemplate2: req.body.coverTemplate2 || req.query.coverTemplate2,
    cvTemplates: req.body.templates || req.query.templates,
    clTemplates: req.body.coverTemplates || req.query.coverTemplates,
    preferredTemplate: effectivePreferredTemplate,
  });
  let {
    template1,
    template2,
    coverTemplate1,
    coverTemplate2,
    templates: availableCvTemplates,
    coverTemplates: availableCoverTemplates,
  } = selection;
  if (!Array.isArray(availableCvTemplates) || !availableCvTemplates.length) {
    availableCvTemplates = [...CV_TEMPLATES];
  }
  if (!Array.isArray(availableCoverTemplates) || !availableCoverTemplates.length) {
    availableCoverTemplates = [...CL_TEMPLATES];
  }
  logStructured('info', 'template_selection', {
    ...logContext,
    template1,
    template2,
    coverTemplate1,
    coverTemplate2,
    availableCvTemplates,
    availableCoverTemplates,
  });
  const canonicalSelectedTemplate =
    canonicalizeCvTemplateId(effectivePreferredTemplate) || template1;
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
  if (!hasManualJobDescription) {
    logStructured('warn', 'job_description_missing', logContext);
    return sendError(
      res,
      400,
      'JOB_DESCRIPTION_REQUIRED',
      'manualJobDescription required',
      { field: 'manualJobDescription' }
    );
  }
  const ext = (path.extname(req.file.originalname) || '').toLowerCase();
  const normalizedExt = ext || '.pdf';
  const storedFileType =
    req.file.mimetype || (normalizedExt.startsWith('.') ? normalizedExt.slice(1) : normalizedExt) || 'unknown';
  const temporaryPrefix = `${jobId}/incoming/${date}/`;
  let originalUploadKey = `${temporaryPrefix}original${normalizedExt}`;
  const initialUploadKey = originalUploadKey;
  let logKey = `${temporaryPrefix}logs/processing.jsonl`;
  const originalContentType = determineUploadContentType(req.file);
  if (originalContentType !== req.file.mimetype) {
    logStructured('warn', 'initial_upload_content_type_adjusted', {
      ...logContext,
      originalContentType: req.file.mimetype,
      normalizedContentType: originalContentType,
    });
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: originalUploadKey,
        Body: req.file.buffer,
        ContentType: originalContentType,
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
      S3_STORAGE_ERROR_MESSAGE,
      { bucket, reason: message }
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
  const applicantName = extractName(text);
  const sanitizedName = sanitizeName(applicantName) || 'candidate';
  const storedApplicantName = normalizePersonalData(applicantName);
  const storedLinkedIn = normalizePersonalData(profileIdentifier);
  const storedIpAddress = normalizePersonalData(ipAddress);
  const storedUserAgent = normalizePersonalData(userAgent);
  const storedCredlyProfile = normalizePersonalData(submittedCredly);
  const jobKeySegment = sanitizeJobSegment(jobId);
  const ownerSegment = resolveDocumentOwnerSegment({ userId, sanitizedName });
  const prefix = buildDocumentSessionPrefix({
    ownerSegment,
    dateSegment: date,
    jobSegment: jobKeySegment,
    sessionSegment,
  });
  const finalUploadKey = `${prefix}original${normalizedExt}`;
  const finalLogKey = `${prefix}logs/processing.jsonl`;
  const metadataKey = `${prefix}logs/log.json`;
  const sessionChangeLogKey = `${prefix}logs/change-log.json`;

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
  try {
    await ensureTableExists();
    const timestamp = new Date().toISOString();
    const putItemPayload = {
      TableName: tableName,
      Item: {
        linkedinProfileUrl: { S: storedLinkedIn },
        candidateName: { S: storedApplicantName },
        timestamp: { S: timestamp },
        uploadedAt: { S: timestamp },
        requestId: { S: safeRequestId },
        jobId: { S: jobId },
        credlyProfileUrl: { S: storedCredlyProfile },
        cv1Url: { S: '' },
        cv2Url: { S: '' },
        coverLetter1Url: { S: '' },
        coverLetter2Url: { S: '' },
        ipAddress: { S: storedIpAddress },
        userAgent: { S: storedUserAgent },
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
        status: { S: 'uploaded' },
        sessionChangeLogKey: { S: sessionChangeLogKey },
      }
    };
    await dynamo.send(new PutItemCommand(putItemPayload));
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

    const stageMetadataUpdated = await updateStageMetadata({
      s3,
      bucket,
      metadataKey,
      jobId,
      stage: 'upload',
      data: {
        uploadedAt: timestamp,
        fileType: storedFileType,
      },
      logContext,
    });

    if (stageMetadataUpdated) {
      logStructured('info', 'upload_metadata_written', {
        ...logContext,
        bucket,
        key: metadataKey,
      });
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'uploaded_metadata',
      });
    } else {
      logStructured('warn', 'upload_metadata_write_failed', {
        ...logContext,
        bucket,
        key: metadataKey,
      });
    }
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
      message: `credlyProfileUrl=${submittedCredly || ''}`
    });
    await logEvent({
      s3,
      bucket,
      key: logKey,
      jobId,
      event: 'selected_templates',
      message: `template1=${template1}; template2=${template2}`
    });

    const jobDescriptionHtml = manualJobDescription;
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

    const linkedinData = { experience: [], education: [], certifications: [] };

    const manualCertificates = parseManualCertificates(req.body.manualCertificates);
    if (manualCertificates.length) {
      logStructured('info', 'manual_certificates_received', {
        ...logContext,
        manualCount: manualCertificates.length,
      });
    }

    let credlyCertifications = [];
    let credlyStatus = {
      attempted: Boolean(submittedCredly),
      success: false,
      manualEntryRequired: false,
      message: '',
    };
    if (submittedCredly) {
      try {
        credlyCertifications = await fetchCredlyProfile(submittedCredly);
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

    const addedSkills = [];
    const missingSkills = Array.isArray(originalMatch.newSkills)
      ? originalMatch.newSkills
      : [];
    const finalScoreBreakdown = scoreBreakdown;

    const selectionInsights = buildSelectionInsights({
      jobTitle,
      originalTitle,
      modifiedTitle: originalTitle,
      jobDescriptionText: jobDescription,
      bestMatch: originalMatch,
      originalMatch,
      missingSkills,
      addedSkills,
      scoreBreakdown: finalScoreBreakdown,
      resumeExperience,
      linkedinExperience,
      knownCertificates,
      certificateSuggestions,
      manualCertificatesRequired,
    });

    logStructured('info', 'process_cv_scoring_completed', {
      ...logContext,
      applicantName,
      originalScore: originalMatch.score,
      enhancedScore: originalMatch.score,
      missingSkills: missingSkills.length,
    });

    try {
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'analysis_completed',
      });
    } catch (logErr) {
      logStructured('error', 's3_log_failure', {
        ...logContext,
        error: serializeError(logErr),
      });
    }

    const atsSubScores = scoreBreakdownToArray(finalScoreBreakdown);

    const normalizedMissingSkills = Array.isArray(missingSkills)
      ? missingSkills.map((skill) => String(skill))
      : [];
    const normalizedAddedSkills = Array.isArray(addedSkills)
      ? addedSkills.map((skill) => String(skill))
      : [];
    const normalizedScore = Number.isFinite(originalMatch?.score)
      ? Number(originalMatch.score)
      : 0;
    const scoringCompletedAt = new Date().toISOString();
    const scoringMetadataKey = originalUploadKey
      ? `${originalUploadKey.replace(/[^/]+$/, '')}logs/log.json`
      : '';

    const scoringUpdate = {
      normalizedMissingSkills,
      normalizedAddedSkills,
      normalizedScore,
    };

    const templateContextInput = {
      template1,
      template2,
      coverTemplate1,
      coverTemplate2,
    templates: availableCvTemplates,
    coverTemplates: availableCoverTemplates,
    selectedTemplate: canonicalSelectedTemplate,
    templateHistory: normalizeTemplateHistory(req.body.templateHistory, [
      canonicalSelectedTemplate,
    ])
  };
    const templateParamConfig = parseTemplateParamsConfig(req.body.templateParams);

    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          UpdateExpression:
            'SET #status = :status, analysisCompletedAt = :completedAt, missingSkills = :missing, addedSkills = :added, enhancedScore = :score, originalScore = if_not_exists(originalScore, :score)',
          ExpressionAttributeValues: {
            ':status': { S: 'scored' },
            ':completedAt': { S: scoringCompletedAt },
            ':missing': {
              L: scoringUpdate.normalizedMissingSkills.map((skill) => ({
                S: skill,
              })),
            },
            ':added': {
              L: scoringUpdate.normalizedAddedSkills.map((skill) => ({
                S: skill,
              })),
            },
            ':score': { N: String(scoringUpdate.normalizedScore) },
            ':jobId': { S: jobId },
            ':statusUploaded': { S: 'uploaded' },
          },
          ExpressionAttributeNames: { '#status': 'status' },
          ConditionExpression:
            'jobId = :jobId AND (#status = :statusUploaded OR #status = :status OR attribute_not_exists(#status))',
        })
      );
      await logEvent({
        s3,
        bucket,
        key: logKey,
        jobId,
        event: 'scoring_metadata_updated',
        metadata: {
          score: scoringUpdate.normalizedScore,
          missingSkillsCount: scoringUpdate.normalizedMissingSkills.length,
          addedSkillsCount: scoringUpdate.normalizedAddedSkills.length,
        },
      });
      await updateStageMetadata({
        s3,
        bucket,
        metadataKey: scoringMetadataKey,
        jobId,
      stage: 'scoring',
      data: {
        completedAt: scoringCompletedAt,
        score: scoringUpdate.normalizedScore,
      },
      logContext,
    });
    } catch (updateErr) {
      logStructured('error', 'process_cv_status_update_failed', {
        ...logContext,
        error: serializeError(updateErr),
      });
    }

    let enhancedResponse = null;
    let lastGenerationError = null;
    const generationRequest = {
      res,
      s3,
      dynamo,
      tableName,
      bucket,
      logKey,
      jobId,
      requestId,
      logContext,
      resumeText: text,
      originalResumeTextInput: originalResumeText,
      jobDescription,
      jobSkills,
      resumeSkills,
      originalMatch,
      linkedinProfileUrl,
      linkedinData,
      credlyProfileUrl,
      credlyCertifications,
      credlyStatus,
      manualCertificates,
      templateContextInput,
      templateParamConfig,
      applicantName,
      sanitizedName,
      storedLinkedIn,
      originalUploadKey,
      selection,
      geminiApiKey: secrets.GEMINI_API_KEY,
      changeLogEntries: [],
      existingRecord: {
        device: { S: device },
        os: { S: os },
        browser: { S: browser },
        location: { S: locationLabel },
        locationCity: { S: locationMeta.city || '' },
        locationRegion: { S: locationMeta.region || '' },
        locationCountry: { S: locationMeta.country || '' },
      },
      userId: res.locals.userId,
      plainPdfFallbackEnabled: Boolean(secrets.ENABLE_PLAIN_PDF_FALLBACK),
    };

    try {
      enhancedResponse = await generateEnhancedDocumentsResponse(generationRequest);
    } catch (generationErr) {
      lastGenerationError = generationErr;
      logStructured('warn', 'process_cv_generation_failed', {
        ...logContext,
        error: serializeError(generationErr),
      });
    }

    if (!enhancedResponse && !res.headersSent) {
      logStructured('info', 'process_cv_generation_retry', {
        ...logContext,
        strategy: 'disable_generative_enhancements',
      });
      try {
        enhancedResponse = await generateEnhancedDocumentsResponse({
          ...generationRequest,
          geminiApiKey: null,
        });
      } catch (retryErr) {
        lastGenerationError = retryErr;
        logStructured('error', 'process_cv_generation_retry_failed', {
          ...logContext,
          error: serializeError(retryErr),
        });
      }
    }

    if (enhancedResponse) {
      return res.json(enhancedResponse);
    }

    if (res.headersSent) {
      return;
    }

    logStructured('error', 'process_cv_generation_unavailable', {
      ...logContext,
      error: lastGenerationError ? serializeError(lastGenerationError) : undefined,
    });

    const errorDetails =
      lastGenerationError && lastGenerationError.message &&
      lastGenerationError.message !== CV_GENERATION_ERROR_MESSAGE
        ? { reason: lastGenerationError.message }
        : undefined;

    return sendError(
      res,
      500,
      'DOCUMENT_GENERATION_FAILED',
      LAMBDA_PROCESSING_ERROR_MESSAGE,
      errorDetails
    );


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

app.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (res.headersSent) {
    return next(err);
  }

  const statusCandidates = [err?.statusCode, err?.status, err?.httpStatus];
  const status = statusCandidates.find(
    (value) => Number.isInteger(value) && value >= 400 && value <= 599
  ) || 500;

  const code =
    typeof err?.code === 'string' && err.code.trim()
      ? err.code.trim()
      : status >= 500
        ? 'INTERNAL_SERVER_ERROR'
        : 'BAD_REQUEST';

  const fallbackMessage =
    status >= 500
      ? 'An unexpected error occurred. Please try again later.'
      : 'The request could not be completed.';

  const message =
    typeof err?.message === 'string' && err.message.trim()
      ? err.message.trim()
      : fallbackMessage;

  const details = err?.details ?? err?.errors ?? err?.data ?? undefined;

  logStructured('error', 'unhandled_request_error', {
    requestId: req.requestId,
    path: req.originalUrl || req.url,
    method: req.method,
    status,
    code,
    error: serializeError(err),
  });

  return sendError(res, status, code, message, details);
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
  generatePdfWithFallback,
  setGeneratePdf,
  setTemplateBackstop,
  setChromiumLauncher,
  setS3Client,
  setPlainPdfFallbackEngines,
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
  canonicalSectionKey,
  TEMPLATE_IDS,
  CV_TEMPLATES,
  CL_TEMPLATES,
  CV_TEMPLATE_GROUPS,
  CONTRASTING_PAIRS,
  selectTemplates,
  removeGuidanceLines,
  sanitizeGeneratedText,
  resolveEnhancementTokens,
  injectEnhancementTokens,
  relocateProfileLinks,
  verifyResume,
  createResumeVariants,
  classifyDocument,
  buildScoreBreakdown,
  enforceTargetedUpdate,
  JobDescriptionFetchBlockedError,
  extractContactDetails,
  buildTemplateSectionContext,
  buildTemplateContactEntries,
  CHANGE_LOG_FIELD_LIMITS,
  CHANGE_LOG_DYNAMO_LIMITS,
  mapCoverLetterFields,
  ensureOutputFileUrls,
  determineUploadContentType,
  setCoverLetterFallbackBuilder,
};
