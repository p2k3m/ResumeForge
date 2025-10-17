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
  DeleteItemCommand,
} = DynamoDB;
import fs from 'fs/promises';
import fsSync from 'fs';
import { spawnSync } from 'node:child_process';
import { logEvent, logErrorTrace } from './logger.js';
import {
  executeWithRetry,
  getErrorStatus,
  shouldRetryGeminiError,
  shouldRetryS3Error,
} from './lib/retry.js';
import Handlebars from './lib/handlebars.js';
import JSON5 from 'json5';
import mime from 'mime-types';
import { buildAggregatedChangeLogSummary } from './client/src/utils/changeLogSummaryShared.js';
import {
  getDeploymentEnvironment,
  withEnvironmentTagging,
} from './config/environment.js';
import {
  API_ERROR_CONTRACTS,
  CV_GENERATION_ERROR_MESSAGE,
  DOWNLOAD_SESSION_EXPIRED_MESSAGE,
  GEMINI_ENHANCEMENT_ERROR_MESSAGE,
  LAMBDA_PROCESSING_ERROR_MESSAGE,
  S3_CHANGE_LOG_ERROR_MESSAGE,
  S3_STORAGE_ERROR_MESSAGE,
  buildServiceErrorFallbackMessages
} from './client/src/shared/serviceErrorContracts.js';
import { MIMEType } from 'node:util';
import { renderTemplatePdf } from './lib/pdf/index.js';
import { backstopPdfTemplates as runPdfTemplateBackstop } from './lib/pdf/backstop.js';
import {
  parseTemplateParams as parseTemplateParamsConfig,
  resolveTemplateParams as resolveTemplateParamsConfig
} from './lib/pdf/utils.js';
import { ENHANCEMENT_TYPES } from './lib/resume/enhancement.js';
import {
  extractResumeText,
  classifyResumeDocument,
  shouldRejectBasedOnClassification,
} from './lib/resume/parsing.js';
import {
  createGeminiGenerativeModel,
  generateContentWithRetry,
  parseGeminiJsonResponse,
} from './lib/llm/gemini.js';
import {
  normalizeUrl,
  detectLikelyLocation,
  extractContactDetails,
  parseContactLine,
  dedupeContactLines,
  filterSensitiveContactLines,
  buildTemplateContactContext,
  parseLine,
  normalizeHeading,
  ensureRequiredSections,
  splitSkills,
  moveSummaryJobEntries,
  mergeDuplicateSections,
  pruneEmptySections,
  normalizeName,
  containsContactInfo,
  isJobEntry,
  parseContent,
  extractExperience,
  extractEducation,
  extractCertifications,
} from './lib/resume/content.js';
import { publishResumeWorkflowEvent } from './services/orchestration/eventBridgePublisher.js';
import {
  TECHNICAL_TERMS,
  calculateMatchScore,
  computeSkillGap,
  extractResumeSkills,
  normalizeSkillListInput,
} from './lib/resume/skills.js';
import { evaluateJobDescription } from './lib/resume/jobEvaluation.js';
import { scoreResumeAgainstJob } from './lib/resume/scoring.js';
import { createTextDigest } from './lib/resume/utils.js';
import { createVersionedPrompt, PROMPT_TEMPLATES } from './lib/llm/templates.js';
import { resolveServiceForRoute } from './microservices/services.js';
import { stripUploadMetadata } from './lib/uploads/metadata.js';
import createS3StreamingStorage from './lib/uploads/s3StreamingStorage.js';
import { withRequiredLogAttributes } from './lib/logging/attributes.js';

const knownResumeIdentifiers = new Set();

const extractText = extractResumeText;
const classifyDocument = classifyResumeDocument;
const deploymentEnvironment = getDeploymentEnvironment();
const logLevelOrder = new Map([
  ['debug', 10],
  ['info', 20],
  ['warn', 30],
  ['error', 40],
]);

function resolveActiveLogLevel() {
  const configured = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  const debugOverride = /^(1|true|yes|on)$/i.test(process.env.ENABLE_DEBUG_LOGGING || '');
  if (debugOverride) {
    return 'debug';
  }
  if (logLevelOrder.has(configured)) {
    return configured;
  }
  const productionLabels = new Set(['prod', 'production']);
  return productionLabels.has(deploymentEnvironment.trim().toLowerCase()) ? 'info' : 'debug';
}

const activeLogLevel = resolveActiveLogLevel();

function shouldLog(level) {
  const resolvedLevel = typeof level === 'string' ? level.trim().toLowerCase() : 'info';
  const targetWeight = logLevelOrder.get(resolvedLevel);
  if (typeof targetWeight !== 'number') {
    return true;
  }
  const activeWeight = logLevelOrder.get(activeLogLevel) ?? logLevelOrder.get('info');
  return targetWeight >= activeWeight;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDir = path.join(__dirname, 'client');
const clientDistDir = path.join(clientDir, 'dist');
const clientIndexPath = path.join(clientDistDir, 'index.html');
let cachedClientIndexHtml;
let clientAutoBuildAttempted = false;
let s3Client;

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

const DOWNLOAD_LINK_GENERATION_ERROR_MESSAGE =
  'Unable to prepare download links for the generated documents.';

function normalizeMessageList(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (const entry of messages) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
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

function formatDocumentTypeLabel(documentType) {
  if (!documentType) {
    return 'document';
  }
  const normalized = String(documentType).trim().toLowerCase();
  if (!normalized) {
    return 'document';
  }
  if (normalized === 'cover_letter' || normalized === 'cover-letter') {
    return 'cover letter';
  }
  if (normalized === 'resume' || normalized === 'cv') {
    return 'resume';
  }
  return normalized.replace(/[_\-]+/g, ' ');
}

function formatTemplateDisplayNames(templates = [], documentType) {
  const names = [];
  const seen = new Set();
  for (const entry of templates) {
    if (!entry || typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const display =
      documentType === 'cover_letter'
        ? formatCoverTemplateDisplayName(trimmed)
        : formatTemplateDisplayName(trimmed);
    const normalized = display && display.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(normalized);
  }
  return names;
}

function formatListForMessage(values = []) {
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  const last = values[values.length - 1];
  return `${values.slice(0, -1).join(', ')}, and ${last}`;
}

function buildPdfFailureSummary({ documentType, templates = [], lastError }) {
  const docLabel = formatDocumentTypeLabel(documentType);
  const templateNames = formatTemplateDisplayNames(templates, documentType);
  const templateSegment = templateNames.length
    ? ` Tried templates: ${formatListForMessage(templateNames)}.`
    : '';
  const lastErrorMessage =
    typeof lastError?.message === 'string' ? lastError.message.trim() : '';
  const errorSegment = lastErrorMessage ? ` Last error: ${lastErrorMessage}` : '';
  return `Unable to generate ${docLabel} PDF.${templateSegment}${errorSegment}`.trim();
}

class PdfGenerationError extends Error {
  constructor({
    message,
    documentType,
    templates,
    cause,
    summary,
    messages,
    details,
    code,
  } = {}) {
    const normalizedSummary = summary || message;
    super(normalizedSummary || 'PDF generation failed.');
    this.name = 'PdfGenerationError';
    if (cause) {
      this.cause = cause;
    }
    if (documentType) {
      this.documentType = documentType;
    }
    const templateList = Array.isArray(templates) ? templates.filter(Boolean) : [];
    if (templateList.length) {
      this.templates = [...templateList];
      this.templatesTried = [...templateList];
    }
    const normalizedMessages = normalizeMessageList(messages);
    if (normalizedMessages.length) {
      this.messages = normalizedMessages;
    }
    if (summary) {
      this.summary = summary;
    }
    this.code =
      typeof code === 'string' && code.trim()
        ? code.trim()
        : documentType === 'cover_letter'
          ? 'COVER_LETTER_GENERATION_FAILED'
          : 'PDF_GENERATION_FAILED';
    if (details && typeof details === 'object') {
      this.details = { ...details };
    }
  }
}

let chromium;
let puppeteerCore;
let chromiumLaunchAttempted = false;
let customChromiumLauncher;

let sharedGenerativeModelPromise;

const LEARNING_RESOURCE_LIMITS = Object.freeze({
  skills: 3,
  linksPerSkill: 3,
});

const RESOURCE_PROVIDER_LABELS = Object.freeze({
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'm.youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'coursera.org': 'Coursera',
  'www.coursera.org': 'Coursera',
  'udemy.com': 'Udemy',
  'www.udemy.com': 'Udemy',
});

function resolveResourceProvider(url = '') {
  if (typeof url !== 'string' || !url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname || '';
    if (!hostname) {
      return '';
    }
    const normalized = hostname.toLowerCase();
    if (RESOURCE_PROVIDER_LABELS[normalized]) {
      return RESOURCE_PROVIDER_LABELS[normalized];
    }
    return hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function normalizeLearningSkillList(skills = [], limit = LEARNING_RESOURCE_LIMITS.skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  const unique = [];
  const seen = new Set();
  skills.forEach((skill) => {
    if (typeof skill !== 'string') {
      return;
    }
    const trimmed = skill.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(trimmed);
  });
  return unique.slice(0, Math.max(1, limit));
}

function sanitizeLearningResourceEntries(entries, { missingSkills = [] } = {}) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const allowedSkills = normalizeLearningSkillList(missingSkills);
  const allowedSet = new Set(allowedSkills.map((skill) => skill.toLowerCase()));
  const result = [];
  const seenSkills = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const rawSkill = typeof entry.skill === 'string' ? entry.skill.trim() : '';
    if (!rawSkill) continue;
    const skillKey = rawSkill.toLowerCase();
    if (allowedSet.size > 0 && !allowedSet.has(skillKey)) continue;
    if (seenSkills.has(skillKey)) continue;

    const links = Array.isArray(entry.resources || entry.links) ? entry.resources || entry.links : [];
    const sanitizedLinks = [];
    for (const link of links) {
      if (!link || typeof link !== 'object') continue;
      const url = typeof link.url === 'string' ? link.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) continue;
      const title = typeof link.title === 'string' && link.title.trim() ? link.title.trim() : url;
      const description = typeof link.description === 'string' ? link.description.trim() : '';
      sanitizedLinks.push({ title, url, description });
      if (sanitizedLinks.length >= LEARNING_RESOURCE_LIMITS.linksPerSkill) {
        break;
      }
    }

    if (sanitizedLinks.length === 0) continue;
    result.push({ skill: rawSkill, resources: sanitizedLinks });
    seenSkills.add(skillKey);
    if (result.length >= LEARNING_RESOURCE_LIMITS.skills) {
      break;
    }
  }

  return result;
}

function formatLearningResourceDescriptor(resource) {
  if (!resource || typeof resource !== 'object') {
    return '';
  }
  const url = typeof resource.url === 'string' ? resource.url.trim() : '';
  if (!url) {
    return '';
  }
  const title =
    typeof resource.title === 'string' && resource.title.trim()
      ? resource.title.trim()
      : '';
  const provider = resolveResourceProvider(url);
  const providerLabel =
    provider && title && title.toLowerCase().includes(provider.toLowerCase())
      ? ''
      : provider;
  const descriptor = [title || '', providerLabel || ''].filter(Boolean).join(' ');
  const anchor = descriptor || url;
  return `${anchor} → ${url}`;
}

function buildResourceHighlightSummary(entries, { limit = 2 } = {}) {
  if (!Array.isArray(entries) || !entries.length) {
    return '';
  }
  const highlights = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const skill = typeof entry.skill === 'string' ? entry.skill.trim() : '';
    if (!skill) continue;
    const resources = Array.isArray(entry.resources) ? entry.resources : [];
    const primary = resources.find(
      (item) => item && typeof item.url === 'string' && item.url.trim()
    );
    const descriptor = formatLearningResourceDescriptor(primary);
    if (!descriptor) continue;
    highlights.push(`${skill}: ${descriptor}`);
    if (highlights.length >= Math.max(1, limit)) {
      break;
    }
  }
  return summarizeList(highlights, { limit: Math.max(1, limit), conjunction: 'and' });
}

function buildFallbackLearningResources(skills, { jobTitle = '' } = {}) {
  const normalizedSkills = normalizeLearningSkillList(skills);
  if (!normalizedSkills.length) {
    return [];
  }
  return normalizedSkills.map((skill) => {
    const focus = jobTitle ? `${skill} for ${jobTitle}` : `${skill} interview prep`;
    return {
      skill,
      resources: [
        {
          title: `${skill} crash course (YouTube)`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(focus)}`,
          description: 'Video playlist to refresh the fundamentals quickly.',
        },
        {
          title: `${skill} guided course (Coursera)`,
          url: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
          description: 'Structured Coursera path to cover the fundamentals fast.',
        },
        {
          title: `${skill} bootcamp picks (Udemy)`,
          url: `https://www.udemy.com/courses/search/?q=${encodeURIComponent(skill)}`,
          description: 'Top-rated Udemy sprint courses for quick hands-on practice.',
        },
      ].slice(0, LEARNING_RESOURCE_LIMITS.linksPerSkill),
    };
  });
}

async function generateLearningResources(skills, context = {}) {
  const normalizedSkills = normalizeLearningSkillList(skills);
  if (!normalizedSkills.length) {
    return [];
  }

  const focusSummary = summarizeJobFocus(context.jobDescription || context.jobDescriptionText || '');
  const templateMeta = PROMPT_TEMPLATES.learningResources;
  const promptPackage = createVersionedPrompt({
    ...templateMeta,
    description: 'Recommend learning resources that close candidate skill gaps.',
    metadata: { skill_count: normalizedSkills.length || 0 },
    sections: [
      {
        title: 'TASK',
        body: [
          'You are an interview coach helping a candidate close skill gaps before interviews.',
          'Recommend 2-3 public learning resources per skill (YouTube playlists, documentation, hands-on labs, credible tutorials).',
          'Prioritise reputable platforms such as YouTube, Coursera, or Udemy and provide the direct URL for each pick.',
        ].join('\n'),
      },
      {
        title: 'SKILLS',
        body: normalizedSkills.length ? normalizedSkills.join(', ') : 'None provided',
      },
      {
        title: 'JOB CONTEXT',
        body: [
          context.jobTitle ? `Target job title: ${context.jobTitle}` : 'Target job title: Not provided',
          focusSummary ? `Job focus: ${focusSummary}` : 'Job focus: Not provided',
        ],
      },
      {
        title: 'OUTPUT REQUIREMENTS',
        body: [
          'Respond with JSON in the format {"resources":[{"skill":"<skill>","resources":[{"title":"","url":"https://","description":""}]}]}.',
          'Keep descriptions under 160 characters, reference only reputable sites, and ensure each URL is absolute.',
        ],
      },
    ],
  });
  const prompt = promptPackage.text;
  const promptDigest = createTextDigest(prompt);

  const disableGenerative =
    context.disableGenerative ||
    (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_GENERATIVE !== 'true');

  if (!disableGenerative) {
    try {
      const model = await getSharedGenerativeModel();
      if (model?.generateContent) {
        const learningLogger = createStructuredLogger({
          skills: normalizedSkills,
          requestId: context.requestId,
        });
        const startedAt = Date.now();
        const response = await generateContentWithRetry(model, prompt, {
          retryLogEvent: 'learning_resource_generation',
          retryLogContext: { skills: normalizedSkills },
          logger: learningLogger,
        });
        const latencyMs = Date.now() - startedAt;
        const parsed = parseGeminiJsonResponse(response?.response?.text?.(), {
          logger: learningLogger,
        });
        const sanitized = sanitizeLearningResourceEntries(parsed?.resources, {
          missingSkills: normalizedSkills,
        });
        if (sanitized.length) {
          const outputDigest = createTextDigest(JSON.stringify(sanitized));
          recordLlmTelemetry({
            requestId: context.requestId,
            operation: 'learning_resources',
            templateId: promptPackage.templateId,
            templateVersion: promptPackage.templateVersion,
            promptDigest,
            outputDigest,
            latencyMs,
            resourceCount: sanitized.length,
            skillCount: normalizedSkills.length,
          });
          return sanitized;
        }
      }
    } catch (err) {
      logStructured('warn', 'learning_resource_generation_failed', {
        error: serializeError(err),
        skills: normalizedSkills,
      });
    }
  }

  const fallback = buildFallbackLearningResources(normalizedSkills, context);
  recordLlmTelemetry({
    requestId: context.requestId,
    operation: 'learning_resources',
    templateId: PROMPT_TEMPLATES.learningResources.templateId,
    templateVersion: PROMPT_TEMPLATES.learningResources.templateVersion,
    outputDigest: createTextDigest(JSON.stringify(fallback)),
    resourceCount: fallback.length,
    skillCount: normalizedSkills.length,
    outcome: 'fallback',
  });
  return fallback;
}

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

function resetTestState() {
  runtimeConfigFileCache = undefined;
  runtimeConfigFileError = undefined;
  runtimeConfigFileLoaded = false;

  runtimeConfigCache = undefined;
  runtimeConfigError = undefined;
  runtimeConfigLogged = false;
  runtimeConfigSnapshot = loadRuntimeConfig({ logOnError: true });

  configuredRegion =
    runtimeConfigSnapshot?.AWS_REGION || readEnvValue('AWS_REGION') || DEFAULT_AWS_REGION;
  process.env.AWS_REGION = configuredRegion;
  region = configuredRegion;
  s3Client = new S3Client({ region });
  errorLogS3Client = s3Client;
  errorLogBucket =
    runtimeConfigSnapshot?.S3_BUCKET || process.env.S3_BUCKET || readEnvValue('S3_BUCKET');

  sharedGenerativeModelPromise = undefined;
  chromium = undefined;
  puppeteerCore = undefined;
  chromiumLaunchAttempted = false;
  customChromiumLauncher = null;
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
      return createGeminiGenerativeModel({ apiKey: GEMINI_API_KEY });
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

function normalizeFlag(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function flagEnabled(value) {
  const normalized = normalizeFlag(value);
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function flagDisabled(value) {
  const normalized = normalizeFlag(value);
  return normalized === '0' || normalized === 'false' || normalized === 'no';
}

function shouldAutoBuildClientAssets() {
  if (flagDisabled(process.env.ENABLE_CLIENT_AUTO_BUILD)) {
    return false;
  }

  if (flagEnabled(process.env.ENABLE_CLIENT_AUTO_BUILD)) {
    return true;
  }

  const nodeEnv = normalizeFlag(process.env.NODE_ENV) || 'development';

  if (nodeEnv === 'production' || nodeEnv === 'test') {
    return false;
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false;
  }

  if (flagEnabled(process.env.CI)) {
    return false;
  }

  return true;
}

function buildClientAssets() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'build:client'], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const error = new Error(`Client build exited with status ${result.status}`);
    error.code = result.status;
    throw error;
  }
}

function attemptClientAutoBuild() {
  if (clientAutoBuildAttempted) {
    return false;
  }

  clientAutoBuildAttempted = true;

  if (!shouldAutoBuildClientAssets()) {
    return false;
  }

  try {
    logStructured('info', 'client_build_auto_build_started', {
      command: 'npm run build:client',
      path: clientIndexPath,
    });
    buildClientAssets();
    cachedClientIndexHtml = undefined;
    logStructured('info', 'client_build_auto_build_succeeded', {
      path: clientIndexPath,
    });
    return true;
  } catch (error) {
    logStructured('error', 'client_build_auto_build_failed', {
      path: clientIndexPath,
      error: serializeError(error),
    });
    return false;
  }
}

function clientAssetsAvailable() {
  if (fsSync.existsSync(clientIndexPath)) {
    return true;
  }

  if (attemptClientAutoBuild() && fsSync.existsSync(clientIndexPath)) {
    return true;
  }

  return false;
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
const DOWNLOAD_SESSION_RETENTION_MS = URL_EXPIRATION_SECONDS * 1000;
const isTestEnvironment = process.env.NODE_ENV === 'test';

const parsePositiveInt = (value) => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

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

const LOG_REDACTED_VALUE = '[REDACTED]';
const LOG_CIRCULAR_VALUE = '[Circular]';

const SENSITIVE_KEY_TOKENS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'secrets',
  'token',
  'tokens',
  'authorization',
  'authorisation',
  'auth',
  'credential',
  'credentials',
  'cookie',
  'csrf',
  'bearer',
  'jwt',
  'oauth',
  'apikey',
  'accesskey',
  'secretkey',
  'privatekey',
  'clientsecret',
  'clientid',
  'sessionid',
  'sessiontoken',
  'sessionsecret',
  'sessionkey',
  'authtoken',
]);

const SENSITIVE_KEY_COMBINATIONS = [
  ['api', 'key'],
  ['access', 'key'],
  ['secret', 'key'],
  ['private', 'key'],
  ['client', 'secret'],
  ['client', 'id'],
  ['session', 'id'],
  ['session', 'token'],
  ['session', 'secret'],
  ['session', 'key'],
  ['auth', 'token'],
  ['x', 'api', 'key'],
];

const SENSITIVE_VALUE_PATTERNS = [
  /^\s*Bearer\s+\S+/i,
  /^\s*Basic\s+\S+/i,
  /-----BEGIN [A-Z ]+-----/, // PEM blocks
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/, // AWS temp access key id
  /\bA3T[A-Z0-9]{16}\b/,
  /\bAIza[0-9A-Za-z\-_]{35}\b/, // Google API key format
  /\bya29\.[0-9A-Za-z\-_]+\b/, // Google OAuth tokens
  /\b(?:eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,})\b/, // JWTs
];

function isSensitiveLogKey(key = '') {
  if (!key) {
    return false;
  }
  const tokens = key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase()
    .split('_')
    .filter(Boolean);
  if (!tokens.length) {
    return false;
  }
  const collapsed = tokens.join('');
  if (SENSITIVE_KEY_TOKENS.has(collapsed)) {
    return true;
  }
  if (tokens.some((token) => SENSITIVE_KEY_TOKENS.has(token))) {
    return true;
  }
  for (const combo of SENSITIVE_KEY_COMBINATIONS) {
    if (combo.every((needle) => tokens.includes(needle))) {
      return true;
    }
  }
  return false;
}

function looksLikeSensitiveValue(value = '') {
  if (typeof value !== 'string') {
    return false;
  }
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function describeFunction(value) {
  const name = value && value.name ? `: ${value.name}` : '';
  return `[Function${name}]`;
}

function sanitizeLogValue(value, { key = '', sensitive = false, seen = new WeakSet() } = {}) {
  const nextSensitive = sensitive || isSensitiveLogKey(key);

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer length=${value.length}]`;
  }

  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`;
  }

  if (ArrayBuffer.isView(value)) {
    const constructorName = value.constructor?.name || 'TypedArray';
    const length = 'length' in value ? value.length : value.byteLength;
    return `[${constructorName} length=${length}]`;
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (typeof value === 'string') {
    if (nextSensitive || looksLikeSensitiveValue(value)) {
      return LOG_REDACTED_VALUE;
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return nextSensitive ? LOG_REDACTED_VALUE : value;
  }

  if (typeof value === 'boolean') {
    return nextSensitive ? LOG_REDACTED_VALUE : value;
  }

  if (typeof value === 'bigint') {
    return nextSensitive ? LOG_REDACTED_VALUE : value.toString();
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return describeFunction(value);
  }

  if (value instanceof Promise) {
    return '[Promise]';
  }

  if (typeof value !== 'object') {
    return nextSensitive ? LOG_REDACTED_VALUE : value;
  }

  if (seen.has(value)) {
    return LOG_CIRCULAR_VALUE;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeLogValue(item, { key: String(index), sensitive: nextSensitive, seen })
    );
  }

  if (value instanceof Set) {
    return Array.from(value).map((item, index) =>
      sanitizeLogValue(item, { key: String(index), sensitive: nextSensitive, seen })
    );
  }

  if (value instanceof Map) {
    const mapped = {};
    for (const [entryKey, entryValue] of value.entries()) {
      let keyString;
      if (typeof entryKey === 'string') {
        keyString = entryKey;
      } else {
        try {
          keyString = JSON.stringify(entryKey);
        } catch {
          keyString = String(entryKey);
        }
      }
      mapped[keyString] = sanitizeLogValue(entryValue, {
        key: keyString,
        sensitive: nextSensitive,
        seen,
      });
    }
    return mapped;
  }

  if (value instanceof URLSearchParams) {
    const params = {};
    for (const [paramKey, paramValue] of value.entries()) {
      params[paramKey] = sanitizeLogValue(paramValue, {
        key: paramKey,
        sensitive: nextSensitive,
        seen,
      });
    }
    return params;
  }

  const entries = Object.entries(value);
  const result = {};
  for (const [entryKey, entryValue] of entries) {
    result[entryKey] = sanitizeLogValue(entryValue, {
      key: entryKey,
      sensitive: nextSensitive,
      seen,
    });
  }
  return result;
}

function sanitizeLogPayload(payload) {
  return sanitizeLogValue(payload, { seen: new WeakSet() });
}

const requestContextStore = new Map();
let errorLogS3Client;
let errorLogBucket;
const ERROR_LOG_PREFIX = 'logs/errors/';

function createErrorLogDescriptor(entry = {}) {
  const now = new Date();
  const timestamp = now.toISOString();
  const fallbackRequestId = `request-${createIdentifier()}`;
  const fallbackTimestamp = `ts-${createIdentifier()}`;
  const dateSegment = sanitizeS3KeyComponent(timestamp.slice(0, 10), {
    fallback: 'unknown-date',
  }) || 'unknown-date';
  const safeTimestampSegment =
    sanitizeS3KeyComponent(timestamp, { fallback: fallbackTimestamp }) ||
    sanitizeS3KeyComponent(fallbackTimestamp) ||
    fallbackTimestamp;
  const safeRequestSegment =
    sanitizeS3KeyComponent(entry.requestId, { fallback: fallbackRequestId }) ||
    sanitizeS3KeyComponent(fallbackRequestId) ||
    fallbackRequestId;
  const normalizedPrefix = ERROR_LOG_PREFIX.replace(/^\/+/, '');
  const prefix = normalizedPrefix.endsWith('/')
    ? normalizedPrefix
    : `${normalizedPrefix}/`;
  const key = `${prefix}${dateSegment}/${safeTimestampSegment}-${safeRequestSegment}.json`;
  return { key, timestamp };
}

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

function appendRequestLlmTrace(requestId, trace = {}) {
  if (!requestId || !trace || typeof trace !== 'object') {
    return;
  }
  const context = ensureRequestContext(requestId);
  if (!context) {
    return;
  }
  if (!Array.isArray(context.llmTraces)) {
    context.llmTraces = [];
  }
  const sanitized = Object.fromEntries(
    Object.entries(trace).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  context.llmTraces.push({ ...sanitized });
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
  const descriptor = createErrorLogDescriptor(payload);
  if (payload.requestId) {
    updateRequestContext(payload.requestId, {
      errorLogReference: {
        bucket: errorLogBucket,
        key: descriptor.key,
        timestamp: descriptor.timestamp,
        status: 'pending',
      },
    });
  }
  scheduleTask(() => {
    logErrorTrace({
      s3: errorLogS3Client,
      bucket: errorLogBucket,
      prefix: ERROR_LOG_PREFIX,
      entry: { ...payload, timestamp: descriptor.timestamp },
      key: descriptor.key,
    })
      .then(() => {
        if (payload.requestId && getRequestContext(payload.requestId)) {
          updateRequestContext(payload.requestId, {
            errorLogReference: {
              bucket: errorLogBucket,
              key: descriptor.key,
              timestamp: descriptor.timestamp,
              status: 'stored',
            },
          });
        }
      })
      .catch((err) => {
        if (payload.requestId && getRequestContext(payload.requestId)) {
          updateRequestContext(payload.requestId, {
            errorLogReference: {
              bucket: errorLogBucket,
              key: descriptor.key,
              timestamp: descriptor.timestamp,
              status: 'failed',
            },
          });
        }
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
  if (!shouldLog(level)) {
    return;
  }
  const payload = withRequiredLogAttributes(
    {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    },
    context
  );
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
    const safePayload = sanitizeLogPayload(payload);
    const serialised = JSON.stringify(safePayload);
    logFn(serialised);
    if (level === 'error') {
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

function createStructuredLogger(baseContext = {}) {
  return {
    debug: (event, details = {}) => logStructured('debug', event, { ...baseContext, ...details }),
    info: (event, details = {}) => logStructured('info', event, { ...baseContext, ...details }),
    warn: (event, details = {}) => logStructured('warn', event, { ...baseContext, ...details }),
    error: (event, details = {}) => logStructured('error', event, { ...baseContext, ...details }),
  };
}

function recordLlmTelemetry({
  requestId,
  operation,
  templateId,
  templateVersion,
  model = 'gemini-1.5-flash',
  promptDigest,
  outputDigest,
  latencyMs,
  ...additional
} = {}) {
  const payload = {
    requestId,
    operation,
    templateId,
    templateVersion,
    model,
    latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : undefined,
    promptDigest,
    outputDigest,
    ...additional,
  };
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  if (Object.keys(sanitized).length) {
    logStructured('info', 'llm_call_metrics', sanitized);
    appendRequestLlmTrace(requestId, { ...sanitized, timestamp: new Date().toISOString() });
  }
  return sanitized;
}

const structuredLogger = createStructuredLogger();

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

function isRetryActionEntry(entry) {
  if (!entry) {
    return false;
  }
  if (typeof entry === 'string') {
    return entry.trim().toLowerCase() === 'retry';
  }
  if (typeof entry === 'object') {
    const candidates = [entry.type, entry.key, entry.label, entry.action];
    return candidates.some(
      (value) => typeof value === 'string' && value.trim().toLowerCase() === 'retry'
    );
  }
  return false;
}

function ensureRetryAction(details) {
  const base =
    details && typeof details === 'object'
      ? { ...details }
      : {};
  const normalizedActions = [];
  const appendAction = (value) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(appendAction);
      return;
    }
    normalizedActions.push(value);
  };

  appendAction(base.actions);

  if (!normalizedActions.some(isRetryActionEntry)) {
    normalizedActions.push('retry');
  }

  return { ...base, actions: normalizedActions };
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

const SERVICE_ERROR_FALLBACK_MESSAGES = buildServiceErrorFallbackMessages(
  API_ERROR_CONTRACTS
);

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
  const shouldOfferRetry = status >= 500;
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

  const hasDetailsContent =
    enrichedDetails &&
    typeof enrichedDetails === 'object' &&
    Object.keys(enrichedDetails).length > 0;

  if (shouldOfferRetry && hasDetailsContent) {
    enrichedDetails = ensureRetryAction(enrichedDetails);
  }

  if (status >= 500) {
    const requestId = res.locals.requestId;
    if (requestId) {
      const context = getRequestContext(requestId);
      const reference = context?.errorLogReference;
      if (reference?.bucket && reference?.key) {
        const logEntry = {
          bucket: reference.bucket,
          key: reference.key,
        };
        if (reference.status && reference.status !== 'stored') {
          logEntry.status = reference.status;
        }
        const existingLogs =
          enrichedDetails &&
          typeof enrichedDetails === 'object' &&
          typeof enrichedDetails.logs === 'object'
            ? enrichedDetails.logs
            : undefined;
        const mergedLogs = {
          ...(existingLogs || {}),
          s3: {
            ...(existingLogs?.s3 || {}),
            ...logEntry,
          },
        };
        if (!enrichedDetails || typeof enrichedDetails !== 'object') {
          enrichedDetails = { logs: mergedLogs };
        } else {
          enrichedDetails = {
            ...enrichedDetails,
            logs: mergedLogs,
          };
        }
      }
    }
  }

  let detailMessages = [];
  if (enrichedDetails && typeof enrichedDetails === 'object') {
    if (Array.isArray(enrichedDetails.messages)) {
      detailMessages = normalizeMessageList(enrichedDetails.messages);
      if (detailMessages.length) {
        enrichedDetails = { ...enrichedDetails, messages: detailMessages };
      } else {
        const { messages: _messages, ...rest } = enrichedDetails;
        enrichedDetails = rest;
      }
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
  if (detailMessages.length) {
    payload.messages = detailMessages;
  }
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

function isDownloadSessionLogCleanupEnabled() {
  return readBooleanEnv('ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP', false);
}

function isGenerationStaleArtifactCleanupEnabled() {
  return readBooleanEnv('ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP', false);
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
  const downloadSessionLogCleanupEnabled = readBooleanEnv(
    'ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP',
    parseBoolean(fileConfig.ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP, false)
  );
  const generationStaleArtifactCleanupEnabled = readBooleanEnv(
    'ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP',
    parseBoolean(fileConfig.ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP, false)
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
  process.env.ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP = downloadSessionLogCleanupEnabled
    ? 'true'
    : 'false';
  process.env.ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP = generationStaleArtifactCleanupEnabled
    ? 'true'
    : 'false';

  return Object.freeze({
    AWS_REGION: region,
    S3_BUCKET: s3Bucket,
    GEMINI_API_KEY: geminiApiKey,
    CLOUDFRONT_ORIGINS: allowedOrigins,
    ENABLE_PLAIN_PDF_FALLBACK: plainPdfFallbackEnabled,
    ENABLE_DOWNLOAD_SESSION_LOG_CLEANUP: downloadSessionLogCleanupEnabled,
    ENABLE_GENERATION_STALE_ARTIFACT_CLEANUP: generationStaleArtifactCleanupEnabled,
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

let runtimeConfigSnapshot = loadRuntimeConfig({ logOnError: true });

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

function resolveActiveServiceAllowList() {
  const raw =
    (typeof process.env.ACTIVE_SERVICE === 'string'
      ? process.env.ACTIVE_SERVICE
      : '') +
    (typeof process.env.ACTIVE_SERVICES === 'string'
      ? `,${process.env.ACTIVE_SERVICES}`
      : '');

  if (!raw.trim()) {
    return null;
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.length) {
    return null;
  }

  if (values.some((value) => value === '*' || value.toLowerCase() === 'all')) {
    return null;
  }

  return new Set(values);
}

const activeServiceAllowList = resolveActiveServiceAllowList();

const SERVICE_GUARD_HEADERS = Object.freeze({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
});

function respondWithServiceNotFound(res, method, path, serviceKey) {
  try {
    res.set(SERVICE_GUARD_HEADERS);
  } catch {
    // ignore header assignment failures
  }
  res.status(404).json({
    message: 'Not Found',
    method,
    path,
    service: serviceKey || null,
  });
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
  if (!(activeServiceAllowList instanceof Set) || activeServiceAllowList.size === 0) {
    return next();
  }

  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  const rawPath =
    typeof req.path === 'string'
      ? req.path
      : typeof req.originalUrl === 'string'
        ? (req.originalUrl.split('?')[0] || '/')
        : '/';

  const serviceKey = resolveServiceForRoute(method, rawPath);

  if (!serviceKey || !activeServiceAllowList.has(serviceKey)) {
    return respondWithServiceNotFound(res, method, rawPath, serviceKey);
  }

  res.locals.activeService = serviceKey;
  return next();
});

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
  storage: createS3StreamingStorage({ s3Client: () => s3Client }),
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
          'SET itemType = :itemType, templatePreference = :template, updatedAt = :updatedAt, userIdValue = :userIdValue, environment = if_not_exists(environment, :environment)',
        ExpressionAttributeValues: {
          ':itemType': { S: USER_TEMPLATE_ITEM_TYPE },
          ':template': { S: canonical },
          ':updatedAt': { S: nowIso },
          ':userIdValue': { S: normalized },
          ':environment': { S: deploymentEnvironment },
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

let configuredRegion =
  runtimeConfigSnapshot?.AWS_REGION || readEnvValue('AWS_REGION') || DEFAULT_AWS_REGION;
process.env.AWS_REGION = configuredRegion;

let region = configuredRegion;
s3Client = new S3Client({ region });
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
    const llmDescriptor = formatLlmDescriptor(
      extractJobLlmVendors(context.jobDescription || '', context.jobSkills)
    );

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
      highlights: (() => {
        if (llmDescriptor) {
          return targetJobTitle
            ? `Highlights now emphasise quantified ${llmDescriptor} impact tied to ${targetJobTitle} KPIs from the JD.`
            : `Highlights now emphasise quantified ${llmDescriptor} impact tied to the JD success metrics.`;
        }
        return targetJobTitle
          ? `Highlights now emphasise quantified wins tied to ${targetJobTitle} success metrics from the JD.`
          : 'Highlights now emphasise quantified wins tied to the job description success metrics.';
      })(),
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
      'Elevate the top-line wins so they mirror the target role’s success metrics and KPIs from the JD.',
      'Quantify each highlight using resume-backed metrics while naming the JD responsibility or KPI it satisfies.',
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

function extractJobLlmVendors(jobDescription = '', jobSkills = []) {
  const jobSkillText = Array.isArray(jobSkills) ? jobSkills.join(' ') : '';
  const source = `${jobDescription}\n${jobSkillText}`.toLowerCase();
  const vendors = new Set();

  if (/(?:\bopen\s*ai\b|\bchatgpt\b|\bgpt(?:-[\w.]+)?\b|\bazure\s+openai\b)/.test(source)) {
    vendors.add('OpenAI');
  }

  if (/\bgemini(?:\s+1\.5|\s+1\.0|\s+pro|\s+flash)?\b/.test(source) || /\bgoogle\s+gemini\b/.test(source)) {
    vendors.add('Gemini');
  }

  return Array.from(vendors);
}

function formatLlmDescriptor(vendors = []) {
  if (!Array.isArray(vendors) || !vendors.length) {
    return '';
  }
  const unique = Array.from(new Set(vendors.filter(Boolean)));
  if (!unique.length) {
    return '';
  }
  const descriptor = summarizeList(unique, { conjunction: 'and' });
  const suffix = unique.length > 1 ? ' LLMs' : ' LLM';
  return `${descriptor}${suffix}`;
}

function buildImprovementPrompt(type, context, instructions) {
  let requests = Array.isArray(instructions)
    ? instructions.filter(Boolean)
    : [instructions].filter(Boolean);

  const resumeText = context.resumeText || '';
  const jobDescription = context.jobDescription || '';
  const llmDescriptor = formatLlmDescriptor(
    extractJobLlmVendors(jobDescription, context.jobSkills)
  );

  if (type === 'improve-highlights') {
    const highlightDirectives = [
      'Expand the highlight bullets with quantified achievements tied directly to JD success metrics using only resume-backed facts.',
      'Explicitly call out the JD metric, KPI, or responsibility each highlight reinforces.',
    ];
    if (llmDescriptor) {
      highlightDirectives.push(
        `Showcase measurable ${llmDescriptor} outcomes that the JD references by name.`
      );
    }
    const lowerRequests = new Set(requests.map((entry) => entry.toLowerCase()));
    highlightDirectives.forEach((directive) => {
      if (!lowerRequests.has(directive.toLowerCase())) {
        requests = [...requests, directive];
        lowerRequests.add(directive.toLowerCase());
      }
    });
  }

  const sections = collectSectionText(resumeText, context.linkedinData || {}, context.knownCertificates || []);
  const combinedCertificates = [
    ...(context.knownCertificates || []),
    ...(context.manualCertificates || []),
  ];
  const candidateName = extractName(resumeText);

  const candidateContextLines = [
    formatPromptLine('Candidate name', candidateName, { fallback: 'Not listed' }),
    formatPromptLine('Summary snapshot', sections.summary, {
      fallback: 'Summary not detected',
      maxLength: 400,
    }),
    formatPromptLine('Highlights snapshot', sections.highlights, {
      fallback: 'Highlights not detected',
      maxLength: 350,
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
  ];

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
    formatPromptLine('JD excerpt', jobDescription, {
      fallback: 'Not provided',
      maxLength: 600,
    }),
  ];

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

  if (type === 'improve-highlights') {
    ruleLines.push('Tie each highlight to a JD metric, KPI, or responsibility using resume-backed evidence.');
    ruleLines.push('Prefer quantified language (%, $, #, volume) already present in the resume when rewriting highlights.');
  }

  const ruleBlock = `Rules:\n- ${ruleLines.join('\n- ')}`;

  return createVersionedPrompt({
    ...PROMPT_TEMPLATES.resumeImprovement,
    description: `ResumeForge ${IMPROVEMENT_CONFIG[type]?.title || 'Resume improvement'}`,
    metadata: { improvement_type: type },
    sections: [
      {
        title: 'DIRECTIVES',
        body: [
          'You are an elite resume improvement assistant.',
          actionBlock,
          ruleBlock,
          'Return ONLY valid JSON with keys: updatedResume (string), beforeExcerpt (string), afterExcerpt (string), explanation (string), confidence (0-1).',
        ],
      },
      { title: 'CANDIDATE CONTEXT', body: candidateContextLines },
      { title: 'JOB CONTEXT', body: jobContextLines },
      { title: 'RESUME TEXT', body: `"""${resumeText}"""` },
      { title: 'JOB DESCRIPTION', body: `"""${jobDescription || 'Not provided'}"""` },
    ],
  });
}

function fallbackImprovement(type, context) {
  const resumeText = context.resumeText || '';
  const jobTitle = context.jobTitle || '';
  const jobSkills = context.jobSkills || [];
  const missingSkills = context.missingSkills || [];
  const llmDescriptor = formatLlmDescriptor(
    extractJobLlmVendors(context.jobDescription || '', jobSkills)
  );
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
    const addition = llmDescriptor
      ? `- Quantified ${llmDescriptor} impact hitting ${focusText} KPIs from the JD.`
      : `- Spotlighted quantified wins that reinforce ${focusText} outcomes from the JD.`;
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
      ? llmDescriptor
        ? `Highlights already underscore the JD-referenced ${llmDescriptor} outcomes.`
        : 'Highlights already underscore the job-aligned achievements.'
      : llmDescriptor
        ? `Reinforced highlights with quantified ${llmDescriptor} impact tied to the JD success metrics.`
        : 'Reinforced highlights with quantified wins tied to the JD success metrics.';
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
      const promptPackage = buildImprovementPrompt(type, promptContext, config.focus);
      const promptText = promptPackage?.text || '';
      const promptDigest = createTextDigest(promptText);
      const startedAt = Date.now();
      const response = await generateContentWithRetry(model, promptText, {
        retryLogEvent: 'targeted_improvement_ai',
        retryLogContext: { type },
      });
      const latencyMs = Date.now() - startedAt;
      const parsed = parseGeminiJsonResponse(response?.response?.text?.(), {
        logger: structuredLogger,
      });
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
        const enforced = enforceTargetedUpdate(
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
        const outputDigest = createTextDigest(enforced.updatedResume || '');
        recordLlmTelemetry({
          requestId: context.requestId,
          operation: 'resume_improvement',
          templateId: promptPackage?.templateId || PROMPT_TEMPLATES.resumeImprovement.templateId,
          templateVersion: promptPackage?.templateVersion || PROMPT_TEMPLATES.resumeImprovement.templateVersion,
          promptDigest,
          outputDigest,
          latencyMs,
          confidence,
          type,
          changeDetailCount: changeDetails.length,
        });
        return {
          ...enforced,
          llmTrace: {
            templateId: promptPackage?.templateId || PROMPT_TEMPLATES.resumeImprovement.templateId,
            templateVersion: promptPackage?.templateVersion || PROMPT_TEMPLATES.resumeImprovement.templateVersion,
            outputDigest,
            source: 'generative',
          },
        };
      }
      recordLlmTelemetry({
        requestId: context.requestId,
        operation: 'resume_improvement',
        templateId: promptPackage?.templateId || PROMPT_TEMPLATES.resumeImprovement.templateId,
        templateVersion: promptPackage?.templateVersion || PROMPT_TEMPLATES.resumeImprovement.templateVersion,
        promptDigest,
        latencyMs,
        type,
        outcome: 'no_parse',
      });
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

  const enforcedFallback = enforceTargetedUpdate(type, resumeText, fallbackResult, scopeContext);
  const fallbackDigest = createTextDigest(enforcedFallback.updatedResume || '');
  recordLlmTelemetry({
    requestId: context.requestId,
    operation: 'resume_improvement',
    templateId: PROMPT_TEMPLATES.resumeImprovement.templateId,
    templateVersion: PROMPT_TEMPLATES.resumeImprovement.templateVersion,
    outputDigest: fallbackDigest,
    type,
    outcome: 'fallback',
  });
  return {
    ...enforcedFallback,
    llmTrace: {
      templateId: PROMPT_TEMPLATES.resumeImprovement.templateId,
      templateVersion: PROMPT_TEMPLATES.resumeImprovement.templateVersion,
      outputDigest: fallbackDigest,
      source: 'fallback',
    },
  };
}

async function sendS3CommandWithRetry(
  s3Client,
  commandFactory,
  {
    maxAttempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 6000,
    jitterMs = 400,
    retryLogEvent,
    retryLogContext = {},
  } = {}
) {
  if (!s3Client || typeof s3Client.send !== 'function') {
    throw new Error('A valid S3 client must be provided for retries.');
  }

  const operation = () => {
    const command = typeof commandFactory === 'function' ? commandFactory() : commandFactory;
    return s3Client.send(command);
  };

  return await executeWithRetry(operation, {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitterMs,
    shouldRetry: (err) => shouldRetryS3Error(err),
    onRetry: (err, attempt, delayMs) => {
      if (!retryLogEvent) {
        return;
      }
      logStructured('warn', retryLogEvent, {
        ...retryLogContext,
        attempt,
        delayMs,
        status: getErrorStatus(err),
        error: serializeError(err),
      });
    },
  });
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
  const escapeRegex = (value) =>
    typeof value === 'string' ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

  const skills = [];
  const termCounts = [];
  for (const term of TECHNICAL_TERMS) {
    const normalized = typeof term === 'string' ? term.replace(/\+\+/g, '++') : '';
    const searchTerm = typeof term === 'string' ? term.toLowerCase() : '';
    let count = 0;
    if (searchTerm) {
      try {
        const regex = new RegExp(`\\b${escapeRegex(searchTerm)}\\b`, 'g');
        const matches = lower.match(regex);
        count = matches ? matches.length : 0;
      } catch {
        count = 0;
      }
    }
    if (count > 0) {
      skills.push(normalized);
    }
    termCounts.push({ term: normalized || term, count });
  }

  if (skills.length < 5) {
    const remaining = termCounts
      .filter(({ term }) => term && !skills.includes(term))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5 - skills.length)
      .map(({ term }) => term);
    skills.push(...remaining);
  }

  return { title, skills, text };
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

  const highlightSections = Object.entries(sectionMap)
    .filter(([key]) => key.includes('highlight'))
    .map(([, value]) => value)
    .filter(Boolean);

  const highlights = highlightSections.join('\n');

  const summary = [sectionMap.summary || '', linkedinData.headline || '']
    .filter(Boolean)
    .join('\n');
  const resumeExperienceEntries = extractExperience(resumeText);
  const linkedinExperienceEntries = extractExperience(linkedinData.experience || []);

  const normalizeResponsibilityList = (responsibilities = []) => {
    if (!Array.isArray(responsibilities)) {
      return [];
    }
    return responsibilities
      .map((line) => (typeof line === 'string' ? line.replace(/\s+/g, ' ').trim() : ''))
      .filter(Boolean);
  };

  const experienceLookup = new Map();
  const combinedExperienceEntries = [];
  const registerExperienceEntry = (exp = {}) => {
    const normalized = {
      title: typeof exp.title === 'string' ? exp.title.trim() : '',
      company: typeof exp.company === 'string' ? exp.company.trim() : '',
      startDate: typeof exp.startDate === 'string' ? exp.startDate.trim() : '',
      endDate: typeof exp.endDate === 'string' ? exp.endDate.trim() : '',
      responsibilities: normalizeResponsibilityList(exp.responsibilities),
    };
    const rawKey = [normalized.title, normalized.company, normalized.startDate, normalized.endDate]
      .map((value) => value.toLowerCase())
      .join('|');
    const fallbackKey = normalized.responsibilities.join('|').toLowerCase();
    const key = rawKey || fallbackKey || `entry-${combinedExperienceEntries.length}`;

    if (experienceLookup.has(key)) {
      const existing = experienceLookup.get(key);
      if (!existing.title && normalized.title) existing.title = normalized.title;
      if (!existing.company && normalized.company) existing.company = normalized.company;
      if (!existing.startDate && normalized.startDate) existing.startDate = normalized.startDate;
      if (!existing.endDate && normalized.endDate) existing.endDate = normalized.endDate;
      const merged = new Set([...(existing.responsibilities || []), ...normalized.responsibilities]);
      existing.responsibilities = Array.from(merged);
      return;
    }

    const stored = { ...normalized };
    experienceLookup.set(key, stored);
    combinedExperienceEntries.push(stored);
  };

  resumeExperienceEntries.forEach(registerExperienceEntry);
  linkedinExperienceEntries.forEach(registerExperienceEntry);

  const formatResponsibilities = (responsibilities = []) => {
    const normalized = normalizeResponsibilityList(responsibilities);
    if (!normalized.length) {
      return '';
    }
    return normalized.join('; ');
  };

  const experience = combinedExperienceEntries
    .map((exp) => {
      const base = fmtExp(exp);
      const responsibilityText = formatResponsibilities(exp.responsibilities);
      return responsibilityText ? `${base}: ${responsibilityText}` : base;
    })
    .filter(Boolean)
    .join('\n');

  const structuredExperience = combinedExperienceEntries.map((exp) => ({
    title: exp.title || '',
    company: exp.company || '',
    startDate: exp.startDate || '',
    endDate: exp.endDate || '',
    responsibilities: Array.isArray(exp.responsibilities)
      ? exp.responsibilities
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [],
  }));
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

  return {
    summary,
    experience,
    education,
    certifications,
    skills,
    projects,
    highlights,
    structuredExperience,
  };
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
  baseResumeText = '',
  telemetry = {}
) {
  const normalizeOptions = sanitizeOptions && typeof sanitizeOptions === 'object'
    ? { ...sanitizeOptions }
    : {};
  const baseParseOptions = { ...normalizeOptions, skipRequiredSections: true };
  const telemetryContext = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const telemetryRequestId = telemetryContext.requestId;
  const telemetryOperation = telemetryContext.operation || 'resume_rewrite';
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
    llmTrace: {
      templateId: PROMPT_TEMPLATES.resumeRewrite.templateId,
      templateVersion: PROMPT_TEMPLATES.resumeRewrite.templateVersion,
      outputDigest: createTextDigest(fallbackResolved || sanitizedBaseText),
      source: 'fallback',
    },
  };

  if (!generativeModel?.generateContent) {
    recordLlmTelemetry({
      requestId: telemetryRequestId,
      operation: telemetryOperation,
      templateId: PROMPT_TEMPLATES.resumeRewrite.templateId,
      templateVersion: PROMPT_TEMPLATES.resumeRewrite.templateVersion,
      outputDigest: fallbackResult.llmTrace.outputDigest,
      outcome: 'fallback_no_model',
    });
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
      structuredExperience: Array.isArray(sections?.structuredExperience)
        ? sections.structuredExperience
        : [],
    };
    const instructionLines = [
      'You are an elite resume architect optimizing for Gemini/OpenAI outputs.',
      'Follow these rules precisely:',
      '- Never degrade CV structure; respect existing headings, chronology, and polished tone.',
      '- Align work experience bullets, summary lines, and highlights directly with the job description responsibilities using evidence from the candidate history.',
      '- Use the structuredExperience array to rewrite each role\'s responsibilities so verbs, metrics, and focus mirror the job description while staying truthful to the provided achievements.',
      '- Blend JD-critical skills into the skills section only when the candidate context proves them—avoid isolated keyword stuffing.',
      '- Emphasise measurable impact and outcomes that demonstrate the candidate already performs what the JD requires; do not fabricate new roles or tools.',
      '- Respond using ONLY valid JSON conforming to the provided schema.',
    ];
    const promptPackage = createVersionedPrompt({
      ...PROMPT_TEMPLATES.resumeRewrite,
      description: 'Rewrite resume sections using structured experience context.',
      metadata: {
        structured_experience_rows: Array.isArray(sections?.structuredExperience)
          ? sections.structuredExperience.length
          : 0,
      },
      sections: [
        { title: 'TASK', body: instructionLines },
        { title: 'OUTPUT_SCHEMA', body: JSON.stringify(outputSchema, null, 2) },
        { title: 'INPUT_CONTEXT', body: JSON.stringify(inputPayload, null, 2) },
      ],
    });
    const promptText = promptPackage.text;
    const promptDigest = createTextDigest(promptText);
    const retryContext = {
      resumeDigest: createTextDigest(name || baseResumeData?.name || ''),
      hasJobDescription: Boolean(jobDescription),
    };
    const rewriteLogger = createStructuredLogger({ ...retryContext, requestId: telemetryRequestId });
    const startedAt = Date.now();
    const result = await generateContentWithRetry(generativeModel, promptText, {
      retryLogEvent: 'generation_section_rewrite',
      retryLogContext: retryContext,
      logger: rewriteLogger,
    });
    const latencyMs = Date.now() - startedAt;
    const parsed = parseGeminiJsonResponse(result?.response?.text?.(), {
      logger: rewriteLogger,
    });
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
      const outputDigest = createTextDigest(outputText);
      recordLlmTelemetry({
        requestId: telemetryRequestId,
        operation: telemetryOperation,
        templateId: promptPackage.templateId,
        templateVersion: promptPackage.templateVersion,
        promptDigest,
        outputDigest,
        latencyMs,
        addedSkillCount: addedSkills.length,
      });
      return {
        text: cleaned,
        resolvedText: outputText,
        tokenizedText: cleaned,
        project: parsed.projectSnippet || parsed.project || '',
        modifiedTitle: parsed.latestRoleTitle || '',
        addedSkills,
        sanitizedFallbackUsed: false,
        placeholders,
        llmTrace: {
          templateId: promptPackage.templateId,
          templateVersion: promptPackage.templateVersion,
          outputDigest,
          source: 'generative',
        },
      };
    }
    recordLlmTelemetry({
      requestId: telemetryRequestId,
      operation: telemetryOperation,
      templateId: promptPackage.templateId,
      templateVersion: promptPackage.templateVersion,
      promptDigest,
      latencyMs,
      outcome: 'no_parse',
    });
  } catch {
    /* ignore */
  }
  recordLlmTelemetry({
    requestId: telemetryRequestId,
    operation: telemetryOperation,
    templateId: PROMPT_TEMPLATES.resumeRewrite.templateId,
    templateVersion: PROMPT_TEMPLATES.resumeRewrite.templateVersion,
    outputDigest: fallbackResult.llmTrace.outputDigest,
    outcome: 'fallback',
  });
  return fallbackResult;
}

async function generateProjectSummary(
  jobDescription = '',
  resumeSkills = [],
  jobSkills = [],
  generativeModel,
  telemetry = {}
) {
  const skills = resumeSkills.length ? resumeSkills : jobSkills;
  if (!jobDescription && !skills.length) return '';
  const telemetryContext = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const telemetryRequestId = telemetryContext.requestId;
  const telemetryOperation = telemetryContext.operation || 'project_summary';
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
      const promptPackage = createVersionedPrompt({
        ...PROMPT_TEMPLATES.projectSummary,
        description: 'Generate a concise project summary line.',
        metadata: { skill_count: skills.length },
        sections: [
          {
            title: 'TASK',
            body:
              'You are a resume assistant. Using the job description and top skills, write one concise sentence that begins with "Led a project" and describes a project using those skills.',
          },
          { title: 'JOB DESCRIPTION', body: cleaned ? `"""${cleaned}"""` : 'Not provided' },
          { title: 'TOP SKILLS', body: skills.length ? skills.join(', ') : 'Not provided' },
        ],
      });
      const promptText = promptPackage.text;
      const promptDigest = createTextDigest(promptText);
      const startedAt = Date.now();
      const result = await generateContentWithRetry(generativeModel, promptText);
      const latencyMs = Date.now() - startedAt;
      const text = result?.response?.text?.().trim() || '';
      if (text) {
        const aiSummary = text.replace(/[(){}]/g, '');
        const normalizedSummary = aiSummary.endsWith('.') ? aiSummary : `${aiSummary}.`;
        const outputDigest = createTextDigest(normalizedSummary);
        recordLlmTelemetry({
          requestId: telemetryRequestId,
          operation: telemetryOperation,
          templateId: promptPackage.templateId,
          templateVersion: promptPackage.templateVersion,
          promptDigest,
          outputDigest,
          latencyMs,
          skillCount: skills.length,
        });
        return normalizedSummary;
      }
      recordLlmTelemetry({
        requestId: telemetryRequestId,
        operation: telemetryOperation,
        templateId: promptPackage.templateId,
        templateVersion: promptPackage.templateVersion,
        promptDigest,
        latencyMs,
        skillCount: skills.length,
        outcome: 'no_parse',
      });
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
  const fallbackSummary = `${summary}.`;
  recordLlmTelemetry({
    requestId: telemetryRequestId,
    operation: telemetryOperation,
    templateId: PROMPT_TEMPLATES.projectSummary.templateId,
    templateVersion: PROMPT_TEMPLATES.projectSummary.templateVersion,
    outputDigest: createTextDigest(fallbackSummary),
    skillCount: skills.length,
    outcome: 'fallback',
  });
  return fallbackSummary;
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

let minimalPlainPdfBufferGenerator = createMinimalPlainPdfBuffer;

function setMinimalPlainPdfBufferGenerator(fn) {
  if (typeof fn === 'function') {
    minimalPlainPdfBufferGenerator = fn;
    return;
  }
  minimalPlainPdfBufferGenerator = createMinimalPlainPdfBuffer;
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

async function defaultGeneratePlainPdfFallback({
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
    const minimalBuffer = minimalPlainPdfBufferGenerator({
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

let plainPdfFallbackOverride = null;

function setPlainPdfFallbackOverride(fn) {
  if (typeof fn === 'function') {
    plainPdfFallbackOverride = fn;
    return;
  }
  plainPdfFallbackOverride = null;
}

async function generatePlainPdfFallback(payload) {
  if (plainPdfFallbackOverride) {
    return plainPdfFallbackOverride({
      ...payload,
      defaultGenerator: () => defaultGeneratePlainPdfFallback(payload),
    });
  }
  return defaultGeneratePlainPdfFallback(payload);
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
    const missingTemplatesError = new Error(
      `No PDF templates provided for ${documentType}`
    );
    const summary = buildPdfFailureSummary({
      documentType,
      templates: [],
      lastError: missingTemplatesError,
    });
    const failureMessages = normalizeMessageList([summary]);
    logStructured('error', 'pdf_generation_no_templates', {
      ...logContext,
      documentType,
      environment: environmentDetails,
      summary,
    });
    const failureDetails = {
      documentType,
      templates: [],
      messages: failureMessages,
      summary,
      reason: missingTemplatesError.message,
    };
    throw new PdfGenerationError({
      message: summary,
      summary,
      documentType,
      templates: [],
      cause: missingTemplatesError,
      messages: failureMessages,
      details: failureDetails,
    });
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
      const minimalBuffer = minimalPlainPdfBufferGenerator({
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
      fallbackContext.lastError = minimalError;
      lastError = minimalError;
    }
  }

  const summary = buildPdfFailureSummary({
    documentType,
    templates: candidates,
    lastError,
  });
  appendMessage(summary);
  const failureMessages = normalizeMessageList(messages);

  logStructured('error', 'pdf_generation_all_attempts_failed', {
    ...logContext,
    documentType,
    templates: candidates,
    error: serializeError(lastError),
    targetFilePath: lastAttemptFilePath,
    environment: environmentDetails,
    summary,
    messages: failureMessages,
  });

  const failureDetails = {
    documentType,
    templates: candidates,
    messages: failureMessages,
    summary,
  };
  if (typeof lastError?.message === 'string' && lastError.message.trim()) {
    failureDetails.reason = lastError.message.trim();
  }
  if (typeof lastAttemptTemplate === 'string') {
    failureDetails.lastTemplate = lastAttemptTemplate;
  }

  const failure = new PdfGenerationError({
    message: summary,
    summary,
    documentType,
    templates: candidates,
    cause: lastError,
    messages: failureMessages,
    details: failureDetails,
  });
  if (lastAttemptFilePath) {
    failure.targetFilePath = lastAttemptFilePath;
  }
  if (!failure.templatesTried) {
    failure.templatesTried = candidates;
  }
  throw failure;
}

function extractPdfGenerationError(err) {
  let current = err;
  const seen = new Set();
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof PdfGenerationError) {
      return current;
    }
    seen.add(current);
    current = current.cause;
  }
  return null;
}

function buildPdfGenerationErrorDetails(error, { source = 'lambda' } = {}) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const baseDetails =
    error.details && typeof error.details === 'object'
      ? { ...error.details }
      : {};
  if (source && (!baseDetails || typeof baseDetails !== 'object')) {
    return { source };
  }
  if (source && !baseDetails.source) {
    baseDetails.source = source;
  }
  const templateCandidates = [];
  if (Array.isArray(error.templates)) {
    templateCandidates.push(...error.templates);
  }
  if (Array.isArray(error.templatesTried)) {
    templateCandidates.push(...error.templatesTried);
  }
  const templateSet = new Set();
  const templates = [];
  for (const candidate of templateCandidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || templateSet.has(trimmed)) continue;
    templateSet.add(trimmed);
    templates.push(trimmed);
  }
  if (templates.length && !baseDetails.templates) {
    baseDetails.templates = templates;
  }
  const messageCandidates = [];
  if (Array.isArray(error.messages)) {
    messageCandidates.push(...error.messages);
  }
  if (Array.isArray(baseDetails.messages)) {
    messageCandidates.push(...baseDetails.messages);
  }
  const normalizedMessages = normalizeMessageList(messageCandidates);
  if (normalizedMessages.length) {
    baseDetails.messages = normalizedMessages;
  } else if (baseDetails.messages) {
    delete baseDetails.messages;
  }
  if (error.summary && !baseDetails.summary) {
    baseDetails.summary = error.summary;
  }
  if (error.documentType && !baseDetails.documentType) {
    baseDetails.documentType = error.documentType;
  }
  const causeMessage =
    typeof error?.cause?.message === 'string' ? error.cause.message.trim() : '';
  if (causeMessage && !baseDetails.reason) {
    baseDetails.reason = causeMessage;
  }
  return baseDetails;
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

function buildActionLabeler(actionBuilder) {
  return (value) => {
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!text) return '';
    const action = typeof actionBuilder === 'function' ? actionBuilder(text) : '';
    const actionText = typeof action === 'string' ? action.trim() : '';
    return actionText ? `${text} (${actionText})` : text;
  };
}

function summarizeList(values = [], { limit = 3, conjunction = 'and', decorate } = {}) {
  if (!values.length) return '';
  const unique = Array.from(new Set(values))
    .map((value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()))
    .filter(Boolean);
  if (!unique.length) return '';
  const decorated =
    typeof decorate === 'function'
      ? unique
          .map((value) => decorate(value))
          .map((value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()))
          .filter(Boolean)
      : unique;
  if (!decorated.length) return '';
  if (decorated.length === 1) return decorated[0];
  if (decorated.length === 2) return `${decorated[0]} ${conjunction} ${decorated[1]}`;
  const display = decorated.slice(0, limit);
  const remaining = decorated.length - display.length;
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
  normalization,
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

  if (normalization) {
    reasons.push(normalization);
  }

  if (!reasons.length) {
    reasons.push('core alignment signals are balanced without major strengths or gaps');
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
  const normalizedLearningResources = sanitizeLearningResourceEntries(
    context.learningResources,
    {
      missingSkills: missing,
    }
  );
  let skillsStatus = 'match';
  let skillsMessage = `Resume now covers ${skillCoverage}% of the JD skills.`;
  if (missing.length) {
    skillsStatus = 'gap';
    skillsMessage = `Still missing ${summarizeList(missing, {
      limit: 4,
      decorate: buildActionLabeler((skill) => `Practice ${skill}`)
    })} from the JD.`;
    if (normalizedLearningResources.length) {
      skillsMessage += ' Review the learning sprint below to build confidence.';
    }
  } else if (skillCoverage < 70) {
    skillsStatus = 'partial';
    skillsMessage = `Resume covers ${skillCoverage}% of JD skills. Reinforce keywords in experience and summary.`;
  } else if (added.length) {
    skillsMessage = `Resume now covers ${skillCoverage}% of the JD skills, adding ${summarizeList(added, {
      limit: 4,
      decorate: buildActionLabeler((skill) => `Practice ${skill}`)
    })}.`;
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
    certificationMessage = `Consider adding ${summarizeList(suggestions, {
      limit: 3,
      decorate: buildActionLabeler((cert) => `Add credential ${cert}`)
    })} to mirror the JD.`;
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
  const PROBABILITY_MIN = 8;
  const PROBABILITY_MAX = 97;

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

    const rawProbability = clamp(average, 0, 100);
    let probability = rawProbability;
    let normalization = null;

    if (!values.length) {
      probability = PROBABILITY_MIN;
      normalization = `insufficient scoring signals were detected, so probability defaults to the ${PROBABILITY_MIN}% floor`;
    } else {
      if (rawProbability < PROBABILITY_MIN) {
        probability = PROBABILITY_MIN;
        normalization = `calculated probability was lifted to the ${PROBABILITY_MIN}% floor to reflect baseline interview chances`;
      } else if (rawProbability > PROBABILITY_MAX) {
        probability = PROBABILITY_MAX;
        normalization = `calculated probability was capped at ${PROBABILITY_MAX}% to avoid overstating selection odds`;
      }
    }

    const level = probability >= 75 ? 'High' : probability >= 55 ? 'Medium' : 'Low';
    return { probability, level, normalization };
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

  const {
    probability: baselineProbability,
    level: baselineLevel,
    normalization: baselineProbabilityNormalization,
  } = computeProbability(baselineProbabilityInput);

  const {
    probability,
    level,
    normalization: probabilityNormalization,
  } = computeProbability(selectionProbabilityInput);

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
    normalization: probabilityNormalization,
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
    normalization: baselineProbabilityNormalization,
  });
  const baseSummary =
    'These JD-aligned additions were applied so you can prep for interview conversations with confidence.';
  let summary = baseSummary;
  if (missing.length) {
    const missingSummary = summarizeList(missing, { limit: 4 });
    const resourceNote = normalizedLearningResources.length
      ? 'Use the learning sprint below to close the gap before interviews.'
      : 'Plan targeted practice so you can discuss them confidently in interviews.';
    const resourceHighlightsText = buildResourceHighlightSummary(normalizedLearningResources);
    const summaryParts = [`Skill gaps detected: ${missingSummary}.`, resourceNote];
    if (resourceHighlightsText) {
      summaryParts.push(`Start with ${resourceHighlightsText}.`);
    }
    if (added.length) {
      summaryParts.push(`Strengthened coverage for ${summarizeList(added, { limit: 3 })}.`);
    }
    summary = summaryParts.join(' ').replace(/\s+/g, ' ').trim();
  } else if (added.length) {
    const addedSummary = summarizeList(added, { limit: 4 });
    summary = `We added ${addedSummary}; prepare for questions.`;
  }

  const selectionFactors = [];

  const normalizedOriginalTitle = normalizeTitle(originalTitle || '');
  const normalizedFinalTitle = normalizeTitle(modifiedTitle || originalTitle || '');
  const originalVisibleTitle = baselineDesignation.visibleTitle || '';
  const finalVisibleTitle = finalDesignation.visibleTitle || originalVisibleTitle;

  if (normalizedOriginalTitle && normalizedFinalTitle && normalizedOriginalTitle !== normalizedFinalTitle) {
    const detailParts = [];
    if (originalVisibleTitle && finalVisibleTitle && originalVisibleTitle !== finalVisibleTitle) {
      detailParts.push(`Updated from “${originalVisibleTitle}” to “${finalVisibleTitle}”.`);
    }
    detailParts.push('Adjusted headline to mirror the job designation.');
    selectionFactors.push({
      key: 'designation-changed',
      label: 'Designation changed',
      detail: detailParts.filter(Boolean).join(' '),
      impact: designationStatus === 'match' ? 'positive' : 'neutral',
    });
  } else if (
    baselineDesignation.designationStatus !== designationStatus &&
    designationStatus === 'match'
  ) {
    selectionFactors.push({
      key: 'designation-aligned',
      label: 'Designation aligned',
      detail: designationMessage,
      impact: 'positive',
    });
  }

  const coverageDelta = Math.round(skillCoverage - originalCoverage);
  if (coverageDelta > 0 || added.length) {
    const detailParts = [];
    if (coverageDelta > 0) {
      detailParts.push(`Coverage +${coverageDelta} pts`);
    }
    if (added.length) {
      detailParts.push(`Added ${summarizeList(added, { limit: 3 })}`);
    }
    selectionFactors.push({
      key: 'skills-added',
      label: 'Missing skills added',
      detail: detailParts.length ? `${detailParts.join('. ')}.` : null,
      impact: 'positive',
    });
  }

  if (missing.length) {
    selectionFactors.push({
      key: 'skills-remaining',
      label: 'Skills still missing',
      detail: `Still missing ${summarizeList(missing, { limit: 3 })}.`,
      impact: 'negative',
    });
  }

  const taskDelta = Math.round(impactScore - baselineImpactScore);
  if (taskDelta > 4) {
    selectionFactors.push({
      key: 'tasks-improved',
      label: 'Task alignment strengthened',
      detail: `Task impact score improved by ${taskDelta} pts.`,
      impact: 'positive',
    });
  } else if (taskDelta < -4) {
    selectionFactors.push({
      key: 'tasks-declined',
      label: 'Task alignment declined',
      detail: `Task impact score dropped by ${Math.abs(taskDelta)} pts.`,
      impact: 'negative',
    });
  }

  const highlightDelta = Math.round(highlightScore - baselineHighlightScore);
  if (highlightDelta > 4) {
    selectionFactors.push({
      key: 'highlights-improved',
      label: 'Highlights sharpened',
      detail: `Highlights clarity score improved by ${highlightDelta} pts.`,
      impact: 'positive',
    });
  } else if (highlightDelta < -4) {
    selectionFactors.push({
      key: 'highlights-declined',
      label: 'Highlights weakened',
      detail: `Highlights clarity score dropped by ${Math.abs(highlightDelta)} pts.`,
      impact: 'negative',
    });
  }

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
    learningResources: normalizedLearningResources,
    factors: selectionFactors,
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
  const jobKeywords = Array.from(jobKeywordSet);

  const bulletKeywordDetails = bulletLines
    .map((line) => {
      const matches = jobKeywords.filter((keyword) =>
        new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(line)
      );
      if (!matches.length) {
        return null;
      }
      return { line, matches };
    })
    .filter(Boolean);

  const bulletKeywordHits = bulletKeywordDetails.map((entry) => entry.line);
  const bulletKeywordUniqueSet = new Set(
    bulletKeywordDetails.flatMap((entry) =>
      entry.matches.map((keyword) => keyword.toLowerCase())
    )
  );
  const bulletKeywordUniqueCount = bulletKeywordUniqueSet.size;
  const totalBulletKeywordMentions = bulletKeywordDetails.reduce(
    (sum, entry) => sum + entry.matches.length,
    0
  );

  const bulletKeywordVariety = jobKeywordSet.size
    ? clamp01(bulletKeywordUniqueCount / Math.max(4, jobKeywordSet.size))
    : 0;
  const keywordStuffingSignal = bulletKeywordUniqueCount
    ? (totalBulletKeywordMentions - bulletKeywordUniqueCount) /
      Math.max(1, bulletKeywordUniqueCount)
    : 0;
  const keywordStuffingPenalty = clamp01(keywordStuffingSignal / 4);

  const jobKeywordMatches = jobKeywords.filter((keyword) =>
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text)
  );

  const summaryText = extractSummaryText(text);
  const summaryKeywordHits = summaryText
    ? jobKeywords.filter((keyword) =>
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
    bulletKeywordUniqueCount,
    bulletKeywordVariety,
    bulletKeywordHits,
    keywordStuffingPenalty,
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
    bulletKeywordUniqueCount,
    bulletKeywordVariety,
    keywordStuffingPenalty,
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
  const keywordLineRatio = bulletLines.length
    ? bulletKeywordHits.length / bulletLines.length
    : 0;
  const keywordVarietyScore = bulletKeywordVariety;
  const keywordRepetitionAdjustment = 1 - Math.min(0.6, keywordStuffingPenalty * 0.8);
  const keywordQualityScore = clamp01(
    (keywordLineRatio * 0.6 + keywordVarietyScore * 0.4) * keywordRepetitionAdjustment
  );

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
        keywordQualityScore * 0.22 +
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

  if (jobKeywordSet.size > 0) {
    if (keywordVarietyScore < 0.3) {
      impactTips.push(
        'Vary the job-aligned language—repeating one keyword will not boost impact as much as weaving in a mix tied to wins.'
      );
    } else if (bulletKeywordHits.length < Math.max(2, Math.ceil(jobKeywordSet.size * 0.1))) {
      const keywordSample = Array.from(jobKeywordSet)
        .slice(0, 5)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
      if (keywordSample.length) {
        impactTips.push(
          `Mirror the job posting by weaving in keywords such as ${summarizeList(keywordSample)} inside your accomplishment bullets.`
        );
      }
    }
  }

  if (summaryPresent && summarySkillHits.length === 0 && normalizedJobSkills.size > 0) {
    impactTips.push(
      'Rework your summary to echo critical job keywords so reviewers immediately see the alignment.'
    );
  }

  if (keywordStuffingPenalty >= 0.4 && !impactTips.some((tip) => /vary/.test(tip))) {
    impactTips.push('Avoid keyword stuffing—anchor achievements with varied, role-relevant language instead of repeating the same term.');
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
    keywordLineRatio: Number((keywordLineRatio * 100).toFixed(1)),
    keywordVariety: Number((keywordVarietyScore * 100).toFixed(1)),
    keywordQualityScore: Number((keywordQualityScore * 100).toFixed(1)),
    keywordStuffingPenalty: Number((keywordStuffingPenalty * 100).toFixed(1)),
    summaryPresent,
    summaryKeywordScore: Number((summaryKeywordScore * 100).toFixed(1)),
    summarySkillScore: Number((summarySkillScore * 100).toFixed(1)),
    jobKeywordCount: jobKeywordSet.size,
    bulletKeywordHits: bulletKeywordHits.length,
    bulletKeywordUniqueCount,
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
    bulletKeywordVariety,
    bulletKeywordUniqueCount,
    keywordStuffingPenalty,
    summaryPresent,
    summaryKeywordHits,
    summarySkillHits,
  } = analysis;

  const skillCoverage = normalizedJobSkills.size
    ? normalizedResumeSkills.size / Math.max(normalizedJobSkills.size, 1)
    : normalizedResumeSkills.size > 0
    ? 1
    : 0;

  const keywordCoverageScore = jobKeywordMatches.length
    ? jobKeywordMatches.length / Math.max(normalizedJobSkills.size || jobKeywordMatches.length, 6)
    : normalizedResumeSkills.size
    ? Math.min(1, normalizedResumeSkills.size / 12)
    : 0;

  let keywordVarietyScore = bulletKeywordVariety;
  if (keywordVarietyScore <= 0) {
    keywordVarietyScore = jobKeywordMatches.length
      ? clamp01(jobKeywordMatches.length / Math.max(normalizedJobSkills.size || jobKeywordMatches.length, 8))
      : 0;
  }

  const summaryWeight = summaryPresent ? 0.2 : 0;
  const skillWeight = normalizedJobSkills.size ? 0.45 : 0.25;
  const keywordWeight = normalizedJobSkills.size ? 0.35 : 0.5;

  const summaryContribution = summaryPresent
    ? clamp01((summaryKeywordHits.length + summarySkillHits.length) / Math.max(2, normalizedJobSkills.size))
    : 0;

  const keywordRepetitionAdjustment = 1 - Math.min(0.5, keywordStuffingPenalty * 0.7);
  const keywordQualityComposite = clamp01(
    (keywordCoverageScore * 0.6 + keywordVarietyScore * 0.4) * keywordRepetitionAdjustment
  );

  const otherScore =
    100 *
    clamp01(
      skillCoverage * skillWeight + keywordQualityComposite * keywordWeight + summaryContribution * summaryWeight
    );

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
  if (summaryPresent && normalizedJobSkills.size && summarySkillHits.length === 0) {
    otherTips.push(
      `Infuse your summary or headline with domain language from the posting—for example ${summarizeList(
        Array.from(normalizedJobSkills).slice(0, 3)
      )}—to reinforce alignment.`
    );
  }
  if (keywordStuffingPenalty >= 0.4) {
    otherTips.push('Swap repeated keywords for specific accomplishments—ATS now favors varied, evidence-backed language.');
  } else if (keywordVarietyScore < 0.3 && jobKeywordMatches.length) {
    otherTips.push('Broaden the range of JD-aligned keywords instead of repeating the same few terms.');
  }
  if (!otherTips.length) {
    otherTips.push('Keyword coverage is solid—keep tailoring skills to each job description.');
  }

  const otherDetails = {
    normalizedJobSkillCount: normalizedJobSkills.size,
    normalizedResumeSkillCount: normalizedResumeSkills.size,
    jobKeywordMatches: jobKeywordMatches.length,
    skillCoverage: Number((skillCoverage * 100).toFixed(1)),
    keywordCoverageScore: Number((keywordCoverageScore * 100).toFixed(1)),
    keywordVariety: Number((keywordVarietyScore * 100).toFixed(1)),
    keywordQualityComposite: Number((keywordQualityComposite * 100).toFixed(1)),
    keywordStuffingPenalty: Number((keywordStuffingPenalty * 100).toFixed(1)),
    summaryContribution: Number((summaryContribution * 100).toFixed(1)),
    weights: {
      skillWeight: Number((skillWeight * 100).toFixed(1)),
      keywordWeight: Number((keywordWeight * 100).toFixed(1)),
      summaryWeight: Number((summaryWeight * 100).toFixed(1)),
    },
    summaryPresent,
    bulletKeywordUniqueCount,
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
  const normalizedName = sanitizeS3KeyComponent(sanitizedName);
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedUserId = sanitizeS3KeyComponent(userId);
  if (normalizedUserId) {
    return normalizedUserId;
  }

  return 'candidate';
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

function extractSessionScopedPrefixFromKey(key) {
  if (typeof key !== 'string') {
    return '';
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return '';
  }
  const normalizedWithFileRemoved = trimmed.replace(/[^/]+$/, '');
  const segments = ensureTrailingSlash(normalizedWithFileRemoved)
    .split('/')
    .filter(Boolean);
  if (segments.length < 3) {
    return '';
  }
  const sessionCandidate = segments[2];
  if (!sessionCandidate) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(sessionCandidate)) {
    return '';
  }
  if (sessionCandidate === 'incoming') {
    return '';
  }
  return `${segments.slice(0, 3).join('/')}/`;
}

function resolveSessionArtifactPrefix({
  originalUploadKey,
  ownerSegment,
  sanitizedName,
  userId,
  sessionSegment,
  requestId,
  dateSegment,
  jobId,
  jobSegment,
} = {}) {
  const existingSessionPrefix = extractSessionScopedPrefixFromKey(originalUploadKey);
  if (existingSessionPrefix) {
    return existingSessionPrefix;
  }

  const normalizedOwnerSegment =
    sanitizeS3KeyComponent(ownerSegment) ||
    resolveDocumentOwnerSegment({ userId, sanitizedName });
  const normalizedSessionSegment =
    sanitizeS3KeyComponent(sessionSegment) ||
    sanitizeS3KeyComponent(requestId, { fallback: '' });
  const normalizedDateSegment = sanitizeS3KeyComponent(dateSegment);
  const normalizedJobSegment =
    sanitizeS3KeyComponent(jobSegment) || sanitizeJobSegment(jobId);

  return buildDocumentSessionPrefix({
    ownerSegment: normalizedOwnerSegment,
    sessionSegment: normalizedSessionSegment,
    dateSegment: normalizedDateSegment,
    jobSegment: normalizedJobSegment,
  });
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
  const prefix = extractSessionScopedPrefixFromKey(uploadKey);
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

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (Buffer.isBuffer(stream)) return stream;
  if (typeof stream.arrayBuffer === 'function') {
    const arrayBuffer = await stream.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  const readable =
    stream instanceof Readable || typeof stream[Symbol.asyncIterator] === 'function'
      ? stream
      : Readable.from(stream);
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
      const existing = await sendS3CommandWithRetry(
        s3,
        () => new GetObjectCommand({ Bucket: bucket, Key: metadataKey }),
        {
          maxAttempts: 3,
          baseDelayMs: 300,
          maxDelayMs: 2500,
        }
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

    await sendS3CommandWithRetry(
      s3,
      () =>
        new PutObjectCommand(
          withEnvironmentTagging({
            Bucket: bucket,
            Key: metadataKey,
            Body: JSON.stringify(nextPayload, null, 2),
            ContentType: 'application/json',
          })
        ),
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 4000,
        jitterMs: 300,
        retryLogEvent: 'stage_metadata_update_retry',
        retryLogContext: context,
      }
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
    const response = await sendS3CommandWithRetry(
      s3,
      () => new GetObjectCommand({ Bucket: bucket, Key: key }),
      {
        maxAttempts: 3,
        baseDelayMs: 300,
        maxDelayMs: 2500,
      }
    );
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

function normalizeSessionChangeLogArray(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => normalizeChangeLogEntryInput(entry))
    .filter(Boolean);
}

async function loadSessionChangeLog({ s3, bucket, key, fallbackEntries = [] } = {}) {
  const data = await readJsonFromS3({ s3, bucket, key });
  if (!data) {
    return {
      entries: normalizeSessionChangeLogArray(fallbackEntries),
      dismissedEntries: [],
      coverLetterEntries: [],
      dismissedCoverLetterEntries: [],
      sessionLogs: [],
      evaluationLogs: [],
      enhancementLogs: [],
      downloadLogs: [],
    };
  }
  const entries = normalizeSessionChangeLogArray(data.entries);
  const dismissedEntries = normalizeSessionChangeLogArray(data.dismissedEntries);
  const coverLettersPayload =
    data.coverLetters && typeof data.coverLetters === 'object' ? data.coverLetters : {};
  const legacyCoverLetterEntries = Array.isArray(data.coverLetterEntries)
    ? data.coverLetterEntries
    : [];
  const legacyDismissedCoverLetters = Array.isArray(data.dismissedCoverLetterEntries)
    ? data.dismissedCoverLetterEntries
    : [];
  const coverLetterEntries = normalizeCoverLetterChangeLogArray(
    Array.isArray(coverLettersPayload.entries)
      ? coverLettersPayload.entries
      : legacyCoverLetterEntries
  );
  const dismissedCoverLetterEntries = normalizeCoverLetterChangeLogArray(
    Array.isArray(coverLettersPayload.dismissedEntries)
      ? coverLettersPayload.dismissedEntries
      : legacyDismissedCoverLetters
  ).map((entry) => ({
    ...entry,
    rejected: true,
    rejectedAt: entry.rejectedAt || null,
    rejectionReason: entry.rejectionReason || null,
  }));
  const sessionLogs = normalizeChangeLogActivityArray(data.sessionLogs);
  const evaluationLogs = normalizeChangeLogActivityArray(data.evaluationLogs);
  const enhancementLogs = normalizeChangeLogActivityArray(data.enhancementLogs);
  const downloadLogs = normalizeChangeLogActivityArray(data.downloadLogs);

  return {
    entries,
    dismissedEntries,
    coverLetterEntries,
    dismissedCoverLetterEntries,
    sessionLogs,
    evaluationLogs,
    enhancementLogs,
    downloadLogs,
  };
}

function resolveSessionChangeLogLocation({
  bucket,
  key,
  jobId,
  originalUploadKey,
  ownerSegment,
  sanitizedName,
  userId,
  sessionSegment,
  requestId,
  dateSegment,
} = {}) {
  const preferredBuckets = [
    typeof bucket === 'string' ? bucket.trim() : '',
    typeof process.env.SESSION_CHANGE_LOG_BUCKET === 'string'
      ? process.env.SESSION_CHANGE_LOG_BUCKET.trim()
      : '',
    typeof process.env.S3_BUCKET === 'string' ? process.env.S3_BUCKET.trim() : '',
    typeof process.env.S3_BUCKET_NAME === 'string' ? process.env.S3_BUCKET_NAME.trim() : '',
  ];

  let resolvedBucket = preferredBuckets.find((value) => value) || '';

  let resolvedKey = typeof key === 'string' ? key.trim() : '';

  if (!resolvedKey) {
    const sessionPrefix = resolveSessionArtifactPrefix({
      originalUploadKey,
      ownerSegment,
      sanitizedName,
      userId,
      sessionSegment,
      requestId,
      dateSegment,
      jobId,
    });

    if (sessionPrefix) {
      resolvedKey = `${sessionPrefix}logs/change-log.json`;
    }
  }

  if (!resolvedKey && jobId) {
    const jobSegment = sanitizeJobSegment(jobId);
    if (jobSegment) {
      const fallbackSessionSegment =
        sanitizeS3KeyComponent(sessionSegment) ||
        sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
        'session';
      resolvedKey = `cv/${jobSegment}/${fallbackSessionSegment}/logs/change-log.json`;
    }
  }

  return { bucket: resolvedBucket, key: resolvedKey };
}

async function writeSessionChangeLog({
  s3,
  bucket,
  key,
  jobId,
  originalUploadKey,
  ownerSegment,
  sanitizedName,
  userId,
  sessionSegment,
  requestId,
  dateSegment,
  entries,
  summary,
  dismissedEntries,
  coverLetterEntries,
  dismissedCoverLetterEntries,
  sessionLogs = [],
  evaluationLogs = [],
  enhancementLogs = [],
  downloadLogs = [],
}) {
  if (!s3) {
    return null;
  }

  const { bucket: resolvedBucket, key: resolvedKey } = resolveSessionChangeLogLocation({
    bucket,
    key,
    jobId,
    originalUploadKey,
    ownerSegment,
    sanitizedName,
    userId,
    sessionSegment,
    requestId,
    dateSegment,
  });

  if (!resolvedBucket || !resolvedKey) {
    return null;
  }
  const normalizedSummary = normalizeChangeLogSummaryPayload(summary);
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry) => normalizeChangeLogEntryInput(entry)).filter(Boolean)
    : [];
  const normalizedDismissedEntries = Array.isArray(dismissedEntries)
    ? dismissedEntries.map((entry) => normalizeChangeLogEntryInput(entry)).filter(Boolean)
    : [];
  const normalizedCoverLetterEntries = Array.isArray(coverLetterEntries)
    ? coverLetterEntries
        .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
        .filter(Boolean)
    : [];
  const normalizedDismissedCoverLetters = Array.isArray(dismissedCoverLetterEntries)
    ? dismissedCoverLetterEntries
        .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
        .filter(Boolean)
        .map((entry) => ({
          ...entry,
          rejected: true,
          rejectedAt: entry.rejectedAt || null,
          rejectionReason: entry.rejectionReason || null,
        }))
    : [];
  const normalizedSessionLogs = normalizeChangeLogActivityArray(sessionLogs);
  const normalizedEvaluationLogs = normalizeChangeLogActivityArray(evaluationLogs);
  const normalizedEnhancementLogs = normalizeChangeLogActivityArray(enhancementLogs);
  const normalizedDownloadLogs = normalizeChangeLogActivityArray(downloadLogs);
  const payload = {
    version: 1,
    jobId,
    updatedAt: new Date().toISOString(),
    entries: normalizedEntries,
    summary: normalizedSummary,
    dismissedEntries: normalizedDismissedEntries,
    coverLetters: {
      entries: normalizedCoverLetterEntries,
      dismissedEntries: normalizedDismissedCoverLetters,
    },
    sessionLogs: normalizedSessionLogs,
    evaluationLogs: normalizedEvaluationLogs,
    enhancementLogs: normalizedEnhancementLogs,
    downloadLogs: normalizedDownloadLogs,
  };
  await sendS3CommandWithRetry(
    s3,
    () =>
      new PutObjectCommand(
        withEnvironmentTagging({
          Bucket: resolvedBucket,
          Key: resolvedKey,
          Body: JSON.stringify(payload, null, 2),
          ContentType: 'application/json',
        })
      ),
    {
      maxAttempts: 4,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitterMs: 300,
      retryLogEvent: 'session_changelog_write_retry',
      retryLogContext: {
        jobId,
        bucket: resolvedBucket,
        key: resolvedKey,
      },
    }
  );
  return { payload, bucket: resolvedBucket, key: resolvedKey };
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
  /^(?:thank you(?:(?: for (?:your )?(?:time|consideration))|(?: for considering (?:my|the) (?:application|candidacy)))?|thanks(?: so much)?|sincerely|best(?: regards| wishes)?|regards|kind regards|warm regards|with appreciation|with gratitude|respectfully|yours truly|yours faithfully|yours sincerely)/i;
const COVER_LETTER_PLACEHOLDER_PATTERNS = Object.freeze([
  /\b(?:lorem ipsum|dummy text|sample text|placeholder)\b/i,
  /\b(?:to be determined|tbd|fill in|fill out|type here)\b/i,
  /\b(?:insert|replace)\b[^.\n]*\b(?:here|placeholder|text|details|information)\b/i,
  /\badd\b[^.\n]*\b(?:details here|information here)\b/i,
  /\[(?:insert|add|replace|type|fill)[^\]]*\]/i,
  /\[(?:your|the|company|organization|organisation|employer|hiring manager|recruiter|recipient|team|department|role|position|job|title|name|contact|email|phone|address|date)[^\]]*\]/i,
  /<(?:insert|add|replace|type|fill)[^>]*>/i,
  /<(?:your|the|company|organization|organisation|employer|hiring manager|recruiter|recipient|team|department|role|position|job|title|name|contact|email|phone|address|date)[^>]*>/i,
  /\{(?:your|the|company|organization|organisation|employer|hiring manager|recruiter|recipient|team|department|role|position|job|title|name|contact|email|phone|address|date)[^}]*\}/i,
  /{{(?!RF_ENH)[^}]+}}/i,
  /<<[^>]+>>/i,
  /\b(?:your (?:name|title|company|contact) here)\b/i,
  /\b(?:company name|hiring manager name|recipient name|applicant name|applicant signature)\b/i,
  /\bInformation not provided\b/i,
]);
const COVER_LETTER_RECOVERABLE_ISSUES = Object.freeze(
  new Set([
    // Allow cover letters that have otherwise solid structure but end with a
    // simple expression of gratitude. These can be improved later without
    // discarding the AI response entirely.
    'weak_closing',
  ])
);
const COVER_LETTER_SECTION_HEADING_PATTERNS = Object.freeze([
  /\bintroduction\b/i,
  /\bintro\b/i,
  /\bopening\b/i,
  /\bbody(?:\s+paragraph)?(?:\s+\d+)?\b/i,
  /\bparagraph\s*\d+\b/i,
  /\bsection\s*\d+\b/i,
  /\bclosing\b/i,
  /\bconclusion\b/i,
  /\bsummary\b/i,
  /\bcontact\s+(?:information|details)\b/i,
  /\bsalutation\b/i,
  /\bgreeting\b/i,
  /\bsignature\b/i,
  /\bqualifications\b/i,
  /\bachievements\b/i,
  /\bexperience\b/i,
  /\bskills\b/i,
  /\bbackground\b/i,
]);

const COVER_LETTER_MAX_WORDS = 500;
const COVER_LETTER_STRONG_CLOSING_PATTERNS = Object.freeze([
  /\blook forward to\b/i,
  /\bwelcome the opportunity\b/i,
  /\beager to\b/i,
  /\bexcited to\b/i,
  /\bready to\b/i,
  /\bkeen to\b/i,
  /\bconfident\b/i,
  /\bcan (?:contribute|support|help|add value|deliver)\b/i,
  /\bdeliver\b[^.?!]*\bvalue\b/i,
  /\bplease (?:contact|let me know)\b/i,
  /\bwould love to\b/i,
  /\bavailable to\b[^.?!]*\bdiscuss\b/i,
]);
const COVER_LETTER_WEAK_CLOSING_ONLY_PATTERNS = Object.freeze([
  /\bthank you(?: so much)?(?: for (?:your )?(?:time|consideration|review))?\b/i,
  /\bthanks(?: so much)?(?: for (?:your )?(?:time|consideration|review))?\b/i,
  /\bi appreciate your (?:time|consideration)\b/i,
  /\bi appreciate you taking the time\b/i,
  /\bi hope to hear from you(?: soon)?\b/i,
  /\bi hope you will consider\b/i,
]);
const COVER_LETTER_SALUTATION_ONLY_PATTERN =
  /^(?:sincerely|best regards|regards|kind regards|warm regards|respectfully|with appreciation|with gratitude|yours truly|yours faithfully|yours sincerely|best|cheers)[,\s]/i;

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
    if (/^(dear|hello|hi|greetings)\b/i.test(firstLine)) {
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
          contactLines: filterSensitiveContactLines(
            Array.isArray(contactDetails.contactLines)
              ? contactDetails.contactLines.filter((line) => typeof line === 'string')
              : [],
          ),
        }
      : {
          email: '',
          phone: '',
          linkedin: '',
          cityState: '',
          contactLines: [],
        };

  const detectedContactRaw = extractContactDetails(normalizedText, explicitContact.linkedin);
  const detectedContactLines = filterSensitiveContactLines(
    Array.isArray(detectedContactRaw.contactLines)
      ? detectedContactRaw.contactLines
      : [],
  );

  const combinedContact = {
    email: explicitContact.email || detectedContactRaw.email || '',
    phone: explicitContact.phone || detectedContactRaw.phone || '',
    linkedin: explicitContact.linkedin || detectedContactRaw.linkedin || '',
    cityState: explicitContact.cityState || detectedContactRaw.cityState || '',
  };

  const contactSources = {
    email: explicitContact.email ? 'provided' : detectedContactRaw.email ? 'detected' : '',
    phone: explicitContact.phone ? 'provided' : detectedContactRaw.phone ? 'detected' : '',
    linkedin: '',
    location: explicitContact.cityState
      ? 'provided'
      : detectedContactRaw.cityState
        ? 'detected'
        : '',
  };

  const contactLines = filterSensitiveContactLines(
    dedupeContactLines(
      [
        ...explicitContact.contactLines,
        ...detectedContactLines,
        combinedContact.email ? `Email: ${combinedContact.email}` : '',
        combinedContact.phone ? `Phone: ${combinedContact.phone}` : '',
        combinedContact.cityState ? `Location: ${combinedContact.cityState}` : '',
      ]
        .map((line) => (typeof line === 'string' ? line.trim().replace(/\s+/g, ' ') : ''))
        .filter(Boolean)
    )
  );

  const providedContactLines = explicitContact.contactLines;
  const detectedContactSanitizedLines = detectedContactLines;

  combinedContact.linkedin = '';

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
      linkedin: '',
      location: combinedContact.cityState,
      lines: contactLines,
      provided: {
        email: explicitContact.email,
        phone: explicitContact.phone,
        linkedin: '',
        location: explicitContact.cityState,
        lines: providedContactLines,
      },
      detected: {
        email: detectedContactRaw.email || explicitContact.email || '',
        phone: detectedContactRaw.phone || explicitContact.phone || '',
        linkedin: '',
        location: detectedContactRaw.cityState || explicitContact.cityState || '',
        lines: detectedContactSanitizedLines,
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

function auditCoverLetterStructure(
  text = '',
  {
    contactDetails = {},
    jobTitle = '',
    jobDescription = '',
    jobSkills = [],
    applicantName = '',
    letterIndex = 1,
  } = {}
) {
  const normalizedText = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';
  const issues = [];

  if (!normalizedText) {
    return { valid: false, issues: ['empty'] };
  }

  const wordCount = normalizedText ? normalizedText.split(/\s+/).filter(Boolean).length : 0;
  if (wordCount > COVER_LETTER_MAX_WORDS) {
    issues.push('exceeds_word_limit');
  }

  if (COVER_LETTER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    issues.push('placeholder_detected');
  }

  const fields = mapCoverLetterFields({
    text: normalizedText,
    contactDetails,
    jobTitle,
    jobDescription,
    jobSkills,
    applicantName,
    letterIndex,
  });

  const bodyParagraphs = Array.isArray(fields?.body) ? [...fields.body] : [];
  const hasBodyContent = bodyParagraphs.some(
    (paragraph) => typeof paragraph === 'string' && paragraph.trim()
  );
  const closingParagraph =
    typeof fields?.closing?.paragraph === 'string'
      ? fields.closing.paragraph.trim()
      : '';
  const normalizedBodyParagraphs = bodyParagraphs.map((paragraph) =>
    typeof paragraph === 'string' ? paragraph.replace(/\s+/g, ' ').trim() : ''
  );

  let closingEvaluationText = closingParagraph.replace(/\s+/g, ' ').trim();
  if (
    !closingEvaluationText ||
    COVER_LETTER_SALUTATION_ONLY_PATTERN.test(closingEvaluationText)
  ) {
    const lastBodyParagraph = normalizedBodyParagraphs[normalizedBodyParagraphs.length - 1] || '';
    closingEvaluationText = lastBodyParagraph;
  }

  const normalizedClosingEvaluation = closingEvaluationText
    ? closingEvaluationText.replace(/\s+/g, ' ').trim()
    : '';
  const closingEvaluationWordCount = normalizedClosingEvaluation
    ? normalizedClosingEvaluation.split(/\s+/).filter(Boolean).length
    : 0;
  const hasStrongClosing = normalizedClosingEvaluation
    ? COVER_LETTER_STRONG_CLOSING_PATTERNS.some((pattern) =>
        pattern.test(normalizedClosingEvaluation)
      )
    : false;
  const hasWeakClosingCue = normalizedClosingEvaluation
    ? COVER_LETTER_WEAK_CLOSING_ONLY_PATTERNS.some((pattern) =>
        pattern.test(normalizedClosingEvaluation)
      )
    : false;
  if (
    normalizedClosingEvaluation &&
    ((!hasStrongClosing && hasWeakClosingCue) ||
      (!hasStrongClosing && closingEvaluationWordCount && closingEvaluationWordCount <= 5))
  ) {
    issues.push('weak_closing');
  }

  if (!hasBodyContent && closingParagraph) {
    // Allow concise letters where the closing paragraph doubles as the main message.
    bodyParagraphs.push(closingParagraph);
  }

  if (!hasBodyContent && !closingParagraph) {
    issues.push('missing_body');
  }

  const metadata = fields?.metadata || {};
  if (!metadata.hasGreeting) {
    issues.push('missing_greeting');
  }
  if (!metadata.hasClosing && !closingParagraph && !hasBodyContent) {
    issues.push('missing_closing');
  }

  const bodyHasPlaceholder = bodyParagraphs.some((paragraph) =>
    COVER_LETTER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(paragraph))
  );
  if (bodyHasPlaceholder && !issues.includes('placeholder_detected')) {
    issues.push('placeholder_detected');
  }

  const analyzedBodyParagraphs = bodyParagraphs.map((paragraph) => {
    const raw = typeof paragraph === 'string' ? paragraph : '';
    const trimmed = raw.trim();
    const withoutBullets = trimmed.replace(/^[-*•\s]+/, '').trim();
    const normalizedHeading = withoutBullets.replace(/[:\-–—]+$/, '').trim();
    const looksLikeHeading = Boolean(
      withoutBullets &&
        normalizedHeading &&
        normalizedHeading.length <= 80 &&
        !/[.!?]/.test(normalizedHeading) &&
        COVER_LETTER_SECTION_HEADING_PATTERNS.some((pattern) =>
          pattern.test(normalizedHeading)
        )
    );

    return {
      raw,
      trimmed,
      withoutBullets,
      normalizedHeading,
      looksLikeHeading,
    };
  });

  const headingIndices = analyzedBodyParagraphs
    .map((entry, index) => (entry.looksLikeHeading ? index : -1))
    .filter((index) => index !== -1);

  const headingWithoutContent = headingIndices.some((headingIndex) => {
    const nextContentEntry = analyzedBodyParagraphs
      .slice(headingIndex + 1)
      .find((entry) => Boolean(entry.trimmed));

    if (!nextContentEntry) {
      return true;
    }

    if (nextContentEntry.looksLikeHeading) {
      return true;
    }

    if (
      COVER_LETTER_PLACEHOLDER_PATTERNS.some((pattern) =>
        pattern.test(nextContentEntry.raw)
      )
    ) {
      return true;
    }

    const contentWords = nextContentEntry.withoutBullets
      ? nextContentEntry.withoutBullets.split(/\s+/).filter(Boolean)
      : [];
    const hasMeaningfulLength = contentWords.length >= 3;
    const hasSentencePunctuation = /[.!?]/.test(nextContentEntry.withoutBullets);
    const hasDataCue = /[0-9$%]/.test(nextContentEntry.withoutBullets);

    return !(hasMeaningfulLength || hasSentencePunctuation || hasDataCue);
  });

  if (headingWithoutContent) {
    issues.push('section_heading_without_content');
  }

  const contactLines = Array.isArray(fields?.contact?.lines) ? fields.contact.lines : [];
  if (contactLines.length && !contactLines.some((line) => typeof line === 'string' && line.trim())) {
    issues.push('empty_contact_block');
  }

  const contactHasPlaceholder = contactLines.some((line) =>
    typeof line === 'string' &&
    COVER_LETTER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(line))
  );
  if (contactHasPlaceholder && !issues.includes('placeholder_detected')) {
    issues.push('placeholder_detected');
  }

  return { valid: issues.length === 0, issues, fields };
}

function cleanEmployerName(value = '') {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/[\s,.;:]+$/, '').trim();
  if (!trimmed) return '';
  return trimmed;
}

function extractEmployerName(jobDescription = '') {
  if (typeof jobDescription !== 'string') {
    return '';
  }

  const normalized = jobDescription.replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const inspectable = lines.slice(0, 8);

  for (const line of inspectable) {
    const companyMatch = line.match(
      /^(?:company|employer|organization|organisation|about(?: us)?)\s*[:\-]\s*(.+)$/i
    );
    if (companyMatch) {
      const name = cleanEmployerName(companyMatch[1]);
      if (name) return name;
    }
  }

  const searchWindow = inspectable.join(' ');
  const patterns = [
    /(?:role|position|opportunity)\s+at\s+([A-Z][A-Za-z0-9&.,' -]{2,})/i,
    /join(?:ing)?\s+(?:the\s+)?([A-Z][A-Za-z0-9&.,' -]{2,})(?:\s+(?:team|organization|organisation|company|group))?/i,
    /at\s+([A-Z][A-Za-z0-9&.,' -]{2,})(?=\s+(?:is|are|seeks|seeking|,|\.|offers|provides))/i,
    /with\s+([A-Z][A-Za-z0-9&.,' -]{2,})(?=\s+(?:is|are|seeks|seeking|,|\.|offers|provides))/i,
  ];

  for (const pattern of patterns) {
    const match = searchWindow.match(pattern);
    if (match) {
      const name = cleanEmployerName(match[1]);
      if (name) {
        return name;
      }
    }
  }

  return '';
}

function buildContactHeader(contactDetails = {}) {
  const lineCandidates = [];
  if (Array.isArray(contactDetails.contactLines)) {
    lineCandidates.push(...contactDetails.contactLines);
  }

  const pushLine = (label, value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    lineCandidates.push(`${label}: ${trimmed}`);
  };

  pushLine('Email', contactDetails.email);
  pushLine('Phone', contactDetails.phone);
  pushLine('LinkedIn', contactDetails.linkedin);
  pushLine('Location', contactDetails.cityState);

  const normalizedLines = dedupeContactLines(lineCandidates);
  if (!normalizedLines.length) {
    return '';
  }
  return normalizedLines.join('\n');
}

function buildFallbackCoverLetters({
  applicantName = '',
  jobTitle = '',
  designation = '',
  jobDescription = '',
  jobSkills = [],
  targetedSkills = [],
  contactDetails = {},
  resumeText = '',
} = {}) {
  const safeName = typeof applicantName === 'string' && applicantName.trim()
    ? applicantName.trim()
    : 'Candidate';
  const normalizedTitle = typeof jobTitle === 'string' ? jobTitle.trim() : '';
  const employerName = extractEmployerName(jobDescription) || 'your organization';
  const titlePhrase = normalizedTitle
    ? `the ${normalizedTitle} role`
    : 'the role';
  const designationLabel =
    typeof designation === 'string' && designation.trim()
      ? designation.trim()
      : normalizedTitle;
  const contactHeader = buildContactHeader(contactDetails);
  const focusSentence = summarizeJobFocus(jobDescription);
  const prioritizedSkills = Array.isArray(targetedSkills) && targetedSkills.length
    ? targetedSkills
    : jobSkills;
  const skillPhrase = formatSkillList(prioritizedSkills);

  const introParts = [`I am excited to apply for ${titlePhrase} at ${employerName}.`];
  if (focusSentence) {
    introParts.push(`The opportunity to ${focusSentence.toLowerCase()}`);
  }
  if (skillPhrase) {
    introParts.push(
      `My background with ${skillPhrase} equips me to tackle the priorities outlined in the description.`
    );
  }
  const introParagraph = introParts.join(' ').replace(/\s+/g, ' ').trim();

  const designationSentence = designationLabel
    ? `As a ${designationLabel}, I have a track record of translating strategy into measurable outcomes by collaborating across teams and elevating delivery quality.`
    : 'I have a track record of translating strategy into measurable outcomes by collaborating across teams and elevating delivery quality.';

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

  const closingParagraphVariantTwo = `I look forward to discussing how my background can accelerate results for ${closingTarget}.`;

  const coverLetter1 = [
    contactHeader,
    'Dear Hiring Manager,',
    introParagraph,
    designationSentence,
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
    contactHeader,
    'Dear Hiring Manager,',
    `I am ready to contribute to ${titlePhrase} and immediately add value at ${employerName}.`,
    designationSentence,
    reinforcementParagraph,
    alignmentParagraph,
    primaryExperience ||
      'I thrive when collaborating with diverse partners, simplifying complex requirements, and guiding initiatives from concept through successful delivery.',
    closingParagraphVariantTwo,
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

function upgradeCoverLetterClosingWithFallback({
  originalText = '',
  fallbackText = '',
  applicantName = '',
}) {
  const normalizedOriginal =
    typeof originalText === 'string' ? originalText.replace(/\r\n/g, '\n') : '';
  const normalizedFallback =
    typeof fallbackText === 'string' ? fallbackText.replace(/\r\n/g, '\n') : '';

  if (!normalizedOriginal.trim() || !normalizedFallback.trim()) {
    return normalizedOriginal || '';
  }

  const originalParagraphs = splitCoverLetterParagraphs(normalizedOriginal);
  const fallbackParagraphs = splitCoverLetterParagraphs(normalizedFallback);

  if (!originalParagraphs.length || !fallbackParagraphs.length) {
    return normalizedOriginal;
  }

  const originalClosing = findCoverLetterClosing(originalParagraphs, applicantName);
  const fallbackClosing = findCoverLetterClosing(fallbackParagraphs, applicantName);

  const resolveClosingMessageIndex = (paragraphs, closingInfo) => {
    if (!Array.isArray(paragraphs) || !paragraphs.length) {
      return -1;
    }
    let candidateIndex =
      typeof closingInfo?.index === 'number' && closingInfo.index >= 0
        ? closingInfo.index
        : paragraphs.length - 1;
    const paragraph = paragraphs[candidateIndex] || '';
    const firstLine = paragraph.split('\n')[0]?.trim() || '';
    if (firstLine && COVER_LETTER_SALUTATION_ONLY_PATTERN.test(firstLine)) {
      if (candidateIndex - 1 >= 0) {
        return candidateIndex - 1;
      }
    }
    return candidateIndex;
  };

  const originalMessageIndex = resolveClosingMessageIndex(originalParagraphs, originalClosing);
  const fallbackMessageIndex = resolveClosingMessageIndex(fallbackParagraphs, fallbackClosing);

  const fallbackMessage =
    fallbackMessageIndex >= 0 ? fallbackParagraphs[fallbackMessageIndex] : '';

  if (!fallbackMessage || originalMessageIndex < 0) {
    return normalizedOriginal;
  }

  const updatedParagraphs = [...originalParagraphs];
  updatedParagraphs[originalMessageIndex] = fallbackMessage;

  const updatedText = updatedParagraphs.join('\n\n').trim();
  return updatedText || normalizedOriginal;
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
  const emptyContext = {
    sectionOrder: [],
    sectionFallbacks: [],
    contactLines: ['Contact: Update with your email, phone, and location.'],
  };

  if (!text) {
    return emptyContext;
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

  const contactSection = sections.find(
    (sec) => normalizeHeading(sec.heading || '').toLowerCase() === 'contact'
  );
  const contactLinesFromSection = contactSection
    ? (contactSection.items || [])
        .map((tokens) => stringifyTokens(tokens || []))
        .map((line) => String(line || '').trim())
        .filter(Boolean)
    : [];

  const detectedContactDetails = extractContactDetails(text);
  const detectedContactLines = Array.isArray(detectedContactDetails.contactLines)
    ? detectedContactDetails.contactLines.map((line) => String(line || '').trim())
    : [];

  const combinedContactLines = dedupeContactLines([
    ...contactLinesFromSection,
    ...detectedContactLines,
  ]);

  const contactLines = combinedContactLines.length
    ? combinedContactLines
    : emptyContext.contactLines;

  return { sectionOrder, sectionFallbacks, contactLines };
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
    const result = await generateContentWithRetry(generativeModel, prompt);
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
const MAX_COVER_LETTER_CHANGE_LOG_TEXT_LENGTH = 10000;
const MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH = 20000;
const CHANGE_LOG_FIELD_LIMITS = Object.freeze({
  detail: MAX_CHANGE_LOG_DETAIL_LENGTH,
  diff: MAX_CHANGE_LOG_DIFF_LENGTH,
  resume: MAX_CHANGE_LOG_RESUME_TEXT_LENGTH,
  history: MAX_CHANGE_LOG_HISTORY_CONTEXT_LENGTH,
  suffix: CHANGE_LOG_TRUNCATION_SUFFIX,
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

function normalizeActivityString(value, maxLength = MAX_CHANGE_LOG_DETAIL_LENGTH) {
  const text = normalizeChangeLogString(value);
  if (!text) {
    return '';
  }
  return truncateChangeLogText(text, maxLength);
}

function sanitizeChangeLogActivityValue(value, depth = 0) {
  if (depth > 5) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return normalizeActivityString(value.toISOString());
  }
  if (typeof value === 'string') {
    const text = normalizeActivityString(value);
    return text ? text : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const sanitized = value
      .map((item) => sanitizeChangeLogActivityValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return sanitized.length ? sanitized : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).reduce((acc, [key, val]) => {
      const sanitizedValue = sanitizeChangeLogActivityValue(val, depth + 1);
      if (sanitizedValue !== undefined) {
        acc[key] = sanitizedValue;
      }
      return acc;
    }, {});
    return Object.keys(entries).length ? entries : undefined;
  }
  return undefined;
}

function hasMeaningfulActivityMessage(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return !/^internal server error$/i.test(trimmed);
}

function applyActivityLogFailureMessage(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  const contextFields = ['stage', 'event', 'type', 'category'];
  const contextValues = contextFields
    .map((field) => entry[field])
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase());

  if (!contextValues.length) {
    return entry;
  }

  const relatesToEnhancement = contextValues.some((value) => value.includes('enhancement'));
  const relatesToEvaluation = contextValues.some((value) => value.includes('evaluation'));

  if (!relatesToEnhancement && !relatesToEvaluation) {
    return entry;
  }

  const statusText = typeof entry.status === 'string' ? entry.status.toLowerCase() : '';
  const failureIndicators = ['fail', 'error', 'unavailable', 'timeout'];
  const indicatesFailure =
    failureIndicators.some((token) => statusText.includes(token)) ||
    contextValues.some((value) => failureIndicators.some((token) => value.includes(token)));

  if (!indicatesFailure) {
    return entry;
  }

  const fallback = relatesToEnhancement
    ? CV_GENERATION_ERROR_MESSAGE
    : LAMBDA_PROCESSING_ERROR_MESSAGE;

  const messageFields = ['message', 'detail', 'description', 'notes', 'resolution', 'summary'];
  const hasMeaningfulField = messageFields.some((field) => hasMeaningfulActivityMessage(entry[field]));

  if (!hasMeaningfulField) {
    entry.message = fallback;
  } else {
    messageFields.forEach((field) => {
      const value = entry[field];
      if (typeof value === 'string' && !hasMeaningfulActivityMessage(value)) {
        entry[field] = fallback;
      }
    });
  }

  return entry;
}

function normalizeChangeLogActivityEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const sanitized = sanitizeChangeLogActivityValue(entry);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return null;
  }

  const normalized = { ...sanitized };

  const shortStringFields = [
    'id',
    'stage',
    'stageLabel',
    'event',
    'status',
    'type',
    'category',
    'actor',
    'source',
    'label',
    'title',
  ];
  const longTextFields = ['message', 'detail', 'description', 'notes', 'resolution', 'summary'];

  shortStringFields.forEach((field) => {
    if (field in normalized) {
      const value = normalizeActivityString(normalized[field]);
      if (value) {
        normalized[field] = value;
      } else {
        delete normalized[field];
      }
    }
  });

  longTextFields.forEach((field) => {
    if (field in normalized) {
      const value = normalizeActivityString(normalized[field]);
      if (value) {
        normalized[field] = value;
      } else {
        delete normalized[field];
      }
    }
  });

  if ('timestamp' in normalized) {
    const timestamp = normalizeChangeLogString(normalized.timestamp);
    if (timestamp) {
      normalized.timestamp = timestamp;
    } else {
      delete normalized.timestamp;
    }
  }

  applyActivityLogFailureMessage(normalized);

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === undefined || normalized[key] === '') {
      delete normalized[key];
    }
  });

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeChangeLogActivityArray(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => normalizeChangeLogActivityEntry(entry))
    .filter(Boolean);
}

function extractActivityLogArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null) {
    return [];
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidateKeys = ['entries', 'items', 'logs', 'events', 'history', 'list'];
  for (const key of candidateKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested;
    }
    if (nested === null) {
      return [];
    }
  }

  return null;
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

function isCoverLetterEntryIdentifier(value) {
  const identifier = normalizeChangeLogString(value);
  if (!identifier) {
    return false;
  }
  return identifier.startsWith('cover_letter');
}

function normalizeCoverLetterChangeLogEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = normalizeChangeLogString(entry.id || entry.variant || entry.type);
  if (!id) {
    return null;
  }

  const variantCandidate = normalizeChangeLogString(
    entry.variant || entry.type || (isCoverLetterEntryIdentifier(id) ? id : '')
  );
  const originalText = normalizeChangeLogText(
    entry.originalText ||
      entry.before ||
      entry.previousText ||
      entry.baselineText ||
      entry.initialText,
    MAX_COVER_LETTER_CHANGE_LOG_TEXT_LENGTH
  );
  const editedText = normalizeChangeLogText(
    entry.editedText ||
      entry.updatedText ||
      entry.draftText ||
      entry.after ||
      entry.text,
    MAX_COVER_LETTER_CHANGE_LOG_TEXT_LENGTH
  );
  const notes = normalizeChangeLogString(entry.notes || entry.summary || entry.detail);
  const updatedAt = normalizeChangeLogString(entry.updatedAt || entry.savedAt || entry.acceptedAt);
  const acceptedAt = normalizeChangeLogString(entry.acceptedAt);
  const rejected = Boolean(entry.rejected);
  const rejectedAt = normalizeChangeLogString(entry.rejectedAt || entry.dismissedAt);
  const rejectionReason = normalizeChangeLogString(
    entry.rejectionReason || entry.dismissedReason || entry.reason
  );
  const updatedBy = normalizeChangeLogString(entry.updatedBy || entry.userId || entry.editor);
  const historyContext = normalizeChangeLogHistoryContext(
    entry.historyContext || entry.historySnapshot || entry.history
  );
  const source = normalizeChangeLogString(entry.source || entry.origin);
  const summarySegments = Array.isArray(entry.summarySegments)
    ? entry.summarySegments
        .map((segment) => normalizeChangeLogSegment(segment))
        .filter(Boolean)
    : [];

  const normalized = {
    id,
    variant: variantCandidate || null,
    originalText: originalText || null,
    editedText: editedText || null,
    notes: notes || null,
    updatedAt: updatedAt || null,
    acceptedAt: acceptedAt || null,
    rejected,
    rejectedAt: rejectedAt || null,
    rejectionReason: rejectionReason || null,
    updatedBy: updatedBy || null,
    historyContext,
    source: source || null,
    summarySegments: summarySegments.length ? summarySegments : undefined,
  };

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === null || normalized[key] === undefined) {
      delete normalized[key];
    }
  });

  if (normalized.summarySegments === undefined) {
    delete normalized.summarySegments;
  }

  return normalized;
}

function normalizeCoverLetterChangeLogArray(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
    .filter(Boolean);
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
  const reverted = Boolean(entry.reverted);
  const revertedAt = normalizeChangeLogString(entry.revertedAt);
  const rejected = Boolean(entry.rejected);
  const rejectedAt = normalizeChangeLogString(entry.rejectedAt);
  const rejectionReason = normalizeChangeLogString(
    entry.rejectionReason || entry.rejectedReason || entry.dismissedReason
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
    reverted,
    revertedAt: revertedAt || null,
    rejected,
    rejectedAt: rejectedAt || null,
    rejectionReason: rejectionReason || null,
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
    const reverted = Boolean(map.reverted?.BOOL);
    const revertedAt = normalizeChangeLogString(map.revertedAt?.S);
    const rejected = Boolean(map.rejected?.BOOL);
    const rejectedAt = normalizeChangeLogString(map.rejectedAt?.S);
    const rejectionReason = normalizeChangeLogString(map.rejectionReason?.S);
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
      reverted,
      revertedAt,
      rejected,
      rejectedAt,
      rejectionReason,
    };
  }).filter(Boolean);
}


function normalizeChangeLogSummaryPayload(summary) {
  const defaultTotals = {
    entries: 0,
    categories: 0,
    highlights: 0,
    addedItems: 0,
    removedItems: 0,
  };

  if (!summary || typeof summary !== 'object') {
    return {
      categories: [],
      highlights: [],
      totals: { ...defaultTotals },
      interviewPrepAdvice: '',
    };
  }

  const categories = Array.isArray(summary.categories)
    ? summary.categories
        .map((category) => {
          if (!category || typeof category !== 'object') {
            return null;
          }
          const key = normalizeChangeLogString(category.key);
          const label = normalizeChangeLogString(category.label);
          const description = normalizeChangeLogString(category.description);
          const added = normalizeChangeLogList(category.added);
          const removed = normalizeChangeLogList(category.removed);
          const reasons = normalizeChangeLogList(category.reasons);
          if (!key && !label && !description && !added.length && !removed.length && !reasons.length) {
            return null;
          }
          const totalAdded = Number.isFinite(category.totalAdded)
            ? Number(category.totalAdded)
            : added.length;
          const totalRemoved = Number.isFinite(category.totalRemoved)
            ? Number(category.totalRemoved)
            : removed.length;
          const totalReasons = Number.isFinite(category.totalReasons)
            ? Number(category.totalReasons)
            : reasons.length;
          const totalChanges = Number.isFinite(category.totalChanges)
            ? Number(category.totalChanges)
            : added.length + removed.length;
          return {
            key,
            label,
            description,
            added,
            removed,
            reasons,
            totalAdded,
            totalRemoved,
            totalReasons,
            totalChanges,
          };
        })
        .filter(Boolean)
    : [];

  const highlights = Array.isArray(summary.highlights)
    ? summary.highlights
        .map((highlight) => {
          if (!highlight || typeof highlight !== 'object') {
            return null;
          }
          const key = normalizeChangeLogString(highlight.key);
          const label = normalizeChangeLogString(highlight.label);
          const type = normalizeChangeLogString(highlight.type);
          const category = normalizeChangeLogString(highlight.category);
          const items = normalizeChangeLogList(highlight.items);
          const count = Number.isFinite(highlight.count) ? Number(highlight.count) : items.length;
          if (!key && !label && !type && !category && !items.length) {
            return null;
          }
          return {
            key,
            label,
            type,
            category,
            items,
            count,
          };
        })
        .filter(Boolean)
    : [];

  const totalsSource = summary.totals && typeof summary.totals === 'object' ? summary.totals : {};
  const totals = {
    entries: Number.isFinite(totalsSource.entries)
      ? Number(totalsSource.entries)
      : categories.length,
    categories: Number.isFinite(totalsSource.categories)
      ? Number(totalsSource.categories)
      : categories.length,
    highlights: Number.isFinite(totalsSource.highlights)
      ? Number(totalsSource.highlights)
      : highlights.length,
    addedItems: Number.isFinite(totalsSource.addedItems)
      ? Number(totalsSource.addedItems)
      : categories.reduce((sum, category) => sum + category.added.length, 0),
    removedItems: Number.isFinite(totalsSource.removedItems)
      ? Number(totalsSource.removedItems)
      : categories.reduce((sum, category) => sum + category.removed.length, 0),
  };

  const interviewPrepAdvice = normalizeChangeLogString(
    summary.interviewPrepAdvice || summary.postEnhancementAdvice
  );

  return { categories, highlights, totals, interviewPrepAdvice };
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

  const linkedinProfileUrlInput = '';

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
  let existingChangeLogEntries = [];
  let dismissedChangeLogEntries = [];
  let existingCoverLetterChangeLogEntries = [];
  let dismissedCoverLetterChangeLogEntries = [];
  let sessionActivityLogs = [];
  let evaluationActivityLogs = [];
  let enhancementActivityLogs = [];
  let downloadActivityLogs = [];
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
        const sessionChangeLogState = await loadSessionChangeLog({
          s3: s3Client,
          bucket: storedBucket,
          key: sessionChangeLogKey,
          fallbackEntries: parseDynamoChangeLog(item.changeLog),
        });
        existingChangeLogEntries = Array.isArray(sessionChangeLogState?.entries)
          ? sessionChangeLogState.entries
          : [];
        dismissedChangeLogEntries = Array.isArray(sessionChangeLogState?.dismissedEntries)
          ? sessionChangeLogState.dismissedEntries
          : [];
        existingCoverLetterChangeLogEntries = Array.isArray(
          sessionChangeLogState?.coverLetterEntries
        )
          ? sessionChangeLogState.coverLetterEntries
          : [];
        dismissedCoverLetterChangeLogEntries = Array.isArray(
          sessionChangeLogState?.dismissedCoverLetterEntries
        )
          ? sessionChangeLogState.dismissedCoverLetterEntries
          : [];
        sessionActivityLogs = Array.isArray(sessionChangeLogState?.sessionLogs)
          ? sessionChangeLogState.sessionLogs
          : [];
        evaluationActivityLogs = Array.isArray(sessionChangeLogState?.evaluationLogs)
          ? sessionChangeLogState.evaluationLogs
          : [];
        enhancementActivityLogs = Array.isArray(sessionChangeLogState?.enhancementLogs)
          ? sessionChangeLogState.enhancementLogs
          : [];
        downloadActivityLogs = Array.isArray(sessionChangeLogState?.downloadLogs)
          ? sessionChangeLogState.downloadLogs
          : [];
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
      requestId,
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

    const learningResourcesPromise = afterMissingOverall.length
      ? generateLearningResources(afterMissingOverall, {
          jobTitle: payload.jobTitle || payload.targetTitle || '',
          jobDescription: jobDescription,
          requestId,
        }).catch((err) => {
          logStructured('warn', 'targeted_improvement_learning_resources_failed', {
            ...logContext,
            error: serializeError(err),
            missingSkillCount: afterMissingOverall.length,
          });
          return [];
        })
      : Promise.resolve([]);

    const selectionInsightsPromise = learningResourcesPromise.then((learningResources) => {
      try {
        return buildSelectionInsights({
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
          learningResources,
        });
      } catch (err) {
        logStructured('warn', 'targeted_improvement_rescore_failed', {
          ...logContext,
          error: serializeError(err),
        });
        return null;
      }
    });

    const [learningResources, selectionInsights] = await Promise.all([
      learningResourcesPromise,
      selectionInsightsPromise,
    ]);

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
        factors: Array.isArray(selectionInsights?.factors) ? selectionInsights.factors : [],
      },
    };

    if (selectionInsights) {
      rescoreSummary.selectionInsights = {
        probability: selectionInsights.probability,
        level: selectionInsights.level,
        message: selectionInsights.message,
        summary: selectionInsights.summary,
        learningResources: selectionInsights.learningResources,
        before: selectionInsights.before,
        after: selectionInsights.after,
        factors: Array.isArray(selectionInsights.factors) ? selectionInsights.factors : [],
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
      const sessionPrefix = resolveSessionArtifactPrefix({
        originalUploadKey,
        ownerSegment,
        sanitizedName,
        userId: res.locals.userId,
        sessionSegment: improvementSessionSegment,
        requestId,
        dateSegment,
        jobId: jobIdInput,
        jobSegment: jobKeySegment,
      });
      const effectiveOriginalUploadKey = originalUploadKey || `${sessionPrefix}original.pdf`;
      const effectiveLogKey = logKey || `${sessionPrefix}logs/processing.jsonl`;
      improvementMetadataKey = `${sessionPrefix}logs/log.json`;

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
        changeLogEntries: existingChangeLogEntries,
        dismissedChangeLogEntries,
        coverLetterChangeLogEntries: existingCoverLetterChangeLogEntries,
        dismissedCoverLetterChangeLogEntries: dismissedCoverLetterChangeLogEntries,
        existingRecord,
        userId: res.locals.userId,
        sessionLogs: sessionActivityLogs,
        evaluationLogs: evaluationActivityLogs,
        enhancementLogs: enhancementActivityLogs,
        downloadLogs: downloadActivityLogs,
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

    if (result.llmTrace) {
      responsePayload.llmTrace = result.llmTrace;
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

app.post('/api/jd/evaluate', assignJobContext, (req, res) => {
  const payload = req.body || {};
  const jobIdInput = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';

  if (jobIdInput) {
    req.jobId = jobIdInput;
    res.locals.jobId = jobIdInput;
  }

  captureUserContext(req, res);

  const outcome = evaluateJobDescription(payload);
  if (!outcome.ok) {
    const { statusCode, code, message, details } = outcome.error || {};
    return sendError(
      res,
      statusCode || 400,
      code || 'VALIDATION_ERROR',
      message || 'Unable to evaluate the job description fit.',
      details
    );
  }

  const requestId = res.locals.requestId;
  const result = outcome.result;

  logStructured('info', 'jd_evaluation_completed', {
    requestId,
    jobId: result.jobId,
    score: result.score,
    missingSkillCount: Array.isArray(result.missingSkills)
      ? result.missingSkills.length
      : 0,
  });

  return res.json(result);
});

app.post('/api/score-match', assignJobContext, (req, res) => {
  const payload = req.body || {};
  const jobIdInput = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';

  if (jobIdInput) {
    req.jobId = jobIdInput;
    res.locals.jobId = jobIdInput;
  }

  captureUserContext(req, res);

  const outcome = scoreResumeAgainstJob(payload);
  if (!outcome.ok) {
    const { statusCode, code, message, details } = outcome.error || {};
    return sendError(
      res,
      statusCode || 400,
      code || 'VALIDATION_ERROR',
      message || 'Unable to score the resume against the job description.',
      details
    );
  }

  const requestId = res.locals.requestId;
  const result = outcome.result;

  logStructured('info', 'match_score_calculated', {
    requestId,
    jobId: result.jobId,
    score: result.score,
    missingSkillCount: Array.isArray(result.missingSkills)
      ? result.missingSkills.length
      : 0,
  });

  return res.json(result);
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

const DOWNLOAD_ARTIFACT_ATTRIBUTE_KEYS = [
  'cv1Url',
  'cv2Url',
  'coverLetter1Url',
  'coverLetter2Url',
  'originalTextKey',
  'enhancedVersion1Key',
  'enhancedVersion2Key',
  'changeLogKey',
];

// Preserve canonical source assets unless the user explicitly discards them.
const DOWNLOAD_ARTIFACT_PROTECTED_ATTRIBUTES = new Set(['originalTextKey']);

function normalizeDynamoStringAttribute(attribute) {
  if (!attribute || typeof attribute.S !== 'string') {
    return '';
  }
  const trimmed = attribute.S.trim();
  return trimmed;
}

async function handleExpiredDownloadSession({
  record,
  dynamo,
  tableName,
  storedLinkedIn,
  jobId,
  s3,
  bucket,
  logContext = {},
  logKey,
}) {
  const result = {
    record,
    expired: false,
    clearedKeys: [],
  };

  if (!record || typeof record !== 'object') {
    return result;
  }

  const lastAction = normalizeDynamoStringAttribute(record.lastAction);
  if (lastAction !== 'artifacts_uploaded') {
    return result;
  }

  const lastActionAtRaw = normalizeDynamoStringAttribute(record.lastActionAt);
  const lastActionAtMs = lastActionAtRaw ? Date.parse(lastActionAtRaw) : Number.NaN;
  if (!Number.isFinite(lastActionAtMs)) {
    return result;
  }

  const now = Date.now();
  if (now - lastActionAtMs <= DOWNLOAD_SESSION_RETENTION_MS) {
    return result;
  }

  result.expired = true;
  const sanitizedRecord = { ...record };
  const attributesToRemove = [];
  const clearedKeys = [];

  for (const attribute of DOWNLOAD_ARTIFACT_ATTRIBUTE_KEYS) {
    const normalized = normalizeDynamoStringAttribute(record[attribute]);
    const isProtected = DOWNLOAD_ARTIFACT_PROTECTED_ATTRIBUTES.has(attribute);

    if (normalized && !isProtected) {
      clearedKeys.push(normalized);
      attributesToRemove.push(attribute);
    }

    if (sanitizedRecord[attribute] && !isProtected) {
      delete sanitizedRecord[attribute];
    }
  }

  const shouldCleanupSessionLogs = isDownloadSessionLogCleanupEnabled();
  if (shouldCleanupSessionLogs) {
    const sessionChangeLogKey = normalizeDynamoStringAttribute(
      record.sessionChangeLogKey
    );
    if (sessionChangeLogKey) {
      clearedKeys.push(sessionChangeLogKey);
      attributesToRemove.push('sessionChangeLogKey');
      if (sanitizedRecord.sessionChangeLogKey) {
        delete sanitizedRecord.sessionChangeLogKey;
      }
    }
  }

  const uniqueClearedKeys = Array.from(new Set(clearedKeys));

  result.record = sanitizedRecord;
  result.clearedKeys = uniqueClearedKeys;

  const cleanupBucketCandidate = normalizeDynamoStringAttribute(record.s3Bucket);
  const cleanupBucket = cleanupBucketCandidate || (typeof bucket === 'string' ? bucket.trim() : '');

  if (s3 && cleanupBucket && uniqueClearedKeys.length) {
    const deleteResults = await Promise.allSettled(
      uniqueClearedKeys.map((key) =>
        sendS3CommandWithRetry(
          s3,
          () =>
            new DeleteObjectCommand({
              Bucket: cleanupBucket,
              Key: key,
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 300,
            maxDelayMs: 3000,
            retryLogEvent: 'download_session_artifact_delete_retry',
            retryLogContext: { ...logContext, bucket: cleanupBucket, key },
          }
        )
      )
    );

    const deletedKeys = [];
    const failedDeletes = [];

    for (let index = 0; index < deleteResults.length; index += 1) {
      const entry = deleteResults[index];
      const key = uniqueClearedKeys[index];
      if (entry.status === 'fulfilled') {
        deletedKeys.push(key);
      } else {
        failedDeletes.push({ key, error: serializeError(entry.reason) });
      }
    }

    if (deletedKeys.length) {
      logStructured('info', 'download_session_artifacts_cleared', {
        ...logContext,
        bucket: cleanupBucket,
        clearedKeys: deletedKeys,
        totalCleared: deletedKeys.length,
      });

      if (logKey) {
        try {
          await logEvent({
            s3,
            bucket: cleanupBucket,
            key: logKey,
            jobId,
            event: 'download_session_artifacts_cleared',
            metadata: {
              reason: 'expired',
              deletedCount: deletedKeys.length,
              attemptedCount: uniqueClearedKeys.length,
            },
          });
        } catch (logErr) {
          logStructured('warn', 'download_session_cleanup_log_failed', {
            ...logContext,
            bucket: cleanupBucket,
            key: logKey,
            error: serializeError(logErr),
          });
        }
      }
    }

    if (failedDeletes.length) {
      logStructured('error', 'download_session_artifact_cleanup_failed', {
        ...logContext,
        bucket: cleanupBucket,
        failures: failedDeletes,
      });
    }
  }

  const nowIso = new Date(now).toISOString();
  sanitizedRecord.lastAction = { S: 'session_expired' };
  sanitizedRecord.lastActionAt = { S: nowIso };
  sanitizedRecord.lastActionMetadata = {
    S: JSON.stringify({
      previousAction: lastAction,
      reason: 'expired',
      clearedArtifacts: uniqueClearedKeys.length,
    }),
  };

  if (dynamo && storedLinkedIn) {
    try {
      const updateExpressionParts = ['#lastAction = :lastAction', 'lastActionAt = :lastActionAt', 'lastActionMetadata = :lastActionMetadata'];
      const removeExpression = attributesToRemove.length
        ? ` REMOVE ${attributesToRemove.join(', ')}`
        : '';
      const expressionAttributeNames = { '#lastAction': 'lastAction' };
      const expressionAttributeValues = {
        ':lastAction': { S: 'session_expired' },
        ':lastActionAt': { S: nowIso },
        ':lastActionMetadata': {
          S: JSON.stringify({
            previousAction: lastAction,
            reason: 'expired',
            clearedArtifacts: uniqueClearedKeys.length,
          }),
        },
      };

      if (jobId) {
        expressionAttributeValues[':jobId'] = { S: jobId };
      }

      updateExpressionParts.push('environment = if_not_exists(environment, :environment)');
      expressionAttributeValues[':environment'] = { S: deploymentEnvironment };

      await dynamo.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          UpdateExpression: `SET ${updateExpressionParts.join(', ')}${removeExpression}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ...(jobId ? { ConditionExpression: 'jobId = :jobId' } : {}),
        })
      );
    } catch (err) {
      logStructured('warn', 'download_session_expiry_update_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  return result;
}

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
  jobDescriptionDigest: jobDescriptionDigestInput = '',
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
  dismissedChangeLogEntries = [],
  coverLetterChangeLogEntries = [],
  dismissedCoverLetterChangeLogEntries = [],
  existingRecord = {},
  userId,
  plainPdfFallbackEnabled = false,
  refreshSessionArtifacts = false,
  sessionLogs = [],
  evaluationLogs = [],
  enhancementLogs = [],
  downloadLogs = [],
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

  let expiredDownloadSessionNotice = '';
  if (!isTestEnvironment) {
    try {
      const expiryResult = await handleExpiredDownloadSession({
        record: existingRecord,
        dynamo,
        tableName,
        storedLinkedIn,
        jobId,
        s3,
        bucket,
        logContext: { ...logContext, route: 'download_session_cleanup' },
        logKey,
      });
      existingRecord = expiryResult.record;
      if (expiryResult.expired) {
        expiredDownloadSessionNotice = DOWNLOAD_SESSION_EXPIRED_MESSAGE;
      }
    } catch (err) {
      logStructured('warn', 'download_session_cleanup_check_failed', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  const artifactCleanupKeys = new Set();
  const staleArtifactKeys = new Set();
  const staleArtifactCleanupEnabled = isGenerationStaleArtifactCleanupEnabled();
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
          sendS3CommandWithRetry(
            s3,
            () =>
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
              }),
            {
              maxAttempts: 3,
              baseDelayMs: 300,
              maxDelayMs: 3000,
              retryLogEvent: `${structuredEventName}_retry`,
              retryLogContext: { ...logContext, bucket, key, reason },
            }
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

  const previousSessionChangeLogKey = normalizeArtifactKey(
    existingRecord?.sessionChangeLogKey?.S
  );
  const previousSessionChangeLogBucket = normalizeArtifactKey(
    existingRecord?.s3Bucket?.S
  );
  let persistedSessionChangeLogResult = null;

  try {
  let sessionChangeLogKey = deriveSessionChangeLogKey({
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
  let stageMetadataKey = '';

  const effectiveChangeLogEntries = refreshSessionArtifacts ? [] : changeLogEntries;
  const effectiveDismissedChangeLogEntries = refreshSessionArtifacts
    ? []
    : dismissedChangeLogEntries;
  const effectiveCoverLetterEntries = refreshSessionArtifacts
    ? []
    : coverLetterChangeLogEntries;
  const effectiveDismissedCoverLetterEntries = refreshSessionArtifacts
    ? []
    : dismissedCoverLetterChangeLogEntries;
  const effectiveSessionLogs = refreshSessionArtifacts ? [] : sessionLogs;
  const effectiveEvaluationLogs = refreshSessionArtifacts ? [] : evaluationLogs;
  const effectiveEnhancementLogs = refreshSessionArtifacts ? [] : enhancementLogs;
  const effectiveDownloadLogs = refreshSessionArtifacts ? [] : downloadLogs;

  const normalizedChangeLogEntries = Array.isArray(effectiveChangeLogEntries)
    ? effectiveChangeLogEntries
        .map((entry) => normalizeChangeLogEntryInput(entry))
        .filter(Boolean)
    : [];
  const normalizedDismissedChangeLogEntries = Array.isArray(effectiveDismissedChangeLogEntries)
    ? effectiveDismissedChangeLogEntries
        .map((entry) => normalizeChangeLogEntryInput(entry))
        .filter(Boolean)
    : [];
  const aggregatedChangeLogSummary = buildAggregatedChangeLogSummary(
    normalizedChangeLogEntries
  );
  const changeLogSummary = normalizeChangeLogSummaryPayload(aggregatedChangeLogSummary);
  const normalizedCoverLetterEntries = Array.isArray(effectiveCoverLetterEntries)
    ? effectiveCoverLetterEntries
        .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
        .filter(Boolean)
    : [];
  const normalizedDismissedCoverLetterEntries = Array.isArray(
    effectiveDismissedCoverLetterEntries
  )
    ? effectiveDismissedCoverLetterEntries
        .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
        .filter(Boolean)
        .map((entry) => ({
          ...entry,
          rejected: true,
          rejectedAt: entry.rejectedAt || null,
          rejectionReason: entry.rejectionReason || null,
        }))
    : [];
  const normalizedSessionLogs = normalizeChangeLogActivityArray(effectiveSessionLogs);
  const normalizedEvaluationLogs = normalizeChangeLogActivityArray(
    effectiveEvaluationLogs
  );
  const normalizedEnhancementLogs = normalizeChangeLogActivityArray(
    effectiveEnhancementLogs
  );
  const normalizedDownloadLogs = normalizeChangeLogActivityArray(
    effectiveDownloadLogs
  );

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
    generativeModel = createGeminiGenerativeModel({
      apiKey: geminiApiKey,
      model: 'gemini-1.5-flash',
    });
  }
  const canUseGenerativeModel = Boolean(generativeModel?.generateContent);
  const resolvedJobDescriptionDigest =
    jobDescriptionDigestInput || createTextDigest(jobDescription);

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
        resumeText,
        { requestId, operation: logContext?.route || 'resume_rewrite' }
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
      canUseGenerativeModel ? generativeModel : null,
      { requestId, operation: 'project_summary' }
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
    designation: versionsContext.jobTitle || applicantTitle || '',
    jobSkills,
    targetedSkills: Array.isArray(jobSkills) ? [...jobSkills] : [],
    resumeSkills: Array.isArray(resumeSkillsList) ? [...resumeSkillsList] : [],
    resume: combinedProfile,
    jobDescription,
    contactDetails: {
      email: contactDetails.email || '',
      phone: contactDetails.phone || '',
      linkedin: contactDetails.linkedin || '',
      cityState: contactDetails.cityState || '',
      contactLines: Array.isArray(contactDetails.contactLines)
        ? [...contactDetails.contactLines]
        : [],
    },
  };
  const coverPrompt = [
    'You are an elite career copywriter supporting Gemini/OpenAI workflows.',
    'Instructions:',
    '- Produce exactly two distinct, ATS-aware cover letters.',
    '- Mirror critical language from the job description and respect accomplishments from the resume.',
    '- Open with job-specific motivation that references the target role and employer from the job description.',
    '- Surface the candidate designation provided in the context when positioning achievements.',
    '- Highlight the most relevant targeted skills from the provided lists, weaving them naturally into the narrative.',
    '- Present the candidate contact information from contactDetails at the top, omitting only fields that are blank.',
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
    const coverLogger = createStructuredLogger(logContext);
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const coverResult = await generateContentWithRetry(
          generativeModel,
          coverPrompt,
          {
            retryLogEvent: 'generation_cover_letters',
            retryLogContext: {
              ...logContext,
              outerAttempt: attempt,
            },
            logger: coverLogger,
          }
        );
        const coverText = coverResult?.response?.text?.();
        const parsed = parseGeminiJsonResponse(coverText, { logger: coverLogger });
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

  const structurallyInvalidLetters = [];
  const recoverableCoverLetters = new Map();
  COVER_LETTER_VARIANT_KEYS.forEach((key, index) => {
    const value = typeof coverData[key] === 'string' ? coverData[key] : '';
    if (!value.trim()) {
      return;
    }
    const auditResult = auditCoverLetterStructure(value, {
      contactDetails: coverContext.contactDetails,
      jobTitle: coverContext.jobTitle,
      jobDescription,
      jobSkills,
      applicantName,
      letterIndex: index + 1,
    });
    if (!auditResult.valid) {
      structurallyInvalidLetters.push({ key, issues: auditResult.issues });
      const onlyRecoverableIssues = Array.isArray(auditResult.issues)
        ? auditResult.issues.every((issue) =>
            COVER_LETTER_RECOVERABLE_ISSUES.has(issue)
          )
        : false;
      if (!onlyRecoverableIssues) {
        coverData[key] = '';
      } else {
        recoverableCoverLetters.set(key, {
          issues: Array.isArray(auditResult.issues) ? [...auditResult.issues] : [],
        });
      }
    }
  });

  if (structurallyInvalidLetters.length) {
    logStructured('warn', 'generation_cover_letters_structural_issues', {
      ...logContext,
      invalidLetters: structurallyInvalidLetters,
    });
  }

  const fallbackLetters = activeCoverLetterFallbackBuilder({
    applicantName,
    jobTitle: versionsContext.jobTitle || applicantTitle,
    designation: coverContext.designation,
    jobDescription,
    jobSkills,
    targetedSkills: coverContext.targetedSkills,
    contactDetails: coverContext.contactDetails,
    resumeText: combinedProfile,
  });
  const pushUnique = (list = [], value) => {
    if (!Array.isArray(list)) {
      return;
    }
    if (!list.includes(value)) {
      list.push(value);
    }
  };
  const fallbackAdjustedCoverLetters = [];
  const bestPracticeAdjustedCoverLetters = [];
  const missingCoverLetters = [];
  const disqualifiedCoverLetters = new Set();
  recoverableCoverLetters.forEach((details, key) => {
    if (!details || !Array.isArray(details.issues)) {
      return;
    }
    if (!details.issues.includes('weak_closing')) {
      return;
    }
    const fallbackValue = fallbackLetters?.[key];
    if (typeof fallbackValue !== 'string' || !fallbackValue.trim()) {
      return;
    }
    const upgradedText = upgradeCoverLetterClosingWithFallback({
      originalText: coverData[key],
      fallbackText: fallbackValue,
      applicantName,
    });
    if (typeof upgradedText !== 'string') {
      return;
    }
    const normalizedOriginal = typeof coverData[key] === 'string' ? coverData[key] : '';
    if (!normalizedOriginal.trim()) {
      return;
    }
    const trimmedUpgraded = upgradedText.trim();
    if (!trimmedUpgraded || trimmedUpgraded === normalizedOriginal.trim()) {
      return;
    }
    coverData[key] = trimmedUpgraded;
    pushUnique(fallbackAdjustedCoverLetters, key);
  });

  if (fallbackAdjustedCoverLetters.length) {
    logStructured('info', 'generation_cover_letters_confident_closing_applied', {
      ...logContext,
      variants: fallbackAdjustedCoverLetters,
    });
  }

  const enforceCoverLetterBestPractices = (key, index) => {
    const value = typeof coverData[key] === 'string' ? coverData[key] : '';
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }

    const auditResult = auditCoverLetterStructure(trimmedValue, {
      contactDetails: coverContext.contactDetails,
      jobTitle: coverContext.jobTitle,
      jobDescription,
      jobSkills,
      applicantName,
      letterIndex: index + 1,
    });

    const issues = Array.isArray(auditResult.issues) ? auditResult.issues : [];
    const blockingIssues = issues.filter((issue) =>
      issue === 'exceeds_word_limit' || issue === 'weak_closing'
    );

    if (!blockingIssues.length) {
      return;
    }

    const fallbackValue = fallbackLetters?.[key];
    const normalizedFallback =
      typeof fallbackValue === 'string' ? fallbackValue.trim() : '';

    if (normalizedFallback) {
      coverData[key] = normalizedFallback;
      pushUnique(bestPracticeAdjustedCoverLetters, key);

      const fallbackAudit = auditCoverLetterStructure(normalizedFallback, {
        contactDetails: coverContext.contactDetails,
        jobTitle: coverContext.jobTitle,
        jobDescription,
        jobSkills,
        applicantName,
        letterIndex: index + 1,
      });

      const fallbackIssues = Array.isArray(fallbackAudit.issues)
        ? fallbackAudit.issues
        : [];
      const fallbackStillBlocks = fallbackIssues.some((issue) =>
        issue === 'exceeds_word_limit' || issue === 'weak_closing'
      );

      if (!fallbackAudit.valid && fallbackStillBlocks) {
        coverData[key] = '';
        pushUnique(missingCoverLetters, key);
        disqualifiedCoverLetters.add(key);
      }

      return;
    }

    coverData[key] = '';
    pushUnique(missingCoverLetters, key);
    disqualifiedCoverLetters.add(key);
  };

  COVER_LETTER_VARIANT_KEYS.forEach((key, index) => {
    enforceCoverLetterBestPractices(key, index);
  });

  const ensureCoverLetterValue = (key) => {
    if (disqualifiedCoverLetters.has(key)) {
      return;
    }
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
      pushUnique(missingCoverLetters, key);
    }
  };

  ensureCoverLetterValue('cover_letter1');
  ensureCoverLetterValue('cover_letter2');

  const removeIfBestPracticesFail = (key, index) => {
    const value = typeof coverData[key] === 'string' ? coverData[key].trim() : '';
    if (!value) {
      return;
    }

    const auditResult = auditCoverLetterStructure(value, {
      contactDetails: coverContext.contactDetails,
      jobTitle: coverContext.jobTitle,
      jobDescription,
      jobSkills,
      applicantName,
      letterIndex: index + 1,
    });

    const blockingIssues = Array.isArray(auditResult.issues)
      ? auditResult.issues.filter(
          (issue) => issue === 'exceeds_word_limit' || issue === 'weak_closing'
        )
      : [];

    if (!blockingIssues.length) {
      return;
    }

    coverData[key] = '';
    disqualifiedCoverLetters.add(key);
    pushUnique(missingCoverLetters, key);
  };

  COVER_LETTER_VARIANT_KEYS.forEach((key, index) => {
    removeIfBestPracticesFail(key, index);
  });
  if (missingCoverLetters.length) {
    logStructured('warn', 'generation_cover_letters_fallback', {
      ...logContext,
      missing: missingCoverLetters,
    });
  }
  const fallbackAppliedCoverLetters = Array.from(
    new Set([
      ...missingCoverLetters,
      ...fallbackAdjustedCoverLetters,
      ...bestPracticeAdjustedCoverLetters,
    ])
  );
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
    fallbackApplied: fallbackAppliedCoverLetters.length > 0,
  });

  await logEvent({ s3, bucket, key: logKey, jobId, event: 'generation_outputs_ready' });

  const ownerSegmentForKeys = resolveDocumentOwnerSegment({
    userId,
    sanitizedName,
  });
  const jobSegmentForKeys = sanitizeJobSegment(jobId);
  const generationDateSegment = new Date().toISOString().slice(0, 10);
  const sessionPrefix = resolveSessionArtifactPrefix({
    originalUploadKey,
    ownerSegment: ownerSegmentForKeys,
    sanitizedName,
    userId,
    sessionSegment: generationRunSegment,
    requestId,
    dateSegment: generationDateSegment,
    jobId,
    jobSegment: jobSegmentForKeys,
  });
  stageMetadataKey = sessionPrefix ? `${sessionPrefix}logs/log.json` : '';
  const coverLetter1Tokens = tokenizeCoverLetterText(coverData.cover_letter1 || '', {
    letterIndex: 1,
  });
  const coverLetter2Tokens = tokenizeCoverLetterText(coverData.cover_letter2 || '', {
    letterIndex: 2,
  });

  const coverLetter1PlaceholderMap = expandEnhancementTokenMap(
    coverLetter1Tokens.placeholders || {}
  );
  const coverLetter2PlaceholderMap = expandEnhancementTokenMap(
    coverLetter2Tokens.placeholders || {}
  );
  const coverLetterPlaceholderMap = {
    ...coverLetter1PlaceholderMap,
    ...coverLetter2PlaceholderMap,
  };

  if (Object.keys(coverLetterPlaceholderMap).length) {
    enhancementTokenMap = {
      ...enhancementTokenMap,
      ...coverLetterPlaceholderMap,
    };
  }

  const coverLetterEnhancementTokenMaps = {
    cover_letter1: coverLetter1PlaceholderMap,
    cover_letter2: coverLetter2PlaceholderMap,
  };

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
  if (expiredDownloadSessionNotice) {
    pushUniqueMessage(generationMessages, expiredDownloadSessionNotice);
  }
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
  const originalPdfTemplateMetadata = {
    templateId: 'original_pdf',
    templateName: 'Original Upload (Plain PDF)',
    templateType: 'resume',
  };
  let originalExtension = '';
  let originalIsPdfLike = false;

  if (normalizedOriginalUploadKey) {
    originalExtension = (path.extname(normalizedOriginalUploadKey) || '').toLowerCase();
    originalIsPdfLike = !originalExtension || originalExtension === '.pdf';
  }

  if (normalizedOriginalUploadKey) {
    if (originalIsPdfLike) {
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
          originalPdfBuffer = minimalPlainPdfBufferGenerator({
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
          await sendS3CommandWithRetry(
            s3,
            () =>
              new PutObjectCommand(
                withEnvironmentTagging({
                  Bucket: bucket,
                  Key: originalPdfKey,
                  Body: originalPdfBuffer,
                  ContentType: 'application/pdf',
                })
              ),
            {
              maxAttempts: 4,
              baseDelayMs: 500,
              maxDelayMs: 5000,
              jitterMs: 300,
              retryLogEvent: 'original_upload_pdf_upload_retry',
              retryLogContext: {
                ...logContext,
                originalUploadKey: normalizedOriginalUploadKey,
                originalUploadExtension: originalExtension,
                storageKey: originalPdfKey,
              },
            }
          );
          registerArtifactKey(originalPdfKey);
          uploadedArtifacts.push({ type: 'original_upload_pdf', key: originalPdfKey });
          downloadArtifacts.unshift({
            type: 'original_upload_pdf',
            key: originalPdfKey,
            templateMetadata: originalPdfTemplateMetadata,
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

  const shouldExposeOriginalSource =
    originalUploadKey &&
    normalizedOriginalUploadKey &&
    (!originalIsPdfLike || !originalHandledViaArtifacts);

  if (shouldExposeOriginalSource) {
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
        text: originalResumeForStorage,
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

    const sharedTemplateOptions = {
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

    const baseTemplateOptions = { ...sharedTemplateOptions };

    if (isCvDocument) {
      baseTemplateOptions.resumeExperience = resumeExperience;
    } else if (isCoverLetter) {
      baseTemplateOptions.skipRequiredSections = true;
      baseTemplateOptions.enhancementTokenMap = {
        ...(sharedTemplateOptions.enhancementTokenMap || {}),
        ...(coverLetterEnhancementTokenMaps[name] || {}),
      };
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

    await sendS3CommandWithRetry(
      s3,
      () =>
        new PutObjectCommand(
          withEnvironmentTagging({
            Bucket: bucket,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
          })
        ),
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        jitterMs: 300,
        retryLogEvent: 'generation_artifact_upload_retry',
        retryLogContext: { ...logContext, artifactType: name, storageKey: key },
      }
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
        dismissedEntries: normalizedDismissedChangeLogEntries,
        summary: changeLogSummary,
        coverLetters: {
          entries: normalizedCoverLetterEntries,
          dismissedEntries: normalizedDismissedCoverLetterEntries,
        },
        sessionLogs: normalizedSessionLogs,
        evaluationLogs: normalizedEvaluationLogs,
        enhancementLogs: normalizedEnhancementLogs,
        downloadLogs: normalizedDownloadLogs,
      },
    },
  ];

  for (const artifact of textArtifacts) {
    const key = `${textArtifactPrefix}${artifact.fileName}`;
    await sendS3CommandWithRetry(
      s3,
      () =>
        new PutObjectCommand(
          withEnvironmentTagging({
            Bucket: bucket,
            Key: key,
            Body: JSON.stringify(artifact.payload, null, 2),
            ContentType: 'application/json',
          })
        ),
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 4000,
        jitterMs: 300,
        retryLogEvent: 'generation_text_artifact_upload_retry',
        retryLogContext: {
          ...logContext,
          artifactType: artifact.type,
          storageKey: key,
        },
      }
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

  try {
    const persistedChangeLog = await writeSessionChangeLog({
      s3,
      bucket,
      key: sessionChangeLogKey,
      jobId,
      originalUploadKey,
      ownerSegment: ownerSegmentForKeys,
      sanitizedName,
      userId: res.locals.userId,
      sessionSegment: generationRunSegment,
      requestId,
      dateSegment: generationDateSegment,
      entries: normalizedChangeLogEntries,
      summary: changeLogSummary,
      dismissedEntries: normalizedDismissedChangeLogEntries,
      coverLetterEntries: normalizedCoverLetterEntries,
      dismissedCoverLetterEntries: normalizedDismissedCoverLetterEntries,
      sessionLogs: normalizedSessionLogs,
      evaluationLogs: normalizedEvaluationLogs,
      enhancementLogs: normalizedEnhancementLogs,
      downloadLogs: normalizedDownloadLogs,
    });
    persistedSessionChangeLogResult = persistedChangeLog;

    if (persistedChangeLog?.key) {
      sessionChangeLogKey = persistedChangeLog.key;
    }
    const changeLogBucket = persistedChangeLog?.bucket || bucket;
    if (persistedChangeLog && logKey) {
      await logEvent({
        s3,
        bucket: changeLogBucket,
        key: logKey,
        jobId,
        event: 'session_change_log_synced',
        metadata: { entries: normalizedChangeLogEntries.length },
      });
    }
  } catch (err) {
    logStructured('warn', 'session_change_log_write_failed', {
      ...logContext,
      bucket,
      key: sessionChangeLogKey,
      error: serializeError(err),
    });
  }

  if (persistedSessionChangeLogResult) {
    const nextSessionChangeLogKey = normalizeArtifactKey(
      persistedSessionChangeLogResult.key || sessionChangeLogKey
    );
    const cleanupBucket =
      normalizeArtifactKey(persistedSessionChangeLogResult.bucket) ||
      previousSessionChangeLogBucket ||
      bucket;

    if (
      cleanupBucket &&
      previousSessionChangeLogKey &&
      nextSessionChangeLogKey &&
      previousSessionChangeLogKey !== nextSessionChangeLogKey
    ) {
      try {
        await sendS3CommandWithRetry(
          s3,
          () =>
            new DeleteObjectCommand({
              Bucket: cleanupBucket,
              Key: previousSessionChangeLogKey,
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 300,
            maxDelayMs: 2500,
            retryLogEvent: 'session_change_log_cleanup_retry',
            retryLogContext: {
              ...logContext,
              bucket: cleanupBucket,
              key: previousSessionChangeLogKey,
              reason: 'replaced',
            },
          }
        );
        logStructured('info', 'session_change_log_removed', {
          ...logContext,
          bucket: cleanupBucket,
          key: previousSessionChangeLogKey,
          reason: 'replaced',
        });
      } catch (cleanupErr) {
        logStructured('warn', 'session_change_log_cleanup_failed', {
          ...logContext,
          bucket: cleanupBucket,
          key: previousSessionChangeLogKey,
          error: serializeError(cleanupErr),
        });
      }
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

  let learningResources = [];
  if (Array.isArray(bestMatch?.newSkills) && bestMatch.newSkills.length) {
    try {
      learningResources = await generateLearningResources(bestMatch.newSkills, {
        jobTitle: versionsContext.jobTitle,
        jobDescription,
        disableGenerative: sanitizedFallbackUsed || !canUseGenerativeModel,
        requestId,
      });
    } catch (err) {
      logStructured('warn', 'generation_learning_resources_failed', {
        error: serializeError(err),
        missingSkillCount: bestMatch.newSkills.length,
      });
    }
  }

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
    learningResources,
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
    assignKey('jobDescriptionDigest', ':jobDescriptionDigest', resolvedJobDescriptionDigest);

    if (sessionChangeLogKey) {
      updateExpressionParts.push('sessionChangeLogKey = :sessionChangeLogKey');
      expressionAttributeValues[':sessionChangeLogKey'] = { S: sessionChangeLogKey };
    }

    updateExpressionParts.push('environment = if_not_exists(environment, :environment)');
    expressionAttributeValues[':environment'] = { S: deploymentEnvironment };

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
      if (staleArtifactCleanupEnabled && staleArtifactKeys.size) {
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
    changeLogSummary,
    sessionLogs: normalizedSessionLogs,
    evaluationLogs: normalizedEvaluationLogs,
    enhancementLogs: normalizedEnhancementLogs,
    downloadLogs: normalizedDownloadLogs,
    coverLetterChangeLog: {
      entries: normalizedCoverLetterEntries,
      dismissedEntries: normalizedDismissedCoverLetterEntries,
    },
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

    const enhancementIntentInput = [
      req.body.enhancementIntent,
      req.body.enhancementMode,
      req.body.enhancementRequest,
      req.body.intent,
      req.body.mode,
    ].find((value) => typeof value === 'string' && value.trim());
    const enhancementIntent = enhancementIntentInput
      ? enhancementIntentInput.trim().toLowerCase()
      : '';
    const wantsNewEnhancement =
      enhancementIntent === 'new' || req.body.newEnhancement === true;
    const jobDescriptionDigest = createTextDigest(jobDescription);

    const linkedinProfileUrlInput = '';
    const linkedinProfileUrl = '';

    const profileIdentifier =
      resolveProfileIdentifier({
        linkedinProfileUrl,
        userId: res.locals.userId,
        jobId: jobIdInput,
      }) || jobIdInput;
    const storedLinkedIn = normalizePersonalData(profileIdentifier);

    const credlyProfileUrl = '';

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
      let sessionChangeLogKey = '';
      let existingChangeLogEntries = [];
      let dismissedChangeLogEntries = [];
      let existingCoverLetterEntries = [];
      let dismissedCoverLetterEntries = [];
      let sessionActivityLogs = [];
      let evaluationActivityLogs = [];
      let enhancementActivityLogs = [];
      let downloadActivityLogs = [];
      let existingRecordItem = {};
      let storedJobDescriptionDigest = '';
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
          storedJobDescriptionDigest = item.jobDescriptionDigest?.S || '';
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
          sessionChangeLogKey = deriveSessionChangeLogKey({
            changeLogKey: item.sessionChangeLogKey?.S,
            originalUploadKey,
          });
          try {
            const sessionState = await loadSessionChangeLog({
              s3,
              bucket: storedBucket || bucket,
              key: sessionChangeLogKey,
              fallbackEntries: parseDynamoChangeLog(item.changeLog),
            });
            existingChangeLogEntries = Array.isArray(sessionState?.entries)
              ? sessionState.entries
              : [];
            dismissedChangeLogEntries = Array.isArray(sessionState?.dismissedEntries)
              ? sessionState.dismissedEntries
              : [];
            existingCoverLetterEntries = Array.isArray(sessionState?.coverLetterEntries)
              ? sessionState.coverLetterEntries
              : [];
            dismissedCoverLetterEntries = Array.isArray(
              sessionState?.dismissedCoverLetterEntries
            )
              ? sessionState.dismissedCoverLetterEntries
              : [];
            sessionActivityLogs = Array.isArray(sessionState?.sessionLogs)
              ? sessionState.sessionLogs
              : [];
            evaluationActivityLogs = Array.isArray(sessionState?.evaluationLogs)
              ? sessionState.evaluationLogs
              : [];
            enhancementActivityLogs = Array.isArray(sessionState?.enhancementLogs)
              ? sessionState.enhancementLogs
              : [];
            downloadActivityLogs = Array.isArray(sessionState?.downloadLogs)
              ? sessionState.downloadLogs
              : [];
          } catch (sessionErr) {
            logStructured('warn', 'generation_change_log_load_failed', {
              ...logContext,
              bucket: storedBucket || bucket,
              key: sessionChangeLogKey,
              error: serializeError(sessionErr),
            });
            existingChangeLogEntries = parseDynamoChangeLog(item.changeLog);
            dismissedChangeLogEntries = [];
            existingCoverLetterEntries = [];
            dismissedCoverLetterEntries = [];
            sessionActivityLogs = [];
            evaluationActivityLogs = [];
            enhancementActivityLogs = [];
            downloadActivityLogs = [];
          }
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

      const jobDescriptionChanged =
        Boolean(storedJobDescriptionDigest && jobDescriptionDigest) &&
        storedJobDescriptionDigest !== jobDescriptionDigest;
      const refreshSessionArtifacts = wantsNewEnhancement && jobDescriptionChanged;

      if (refreshSessionArtifacts) {
        logStructured('info', 'generation_session_artifacts_refreshed', {
          ...logContext,
          reason: 'job_description_changed',
        });
        existingChangeLogEntries = [];
        dismissedChangeLogEntries = [];
        existingCoverLetterEntries = [];
        dismissedCoverLetterEntries = [];
        sessionActivityLogs = [];
        evaluationActivityLogs = [];
        enhancementActivityLogs = [];
        downloadActivityLogs = [];
      }

      const jobKeySegment = sanitizeJobSegment(jobId);
      const ownerSegment = resolveDocumentOwnerSegment({
        userId: res.locals.userId,
        sanitizedName,
      });
      const sessionPrefix = resolveSessionArtifactPrefix({
        originalUploadKey,
        ownerSegment,
        sanitizedName,
        userId: res.locals.userId,
        sessionSegment: generationSessionSegment,
        requestId,
        dateSegment: date,
        jobId,
        jobSegment: jobKeySegment,
      });
      const logKey = `${sessionPrefix}logs/processing.jsonl`;

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
        jobDescriptionDigest,
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
        changeLogEntries: existingChangeLogEntries,
        dismissedChangeLogEntries,
        coverLetterChangeLogEntries: existingCoverLetterEntries,
        dismissedCoverLetterChangeLogEntries: dismissedCoverLetterEntries,
        existingRecord: existingRecordItem,
        userId: res.locals.userId,
        refreshSessionArtifacts,
        sessionLogs: sessionActivityLogs,
        evaluationLogs: evaluationActivityLogs,
        enhancementLogs: enhancementActivityLogs,
        downloadLogs: downloadActivityLogs,
      });

      if (!responseBody) {
        return;
      }

      return res.json(responseBody);
    } catch (err) {
      const pdfError = extractPdfGenerationError(err);
      let pdfMessage = '';
      let pdfDetails;
      let pdfErrorCode = 'PDF_GENERATION_FAILED';
      if (pdfError) {
        pdfMessage =
          (typeof pdfError.summary === 'string' && pdfError.summary.trim()) ||
          (typeof pdfError.message === 'string' && pdfError.message.trim()) ||
          CV_GENERATION_ERROR_MESSAGE;
        pdfErrorCode = pdfError.code || 'PDF_GENERATION_FAILED';
        pdfDetails =
          buildPdfGenerationErrorDetails(pdfError, { source: 'lambda' }) || {};
        if (pdfMessage && !pdfDetails.summary) {
          pdfDetails.summary = pdfMessage;
        }
      }

      logStructured('error', 'generation_failed', {
        ...logContext,
        error: serializeError(err),
        ...(pdfError
          ? {
              pdfGeneration: {
                code: pdfErrorCode,
                summary: pdfMessage,
                details: pdfDetails,
              },
            }
          : {}),
      });
      if (pdfError) {
        const responseDetails = pdfDetails && typeof pdfDetails === 'object'
          ? {
              ...pdfDetails,
              ...(Array.isArray(pdfDetails.messages)
                ? { messages: [...pdfDetails.messages] }
                : {}),
              ...(Array.isArray(pdfDetails.templates)
                ? { templates: [...pdfDetails.templates] }
                : {}),
            }
          : pdfDetails;
        return sendError(
          res,
          500,
          pdfErrorCode,
          pdfMessage || CV_GENERATION_ERROR_MESSAGE,
          responseDetails
        );
      }
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

app.post('/api/render-cover-letter', assignJobContext, async (req, res) => {
  captureUserContext(req, res);
  const jobId = res.locals.jobId;
  const requestId = res.locals.requestId;
  const logContext = { requestId, jobId, route: 'render-cover-letter' };

  const rawText = typeof req.body.text === 'string' ? req.body.text : '';
  const text = rawText.replace(/\r\n/g, '\n');
  if (!text.trim()) {
    return sendError(
      res,
      400,
      'COVER_LETTER_TEXT_REQUIRED',
      'text is required to render a cover letter PDF.',
      { field: 'text' }
    );
  }

  let generativeModel = null;
  const shouldAttemptGenerative =
    process.env.ENABLE_COVER_LETTER_GENERATIVE !== 'false' &&
    (!isTestEnvironment || process.env.ENABLE_TEST_GENERATIVE === 'true');
  if (shouldAttemptGenerative) {
    try {
      const model = await getSharedGenerativeModel();
      if (model?.generateContent) {
        generativeModel = model;
      }
    } catch (err) {
      logStructured('warn', 'cover_letter_generative_model_unavailable', {
        ...logContext,
        error: serializeError(err),
      });
    }
  }

  const requestedTemplateCandidates = [
    req.body.templateId,
    req.body.template,
    req.body.coverTemplate,
    req.body.coverTemplateId,
    req.body.template1,
    req.body.template2,
    ...(Array.isArray(req.body.coverTemplates) ? req.body.coverTemplates : []),
    ...(Array.isArray(req.body.templates) ? req.body.templates : [])
  ].filter((value) => typeof value === 'string' && value.trim());

  const canonicalRequestedTemplate = canonicalizeCoverTemplateId(
    requestedTemplateCandidates[0] || '',
    CL_TEMPLATES[0]
  );

  const templateCandidates = uniqueValidCoverTemplates([
    canonicalRequestedTemplate,
    ...requestedTemplateCandidates,
    ...CL_TEMPLATES
  ]);
  if (!templateCandidates.length) {
    templateCandidates.push(CL_TEMPLATES[0]);
  }

  const variantRaw =
    typeof req.body.variant === 'string' ? req.body.variant.trim() : '';
  const parsedLetterIndex = Number.parseInt(req.body.letterIndex, 10);
  const letterIndex = Number.isFinite(parsedLetterIndex) && parsedLetterIndex > 0
    ? parsedLetterIndex
    : variantRaw === 'cover_letter2'
      ? 2
      : 1;

  const applicantNameInput =
    typeof req.body.applicantName === 'string' ? req.body.applicantName : '';
  const jobTitleInput =
    typeof req.body.jobTitle === 'string' ? req.body.jobTitle : '';
  const jobDescriptionInput =
    typeof req.body.jobDescription === 'string' ? req.body.jobDescription : '';
  const jobSkillsInput = Array.isArray(req.body.jobSkills)
    ? req.body.jobSkills.filter((skill) => typeof skill === 'string')
    : [];

  const coverLetterFieldsInput =
    req.body.coverLetterFields && typeof req.body.coverLetterFields === 'object'
      ? req.body.coverLetterFields
      : null;
  const contactDetailsInput =
    req.body.contactDetails && typeof req.body.contactDetails === 'object'
      ? req.body.contactDetails
      : {};

  let coverLetterFields = coverLetterFieldsInput;
  if (!coverLetterFields) {
    coverLetterFields = mapCoverLetterFields({
      text,
      contactDetails: contactDetailsInput,
      jobTitle: jobTitleInput,
      jobDescription: jobDescriptionInput,
      jobSkills: jobSkillsInput,
      applicantName: applicantNameInput,
      letterIndex
    });
  }

  const contactLines = filterSensitiveContactLines(
    Array.isArray(coverLetterFields?.contact?.lines)
      ? coverLetterFields.contact.lines.filter((line) => typeof line === 'string')
      : [],
  );
  const contactDetails = {
    contactLines,
    email:
      typeof coverLetterFields?.contact?.email === 'string'
        ? coverLetterFields.contact.email
        : '',
    phone:
      typeof coverLetterFields?.contact?.phone === 'string'
        ? coverLetterFields.contact.phone
        : '',
    linkedin: '',
    cityState:
      typeof coverLetterFields?.contact?.location === 'string'
        ? coverLetterFields.contact.location
        : ''
  };

  const applicantName =
    (typeof applicantNameInput === 'string' && applicantNameInput.trim()) ||
    (typeof coverLetterFields?.closing?.signature === 'string'
      ? coverLetterFields.closing.signature.trim()
      : '') ||
    extractName(text) ||
    'Candidate';
  const jobTitle =
    (typeof jobTitleInput === 'string' && jobTitleInput.trim()) ||
    (typeof coverLetterFields?.job?.title === 'string'
      ? coverLetterFields.job.title.trim()
      : '');
  const jobSkills = jobSkillsInput.length
    ? jobSkillsInput
    : Array.isArray(coverLetterFields?.job?.skills)
      ? coverLetterFields.job.skills.filter((skill) => typeof skill === 'string')
      : [];

  const enhancementTokenMap =
    req.body.enhancementTokenMap && typeof req.body.enhancementTokenMap === 'object'
      ? req.body.enhancementTokenMap
      : {};

  const baseTemplateOptions = {
    jobSkills,
    linkedinExperience: [],
    resumeEducation: [],
    linkedinEducation: [],
    resumeCertifications: [],
    linkedinCertifications: [],
    credlyCertifications: [],
    credlyProfileUrl: '',
    jobTitle,
    contactLines,
    contactDetails,
    email: contactDetails.email,
    phone: contactDetails.phone,
    cityState: contactDetails.cityState,
    templateParams: {},
    skipRequiredSections: true,
    enhancementTokenMap
  };

  try {
    const { buffer, template: resolvedTemplate } = await generatePdfWithFallback({
      documentType: 'cover_letter',
      templates: templateCandidates,
      inputText: text,
      generativeModel,
      allowPlainFallback: true,
      logContext: {
        ...logContext,
        documentType: 'cover_letter',
        requestedTemplate: canonicalRequestedTemplate,
        outputName: variantRaw || `cover_letter${letterIndex}`
      },
      buildOptionsForTemplate: () => ({
        ...baseTemplateOptions,
        templateParams: {
          ...(baseTemplateOptions.templateParams || {}),
          contact: {
            email: contactDetails.email,
            phone: contactDetails.phone,
            location: contactDetails.cityState,
            lines: contactLines
          },
          name: applicantName,
          jobTitle
        }
      })
    });

    const templateDisplayName = formatCoverTemplateDisplayName(resolvedTemplate);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileBaseName = buildDocumentFileBaseName({
      type: 'cover_letter',
      templateId: resolvedTemplate,
      variant: variantRaw || `cover-letter${letterIndex}`
    });
    const downloadName = `${fileBaseName || 'cover_letter'}-${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"`
    );
    res.setHeader('X-Template-Id', resolvedTemplate);
    res.setHeader('X-Template-Name', templateDisplayName);

    logStructured('info', 'cover_letter_pdf_rendered', {
      ...logContext,
      template: resolvedTemplate,
      requestedTemplate: canonicalRequestedTemplate,
      templateCandidates
    });

    return res.status(200).send(buffer);
  } catch (err) {
    const pdfError = extractPdfGenerationError(err);
    let pdfMessage = '';
    let pdfDetails;
    let pdfErrorCode = 'COVER_LETTER_GENERATION_FAILED';
    if (pdfError) {
      pdfMessage =
        (typeof pdfError.summary === 'string' && pdfError.summary.trim()) ||
        (typeof pdfError.message === 'string' && pdfError.message.trim()) ||
        'Unable to generate the cover letter PDF.';
      pdfErrorCode = pdfError.code || 'COVER_LETTER_GENERATION_FAILED';
      pdfDetails =
        buildPdfGenerationErrorDetails(pdfError, { source: 'lambda' }) || {};
      if (!pdfDetails.summary && pdfMessage) {
        pdfDetails.summary = pdfMessage;
      }
      if (!pdfDetails.documentType) {
        pdfDetails.documentType = 'cover_letter';
      }
      if (Array.isArray(templateCandidates) && templateCandidates.length) {
        if (!Array.isArray(pdfDetails.templates) || !pdfDetails.templates.length) {
          pdfDetails.templates = templateCandidates;
        }
      }
    }
    logStructured('error', 'cover_letter_pdf_render_failed', {
      ...logContext,
      templateCandidates,
      error: serializeError(err),
      ...(pdfError
        ? {
            pdfGeneration: {
              code: pdfErrorCode,
              summary: pdfMessage,
              details: pdfDetails,
            },
          }
        : {}),
    });
    if (pdfError) {
      const responseDetails = pdfDetails && typeof pdfDetails === 'object'
        ? {
            ...pdfDetails,
            ...(Array.isArray(pdfDetails.messages)
              ? { messages: [...pdfDetails.messages] }
              : {}),
            ...(Array.isArray(pdfDetails.templates)
              ? { templates: [...pdfDetails.templates] }
              : {}),
          }
        : pdfDetails;
      return sendError(
        res,
        500,
        pdfErrorCode,
        pdfMessage || 'Unable to generate the cover letter PDF.',
        responseDetails
      );
    }
    return sendError(
      res,
      500,
      'DOCUMENT_GENERATION_FAILED',
      'Unable to generate the cover letter PDF.',
      { source: 'lambda' }
    );
  }
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
      linkedinProfileUrl: '',
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
  let previousSessionChangeLogKey = '';
  let previousSessionChangeLogBucket = '';
  let logKey = '';
  let existingChangeLogEntries = [];
  let existingDismissedChangeLogEntries = [];
  let existingCoverLetterEntries = [];
  let existingDismissedCoverLetterEntries = [];
  let sessionActivityLogs = [];
  let evaluationActivityLogs = [];
  let enhancementActivityLogs = [];
  let downloadActivityLogs = [];
  let existingSessionId = '';
  let existingCandidateName = '';
  let storedUserId = '';
  let existingUploadedAt = '';

  const resolveActivityLogsInput = (primaryKey, alternativeKeys = []) => {
    const keys = [primaryKey, ...alternativeKeys];
    const sources = [req.body, req.body?.logs, req.body?.activityLogs];
    for (const source of sources) {
      if (!source || typeof source !== 'object') {
        continue;
      }
      for (const key of keys) {
        if (!(key in source)) {
          continue;
        }
        const value = source[key];
        const extracted = extractActivityLogArray(value);
        if (extracted !== null) {
          return extracted;
        }
      }
    }
    return null;
  };

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
    existingSessionId =
      typeof item.requestId?.S === 'string' ? item.requestId.S.trim() : '';
    existingCandidateName =
      typeof item.candidateName?.S === 'string' ? item.candidateName.S.trim() : '';
    storedUserId =
      typeof item.userId?.S === 'string' ? item.userId.S.trim() : '';
    existingUploadedAt =
      typeof item.uploadedAt?.S === 'string' ? item.uploadedAt.S.trim() : '';
    storedBucket = item.s3Bucket?.S || '';
    originalUploadKey = item.s3Key?.S || '';
    sessionChangeLogKey = deriveSessionChangeLogKey({
      changeLogKey: item.sessionChangeLogKey?.S,
      originalUploadKey,
    });
    previousSessionChangeLogKey = sessionChangeLogKey;
    previousSessionChangeLogBucket = storedBucket;
    if (originalUploadKey) {
      const existingSessionPrefix = extractSessionScopedPrefixFromKey(originalUploadKey);
      if (existingSessionPrefix) {
        logKey = `${existingSessionPrefix}logs/processing.jsonl`;
      }
    }
    try {
      const sessionChangeLogState = await loadSessionChangeLog({
        s3,
        bucket: storedBucket,
        key: sessionChangeLogKey,
        fallbackEntries: parseDynamoChangeLog(item.changeLog),
      });
      existingChangeLogEntries = Array.isArray(sessionChangeLogState?.entries)
        ? sessionChangeLogState.entries
        : [];
      existingDismissedChangeLogEntries = Array.isArray(
        sessionChangeLogState?.dismissedEntries
      )
        ? sessionChangeLogState.dismissedEntries
        : [];
      existingCoverLetterEntries = Array.isArray(
        sessionChangeLogState?.coverLetterEntries
      )
        ? sessionChangeLogState.coverLetterEntries
        : [];
      existingDismissedCoverLetterEntries = Array.isArray(
        sessionChangeLogState?.dismissedCoverLetterEntries
      )
        ? sessionChangeLogState.dismissedCoverLetterEntries
        : [];
      sessionActivityLogs = Array.isArray(sessionChangeLogState?.sessionLogs)
        ? sessionChangeLogState.sessionLogs
        : [];
      evaluationActivityLogs = Array.isArray(sessionChangeLogState?.evaluationLogs)
        ? sessionChangeLogState.evaluationLogs
        : [];
      enhancementActivityLogs = Array.isArray(sessionChangeLogState?.enhancementLogs)
        ? sessionChangeLogState.enhancementLogs
        : [];
      downloadActivityLogs = Array.isArray(sessionChangeLogState?.downloadLogs)
        ? sessionChangeLogState.downloadLogs
        : [];
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
  const requestSessionIdentifier =
    typeof req.body.sessionId === 'string' ? req.body.sessionId.trim() : '';
  let updatedChangeLog = [...existingChangeLogEntries];
  let dismissedChangeLogEntries = [...existingDismissedChangeLogEntries];
  let coverLetterEntries = [...existingCoverLetterEntries];
  let dismissedCoverLetterEntries = [...existingDismissedCoverLetterEntries];

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
    updatedChangeLog = existingChangeLogEntries.filter((entry) => entry.id !== entryId);
    const removedEntry = existingChangeLogEntries.find((entry) => entry.id === entryId);
    let normalizedRemovedEntry = normalizeChangeLogEntryInput(removedEntry);
    if (!normalizedRemovedEntry && entryId) {
      normalizedRemovedEntry = normalizeChangeLogEntryInput({ id: entryId });
    }
    if (normalizedRemovedEntry) {
      const rejectionTimestamp = nowIso;
      dismissedChangeLogEntries = [
        {
          ...normalizedRemovedEntry,
          rejected: true,
          rejectedAt: rejectionTimestamp,
          rejectionReason:
            normalizedRemovedEntry.rejectionReason || 'user_rejected_change',
        },
        ...dismissedChangeLogEntries.filter((entry) => entry.id !== normalizedRemovedEntry.id),
      ];
    }
    if (isCoverLetterEntryIdentifier(entryId)) {
      const existingCoverEntry = existingCoverLetterEntries.find(
        (entry) => entry.id === entryId
      );
      const normalizedCoverRemoved = normalizeCoverLetterChangeLogEntry({
        ...(existingCoverEntry || {}),
        id: entryId,
      });
      coverLetterEntries = coverLetterEntries.filter((entry) => entry.id !== entryId);
      if (normalizedCoverRemoved) {
        dismissedCoverLetterEntries = [
          {
            ...normalizedCoverRemoved,
            rejected: true,
            rejectedAt: normalizedCoverRemoved.rejectedAt || nowIso,
            rejectionReason:
              normalizedCoverRemoved.rejectionReason || 'user_rejected_change',
          },
          ...dismissedCoverLetterEntries.filter(
            (entry) => entry.id !== normalizedCoverRemoved.id
          ),
        ];
      }
    }
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
    const existingIndex = existingChangeLogEntries.findIndex(
      (entry) => entry.id === normalizedEntry.id
    );
    const baseEntry = existingIndex >= 0 ? existingChangeLogEntries[existingIndex] : null;
    const mergedEntry = {
      ...baseEntry,
      ...normalizedEntry,
    };
    if (!mergedEntry.acceptedAt) {
      mergedEntry.acceptedAt = baseEntry?.acceptedAt || nowIso;
    }
    if (existingIndex >= 0) {
      updatedChangeLog = existingChangeLogEntries.map((entry) =>
        entry.id === mergedEntry.id ? mergedEntry : entry
      );
    } else {
      updatedChangeLog = [mergedEntry, ...existingChangeLogEntries];
    }
    dismissedChangeLogEntries = dismissedChangeLogEntries.filter(
      (entry) => entry.id !== mergedEntry.id
    );
    if (
      isCoverLetterEntryIdentifier(mergedEntry.id) ||
      isCoverLetterEntryIdentifier(normalizedEntry.type)
    ) {
      const coverEntrySource = {
        ...req.body.entry,
        id: mergedEntry.id,
        variant: normalizedEntry.type || req.body.entry?.variant,
        originalText:
          req.body.entry?.coverLetterOriginalText ||
          req.body.entry?.before ||
          normalizedEntry.before,
        editedText:
          req.body.entry?.coverLetterEditedText ||
          req.body.entry?.coverLetterDraft ||
          req.body.entry?.after ||
          normalizedEntry.after,
        acceptedAt: mergedEntry.acceptedAt,
        updatedAt: req.body.entry?.updatedAt || mergedEntry.acceptedAt || nowIso,
        rejected: mergedEntry.rejected,
        rejectedAt: mergedEntry.rejectedAt,
        rejectionReason: mergedEntry.rejectionReason,
      };
      const normalizedCoverEntry = normalizeCoverLetterChangeLogEntry(coverEntrySource);
      if (normalizedCoverEntry) {
        if (mergedEntry.rejected) {
          coverLetterEntries = coverLetterEntries.filter(
            (entry) => entry.id !== normalizedCoverEntry.id
          );
          dismissedCoverLetterEntries = [
            {
              ...normalizedCoverEntry,
              rejected: true,
              rejectedAt: normalizedCoverEntry.rejectedAt || nowIso,
              rejectionReason:
                normalizedCoverEntry.rejectionReason || 'user_rejected_change',
            },
            ...dismissedCoverLetterEntries.filter(
              (entry) => entry.id !== normalizedCoverEntry.id
            ),
          ];
        } else {
          const coverIndex = coverLetterEntries.findIndex(
            (entry) => entry.id === normalizedCoverEntry.id
          );
          if (coverIndex >= 0) {
            coverLetterEntries[coverIndex] = {
              ...coverLetterEntries[coverIndex],
              ...normalizedCoverEntry,
              rejected: false,
              rejectedAt: undefined,
              rejectionReason: undefined,
            };
          } else {
            coverLetterEntries = [normalizedCoverEntry, ...coverLetterEntries];
          }
          dismissedCoverLetterEntries = dismissedCoverLetterEntries.filter(
            (entry) => entry.id !== normalizedCoverEntry.id
          );
        }
      }
    }
  }

  const coverLettersPayload = (() => {
    if (req.body && typeof req.body.coverLetters === 'object') {
      return req.body.coverLetters;
    }
    if (req.body && typeof req.body.coverLetterChangeLog === 'object') {
      return req.body.coverLetterChangeLog;
    }
    return null;
  })();

  const coverLetterEntriesInput = Array.isArray(coverLettersPayload?.entries)
    ? coverLettersPayload.entries
    : Array.isArray(req.body.coverLetterEntries)
    ? req.body.coverLetterEntries
    : null;
  if (coverLetterEntriesInput) {
    coverLetterEntries = coverLetterEntriesInput
      .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
      .filter(Boolean);
  }

  const coverLetterDismissedInput = Array.isArray(
    coverLettersPayload?.dismissedEntries
  )
    ? coverLettersPayload.dismissedEntries
    : Array.isArray(req.body.dismissedCoverLetterEntries)
    ? req.body.dismissedCoverLetterEntries
    : Array.isArray(req.body.dismissedCoverLetters)
    ? req.body.dismissedCoverLetters
    : null;
  if (coverLetterDismissedInput) {
    dismissedCoverLetterEntries = coverLetterDismissedInput
      .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
      .filter(Boolean)
      .map((entry) => ({
        ...entry,
        rejected: true,
        rejectedAt: entry.rejectedAt || nowIso,
        rejectionReason: entry.rejectionReason || 'user_rejected_change',
      }));
    coverLetterEntries = coverLetterEntries.filter((entry) =>
      dismissedCoverLetterEntries.every((removed) => removed.id !== entry.id)
    );
  }

  const sessionLogsInput = resolveActivityLogsInput('sessionLogs', [
    'sessionLog',
    'sessionHistory',
    'session',
  ]);
  if (sessionLogsInput !== null) {
    sessionActivityLogs = normalizeChangeLogActivityArray(sessionLogsInput);
  }

  const evaluationLogsInput = resolveActivityLogsInput('evaluationLogs', [
    'evaluationHistory',
    'evaluation',
  ]);
  if (evaluationLogsInput !== null) {
    evaluationActivityLogs = normalizeChangeLogActivityArray(evaluationLogsInput);
  }

  const enhancementLogsInput = resolveActivityLogsInput('enhancementLogs', [
    'enhancementHistory',
    'enhancements',
    'enhancement',
  ]);
  if (enhancementLogsInput !== null) {
    enhancementActivityLogs = normalizeChangeLogActivityArray(enhancementLogsInput);
  }

  const downloadLogsInput = resolveActivityLogsInput('downloadLogs', [
    'downloadHistory',
    'downloads',
    'download',
  ]);
  if (downloadLogsInput !== null) {
    downloadActivityLogs = normalizeChangeLogActivityArray(downloadLogsInput);
  }

  const normalizedChangeLogEntries = updatedChangeLog
    .map((entry) => normalizeChangeLogEntryInput(entry))
    .filter(Boolean);
  const normalizedDismissedEntries = dismissedChangeLogEntries
    .map((entry) => normalizeChangeLogEntryInput(entry))
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      rejected: true,
      rejectedAt: entry.rejectedAt || nowIso,
      rejectionReason: entry.rejectionReason || 'user_rejected_change',
    }));
  const normalizedCoverLetterEntriesForResponse = coverLetterEntries
    .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
    .filter(Boolean);
  const normalizedDismissedCoverLettersForResponse = dismissedCoverLetterEntries
    .map((entry) => normalizeCoverLetterChangeLogEntry(entry))
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      rejected: true,
      rejectedAt: entry.rejectedAt || nowIso,
      rejectionReason: entry.rejectionReason || 'user_rejected_change',
    }));
  const normalizedSessionLogs = normalizeChangeLogActivityArray(sessionActivityLogs);
  const normalizedEvaluationLogs = normalizeChangeLogActivityArray(
    evaluationActivityLogs
  );
  const normalizedEnhancementLogs = normalizeChangeLogActivityArray(
    enhancementActivityLogs
  );
  const normalizedDownloadLogs = normalizeChangeLogActivityArray(downloadActivityLogs);
  const aggregatedChangeLogSummary = buildAggregatedChangeLogSummary(
    normalizedChangeLogEntries
  );
  const changeLogSummary = normalizeChangeLogSummaryPayload(aggregatedChangeLogSummary);

  const resolvedSessionOwnerSegment = resolveDocumentOwnerSegment({
    userId: res.locals.userId || storedUserId,
    sanitizedName: existingCandidateName,
  });
  const resolvedSessionSegment = requestSessionIdentifier || existingSessionId;
  const resolvedDateSegment = existingUploadedAt ? existingUploadedAt.slice(0, 10) : '';

  if (!sessionChangeLogKey) {
    sessionChangeLogKey = deriveSessionChangeLogKey({ originalUploadKey });
  }

  const resolvedSessionLocation = resolveSessionChangeLogLocation({
    bucket: storedBucket,
    key: sessionChangeLogKey,
    jobId,
    originalUploadKey,
    ownerSegment: resolvedSessionOwnerSegment,
    sanitizedName: existingCandidateName,
    userId: res.locals.userId || storedUserId,
    sessionSegment: resolvedSessionSegment,
    requestId,
    dateSegment: resolvedDateSegment,
  });
  storedBucket = resolvedSessionLocation.bucket;
  sessionChangeLogKey = resolvedSessionLocation.key;

  if (!logKey) {
    const sessionLogPrefix = extractSessionScopedPrefixFromKey(sessionChangeLogKey);
    if (sessionLogPrefix) {
      logKey = `${sessionLogPrefix}logs/processing.jsonl`;
    }
  }

  let persistedSessionChangeLog = null;

  try {
    const persistedChangeLog = await writeSessionChangeLog({
      s3,
      bucket: storedBucket,
      key: sessionChangeLogKey,
      jobId,
      originalUploadKey,
      ownerSegment: resolvedSessionOwnerSegment,
      sanitizedName: existingCandidateName,
      userId: res.locals.userId || storedUserId,
      sessionSegment: resolvedSessionSegment,
      requestId,
      dateSegment: resolvedDateSegment,
      entries: normalizedChangeLogEntries,
      summary: changeLogSummary,
      dismissedEntries: normalizedDismissedEntries,
      coverLetterEntries: normalizedCoverLetterEntriesForResponse,
      dismissedCoverLetterEntries: normalizedDismissedCoverLettersForResponse,
      sessionLogs: normalizedSessionLogs,
      evaluationLogs: normalizedEvaluationLogs,
      enhancementLogs: normalizedEnhancementLogs,
      downloadLogs: normalizedDownloadLogs,
    });
    persistedSessionChangeLog = persistedChangeLog;

    if (persistedChangeLog?.bucket) {
      storedBucket = persistedChangeLog.bucket;
    }
    if (persistedChangeLog?.key) {
      sessionChangeLogKey = persistedChangeLog.key;
    }
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

  if (
    persistedSessionChangeLog &&
    previousSessionChangeLogKey &&
    previousSessionChangeLogKey !== sessionChangeLogKey
  ) {
    const cleanupBucket =
      previousSessionChangeLogBucket || persistedSessionChangeLog.bucket || storedBucket;
    const normalizedCleanupBucket =
      typeof cleanupBucket === 'string' ? cleanupBucket.trim() : '';
    if (normalizedCleanupBucket) {
      try {
        await sendS3CommandWithRetry(
          s3,
          () =>
            new DeleteObjectCommand({
              Bucket: normalizedCleanupBucket,
              Key: previousSessionChangeLogKey,
            }),
          {
            maxAttempts: 3,
            baseDelayMs: 300,
            maxDelayMs: 2500,
            retryLogEvent: 'session_change_log_cleanup_retry',
            retryLogContext: {
              ...logContext,
              bucket: normalizedCleanupBucket,
              key: previousSessionChangeLogKey,
              reason: 'relocated',
            },
          }
        );
        logStructured('info', 'session_change_log_removed', {
          ...logContext,
          bucket: normalizedCleanupBucket,
          key: previousSessionChangeLogKey,
          reason: 'relocated',
        });
      } catch (cleanupErr) {
        logStructured('warn', 'session_change_log_cleanup_failed', {
          ...logContext,
          bucket: normalizedCleanupBucket,
          key: previousSessionChangeLogKey,
          error: serializeError(cleanupErr),
        });
      }
    }
  }

  const expressionAttributeValues = {
    ':jobId': { S: jobId },
    ':updatedAt': { S: nowIso },
  };
  const setExpressions = [
    'changeLogUpdatedAt = :updatedAt',
    'environment = if_not_exists(environment, :environment)',
  ];
  const removeExpressions = ['changeLog'];

  if (sessionChangeLogKey) {
    expressionAttributeValues[':sessionChangeLogKey'] = { S: sessionChangeLogKey };
    setExpressions.push('sessionChangeLogKey = :sessionChangeLogKey');
  }

  expressionAttributeValues[':environment'] = { S: deploymentEnvironment };

  let updateExpression = `SET ${setExpressions.join(', ')}`;
  if (removeExpressions.length) {
    updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
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

  return res.json({
    success: true,
    changeLog: normalizedChangeLogEntries,
    changeLogSummary,
    sessionLogs: normalizedSessionLogs,
    evaluationLogs: normalizedEvaluationLogs,
    enhancementLogs: normalizedEnhancementLogs,
    downloadLogs: normalizedDownloadLogs,
    coverLetters: {
      entries: normalizedCoverLetterEntriesForResponse,
      dismissedEntries: normalizedDismissedCoverLettersForResponse,
    },
  });
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
      linkedinProfileUrl: '',
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

    let item = record.Item || {};
    if (!item.jobId || item.jobId.S !== jobId) {
      return sendError(
        res,
        404,
        'JOB_CONTEXT_NOT_FOUND',
        'The upload context could not be located to refresh the download link.'
      );
    }

    storedBucket = normalizeDynamoStringAttribute(item.s3Bucket) || '';
    originalUploadKey = normalizeDynamoStringAttribute(item.s3Key) || '';

    try {
      const expiryResult = await handleExpiredDownloadSession({
        record: item,
        dynamo,
        tableName,
        storedLinkedIn,
        jobId,
        s3,
        bucket: storedBucket,
        logContext: { ...logContext, route: 'refresh-download-link' },
        logKey,
      });
      item = expiryResult.record;
      if (expiryResult.expired) {
        logStructured('info', 'refresh_download_session_expired', {
          ...logContext,
          bucket: storedBucket,
          clearedKeys: expiryResult.clearedKeys,
        });
        return sendError(
          res,
          410,
          'DOWNLOAD_SESSION_EXPIRED',
          DOWNLOAD_SESSION_EXPIRED_MESSAGE
        );
      }
    } catch (expiryErr) {
      logStructured('warn', 'refresh_download_session_check_failed', {
        ...logContext,
        error: serializeError(expiryErr),
      });
    }

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
      const existingSessionPrefix = extractSessionScopedPrefixFromKey(originalUploadKey);
      if (existingSessionPrefix) {
        logKey = `${existingSessionPrefix}logs/processing.jsonl`;
      }
    }
    if (!logKey) {
      const sessionPrefix = extractSessionScopedPrefixFromKey(sessionChangeLogKey);
      if (sessionPrefix) {
        logKey = `${sessionPrefix}logs/processing.jsonl`;
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
  async (req, res, next) => {
    const jobId = req.jobId || createIdentifier();
    res.locals.jobId = jobId;
    captureUserContext(req, res);
    const requestId = res.locals.requestId;
    const userId = res.locals.userId;
    const logContext = userId
      ? { requestId, jobId, userId }
      : { requestId, jobId };

    let secrets;
    let bucket;
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
      sendError(
        res,
        500,
        'CONFIGURATION_ERROR',
        describeConfigurationError(err),
        missing.length ? { missing } : undefined
      );
      return;
    }

    if (!bucket) {
      logStructured('error', 'upload_bucket_missing', logContext);
      sendError(res, 500, 'STORAGE_UNAVAILABLE', S3_STORAGE_ERROR_MESSAGE);
      return;
    }

    const sessionSegment =
      sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
      sanitizeS3KeyComponent(`session-${createIdentifier()}`);
    const ownerSegment =
      sanitizeS3KeyComponent(res.locals.userId, { fallback: 'candidate' }) ||
      'candidate';
    const sessionPrefix = `cv/${ownerSegment}/${sessionSegment}/`;
    const dateSegment = new Date().toISOString().slice(0, 10);
    const incomingPrefix = `${jobId}/incoming/${dateSegment}/`;

    req.resumeUploadContext = {
      bucket,
      key: `${incomingPrefix}original.pdf`,
      contentType: 'application/octet-stream',
      sessionPrefix: incomingPrefix,
      incomingPrefix,
      finalSessionPrefix: sessionPrefix,
      ownerSegment,
      sessionSegment,
      dateSegment,
    };

    res.locals.initialSessionPrefix = incomingPrefix;
    res.locals.sessionPrefix = sessionPrefix;
    res.locals.sessionSegment = sessionSegment;
    res.locals.uploadBucket = bucket;
    res.locals.uploadLogContext = logContext;
    res.locals.secrets = secrets;
    res.locals.uploadDateSegment = dateSegment;

    uploadResume(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      const storageError = Boolean(
        err && (err.isUploadStorageError || err.code === 'UPLOAD_STORAGE_FAILED')
      );

      logStructured('warn', 'resume_upload_failed', {
        requestId: res.locals.requestId,
        jobId: res.locals.jobId,
        storageError,
        error: serializeError(err),
      });

      const respond = (status, code, message, details) => {
        sendError(res, status, code, message, details);
      };

      if (!storageError) {
        respond(
          400,
          'UPLOAD_VALIDATION_FAILED',
          err.message || 'Upload validation failed.',
          {
            field: 'resume',
            originalName: req.file?.originalname,
          }
        );
        return;
      }

      const bucketName = bucket;
      const sessionPrefixForLogs =
        req.resumeUploadContext?.sessionPrefix || incomingPrefix;
      const failureLogKey = `${sessionPrefixForLogs}logs/processing.jsonl`;
      const reason = err.message || 'initial S3 upload failed';

      (async () => {
        try {
          await logEvent({
            s3: s3Client,
            bucket: bucketName,
            key: failureLogKey,
            jobId,
            event: 'initial_upload_failed',
            level: 'error',
            message: `Failed to upload to bucket ${bucketName}: ${reason}`,
          });
        } catch (logErr) {
          logStructured('error', 's3_log_failure', {
            ...logContext,
            error: serializeError(logErr),
          });
        }

        respond(
          500,
          'INITIAL_UPLOAD_FAILED',
          S3_STORAGE_ERROR_MESSAGE,
          { bucket: bucketName, reason }
        );
      })();
    });
  },
  async (req, res) => {
  const jobId = res.locals.jobId || req.jobId || createIdentifier();
  const requestId = res.locals.requestId;
  const userId = res.locals.userId;
  const logContext =
    res.locals.uploadLogContext ||
    (userId ? { requestId, jobId, userId } : { requestId, jobId });
  const activeServiceKey =
    typeof res.locals.activeService === 'string' ? res.locals.activeService : '';
  const isUploadMicroservice = activeServiceKey === 'resumeUpload';
  const sessionSegment =
    res.locals.sessionSegment ||
    sanitizeS3KeyComponent(requestId, { fallback: '' }) ||
      sanitizeS3KeyComponent(`session-${createIdentifier()}`);
  const date =
    res.locals.uploadDateSegment ||
    req.resumeUploadContext?.dateSegment ||
    new Date().toISOString().slice(0, 10);
  const s3 = s3Client;
  const bucket = res.locals.uploadBucket;
  const secrets = res.locals.secrets || {};
  if (!bucket) {
    logStructured('error', 'upload_bucket_missing', logContext);
    return sendError(res, 500, 'STORAGE_UNAVAILABLE', S3_STORAGE_ERROR_MESSAGE);
  }

  const dynamo = new DynamoDBClient({ region });
  const tableName = process.env.RESUME_TABLE_NAME || 'ResumeForge';
  const tablePollInterval = Math.max(
    1,
    Math.min(DYNAMO_TABLE_POLL_INTERVAL_MS, DYNAMO_TABLE_MAX_WAIT_MS)
  );
  let tableEnsured = false;
  let tableCreatedThisRequest = false;

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
      tableCreatedThisRequest = true;
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
  const linkedinProfileUrlInput = '';
  const linkedinProfileUrl = '';
  const manualJobDescriptionInput =
    typeof req.body.manualJobDescription === 'string'
      ? req.body.manualJobDescription
      : typeof req.body.jobDescriptionText === 'string'
        ? req.body.jobDescriptionText
        : '';
  const manualJobDescription = sanitizeManualJobDescription(manualJobDescriptionInput);
  const manualJobDescriptionDigest = createTextDigest(manualJobDescription);
  const hasManualJobDescription = Boolean(manualJobDescription);
  const submittedCredly = '';
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
  const uploadContext = req.resumeUploadContext || {};
  const initialSessionPrefix =
    uploadContext.sessionPrefix ||
    uploadContext.incomingPrefix ||
    res.locals.initialSessionPrefix ||
    `${jobId}/incoming/${date}/`;
  let originalUploadKey =
    (typeof req.file?.key === 'string' && req.file.key) ||
    `${initialSessionPrefix}original.pdf`;
  const initialUploadKey = originalUploadKey;
  let logKey = `${initialSessionPrefix}logs/processing.jsonl`;
  const originalContentType = determineUploadContentType(req.file);
  if (originalContentType !== req.file.mimetype) {
    logStructured('warn', 'initial_upload_content_type_adjusted', {
      ...logContext,
      originalContentType: req.file.mimetype,
      normalizedContentType: originalContentType,
    });
  }

  let uploadedFileBuffer;
  try {
    const downloadResponse = await sendS3CommandWithRetry(
      s3,
      () => new GetObjectCommand({ Bucket: bucket, Key: originalUploadKey }),
      {
        maxAttempts: 3,
        baseDelayMs: 300,
        maxDelayMs: 2500,
        retryLogEvent: 'initial_upload_download_retry',
        retryLogContext: { ...logContext, bucket, key: originalUploadKey },
      }
    );
    uploadedFileBuffer = await streamToBuffer(downloadResponse.Body);
  } catch (err) {
    logStructured('error', 'initial_upload_download_failed', {
      ...logContext,
      bucket,
      key: originalUploadKey,
      error: serializeError(err),
    });
    return sendError(
      res,
      500,
      'INITIAL_UPLOAD_FAILED',
      S3_STORAGE_ERROR_MESSAGE,
      { bucket, reason: err?.message || 'Unable to read uploaded file.' }
    );
  }

  req.file.buffer = uploadedFileBuffer;

  let sanitizedUploadBuffer = req.file.buffer;
  try {
    const strippedBuffer = await stripUploadMetadata({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    if (Buffer.isBuffer(strippedBuffer)) {
      sanitizedUploadBuffer = strippedBuffer;
      if (strippedBuffer !== req.file.buffer) {
        logStructured('debug', 'upload_metadata_sanitized', logContext);
      }
    }
  } catch (err) {
    logStructured('warn', 'upload_metadata_sanitization_failed', {
      ...logContext,
      error: serializeError(err),
    });
  }
  req.file.buffer = sanitizedUploadBuffer;

  try {
    await sendS3CommandWithRetry(
      s3,
      () =>
        new PutObjectCommand(
          withEnvironmentTagging({
            Bucket: bucket,
            Key: originalUploadKey,
            Body: req.file.buffer,
            ContentType: originalContentType,
          })
        ),
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        jitterMs: 300,
        retryLogEvent: 'initial_upload_retry',
        retryLogContext: { ...logContext, bucket, key: originalUploadKey },
      }
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
  const safeRequestId =
    typeof requestId === 'string' && requestId.trim()
      ? requestId.trim()
      : String(requestId || '');
  const requestScopedIdentifier = normalizePersonalData(safeRequestId);
  let placeholderIdentifier = normalizePersonalData(profileIdentifier || jobId);
  let placeholderRecordIdentifier = '';
  let shouldDeletePlaceholder = false;
  const initialTimestamp = new Date().toISOString();
  const initialS3Location = `s3://${bucket}/${originalUploadKey}`;

  await ensureTableExists();

  const writePlaceholderRecord = async (identifier) => {
    if (!identifier) {
      return false;
    }
    try {
      await dynamo.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            linkedinProfileUrl: { S: identifier },
            timestamp: { S: initialTimestamp },
            uploadedAt: { S: initialTimestamp },
            requestId: { S: safeRequestId },
            jobId: { S: jobId },
            ipAddress: { S: normalizePersonalData(ipAddress) },
            userAgent: { S: normalizePersonalData(userAgent) },
            os: { S: os },
            browser: { S: browser },
            device: { S: device },
            location: { S: locationMeta.label || 'Unknown' },
            locationCity: { S: locationMeta.city || '' },
            locationRegion: { S: locationMeta.region || '' },
            locationCountry: { S: locationMeta.country || '' },
            s3Bucket: { S: bucket },
            s3Key: { S: originalUploadKey },
            s3Url: { S: initialS3Location },
          },
        })
      );
      logStructured('info', 'dynamo_upload_metadata_written', {
        ...logContext,
        bucket,
        key: originalUploadKey,
      });
      return true;
    } catch (err) {
      logStructured('warn', 'dynamo_upload_metadata_failed', {
        ...logContext,
        error: serializeError(err),
      });
      return false;
    }
  };

  const deletePlaceholderRecord = async (identifier) => {
    if (!identifier) {
      return false;
    }
    try {
      await dynamo.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: identifier } },
        })
      );
      logStructured('info', 'placeholder_record_deleted', {
        ...logContext,
        placeholderIdentifier: identifier,
      });
      return true;
    } catch (err) {
      logStructured('warn', 'placeholder_record_delete_failed', {
        ...logContext,
        placeholderIdentifier: identifier,
        error: serializeError(err),
      });
      return false;
    }
  };

  let text;
  try {
    text = await extractResumeText(req.file);
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
  const classificationLogger = createStructuredLogger(logContext);
  const classification = await classifyResumeDocument(text, {
    logger: classificationLogger,
    getGenerativeModel: () => getSharedGenerativeModel(),
  });
  logStructured('info', 'resume_classified', {
    ...logContext,
    isResume: classification.isResume,
    description: classification.description,
    confidence: classification.confidence,
  });
  const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const classificationShouldReject = shouldRejectBasedOnClassification(classification, {
    fileExtension: normalizedExt,
    wordCount,
  });
  if (!classification.isResume && classificationShouldReject) {
    logStructured('warn', 'resume_validation_failed', {
      ...logContext,
      reason: 'not_identified_as_resume',
      description: classification.description,
      confidence: classification.confidence,
      wordCount,
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
  if (!classification.isResume) {
    logStructured('info', 'resume_validation_soft_pass', {
      ...logContext,
      description: classification.description,
      confidence: classification.confidence,
      reason: classification.reason,
      wordCount,
      fileExtension: normalizedExt,
    });
  }
  const initialContactDetails = extractContactDetails(text, linkedinProfileUrl);
  const applicantName = extractName(text);
  const sanitizedName = sanitizeName(applicantName) || 'candidate';
  const storedApplicantName = normalizePersonalData(applicantName);
  const storedLinkedIn = normalizePersonalData(
    initialContactDetails.linkedin || profileIdentifier
  );
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
      await sendS3CommandWithRetry(
        s3,
        () =>
          new CopyObjectCommand(
            withEnvironmentTagging({
              Bucket: bucket,
              CopySource: buildCopySource(bucket, originalUploadKey),
              Key: finalUploadKey,
              MetadataDirective: 'COPY',
              TaggingDirective: 'REPLACE',
            })
          ),
        {
          maxAttempts: 4,
          baseDelayMs: 500,
          maxDelayMs: 5000,
          jitterMs: 300,
          retryLogEvent: 'raw_upload_relocation_retry',
          retryLogContext: {
            ...logContext,
            bucket,
            fromKey: originalUploadKey,
            toKey: finalUploadKey,
            operation: 'copy',
          },
        }
      );
      await sendS3CommandWithRetry(
        s3,
        () => new DeleteObjectCommand({ Bucket: bucket, Key: originalUploadKey }),
        {
          maxAttempts: 3,
          baseDelayMs: 300,
          maxDelayMs: 3000,
          retryLogEvent: 'raw_upload_relocation_retry',
          retryLogContext: {
            ...logContext,
            bucket,
            fromKey: originalUploadKey,
            toKey: finalUploadKey,
            operation: 'delete_source',
          },
        }
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
      if (req.file) {
        req.file.key = finalUploadKey;
      }
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

  try {
    await ensureTableExists();

    let previousSessionChangeLogKey = '';
    let previousChangeLogTextKey = '';
    let previousSessionChangeLogBucket = '';

    let hadPreviousRecord = false;
    try {
      const previousRecord = await dynamo.send(
        new GetItemCommand({
          TableName: tableName,
          Key: { linkedinProfileUrl: { S: storedLinkedIn } },
          ProjectionExpression: 's3Bucket, sessionChangeLogKey, changeLogKey',
        })
      );
      const previousItem = previousRecord.Item || {};
      hadPreviousRecord = Boolean(
        previousItem && typeof previousItem === 'object' && Object.keys(previousItem).length
      );
      if (previousItem.sessionChangeLogKey?.S) {
        previousSessionChangeLogKey = previousItem.sessionChangeLogKey.S.trim();
      }
      if (previousItem.changeLogKey?.S) {
        previousChangeLogTextKey = previousItem.changeLogKey.S.trim();
      }
      if (previousItem.s3Bucket?.S) {
        previousSessionChangeLogBucket = previousItem.s3Bucket.S.trim();
      }
    } catch (lookupErr) {
      logStructured('warn', 'previous_session_lookup_failed', {
        ...logContext,
        error: serializeError(lookupErr),
      });
    }

    if (!tableCreatedThisRequest) {
      const existingRecordKnown = Boolean(
        hadPreviousRecord ||
          (storedLinkedIn && knownResumeIdentifiers.has(storedLinkedIn))
      );
      if (existingRecordKnown && requestScopedIdentifier) {
        placeholderIdentifier = requestScopedIdentifier;
      }

      if (existingRecordKnown && (await writePlaceholderRecord(placeholderIdentifier))) {
        placeholderRecordIdentifier = placeholderIdentifier;
      }
    }

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
        environment: { S: deploymentEnvironment },
        sessionChangeLogKey: { S: sessionChangeLogKey },
        jobDescriptionDigest: { S: manualJobDescriptionDigest || '' },
      }
    };
    await dynamo.send(new PutItemCommand(putItemPayload));
    if (storedLinkedIn) {
      knownResumeIdentifiers.add(storedLinkedIn);
    }
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

    if (placeholderIdentifier && placeholderIdentifier !== storedLinkedIn) {
      shouldDeletePlaceholder = true;
    }

    const cleanupBucket = previousSessionChangeLogBucket || bucket;
    const sessionPrefix = typeof prefix === 'string' ? prefix : '';
    const normalizedPreviousSessionLogKey =
      typeof previousSessionChangeLogKey === 'string'
        ? previousSessionChangeLogKey.trim()
        : '';
    const normalizedSessionLogKey =
      typeof sessionChangeLogKey === 'string' ? sessionChangeLogKey.trim() : '';
    const normalizedPreviousTextKey =
      typeof previousChangeLogTextKey === 'string'
        ? previousChangeLogTextKey.trim()
        : '';
    const sessionArtifactsPrefix = sessionPrefix ? `${sessionPrefix}artifacts/` : '';
    const hasReusedSessionPrefix = Boolean(
      sessionPrefix &&
        ((normalizedPreviousSessionLogKey &&
          normalizedPreviousSessionLogKey.startsWith(sessionPrefix)) ||
          (normalizedPreviousTextKey &&
            normalizedPreviousTextKey.startsWith(sessionArtifactsPrefix)))
    );
    const staleSessionArtifacts = [];

    if (
      cleanupBucket &&
      normalizedPreviousSessionLogKey &&
      (
        normalizedPreviousSessionLogKey !== normalizedSessionLogKey ||
        hasReusedSessionPrefix
      )
    ) {
      staleSessionArtifacts.push({
        key: normalizedPreviousSessionLogKey,
        type: 'session_change_log',
      });
    }

    const previousTextKeyInCurrentPrefix = Boolean(
      sessionArtifactsPrefix &&
        normalizedPreviousTextKey &&
        normalizedPreviousTextKey.startsWith(sessionArtifactsPrefix)
    );

    if (
      cleanupBucket &&
      normalizedPreviousTextKey &&
      (!previousTextKeyInCurrentPrefix || hasReusedSessionPrefix)
    ) {
      staleSessionArtifacts.push({
        key: normalizedPreviousTextKey,
        type: 'change_log_artifact',
      });
    }

    if (cleanupBucket && staleSessionArtifacts.length) {
      const cleanupResults = await Promise.allSettled(
        staleSessionArtifacts.map(({ key, type }) =>
          sendS3CommandWithRetry(
            s3,
            () => new DeleteObjectCommand({ Bucket: cleanupBucket, Key: key }),
            {
              maxAttempts: 3,
              baseDelayMs: 300,
              maxDelayMs: 3000,
              retryLogEvent: 'session_transition_cleanup_retry',
              retryLogContext: { ...logContext, bucket: cleanupBucket, key, type },
            }
          )
        )
      );

      const removed = [];
      const failures = [];

      cleanupResults.forEach((result, index) => {
        const target = staleSessionArtifacts[index];
        if (result.status === 'fulfilled') {
          removed.push(target);
        } else {
          failures.push({
            ...target,
            error: serializeError(result.reason),
          });
        }
      });

      if (removed.length) {
        logStructured('info', 'session_transition_change_log_removed', {
          ...logContext,
          bucket: cleanupBucket,
          removedKeys: removed.map((entry) => entry.key),
        });
      }

      if (failures.length) {
        logStructured('warn', 'session_transition_change_log_cleanup_failed', {
          ...logContext,
          bucket: cleanupBucket,
          failures,
        });
      }
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

    if (isUploadMicroservice) {
      logStructured('info', 'resume_upload_async_enqueued', {
        ...logContext,
        jobTitle,
        jobSkills: jobSkills.length,
        manualCertificates: manualCertificates.length,
        credlyAttempted: credlyStatus.attempted,
      });

      scheduleTask(() => {
        publishResumeWorkflowEvent({
          jobId,
          resumeText: text,
          jobDescription,
          jobSkills,
          manualCertificates,
          targetTitle: jobTitle,
          enhancementTypes: ENHANCEMENT_TYPES,
        }).catch((eventErr) => {
          logStructured('warn', 'process_cv_orchestration_event_failed', {
            ...logContext,
            error: serializeError(eventErr),
          });
        });
      });

      return res.status(202).json({
        success: true,
        queued: true,
        message:
          'Resume upload received. Processing will continue asynchronously.',
        jobId,
        jobTitle,
        resumeText: text,
        jobDescriptionText: jobDescription,
        jobSkills,
        manualCertificates,
        credlyStatus,
        classification,
        upload: {
          bucket,
          key: originalUploadKey,
          metadataKey,
          logKey,
          sessionChangeLogKey,
        },
      });
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

    let learningResources = [];
    if (missingSkills.length) {
      try {
        learningResources = await generateLearningResources(missingSkills, {
          jobTitle,
          jobDescription,
          disableGenerative: true,
          requestId,
        });
      } catch (err) {
        logStructured('warn', 'initial_analysis_learning_resources_failed', {
          error: serializeError(err),
          missingSkillCount: missingSkills.length,
        });
      }
    }

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
      learningResources,
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
    const scoringMetadataPrefix =
      extractSessionScopedPrefixFromKey(logKey) ||
      extractSessionScopedPrefixFromKey(originalUploadKey);
    const scoringMetadataKey = scoringMetadataPrefix
      ? `${scoringMetadataPrefix}logs/log.json`
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
            'SET #status = :status, analysisCompletedAt = :completedAt, missingSkills = :missing, addedSkills = :added, enhancedScore = :score, originalScore = if_not_exists(originalScore, :score), jobDescriptionDigest = :jobDescriptionDigest, environment = if_not_exists(environment, :environment)',
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
            ':jobDescriptionDigest': { S: manualJobDescriptionDigest || '' },
            ':jobId': { S: jobId },
            ':statusUploaded': { S: 'uploaded' },
            ':environment': { S: deploymentEnvironment },
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
      dismissedChangeLogEntries: [],
      coverLetterChangeLogEntries: [],
      dismissedCoverLetterChangeLogEntries: [],
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
      if (
        shouldDeletePlaceholder &&
        placeholderRecordIdentifier &&
        placeholderRecordIdentifier !== storedLinkedIn
      ) {
        await deletePlaceholderRecord(placeholderRecordIdentifier);
        shouldDeletePlaceholder = false;
      }
      scheduleTask(() => {
        publishResumeWorkflowEvent({
          jobId,
          resumeText: generationRequest?.resumeText || originalResumeText,
          jobDescription,
          jobSkills,
          missingSkills,
          manualCertificates,
          targetTitle: jobTitle,
          enhancementTypes: ENHANCEMENT_TYPES,
        }).catch((eventErr) => {
          logStructured('warn', 'process_cv_orchestration_event_failed', {
            ...logContext,
            error: serializeError(eventErr),
          });
        });
      });
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
  setPlainPdfFallbackOverride,
  setMinimalPlainPdfBufferGenerator,
  PdfGenerationError,
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
  sanitizeLogPayload,
  resolveEnhancementTokens,
  injectEnhancementTokens,
  relocateProfileLinks,
  verifyResume,
  createResumeVariants,
  classifyDocument,
  buildScoreBreakdown,
  enforceTargetedUpdate,
  extractContactDetails,
  buildTemplateSectionContext,
  buildTemplateContactEntries,
  CHANGE_LOG_FIELD_LIMITS,
  mapCoverLetterFields,
  auditCoverLetterStructure,
  ensureOutputFileUrls,
  determineUploadContentType,
  setCoverLetterFallbackBuilder,
  resetTestState,
};
