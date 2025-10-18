import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import WordExtractorPackage from 'word-extractor';
import { generateContentWithRetry, parseGeminiJsonResponse } from '../llm/gemini.js';
import { createVersionedPrompt, PROMPT_TEMPLATES } from '../llm/templates.js';
import { createTextDigest } from './utils.js';

const WordExtractor = WordExtractorPackage?.default ?? WordExtractorPackage;

let sharedWordExtractor;

const RESUME_EXTRACTION_MESSAGES = {
  pdf: {
    intro: "We couldn't read your PDF resume.",
    guidance:
      'Please export a new PDF (make sure it is not password protected) and upload it again.',
  },
  docx: {
    intro: "We couldn't read your DOCX resume.",
    guidance:
      'Please download a fresh DOCX copy (or export it to PDF) from your editor and try again.',
  },
  doc: {
    intro: "We couldn't read your DOC resume.",
    guidance:
      'Please re-save it as a DOC file or export it to PDF before uploading again.',
  },
  default: {
    intro: "We couldn't read your resume.",
    guidance: 'Please upload a valid PDF or DOCX resume and try again.',
  },
};

const DOCUMENT_CLASSIFIERS = [
  {
    description: 'a job description document',
    className: 'job_description',
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
    className: 'cover_letter',
    keywords: ['dear', 'sincerely', 'cover letter'],
    threshold: 2,
  },
  {
    description: 'an invoice document',
    className: 'invoice',
    keywords: ['invoice', 'bill to', 'payment terms', 'invoice number'],
    threshold: 2,
  },
  {
    description: 'meeting notes',
    className: 'meeting_notes',
    keywords: ['meeting notes', 'action items', 'attendees'],
    threshold: 2,
  },
  {
    description: 'an academic paper',
    className: 'academic_paper',
    keywords: ['abstract', 'introduction', 'references'],
    threshold: 2,
  },
  {
    description: 'a policy or compliance document',
    className: 'policy_or_compliance',
    keywords: ['policy', 'scope', 'compliance', 'procedures'],
    threshold: 2,
  },
  {
    description: 'a marketing brochure',
    className: 'marketing_brochure',
    keywords: ['call to action', 'our services', 'clients', 'testimonials'],
    threshold: 2,
  },
  {
    description: 'a slide deck outline',
    className: 'presentation',
    keywords: ['slide', 'agenda', 'speaker notes'],
    threshold: 2,
  },
  {
    description: 'a certificate or award notice',
    className: 'certificate',
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

const STRONG_NON_RESUME_KEYWORDS = [
  'job description',
  'job-posting',
  'cover letter',
  'invoice',
  'meeting notes',
  'academic paper',
  'policy',
  'compliance',
  'marketing brochure',
  'slide deck',
  'certificate',
  'does not contain any text',
  'empty document',
];

const NOOP_LOGGER = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function deriveDocumentClassName(...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const withoutArticle = trimmed.replace(/^(?:an?|the)\s+/i, '').trim();
    const withoutSuffix = withoutArticle.replace(/\b(document|file|text)\b$/i, '').trim();
    const cleaned = withoutSuffix
      .toLowerCase()
      .replace(/['"“”‘’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!cleaned) {
      continue;
    }
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      continue;
    }
    return tokens.join('_');
  }
  return '';
}

function ensureClassificationClassName(result, fallback = '') {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const existing =
    typeof result.className === 'string' && result.className.trim()
      ? result.className.trim()
      : '';
  if (existing) {
    return result;
  }
  const derived = deriveDocumentClassName(result.description);
  if (derived) {
    return { ...result, className: derived };
  }
  const normalizedFallback = typeof fallback === 'string' ? fallback.trim() : '';
  if (normalizedFallback) {
    return { ...result, className: normalizedFallback };
  }
  return result;
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeExtractedText(text = '') {
  if (!text) return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000\u2028\u2029]/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

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

/**
 * Extract text from a resume file upload, normalising line endings and spacing
 * so downstream processing sees a consistent view irrespective of the original
 * document type.
 */
export async function extractResumeText(file) {
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

function runDocumentClassifiers(normalized) {
  for (const classifier of DOCUMENT_CLASSIFIERS) {
    const matches = classifier.keywords.filter((keyword) => normalized.includes(keyword));
    if (matches.length >= classifier.threshold) {
      return {
        isResume: false,
        description: classifier.description,
        className: classifier.className || deriveDocumentClassName(classifier.description),
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
      className: 'job_description',
      confidence: 0.35,
      reason: `Detected job-posting ${joinedReason}.`,
    };
  }

  return null;
}

function getNonResumeClassification(normalized) {
  return runDocumentClassifiers(normalized) ?? detectJobPostingDocument(normalized);
}

function isStrongNonResumeSignal(description = '', reason = '') {
  const normalizedDescription =
    typeof description === 'string' ? description.toLowerCase() : '';
  const normalizedReason = typeof reason === 'string' ? reason.toLowerCase() : '';

  return STRONG_NON_RESUME_KEYWORDS.some((keyword) => {
    const needle = keyword.toLowerCase();
    return (
      (normalizedDescription && normalizedDescription.includes(needle)) ||
      (normalizedReason && normalizedReason.includes(needle))
    );
  });
}

/**
 * Determine whether extracted resume text represents a CV. The classifier uses
 * lightweight heuristics and optionally consults Gemini when a generative
 * model is supplied.
 */
export async function classifyResumeDocument(text = '', options = {}) {
  const {
    logger = NOOP_LOGGER,
    generativeModel,
    getGenerativeModel,
    generateContent = generateContentWithRetry,
    parseJson = parseGeminiJsonResponse,
  } = options;

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      isResume: false,
      description: 'an empty document',
      className: 'empty_document',
      confidence: 0,
      reason: 'The uploaded file does not contain any text to evaluate.',
    };
  }

  const normalized = trimmed.toLowerCase();
  const nonResumeClassification = getNonResumeClassification(normalized);

  if (/professional summary/i.test(trimmed) && /experience/i.test(trimmed)) {
    if (nonResumeClassification) {
      return ensureClassificationClassName(nonResumeClassification, 'non_resume');
    }
    return { isResume: true, description: 'a professional resume', className: 'resume', confidence: 0.6 };
  }

  const excerpt = trimmed.slice(0, 3600);
  let model = generativeModel;
  if (!model && typeof getGenerativeModel === 'function') {
    try {
      model = await getGenerativeModel();
    } catch (err) {
      logger.warn('document_classification_ai_failed', {
        error: serializeError(err),
      });
    }
  }

  if (model?.generateContent) {
    try {
      const templateMeta = PROMPT_TEMPLATES.documentClassification;
      const promptText = promptFromExcerpt(excerpt);
      const promptDigest = createTextDigest(promptText);
      const startedAt = Date.now();
      const response = await generateContent(model, promptText, {
        retryLogEvent: 'document_classification_ai',
        logger,
      });
      const latencyMs = Date.now() - startedAt;
      const parsed = parseJson(response?.response?.text?.(), { logger });
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
        const type = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : '';
        const isResume = type === 'resume';
        const confidence = Number.isFinite(parsed.confidence)
          ? clamp(parsed.confidence, 0, 1)
          : isResume
            ? 0.75
            : 0.5;
        const probableType = parsed.probableType || (isResume ? 'a professional resume' : 'a non-resume document');
        const description = isResume ? 'a professional resume' : probableType;
        if (isResume && nonResumeClassification) {
          return ensureClassificationClassName(nonResumeClassification, 'non_resume');
        }
        const parsedReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
        const fallbackReason = isResume
          ? ''
          : `The document content aligns with ${stripLeadingArticle(description)} rather than a CV.`;
        const probableTypeValue = typeof parsed.probableType === 'string' ? parsed.probableType : '';
        const parsedClassName =
          typeof parsed.className === 'string' ? parsed.className : '';
        const classNameCandidate = deriveDocumentClassName(
          parsedClassName,
          probableTypeValue,
          description
        );
        logger.info('document_classification_ai_metrics', {
          templateId: templateMeta.templateId,
          templateVersion: templateMeta.templateVersion,
          promptDigest,
          outputDigest: createTextDigest(JSON.stringify(parsed)),
          latencyMs,
          isResume,
          confidence,
        });
        const classification = {
          isResume,
          description,
          confidence,
          reason: parsedReason || fallbackReason || undefined,
          className: isResume ? 'resume' : classNameCandidate || 'non_resume',
        };
        return classification;
      }
      logger.info('document_classification_ai_metrics', {
        templateId: templateMeta.templateId,
        templateVersion: templateMeta.templateVersion,
        promptDigest,
        latencyMs,
        outcome: 'no_parse',
      });
    } catch (err) {
      logger.warn('document_classification_ai_failed', {
        error: serializeError(err),
      });
    }
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
      return ensureClassificationClassName(nonResumeClassification, 'non_resume');
    }
    return { isResume: true, description: 'a professional resume', className: 'resume', confidence: 0.6 };
  }

  if (nonResumeClassification) {
    return ensureClassificationClassName(nonResumeClassification, 'non_resume');
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
    return { isResume: true, description: 'a professional resume', className: 'resume', confidence: 0.55 };
  }

  const snippet = lines[0]?.slice(0, 60).trim() || '';
  return {
    isResume: false,
    description: snippet
      ? `a document starting with "${snippet}${lines[0].length > 60 ? '…' : ''}"`
      : 'a non-resume document',
    className: 'non_resume',
    confidence: 0.3,
    reason:
      'The text lacks resume-defining sections such as Experience, Education, or Skills.',
  };
}

function promptFromExcerpt(excerpt) {
  const promptPackage = createVersionedPrompt({
    ...PROMPT_TEMPLATES.documentClassification,
    description: 'Classify whether the document excerpt is a resume.',
    sections: [
      {
        title: 'TASK',
        body:
          'You are an AI document classifier. Determine whether the provided text is a curriculum vitae/resume. Return ONLY valid JSON with keys: type ("resume" or "non_resume"), probableType (string describing the document if not a resume), confidence (0-1), and reason (short explanation). Consider layout clues, section headings, and whether the text emphasises experience.',
      },
      {
        title: 'DOCUMENT EXCERPT',
        body: excerpt ? `"""${excerpt}"""` : 'Not provided',
      },
    ],
  });
  return promptPackage.text;
}

/**
 * Determine if a classification result should be rejected immediately based on
 * confidence scores or explicit non-resume signals.
 */
export function shouldRejectBasedOnClassification(result, context = {}) {
  if (!result || typeof result !== 'object' || result.isResume) {
    return false;
  }

  const { confidence = 0, description, reason } = result;

  if (isStrongNonResumeSignal(description, reason)) {
    return true;
  }

  if (confidence >= 0.4) {
    return true;
  }

  const fileExtension =
    typeof context.fileExtension === 'string' ? context.fileExtension.toLowerCase() : '';
  const wordCount = Number.isFinite(context.wordCount) ? context.wordCount : 0;
  const lacksResumeSections =
    typeof reason === 'string' && /lacks resume-defining sections/i.test(reason);
  const isWordDocument = fileExtension === '.doc' || fileExtension === '.docx';

  if (isWordDocument && lacksResumeSections && confidence < 0.4 && wordCount <= 150) {
    return false;
  }

  return true;
}

export { normalizeExtractedText, createResumeExtractionError };
export const classifyDocument = classifyResumeDocument;
export const extractText = extractResumeText;
