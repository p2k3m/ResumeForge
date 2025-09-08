import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { getSecrets } from '../config/secrets.js';
import { logEvent } from '../logger.js';
import {
  requestSectionImprovement,
  uploadFile as openaiUploadFile,
  requestEnhancedCV,
  requestCoverLetter,
  requestAtsAnalysis,
} from '../openaiClient.js';
import { compareMetrics, calculateMetrics } from '../services/atsMetrics.js';
import { convertToPdf } from '../lib/convertToPdf.js';
import { logEvaluation, logSession } from '../services/dynamo.js';

import { uploadResume, validateUrl } from '../lib/serverUtils.js';
import userAgentMiddleware from '../middlewares/userAgent.js';
import { fetchJobDescription, LINKEDIN_AUTH_REQUIRED } from '../services/jobFetch.js';
import { REGION } from '../config/aws.js';

import { extractText } from '../lib/extractText.js';
import { sanitizeName } from '../lib/sanitizeName.js';
import {
  parseContent,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractLanguages,
} from '../services/parseContent.js';
import { REQUEST_TIMEOUT_MS } from '../config/jobFetch.js';
import { PROCESS_TIMEOUT_MS } from '../config/process.js';

const activeJobs = new Map();

const TRACKED_STAGES = [
  'ats_analysis',
  'pdf_generation',
  'text_extraction',
  'uploads',
  'summary_generation',
];

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

async function withRetry(fn, retries = 3, delay = 500, signal) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (signal?.aborted || err.name === 'AbortError') throw err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function extractResponsibilitiesFromJd(html = '', jobSkills = []) {
  const items = html.match(/<li[^>]*>(.*?)<\/li>/gis) || [];
  const skillSet = new Set(jobSkills.map((s) => s.toLowerCase()));
  const verbs = [
    'manage',
    'lead',
    'develop',
    'design',
    'implement',
    'coordinate',
    'support',
    'maintain',
    'analyze',
    'plan',
    'oversee',
    'create',
    'build'
  ];
  return items
    .map((li) =>
      li
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((text) => {
      const lower = text.toLowerCase();
      if (!verbs.some((v) => lower.includes(v))) return false;
      const words = lower.split(/[^a-z0-9+]+/);
      return !words.some((w) => skillSet.has(w));
      });
}

function computeJdMismatches(resumeText = '', jobHtml = '', jobSkills = []) {
  const responsibilities = extractResponsibilitiesFromJd(jobHtml, jobSkills);
  const resumeLower = resumeText.toLowerCase();
  return responsibilities.filter((resp) => {
    const words = resp
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 3);
    return !words.every((w) => resumeLower.includes(w));
  });
}

export async function improveSections(sections, jobDescription, signal) {
  const improvedSections = {};
  for (const key of [
    'summary',
    'experience',
    'education',
    'certifications',
    'projects',
  ]) {
    const text = sections[key]?.trim();
    if (!text) {
      improvedSections[key] = '';
      continue;
    }
    improvedSections[key] = await requestSectionImprovement(
      {
        sectionName: key,
        sectionText: text,
        jobDescription,
      },
      { signal }
    );
  }
  return improvedSections;
}

export function buildS3Key(basePath, filename) {
  return basePath.join('/') + '/' + filename;
}

export function withTimeout(handler, timeoutMs = 10000) {
  return async (req, res, next) => {
    const controller = new AbortController();
    req.signal = controller.signal;
    req.abortController = controller;
    req.requestStart = Date.now();
    req.stageStatus = {};
    req.stageDurations = {};
    if (req.jobId) {
      activeJobs.set(req.jobId, req);
    }
    let summaryLogged = false;
    const logSummary = (result) => {
      if (summaryLogged) return;
      summaryLogged = true;
      const id = req.jobId || 'unknown';
      const elapsed = Date.now() - req.requestStart;
      const stageDurations = Object.fromEntries(
        Object.entries(req.stageDurations).sort((a, b) => b[1] - a[1])
      );
      console.log(
        JSON.stringify({
          [id]: {
            status: result,
            total_ms: elapsed,
            stage_durations: stageDurations,
          },
        })
      );
    };
    controller.signal.addEventListener('abort', () => {
      const ts = new Date().toISOString();
      const id = req.jobId || 'unknown';
      const elapsed = Date.now() - req.requestStart;
      console.log(`[${ts}] [${id}] abort_triggered elapsed=${elapsed}ms`);
      logSummary('aborted');
    });
    const start = Date.now();
    const abortNext = (err) => {
      if (err && !controller.signal.aborted) {
        const elapsed = Date.now() - req.requestStart;
        const id = req.jobId || 'unknown';
        console.log(
          `[processCv] [${id}] aborting due to error: ${err.message} elapsed=${elapsed}ms`,
        );
        controller.abort();
      }
      next(err);
    };
    const timeout = setTimeout(() => {
      if (!controller.signal.aborted) {
        const elapsed = Date.now() - req.requestStart;
        const id = req.jobId || 'unknown';
        console.log(
          `[processCv] [${id}] processing timeout, aborting elapsed=${elapsed}ms`,
        );
        controller.abort();
      }
      if (!res.headersSent) {
        abortNext(createError(503, 'processing timeout'));
      }
    }, timeoutMs);
    const end = res.end;
    res.end = function (...args) {
      const duration = Date.now() - start;
      res.setHeader('X-Processing-Time', duration);
      const elapsed = Date.now() - req.requestStart;
      const id = req.jobId || 'unknown';
      console.log(
        `[processCv] [${id}] ${req.method} ${req.originalUrl} took ${duration}ms elapsed=${elapsed}ms`,
      );
      logSummary('finished');
      if (req.jobId) {
        activeJobs.delete(req.jobId);
      }
      end.apply(this, args);
    };
    try {
      await handler(req, res, abortNext);
    } catch (err) {
      abortNext(err);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function startStep(req, event) {
  const start = Date.now();
  const ts = new Date().toISOString();
  const id = req.jobId || 'unknown';
  const elapsed = start - (req.requestStart || start);
  req.stageStatus = req.stageStatus || {};
  req.stageDurations = req.stageDurations || {};
  req.stageStatus[event] = 'started';
  console.log(`[${ts}] [${id}] ${event}_start elapsed=${elapsed}ms`);
  if (req.s3 && req.bucket && req.logKey) {
    logEvent({
      s3: req.s3,
      bucket: req.bucket,
      key: req.logKey,
      jobId: id,
      event: `${event}_start`,
      message: `elapsed=${elapsed}ms`,
      signal: req.signal,
    }).catch((err) => console.error(`failed to log ${event}_start`, err));
  }
  return (message = '') => logStep(req, event, start, message);
}

async function logStep(req, event, start, message = '') {
  const now = Date.now();
  const duration = now - start;
  const endTs = new Date().toISOString();
  const id = req.jobId || 'unknown';
  const status = req.signal?.aborted ? 'canceled' : 'end';
  const elapsed = now - (req.requestStart || start);
  req.stageStatus[event] = status === 'end' ? 'completed' : 'canceled';
  req.stageDurations[event] = duration;
  console.log(
    `[${endTs}] [${id}] ${event}_${status} duration=${duration}ms elapsed=${elapsed}ms${
      message ? ' - ' + message : ''
    }`,
  );
  if (req.s3 && req.bucket && req.logKey) {
    try {
      await logEvent({
        s3: req.s3,
        bucket: req.bucket,
        key: req.logKey,
        jobId: id,
        event: `${event}_${status}`,
        message: `duration=${duration}ms; elapsed=${elapsed}ms${
          message ? '; ' + message : ''
        }`,
        signal: req.signal,
      });
    } catch (err) {
      console.error(`failed to log ${event}_end`, err);
    }
  }
}

async function extractTextLogged(req, file) {
  const end = startStep(req, 'text_extraction');
  try {
    const text = await extractText(file);
    await end();
    return text;
  } catch (err) {
    await end(err.message);
    throw err;
  }
}

async function convertToPdfLogged(req, content) {
  const end = startStep(req, 'pdf_generation');
  try {
    const pdf = await convertToPdf(content);
    await end();
    return pdf;
  } catch (err) {
    await end(err.message);
    throw err;
  }
}

export default function registerProcessCv(
  app,
  {
    generativeModel,
    classifyDocument,
    extractName,
    CV_TEMPLATES,
    CL_TEMPLATES,
    selectTemplates,
    analyzeJobDescription,
    fetchLinkedInProfile,
    fetchCredlyProfile,
    collectSectionText,
    extractResumeSkills,
    generateProjectSummary,
    calculateMatchScore,
    sanitizeGeneratedText,
    parseAiJson,
  generatePdf,
  generateDocx,
  }
) {
  app.use(userAgentMiddleware);

  app.get('/api/progress/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const active = activeJobs.get(jobId);
    if (active) {
      return res.json(active.stageStatus || {});
    }
    try {
      const dynamo = new DynamoDBClient({ region: REGION });
      let tableName = process.env.DYNAMO_TABLE;
      if (!tableName) {
        try {
          const secrets = await getSecrets();
          tableName = secrets.DYNAMO_TABLE || 'ResumeForgeLogs';
        } catch {
          tableName = 'ResumeForgeLogs';
        }
      }
      const { Item } = await dynamo.send(
        new GetItemCommand({ TableName: tableName, Key: { jobId: { S: jobId } } })
      );
      if (!Item) return res.status(404).json({ error: 'job not found' });
      res.json(Item);
    } catch (err) {
      console.error('failed to fetch progress', err);
      res.status(500).json({ error: 'failed to fetch progress' });
    }
  });

  app.delete('/api/session/:jobId', async (req, res) => {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ error: 'jobId required' });
    }
    let bucket;
    let tableName = process.env.DYNAMO_TABLE;
    try {
      const secrets = await getSecrets();
      bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
      if (!tableName) {
        tableName = secrets.DYNAMO_TABLE || 'ResumeForgeLogs';
      }
    } catch {
      bucket = process.env.S3_BUCKET || 'resume-forge-data';
      if (!tableName) tableName = 'ResumeForgeLogs';
    }
    const s3 = new S3Client({ region: REGION });
    const dynamo = new DynamoDBClient({ region: REGION });
    try {
      const { Item } = await dynamo.send(
        new GetItemCommand({ TableName: tableName, Key: { jobId: { S: jobId } } })
      );
      if (!Item) {
        return res.status(404).json({ error: 'session not found' });
      }
      const keys = [];
      if (Item.cvKey?.S) keys.push(Item.cvKey.S);
      if (Item.coverLetterKey?.S) keys.push(Item.coverLetterKey.S);
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      for (const Key of keys) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
        } catch (err) {
          console.warn('failed to delete s3 object', Key, err);
        }
      }
      const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
      await dynamo.send(
        new DeleteItemCommand({ TableName: tableName, Key: { jobId: { S: jobId } } })
      );
      res.json({ status: 'deleted' });
    } catch (err) {
      console.error('failed to delete session', err);
      res.status(500).json({ error: 'failed to delete session' });
    }
  });

  app.get('/api/download', async (req, res) => {
    const { sanitizedName, date, sessionId, type, file } = req.query;
    if (!sanitizedName || !date || !sessionId || !type || !file) {
      return res.status(400).json({ error: 'invalid parameters' });
    }
    const s3 = new S3Client({ region: REGION });
    let bucket;
    try {
      const secrets = await getSecrets();
      bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
    } catch (err) {
      console.error('failed to load configuration', err);
      return res.status(500).json({ error: 'failed to load configuration' });
    }
    const key = buildS3Key([sanitizedName, date, sessionId, type], file);
    try {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );
      res.json({ url });
    } catch (err) {
      console.error('failed to generate download url', err);
      res.status(404).json({ error: 'file not found' });
    }
  });
  app.post(
    '/api/evaluate',
    (req, res, next) => {
      req.jobId = crypto.randomUUID();
      const endUpload = startStep(req, 'uploads');
      uploadResume(req, res, (err) => {
        endUpload(err ? err.message : '');
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    withTimeout(async (req, res, next) => {
      const { jobId } = req;
      console.log(
        `Received /api/evaluate request [${jobId}] elapsed=${Date.now() - req.requestStart}ms`,
      );
      const ipAddress =
        (req.headers['x-forwarded-for'] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)[0] || req.ip;
      const { userAgent, browser, os, device } = req;
      try {
        if (!req.file) return next(createError(400, 'resume file required'));
        let cvKey =
          req.file.key || req.file.filename || req.file.originalname || '';
        let {
          jobDescriptionUrl,
          jobDescriptionText = '',
          linkedinProfileUrl,
          credlyProfileUrl,
        } = req.body;
        if (!jobDescriptionUrl && !jobDescriptionText)
          return next(
            createError(
              400,
              'jobDescriptionUrl or jobDescriptionText required',
            ),
          );
        if (jobDescriptionUrl) {
          jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
          if (!jobDescriptionUrl)
            return next(createError(400, 'invalid jobDescriptionUrl'));
        }

        if (!linkedinProfileUrl)
          return next(createError(400, 'linkedinProfileUrl required'));
        linkedinProfileUrl = await validateUrl(linkedinProfileUrl);
        if (!linkedinProfileUrl)
          return next(createError(400, 'invalid linkedinProfileUrl'));

        if (credlyProfileUrl) {
          credlyProfileUrl = await validateUrl(credlyProfileUrl);
          if (!credlyProfileUrl)
            return next(createError(400, 'invalid credlyProfileUrl'));
        }

        const endJd = startStep(req, 'job_description_fetch');
        let jobHtml;
        if (jobDescriptionUrl) {
          try {
            jobHtml = await fetchJobDescription(jobDescriptionUrl, {
              timeout: REQUEST_TIMEOUT_MS,
              userAgent,
              signal: req.signal,
              jobId,
            });
            await endJd();
          } catch (err) {
            await endJd(err.code || err.message);
            if (err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText) {
              jobHtml = jobDescriptionText;
            } else if (err.code === LINKEDIN_AUTH_REQUIRED) {
              return res.status(403).json({
                error:
                  'LinkedIn job descriptions require authentication. Please paste the job description text directly.',
                code: LINKEDIN_AUTH_REQUIRED,
              });
            } else {
              throw err;
            }
          }
        } else {
          jobHtml = jobDescriptionText;
          await endJd('job_description_text');
        }
        const { title: jobTitle, skills: jobSkills } = await analyzeJobDescription(
          jobHtml
        );
        const resumeText = await extractTextLogged(req, req.file);
        const docType = await classifyDocument(resumeText);
        if (docType && docType !== 'resume' && docType !== 'unknown') {
          await logEvaluation({
            jobId,
            ipAddress,
            userAgent,
            browser,
            os,
            device,
            jobDescriptionUrl,
            linkedinProfileUrl,
            credlyProfileUrl,
            cvKey,
            docType,
          }, { signal: req.signal });
          return res.status(400).json({
            error: `You have uploaded a ${docType}. Please upload a CV only.`,
          });
        }
        if (!docType || docType === 'unknown') {
          await logEvaluation({
            jobId,
            ipAddress,
            userAgent,
            browser,
            os,
            device,
            jobDescriptionUrl,
            linkedinProfileUrl,
            credlyProfileUrl,
            cvKey,
            docType,
          }, { signal: req.signal });
          return res
            .status(400)
            .json({
              error:
                "The document type couldn't be recognized; please upload a CV.",
            });
        }
        let applicantName =
          req.body.applicantName || (await extractName(resumeText));
        let sanitized = sanitizeName(applicantName);
        if (!sanitized) {
          sanitized = 'candidate';
          applicantName = 'Candidate';
        }
        const sessionId = crypto.randomUUID();
        req.sessionId = sessionId;
        let bucket;
        try {
          const secrets = await getSecrets();
          bucket =
            process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
        } catch (err) {
          console.error('failed to load configuration', err);
          return next(createError(500, 'failed to load configuration'));
        }
        const s3 = new S3Client({ region: REGION });
        req.s3 = s3;
        req.bucket = bucket;
        const ext = path.extname(req.file.originalname).toLowerCase();
        const date = new Date().toISOString().split('T')[0];
        const basePath = [sanitized, date, sessionId];
        const filename = `${Date.now()}-${sanitized}${ext}`;
        cvKey = buildS3Key([...basePath, 'original'], filename);
        req.logKey = buildS3Key([...basePath, 'logs'], 'processing.jsonl');
        const endS3 = startStep(req, 'uploads');
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: cvKey,
              Body: req.file.buffer,
              ContentType: req.file.mimetype,
            }),
            { abortSignal: req.signal }
          );
          await endS3();
        } catch (err) {
          await endS3(err.message);
          console.error(`initial upload to bucket ${bucket} failed`, err);
        }
        const resumeSkills = extractResumeSkills(resumeText);
        const { newSkills: missingSkills } = calculateMatchScore(
          jobSkills,
          resumeSkills
        );
        const jdMismatches = computeJdMismatches(
          resumeText,
          jobHtml,
          jobSkills
        );
        let atsMetrics;
        const endAts = startStep(req, 'ats_analysis');
        try {
          atsMetrics = await requestAtsAnalysis(resumeText, { signal: req.signal });
          await endAts();
        } catch (err) {
          await endAts(err.message);
          console.warn('ATS analysis failed, using heuristic metrics', err);
          atsMetrics = calculateMetrics(resumeText);
        }
        const atsScore = Math.round(
          Object.values(atsMetrics).reduce((a, b) => a + b, 0) /
            Math.max(Object.keys(atsMetrics).length, 1)
        );
        const resumeExperience = extractExperience(resumeText);
        const resumeEducation = extractEducation(resumeText);
        const resumeCertifications = extractCertifications(resumeText);
        const resumeLanguages = extractLanguages(resumeText);
        let originalTitle = resumeExperience[0]?.title || '';

        let missingExperience = [];
        let missingEducation = [];
        let missingCertifications = [];
        let missingLanguages = [];
        if (linkedinProfileUrl) {
          const endLinkedIn = startStep(req, 'linkedin_fetch');
          try {
            const linkedinData = await fetchLinkedInProfile(
              linkedinProfileUrl,
              req.signal,
            );
            const linkedinExperience = extractExperience(
              linkedinData.experience || [],
            );
            const linkedinEducation = extractEducation(
              linkedinData.education || [],
            );
            const linkedinLanguages = extractLanguages(
              linkedinData.languages || [],
            );
            if (linkedinExperience[0]?.title) {
              originalTitle = linkedinExperience[0].title;
            }
            const fmtExp = (e = {}) =>
              `${e.title || ''} at ${e.company || ''}`.trim();
            const resumeExpSet = new Set(
              resumeExperience.map((e) => fmtExp(e)),
            );
            missingExperience = linkedinExperience
              .map((e) => fmtExp(e))
              .filter((e) => e && !resumeExpSet.has(e));
            const resumeEduSet = new Set(
              resumeEducation.map((e) => e.entry.toLowerCase()),
            );
            missingEducation = linkedinEducation
              .map((e) => e.entry)
              .filter((e) => e && !resumeEduSet.has(e.toLowerCase()));
            const resumeLangSet = new Set(
              resumeLanguages.map((l) => l.language.toLowerCase()),
            );
            missingLanguages = linkedinLanguages
              .map((l) =>
                l.proficiency
                  ? `${l.language} - ${l.proficiency}`
                  : l.language,
              )
              .filter((l) => {
                const name = l.split('-')[0].trim().toLowerCase();
                return name && !resumeLangSet.has(name);
              });
            await endLinkedIn();
          } catch (err) {
            await endLinkedIn(err.message);
            // ignore LinkedIn fetch errors
          }
        }

        if (credlyProfileUrl) {
          const endCredly = startStep(req, 'credly_fetch');
          try {
            const credlyData = await fetchCredlyProfile(
              credlyProfileUrl,
              req.signal,
            );
            const fmtCert = (c = {}) =>
              (c.provider ? `${c.name} - ${c.provider}` : c.name || '').trim();
            const resumeCertSet = new Set(
              resumeCertifications.map((c) => fmtCert(c)),
            );
            missingCertifications = credlyData.filter((c) => {
              const key = fmtCert(c);
              return key && !resumeCertSet.has(key);
            });
            await endCredly();
          } catch (err) {
            await endCredly(err.message);
            // ignore Credly fetch errors
          }
        }

        const designationMatch =
          originalTitle && jobTitle
            ? originalTitle.toLowerCase() === jobTitle.toLowerCase()
            : false;

        await logEvaluation({
          jobId,
          ipAddress,
          userAgent,
          browser,
          os,
          device,
          jobDescriptionUrl,
          linkedinProfileUrl,
          credlyProfileUrl,
          cvKey,
          docType: 'resume',
        }, { signal: req.signal });

        res.json({
          jobId,
          sessionId,
          atsScore,
          atsMetrics,
          jobTitle,
          originalTitle,
          designationMatch,
          missingSkills: missingSkills || [],
          jdMismatches,
          missingExperience,
          missingEducation,
          missingCertifications,
          missingLanguages,
        });
      } catch (err) {
        console.error('evaluation failed', err);
        next(createError(500, 'evaluation failed'));
      }
      }, PROCESS_TIMEOUT_MS)
    );
    app.post(
    '/api/process-cv',
    (req, res, next) => {
      req.jobId = crypto.randomUUID();
      const endUpload = startStep(req, 'uploads');
      uploadResume(req, res, (err) => {
        endUpload(err ? err.message : '');
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    withTimeout(async (req, res, next) => {
    const jobId = req.jobId;
    const s3 = new S3Client({ region: REGION });
    req.s3 = s3;
    let bucket;
    let secrets;
    try {
      secrets = await getSecrets();
      bucket =
        process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
    } catch (err) {
      console.error('failed to load configuration', err);
      return next(createError(500, 'failed to load configuration'));
    }
    req.bucket = bucket;
    let logKey;
    const logStep = async (event, { startTime, duration, message } = {}) => {
      const dur = duration ?? (Date.now() - startTime);
      const ts = new Date().toISOString();
      console.log(
        `[${ts}] [${jobId}] ${event} completed in ${dur}ms${
          message ? ' - ' + message : ''
        }`,
      );
      if (bucket && logKey) {
        try {
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event,
            message: `duration=${dur}ms${
              message ? '; ' + message : ''
            }`,
            signal: req.signal,
          });
        } catch (err) {
          console.error(`failed to log ${event}`, err);
        }
      }
    };

    let {
      jobDescriptionUrl,
      jobDescriptionText = '',
      linkedinProfileUrl,
      credlyProfileUrl,
      existingCvKey,
      existingCvTextKey,
      iteration,
      designation,
      addedSkills,
      selectedExperience,
      selectedEducation,
      selectedCertifications,
      selectedLanguages,
    } = req.body;
    let userSkills = [];
    try {
      if (Array.isArray(addedSkills)) {
        userSkills = addedSkills;
      } else if (typeof addedSkills === 'string') {
        userSkills = JSON.parse(addedSkills);
        if (!Array.isArray(userSkills)) userSkills = [];
      }
    } catch {
      userSkills = [];
    }
    const parseArrayField = (field) => {
      try {
        if (Array.isArray(field)) return field;
        if (typeof field === 'string') {
          const arr = JSON.parse(field);
          return Array.isArray(arr) ? arr : [];
        }
      } catch {}
      return [];
    };
    const selectedExperienceArr = parseArrayField(selectedExperience);
    const selectedEducationArr = parseArrayField(selectedEducation);
    const selectedCertificationsArr = parseArrayField(selectedCertifications);
    const selectedLanguagesArr = parseArrayField(selectedLanguages);
    iteration = parseInt(iteration) || 0;
    const maxIterations = parseInt(
      process.env.MAX_ITERATIONS || secrets.MAX_ITERATIONS || 0,
      10
    );
    if (maxIterations && iteration >= maxIterations)
      return next(createError(400, 'max improvements reached'));
    const ipAddress =
      (req.headers['x-forwarded-for'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0] || req.ip;
    const { userAgent, browser, os, device } = req;
    let defaultCvTemplate =
      req.body.template || req.query.template || '2025';
    if (!CV_TEMPLATES.includes(defaultCvTemplate)) defaultCvTemplate = '2025';
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
    let { template1, template2, coverTemplate1, coverTemplate2 } = selection;
    console.log(
      `Selected templates: template1=${template1}, template2=${template2}, coverTemplate1=${coverTemplate1}, coverTemplate2=${coverTemplate2}`
    );
    if (!req.file) {
      return next(createError(400, 'resume file required'));
    }
    if (!jobDescriptionUrl && !jobDescriptionText) {
      return next(
        createError(400, 'jobDescriptionUrl or jobDescriptionText required'),
      );
    }
    if (!linkedinProfileUrl) {
      return next(createError(400, 'linkedinProfileUrl required'));
    }
    if (jobDescriptionUrl) {
      jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
      if (!jobDescriptionUrl) {
        return next(createError(400, 'invalid jobDescriptionUrl'));
      }
    }
    linkedinProfileUrl = await validateUrl(linkedinProfileUrl);
    if (!linkedinProfileUrl) {
      return next(createError(400, 'invalid linkedinProfileUrl'));
    }
    if (credlyProfileUrl) {
      credlyProfileUrl = await validateUrl(credlyProfileUrl);
      if (!credlyProfileUrl) {
        return next(createError(400, 'invalid credlyProfileUrl'));
      }
    }

    let text,
      docType,
      applicantName,
      sanitizedName,
      ext,
      basePath,
      existingCvBuffer,
      originalText,
      originalTitle;
    try {
      originalText = await extractTextLogged(req, req.file);
      docType = await classifyDocument(originalText);
      if (docType && docType !== 'resume' && docType !== 'unknown') {
        return next(
          createError(
            400,
            `You have uploaded a ${docType}. Please upload a CV only.`
          )
        );
      }
      if (!docType || docType === 'unknown') {
        return next(
          createError(
            400,
            "The document type couldn't be recognized; please upload a CV."
          )
        );
      }
      const lines = originalText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      applicantName =
        req.body.applicantName || (await extractName(originalText));
      originalTitle = lines[1] || '';
      sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) {
        sanitizedName = 'candidate';
        applicantName = 'Candidate';
      }
      const sessionId = crypto.randomUUID();
      req.sessionId = sessionId;
      ext = path.extname(req.file.originalname).toLowerCase();
      const date = new Date().toISOString().split('T')[0];
      basePath = [sanitizedName, date, sessionId];
      const originalKey = buildS3Key(
        [...basePath, 'original'],
        req.file.originalname
      );
      existingCvKey = originalKey;
      logKey = buildS3Key([...basePath, 'logs'], 'processing.jsonl');
      req.logKey = logKey;
      text = null;
      if (existingCvTextKey) {
        try {
          const getStart = Date.now();
          const textObj = await s3.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: existingCvTextKey,
            }),
            { abortSignal: req.signal }
          );
          await logStep('s3_get_existing_cv_text', { startTime: getStart });
          text = await textObj.Body.transformToString();
        } catch (err) {
          console.error('failed to fetch existing CV text', err);
        }
      } else if (existingCvKey) {
        const getStart = Date.now();
        const existingObj = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: existingCvKey }),
          { abortSignal: req.signal }
        );
        await logStep('s3_get_existing_cv_pdf', { startTime: getStart });
        const arr = await existingObj.Body.transformToByteArray();
        existingCvBuffer = Buffer.from(arr);
        text = await extractTextLogged(req, {
          originalname: path.basename(existingCvKey),
          buffer: existingCvBuffer,
        });
      }
      if (!text) text = originalText;
    } catch (err) {
      console.error('Failed to extract text from PDF', err);
      return next(createError(500, 'Failed to extract text from PDF'));
    }

    // Store raw file to configured bucket
    const initialS3 = new S3Client({ region: REGION });
    try {
      const endInitialUpload = startStep(req, 'uploads');
      await initialS3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: existingCvKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
        { abortSignal: req.signal }
      );
      await endInitialUpload();
    } catch (e) {
      console.error(`initial upload to bucket ${bucket} failed`, e);
      const message = e.message || 'initial S3 upload failed';
      try {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'initial_upload_failed',
          level: 'error',
          message: `Failed to upload to bucket ${bucket}: ${message}`,
          signal: req.signal,
        });
      } catch (logErr) {
        console.error('failed to log initial upload error', logErr);
      }
      return next(
        createError(
          500,
          `Initial S3 upload to bucket ${bucket} failed: ${message}`
        )
      );
    }

    try {
      try {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'request_received',
          message: `jobDescriptionUrl=${jobDescriptionUrl}; linkedinProfileUrl=${linkedinProfileUrl}; credlyProfileUrl=${credlyProfileUrl || ''}`,
          signal: req.signal,
        });
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'selected_templates',
          message: `template1=${template1}; template2=${template2}`,
          signal: req.signal,
        });
      } catch (err) {
        console.error('initial logging failed', err);
      }

      let jobDescriptionHtml;
      const endJdFetch = startStep(req, 'job_description_fetch');
      if (jobDescriptionUrl) {
        try {
          jobDescriptionHtml = await withRetry(
            () =>
              fetchJobDescription(jobDescriptionUrl, {
                timeout: REQUEST_TIMEOUT_MS,
                userAgent,
                signal: req.signal,
                jobId,
              }),
            2,
            500,
            req.signal,
          );
          await endJdFetch();
        } catch (err) {
          await endJdFetch(err.code || err.message);
          if (err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText) {
            jobDescriptionHtml = jobDescriptionText;
          } else if (err.code === LINKEDIN_AUTH_REQUIRED) {
            return res.status(403).json({
              error:
                'LinkedIn job descriptions require authentication. Please paste the job description text directly.',
              code: LINKEDIN_AUTH_REQUIRED,
            });
          } else {
            console.error('Job description fetch failed', err);
            return next(createError(500, 'Job description fetch failed'));
          }
        }
      } else {
        jobDescriptionHtml = jobDescriptionText;
        await endJdFetch('job_description_text');
      }
      let { title: jobTitle, skills: jobSkills, text: jobDescription } =
        await analyzeJobDescription(jobDescriptionHtml);
      if (designation) {
        jobTitle = designation;
      }
      // Original skills and score can be computed here if needed in future

      let linkedinData = {};
      try {
        linkedinData = await withRetry(
          () => fetchLinkedInProfile(linkedinProfileUrl, req.signal),
          2,
          500,
          req.signal
        );
        const hasContent = Object.values(linkedinData).some((v) =>
          Array.isArray(v) ? v.length > 0 : v
        );
        if (!hasContent) linkedinData = {};
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'fetched_linkedin_profile',
          signal: req.signal,
        });
      } catch (err) {
        console.error(
          'LinkedIn profile fetch failed',
          err.message,
          err.status
        );
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'linkedin_profile_fetch_failed',
          level: 'error',
          message: err.message + (err.status ? ` (status ${err.status})` : ''),
          signal: req.signal,
        });
      }
      linkedinData.experience = selectedExperienceArr;
      linkedinData.education = selectedEducationArr;
      linkedinData.languages = selectedLanguagesArr;

      let credlyCertifications = selectedCertificationsArr;
      if (!credlyCertifications.length && credlyProfileUrl) {
        try {
          credlyCertifications = await withRetry(
            () => fetchCredlyProfile(credlyProfileUrl, req.signal),
            2,
            500,
            req.signal
          );
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'fetched_credly_profile',
            signal: req.signal,
          });
        } catch (err) {
          console.error('Credly profile fetch failed', err);
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'credly_profile_fetch_failed',
            level: 'error',
            message: err.message,
            signal: req.signal,
          });
        }
      }

      const resumeExperience = extractExperience(text);
      const linkedinExperience = extractExperience(linkedinData.experience || []);
      const resumeEducation = extractEducation(text);
      const linkedinEducation = extractEducation(linkedinData.education || []);
      const resumeCertifications = extractCertifications(text);
      const resumeLanguages = extractLanguages(text);
      const linkedinLanguages = extractLanguages(linkedinData.languages || []);

      const parsedResume = parseContent(text, { skipRequiredSections: true });
      const resumeProjects = parsedResume.sections
        .filter(
          (sec) => sec.heading && sec.heading.toLowerCase() === 'projects'
        )
        .flatMap((sec) =>
          sec.items.map((tokens) =>
            tokens.map((t) => t.text || '').join('').trim()
          )
        )
        .filter(Boolean);

      const sections = collectSectionText(text, linkedinData, credlyCertifications);
      const improvedSections = await improveSections(
        sections,
        jobDescription,
        req.signal
      );
      if (jobTitle) {
        const lines = (improvedSections.experience || '').split('\n');
        const idx = lines.findIndex((l) => l.trim());
        if (idx !== -1) {
          const line = lines[idx];
          const atIdx = line.toLowerCase().indexOf(' at ');
          lines[idx] = atIdx !== -1 ? `${jobTitle}${line.slice(atIdx)}` : jobTitle;
          improvedSections.experience = lines.join('\n');
        }
      }
      const resumeSkills = extractResumeSkills(text);
      let projectSummary = '';
      const endSummary = startStep(req, 'summary_generation');
      try {
        projectSummary = await generateProjectSummary(
          jobDescription,
          resumeSkills,
          jobSkills,
          generativeModel
        );
        await endSummary();
      } catch (err) {
        await endSummary(err.message);
      }
      let improvedCv = [
        sanitizedName,
        '# Summary',
        improvedSections.summary,
        '# Experience',
        improvedSections.experience,
        '# Education',
        improvedSections.education,
        '# Certifications',
        improvedSections.certifications,
      ].join('\n\n');
      if (improvedSections.projects?.trim() || projectSummary) {
        const projectLines = [];
        if (improvedSections.projects?.trim()) {
          projectLines.push(improvedSections.projects.trim());
        }
        if (projectSummary) {
          projectLines.push(`- ${projectSummary}`);
        }
        improvedCv += `\n\n# Projects\n${projectLines.join('\n')}`;
      }
      if (userSkills.length) {
        const skillLines = userSkills
          .map((s) => {
            if (typeof s === 'string') return s;
            const { name, icon, level } = s || {};
            return [name, icon, level].filter(Boolean).join(' | ');
          })
          .filter(Boolean)
          .join('\n');
        improvedCv += `\n\n# Skills\n${skillLines}`;
      }
      if (sections.languages?.length) {
        const langLines = sections.languages
          .map((l) =>
            l.proficiency ? `${l.language} - ${l.proficiency}` : l.language
          )
          .join('\n');
        if (langLines) {
          improvedCv += `\n\n# Languages\n${langLines}`;
        }
      }
      const improvedProjectLines = [];
      if (improvedSections.projects?.trim()) {
        improvedProjectLines.push(
          ...improvedSections.projects
            .split(/\n+/)
            .map((l) => l.replace(/^[-*]\s+/, '').trim())
            .filter(Boolean),
        );
      }
      if (projectSummary) improvedProjectLines.push(projectSummary);
      const addedProjects = improvedProjectLines.filter(
        (p) => !resumeProjects.some((r) => r.toLowerCase() === p.toLowerCase())
      );

      const fmtCert = (c = {}) =>
        (c.provider ? `${c.name} - ${c.provider}` : c.name || '').trim();
      const resumeCertSet = new Set(resumeCertifications.map(fmtCert));
      const addedCertifications = [
        ...((linkedinData.certifications || []).map(fmtCert)),
        ...((credlyCertifications || []).map(fmtCert)),
      ].filter((c) => c && !resumeCertSet.has(c));
      const originalMatch = calculateMatchScore(jobSkills, resumeSkills);
      const enhancedMatch = calculateMatchScore(
        jobSkills,
        extractResumeSkills(improvedCv)
      );
      const addedSkills = enhancedMatch.table
        .filter((r) =>
          r.matched &&
          originalMatch.table.some((o) => o.skill === r.skill && !o.matched)
        )
        .map((r) => r.skill);
      const missingSkills = enhancedMatch.newSkills;
      const originalScore = originalMatch.score;
      const enhancedScore = enhancedMatch.score;
      const { table: atsMetrics, improved: atsImproved } = compareMetrics(
        text,
        improvedCv
      );
      const atsScore = Math.round(
        Object.values(atsImproved).reduce((sum, v) => sum + v, 0) /
          Math.max(Object.keys(atsImproved).length, 1)
      );
      const chanceOfSelection = Math.round(
        (enhancedScore + atsScore) / 2
      );
      const endPdfGen = startStep(req, 'pdf_generation');
      let improvedPdf;
      try {
        improvedPdf = await generatePdf(
          improvedCv,
          '2025',
          {},
          generativeModel,
        );
        await endPdfGen();
      } catch (err) {
        await endPdfGen(err.message);
        throw err;
      }
      const ts = Date.now();
      const key = buildS3Key(
        [...basePath, 'generated'],
        `${ts}-improved.pdf`
      );
      const textKey = buildS3Key(
        [...basePath, 'generated'],
        `${ts}-improved.txt`
      );
      const endPdfUpload = startStep(req, 'uploads');
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: improvedPdf,
            ContentType: 'application/pdf',
          }),
          { abortSignal: req.signal }
        );
        await endPdfUpload();
      } catch (err) {
        await endPdfUpload(err.message);
        throw err;
      }
      const endTextUpload = startStep(req, 'uploads');
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: textKey,
            Body: improvedCv,
            ContentType: 'text/plain',
          }),
          { abortSignal: req.signal }
        );
        await endTextUpload();
      } catch (err) {
        await endTextUpload(err.message);
        throw err;
      }
      const cvUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );
      iteration += 1;
      return res.json({
        jobId,
        sessionId,
        applicantName,
        sections: improvedSections,
        cv: improvedCv,
        metrics: atsMetrics,
        table: enhancedMatch.table,
        addedSkills,
        addedProjects,
        addedCertifications,
        missingSkills,
        originalScore,
        enhancedScore,
        originalTitle,
        modifiedTitle: jobTitle,
        chanceOfSelection,
        existingCvKey: key,
        iteration,
        bestCvKey: key,
        cvTextKey: textKey,
        urls: [
          {
            type: 'cv',
            url: cvUrl,
            expiresAt: Date.now() + 3600 * 1000,
          },
        ],
      });

    } catch (err) {
      console.error('processing failed', err);
      if (bucket) {
        try {
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'error',
            level: 'error',
            message: err.message,
            signal: req.signal,
          });
        } catch (e) {
          console.error('failed to log error', e);
        }
      }
      if (err.code === 'AI_TIMEOUT') {
        return next(
          createError(504, 'The AI service took too long to respond. Please try again later.')
        );
      }
        return next(createError(500, 'processing failed'));
      }
      }, PROCESS_TIMEOUT_MS));

  app.post(
    '/api/fix-metric',
    (req, res, next) => {
      uploadResume(req, res, (err) => {
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    async (req, res, next) => {
      try {
        let { metric, jobDescriptionUrl, jobDescriptionText = '' } = req.body;
        if (!req.file) return next(createError(400, 'resume file required'));
        if (!metric) return next(createError(400, 'metric required'));
        if (!jobDescriptionUrl && !jobDescriptionText)
          return next(
            createError(
              400,
              'jobDescriptionUrl or jobDescriptionText required',
            ),
          );
        if (jobDescriptionUrl) {
          jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
          if (!jobDescriptionUrl)
            return next(createError(400, 'invalid jobDescriptionUrl'));
        }
        const { userAgent } = req;
        let jobDescription = jobDescriptionText;
        if (jobDescriptionUrl) {
          try {
            jobDescription = await fetchJobDescription(jobDescriptionUrl, {
              timeout: REQUEST_TIMEOUT_MS,
              userAgent,
              signal: req.signal,
              jobId: req.jobId,
            });
          } catch (err) {
            if (!(err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText)) {
              return next(createError(400, 'invalid jobDescriptionUrl'));
            }
          }
        }
        const resumeText = await extractTextLogged(req, req.file);
        const suggestion = await requestSectionImprovement(
          {
            sectionName: metric,
            sectionText: resumeText,
            jobDescription,
          },
          { signal: req.signal }
        );
        res.json({ suggestion });
      } catch (err) {
        console.error('fix metric failed', err);
        if (err.code === 'AI_TIMEOUT') {
          return next(
            createError(504, 'The AI service took too long to respond. Please try again later.')
          );
        }
        next(createError(500, 'failed to fix metric'));
      }
    }
  );

  app.post(
    '/api/fix-gap',
    (req, res, next) => {
      if (req.is('multipart/form-data')) {
        uploadResume(req, res, (err) => {
          if (err) return next(createError(400, err.message));
          next();
        });
      } else {
        next();
      }
    },
    async (req, res, next) => {
      try {
        let { jobDescriptionUrl, jobDescriptionText = '', gap } = req.body || {};
        if (gap) {
          if (!jobDescriptionUrl && !jobDescriptionText)
            return next(
              createError(
                400,
                'jobDescriptionUrl or jobDescriptionText required',
              ),
            );
          if (jobDescriptionUrl) {
            jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
            if (!jobDescriptionUrl)
              return next(createError(400, 'invalid jobDescriptionUrl'));
          }
          const { userAgent } = req;
          let jobDescriptionHtml = jobDescriptionText;
          if (jobDescriptionUrl) {
            try {
              jobDescriptionHtml = await fetchJobDescription(jobDescriptionUrl, {
                timeout: REQUEST_TIMEOUT_MS,
                userAgent,
                signal: req.signal,
                jobId: req.jobId,
              });
            } catch (err) {
              if (!(err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText)) {
                return next(createError(400, 'invalid jobDescriptionUrl'));
              }
            }
          }
          const { text: jobDescription } = await analyzeJobDescription(
            jobDescriptionHtml,
          );
          const suggestion = await requestSectionImprovement(
            {
              sectionName: 'gap',
              sectionText: gap,
              jobDescription,
            },
            { signal: req.signal }
          );
          return res.json({ suggestion });
        }

        if (!req.file) return next(createError(400, 'resume file required'));
        if (!jobDescriptionUrl && !jobDescriptionText)
          return next(
            createError(400, 'jobDescriptionUrl or jobDescriptionText required'),
          );
        if (jobDescriptionUrl) {
          jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
          if (!jobDescriptionUrl)
            return next(createError(400, 'invalid jobDescriptionUrl'));
        }
        const { userAgent } = req;
        let jobDescriptionHtml = jobDescriptionText;
        if (jobDescriptionUrl) {
          try {
            jobDescriptionHtml = await fetchJobDescription(jobDescriptionUrl, {
              timeout: REQUEST_TIMEOUT_MS,
              userAgent,
              signal: req.signal,
              jobId: req.jobId,
            });
          } catch (err) {
            if (!(err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText)) {
              return next(createError(400, 'invalid jobDescriptionUrl'));
            }
          }
        }
        const { skills: jobSkills, text: jobDescription } =
          await analyzeJobDescription(jobDescriptionHtml);
        const resumeText = await extractTextLogged(req, req.file);
        const gaps = computeJdMismatches(
          resumeText,
          jobDescriptionHtml,
          jobSkills
        );
        let suggestion = '';
        if (gaps.length) {
          suggestion = await requestSectionImprovement(
            {
              sectionName: 'gap analysis',
              sectionText: gaps.join('\n'),
              jobDescription,
            },
            { signal: req.signal }
          );
        }
        res.json({ suggestion, gaps });
      } catch (err) {
        console.error('fix gap failed', err);
        if (err.code === 'AI_TIMEOUT') {
          return next(
            createError(
              504,
              'The AI service took too long to respond. Please try again later.'
            )
          );
        }
        next(createError(500, 'failed to fix gap'));
      }
    }
  );

  app.post('/api/improve-metric', async (req, res, next) => {
    const jobId = crypto.randomUUID();
    const s3 = new S3Client({ region: REGION });
    let bucket;
    let secrets;
    try {
      secrets = await getSecrets();
      bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
    } catch (err) {
      console.error('failed to load configuration', err);
      return next(createError(500, 'failed to load configuration'));
    }

    let {
      metric,
      jobDescriptionUrl,
      jobDescriptionText = '',
      linkedinProfileUrl,
      credlyProfileUrl,
      existingCvKey,
      existingCvTextKey,
      iteration,
    } = req.body;
    iteration = parseInt(iteration) || 0;
    const maxIterations = parseInt(
      process.env.MAX_ITERATIONS || secrets.MAX_ITERATIONS || 0,
      10
    );
    if (maxIterations && iteration >= maxIterations)
      return next(createError(400, 'max improvements reached'));
    if (!metric) return next(createError(400, 'metric required'));
    if (!jobDescriptionUrl && !jobDescriptionText)
      return next(
        createError(400, 'jobDescriptionUrl or jobDescriptionText required'),
      );
    if (!linkedinProfileUrl)
      return next(createError(400, 'linkedinProfileUrl required'));
    if (!existingCvKey && !existingCvTextKey)
      return next(
        createError(400, 'existingCvKey or existingCvTextKey required')
      );

    if (jobDescriptionUrl) {
      jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
      if (!jobDescriptionUrl)
        return next(createError(400, 'invalid jobDescriptionUrl'));
    }
    linkedinProfileUrl = await validateUrl(linkedinProfileUrl);
    if (!linkedinProfileUrl)
      return next(createError(400, 'invalid linkedinProfileUrl'));
    if (credlyProfileUrl) {
      credlyProfileUrl = await validateUrl(credlyProfileUrl);
      if (!credlyProfileUrl)
        return next(createError(400, 'invalid credlyProfileUrl'));
    }

    let existingCvBuffer;
    let originalText;
    try {
      if (existingCvTextKey) {
        const textObj = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: existingCvTextKey }),
          { abortSignal: req.signal }
        );
        originalText = await textObj.Body.transformToString();
        existingCvBuffer = await convertToPdfLogged(req, originalText);
      } else if (existingCvKey) {
        const obj = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: existingCvKey }),
          { abortSignal: req.signal }
        );
        const chunks = [];
        for await (const chunk of obj.Body) chunks.push(chunk);
        existingCvBuffer = Buffer.concat(chunks);
        originalText = await extractTextLogged(req, {
          originalname: path.basename(existingCvKey),
          buffer: existingCvBuffer,
        });
      }
      let applicantName =
        req.body.applicantName || (await extractName(originalText));
      let sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) {
        sanitizedName = 'candidate';
        applicantName = 'Candidate';
      }

      let jobDescription = jobDescriptionText;
      let jobTitle = '';
      if (jobDescriptionUrl) {
        try {
          ({ jobDescription, jobTitle } = await analyzeJobDescription(
            jobDescriptionUrl,
          ));
        } catch (err) {
          if (err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText) {
            ({ jobDescription, jobTitle } = await analyzeJobDescription(
              jobDescriptionText,
            ));
          } else {
            return next(createError(400, 'invalid jobDescriptionUrl'));
          }
        }
      } else if (jobDescriptionText) {
        ({ jobDescription, jobTitle } = await analyzeJobDescription(
          jobDescriptionText,
        ));
      }

      let linkedinData = {};
      try {
        linkedinData = await fetchLinkedInProfile(linkedinProfileUrl, req.signal);
        linkedinData.languages = selectedLanguagesArr;
      } catch {}

      let credlyCertifications = [];
      if (credlyProfileUrl) {
        try {
          credlyCertifications = await fetchCredlyProfile(
            credlyProfileUrl,
            req.signal
          );
        } catch {}
      }

      const cvFile = await openaiUploadFile(
        existingCvBuffer,
        'cv.pdf',
        'assistants',
        { signal: req.signal }
      );
      const jdBuffer = await convertToPdfLogged(req, jobDescription);
      const jdFile = await openaiUploadFile(
        jdBuffer,
        'job.pdf',
        'assistants',
        { signal: req.signal }
      );
      let liFile;
      if (Object.keys(linkedinData).length) {
        const liBuffer = await convertToPdfLogged(req, linkedinData);
        liFile = await openaiUploadFile(
          liBuffer,
          'linkedin.pdf',
          'assistants',
          { signal: req.signal }
        );
      }
      let credlyFile;
      if (credlyCertifications.length) {
        const credlyBuffer = await convertToPdfLogged(req, credlyCertifications);
        credlyFile = await openaiUploadFile(
          credlyBuffer,
          'credly.pdf',
          'assistants',
          { signal: req.signal }
        );
      }

      const instructions =
        `You are an expert resume writer and career coach. Focus on improving the ${metric} metric in the resume. Modify the last job title to match '${jobTitle}' if different. Use the provided resume, job description, and optional LinkedIn or Credly data to create two improved resume versions and two tailored cover letters. Return a JSON object with keys cv_version1, cv_version2, cover_letter1, cover_letter2, original_score, enhanced_score, skills_added, languages, improvement_summary, metrics.`;

      const responseText = await requestEnhancedCV(
        {
          cvFileId: cvFile.id,
          jobDescFileId: jdFile.id,
          linkedInFileId: liFile?.id,
          credlyFileId: credlyFile?.id,
          instructions,
        },
        { signal: req.signal }
      );

      const parsed = parseAiJson(responseText);
      let cvVersion1 = '';
      let cvVersion2 = '';
      if (parsed) {
        cvVersion1 = sanitizeGeneratedText(parsed.cv_version1, { jobTitle });
        cvVersion2 = sanitizeGeneratedText(parsed.cv_version2, { jobTitle });
      }

      const metrics1 = compareMetrics(originalText, cvVersion1);
      const metrics2 = compareMetrics(originalText, cvVersion2);
      const avg1 =
        Object.values(metrics1.improved).reduce((a, b) => a + b, 0) /
        Math.max(Object.keys(metrics1.improved).length, 1);
      const avg2 =
        Object.values(metrics2.improved).reduce((a, b) => a + b, 0) /
        Math.max(Object.keys(metrics2.improved).length, 1);

      const ts = Date.now();
      const date = new Date().toISOString().split('T')[0];

      let bestCv = cvVersion1;
      let metricTable = metrics1.table;
      if (avg2 > avg1) {
        bestCv = cvVersion2;
        metricTable = metrics2.table;
      }
      const endPdfGen = startStep(req, 'pdf_generation');
      let pdf;
      try {
        pdf = await generatePdf(bestCv, '2025', {}, generativeModel);
        await endPdfGen();
      } catch (err) {
        await endPdfGen(err.message);
        throw err;
      }
      const key = buildS3Key(
        [sanitizedName, 'enhanced', date],
        `${ts}-improved.pdf`
      );
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: pdf,
          ContentType: 'application/pdf',
        }),
        { abortSignal: req.signal }
      );
      const textKey = buildS3Key(
        [sanitizedName, 'enhanced', date],
        `${ts}-improved.txt`
      );
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: textKey,
          Body: bestCv,
          ContentType: 'text/plain',
        }),
        { abortSignal: req.signal }
      );
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );

      iteration += 1;
      res.json({
        iteration,
        url,
        metrics: metricTable,
        cvKey: key,
        textKey,
        designation: jobTitle || '',
      });
    } catch (err) {
      console.error('metric improvement failed', err);
      if (err.code === 'AI_TIMEOUT') {
        return next(
          createError(504, 'The AI service took too long to respond. Please try again later.')
        );
      }
      next(createError(500, 'failed to improve metric'));
    }
  });

  app.post(
    '/api/generate-cover-letter',
    (req, res, next) => {
      req.jobId = crypto.randomUUID();
      const endUpload = startStep(req, 'uploads');
      uploadResume(req, res, (err) => {
        endUpload(err ? err.message : '');
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    async (req, res, next) => {
      const jobId = req.jobId;
      const s3 = new S3Client({ region: REGION });
      req.s3 = s3;
      let bucket;
      let secrets;
      let logKey;
      try {
        secrets = await getSecrets();
        bucket =
          process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
      } catch (err) {
        console.error('failed to load configuration', err);
        return next(createError(500, 'failed to load configuration'));
      }
      req.bucket = bucket;
      const logStep = async (event, { startTime, duration, message } = {}) => {
        const dur = duration ?? (Date.now() - startTime);
        const msg = `${event} completed in ${dur}ms${message ? ' - ' + message : ''}`;
        console.log(`[${new Date().toISOString()}] ${msg}`);
        if (bucket && logKey) {
          try {
            await logEvent({
              s3,
              bucket,
              key: logKey,
              jobId,
              event,
              message: `duration=${dur}ms${message ? '; ' + message : ''}`,
              signal: req.signal,
            });
          } catch (err) {
            console.error(`failed to log ${event}`, err);
          }
        }
      };

      let {
        jobDescriptionUrl,
        jobDescriptionText = '',
        linkedinProfileUrl,
        credlyProfileUrl,
        existingCvTextKey,
        selectedCertifications,
        coverTemplate,
      } = req.body;

      if (!jobDescriptionUrl && !jobDescriptionText)
        return next(
          createError(400, 'jobDescriptionUrl or jobDescriptionText required'),
        );
      if (!linkedinProfileUrl)
        return next(createError(400, 'linkedinProfileUrl required'));

      if (jobDescriptionUrl) {
        jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
        if (!jobDescriptionUrl)
          return next(createError(400, 'invalid jobDescriptionUrl'));
      }
      linkedinProfileUrl = await validateUrl(linkedinProfileUrl);
      if (!linkedinProfileUrl)
        return next(createError(400, 'invalid linkedinProfileUrl'));
      if (credlyProfileUrl) {
        credlyProfileUrl = await validateUrl(credlyProfileUrl);
        if (!credlyProfileUrl)
          return next(createError(400, 'invalid credlyProfileUrl'));
      }

      let selectedCertificationsArr = [];
      try {
        if (Array.isArray(selectedCertifications))
          selectedCertificationsArr = selectedCertifications;
        else if (typeof selectedCertifications === 'string') {
          const arr = JSON.parse(selectedCertifications);
          if (Array.isArray(arr)) selectedCertificationsArr = arr;
        }
      } catch {}

      let coverTemplateId = coverTemplate;
      if (!CL_TEMPLATES.includes(coverTemplateId))
        coverTemplateId = CL_TEMPLATES[0];

      let originalText = '';
      let cvBuffer;
      try {
        if (existingCvTextKey) {
          const getStart = Date.now();
          const textObj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: existingCvTextKey }),
            { abortSignal: req.signal }
          );
          await logStep('s3_get_existing_cv_text', { startTime: getStart });
          originalText = await textObj.Body.transformToString();
        } else if (req.file) {
          originalText = await extractTextLogged(req, req.file);
        } else {
          return next(
            createError(400, 'resume or existingCvTextKey required')
          );
        }
        cvBuffer = await convertToPdfLogged(req, originalText);
      } catch (err) {
        console.error('failed to process cv', err);
        return next(createError(500, 'failed to process cv'));
      }

      let applicantName =
        req.body.applicantName || (await extractName(originalText));
      let sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) {
        sanitizedName = 'candidate';
        applicantName = 'Candidate';
      }
      const logDate = new Date().toISOString().split('T')[0];
      const prefix = `${sanitizedName}/cover/${logDate}/`;
      logKey = `${prefix}logs/processing.jsonl`;
      req.logKey = logKey;

      let jobDescription = jobDescriptionText;
      const endJd3 = startStep(req, 'job_description_fetch');
      if (jobDescriptionUrl) {
        try {
          ({ jobDescription } = await analyzeJobDescription(jobDescriptionUrl));
          await endJd3();
        } catch (err) {
          await endJd3(err.code || err.message);
          if (err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText) {
            ({ jobDescription } = await analyzeJobDescription(jobDescriptionText));
          } else {
            return next(createError(400, 'invalid jobDescriptionUrl'));
          }
        }
      } else {
        await endJd3('job_description_text');
      }

      let linkedinData = {};
      try {
        linkedinData = await fetchLinkedInProfile(linkedinProfileUrl, req.signal);
      } catch {}

      let credlyCertifications = selectedCertificationsArr;
      if (!credlyCertifications.length && credlyProfileUrl) {
        try {
          credlyCertifications = await fetchCredlyProfile(
            credlyProfileUrl,
            req.signal
          );
        } catch {}
      }

      const cvFile = await openaiUploadFile(
        cvBuffer,
        'cv.pdf',
        'assistants',
        { signal: req.signal }
      );
      const jdBuffer = await convertToPdfLogged(req, jobDescription);
      const jdFile = await openaiUploadFile(
        jdBuffer,
        'job.pdf',
        'assistants',
        { signal: req.signal }
      );
      let liFile;
      if (Object.keys(linkedinData).length) {
        const liBuffer = await convertToPdfLogged(req, linkedinData);
        liFile = await openaiUploadFile(
          liBuffer,
          'linkedin.pdf',
          'assistants',
          { signal: req.signal }
        );
      }
      let credlyFile;
      if (credlyCertifications.length) {
        const credlyBuffer = await convertToPdfLogged(req, credlyCertifications);
        credlyFile = await openaiUploadFile(
          credlyBuffer,
          'credly.pdf',
          'assistants',
          { signal: req.signal }
        );
      }

      let coverLetterText;
      try {
        coverLetterText = await requestCoverLetter(
          {
            cvFileId: cvFile.id,
            jobDescFileId: jdFile.id,
            linkedInFileId: liFile?.id,
            credlyFileId: credlyFile?.id,
          },
          { signal: req.signal }
        );
      } catch (err) {
        if (err.code === 'AI_TIMEOUT') {
          console.error('cover letter generation timed out', err);
          return next(
            createError(504, 'The AI service took too long to respond. Please try again later.')
          );
        }
        console.error('cover letter generation failed', err);
        return next(createError(500, 'cover letter generation failed'));
      }

      const sanitizedCoverLetter = sanitizeGeneratedText(coverLetterText, {
        skipRequiredSections: true,
        defaultHeading: '',
      });

      const endCoverPdfGen = startStep(req, 'pdf_generation');
      const clPdf = await generatePdf(
        sanitizedCoverLetter,
        coverTemplateId,
        {
          skipRequiredSections: true,
          defaultHeading: '',
        },
        generativeModel,
      );
      await endCoverPdfGen();
      const date = new Date().toISOString().split('T')[0];
      const key = buildS3Key(
        [sanitizedName, 'enhanced', date],
        `${Date.now()}-cover_letter.pdf`
      );
      const endCoverUpload = startStep(req, 'uploads');
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: clPdf,
          ContentType: 'application/pdf',
        }),
        { abortSignal: req.signal }
      );
      await endCoverUpload();
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );

      res.json({
        url,
        expiresAt: Date.now() + 3600 * 1000,
      });
    }
  );

  app.post(
    '/api/compile',
    (req, res, next) => {
      uploadResume(req, res, (err) => {
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    async (req, res, next) => {
      const jobId = crypto.randomUUID();
      const s3 = new S3Client({ region: REGION });
      let bucket;
      let secrets;
      try {
        secrets = await getSecrets();
        bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
      } catch (err) {
        console.error('failed to load configuration', err);
        return next(createError(500, 'failed to load configuration'));
      }

      let {
        jobDescriptionUrl,
        jobDescriptionText = '',
        linkedinProfileUrl,
        credlyProfileUrl,
        existingCvKey,
        existingCvTextKey,
        originalScore,
        selectedCertifications,
        selectedExperience,
        selectedEducation,
        addedSkills,
        designation,
        selectedLanguages,
      } = req.body;

      if (!jobDescriptionUrl && !jobDescriptionText)
        return next(
          createError(400, 'jobDescriptionUrl or jobDescriptionText required'),
        );
      if (!linkedinProfileUrl)
        return next(createError(400, 'linkedinProfileUrl required'));
      if (!existingCvKey && !existingCvTextKey)
        return next(
          createError(400, 'existingCvKey or existingCvTextKey required'),
        );

      if (jobDescriptionUrl) {
        jobDescriptionUrl = await validateUrl(jobDescriptionUrl);
        if (!jobDescriptionUrl)
          return next(createError(400, 'invalid jobDescriptionUrl'));
      }
      linkedinProfileUrl = await validateUrl(linkedinProfileUrl);
      if (!linkedinProfileUrl)
        return next(createError(400, 'invalid linkedinProfileUrl'));
      if (credlyProfileUrl) {
        credlyProfileUrl = await validateUrl(credlyProfileUrl);
        if (!credlyProfileUrl)
          return next(createError(400, 'invalid credlyProfileUrl'));
      }

      const parseArray = (field) => {
        try {
          if (Array.isArray(field)) return field;
          if (typeof field === 'string') {
            const arr = JSON.parse(field);
            return Array.isArray(arr) ? arr : [];
          }
        } catch {}
        return [];
      };

      const addedSkillsArr = parseArray(addedSkills);
      const selectedExperienceArr = parseArray(selectedExperience);
      const selectedEducationArr = parseArray(selectedEducation);
      let selectedCertificationsArr = parseArray(selectedCertifications);
      const selectedLanguagesArr = parseArray(selectedLanguages);

      let cvBuffer;
      let cvText;
      try {
        if (existingCvTextKey) {
          const textObj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: existingCvTextKey }),
            { abortSignal: req.signal }
          );
          cvText = await textObj.Body.transformToString();
          const endPdfGen = startStep(req, 'pdf_generation');
          try {
            cvBuffer = await generatePdf(cvText, '2025', {}, generativeModel);
            await endPdfGen();
          } catch (err) {
            await endPdfGen(err.message);
            throw err;
          }
        } else if (existingCvKey) {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: existingCvKey }),
            { abortSignal: req.signal }
          );
          const chunks = [];
          for await (const chunk of obj.Body) chunks.push(chunk);
          cvBuffer = Buffer.concat(chunks);
          cvText = await extractTextLogged(req, {
            originalname: path.basename(existingCvKey),
            buffer: cvBuffer,
          });
        }
      } catch (err) {
        console.error('failed to load cv', err);
        return next(createError(500, 'failed to load cv'));
      }

      let applicantName =
        req.body.applicantName || (await extractName(cvText));
      let sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) {
        sanitizedName = 'candidate';
        applicantName = 'Candidate';
      }
      const date = new Date().toISOString().split('T')[0];

      if (!existingCvKey) {
        existingCvKey = buildS3Key(
          [sanitizedName, 'enhanced', date],
          `${Date.now()}-final_cv.pdf`
        );
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: existingCvKey,
            Body: cvBuffer,
            ContentType: 'application/pdf',
          }),
          { abortSignal: req.signal }
        );
      }

      if (!existingCvTextKey) {
        existingCvTextKey = buildS3Key(
          [sanitizedName, 'enhanced', date],
          `${Date.now()}-final_cv.txt`
        );
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: existingCvTextKey,
            Body: cvText,
            ContentType: 'text/plain',
          }),
          { abortSignal: req.signal }
        );
      }

      const { userAgent } = req;
      let jobDescriptionHtml = jobDescriptionText;
      let jobDescription = jobDescriptionText;
      let jobSkills = [];
      const endJd2 = startStep(req, 'job_description_fetch');
      if (jobDescriptionUrl) {
        try {
          jobDescriptionHtml = await fetchJobDescription(jobDescriptionUrl, {
            timeout: REQUEST_TIMEOUT_MS,
            userAgent,
            signal: req.signal,
            jobId,
          });
          ({ skills: jobSkills, text: jobDescription } = await analyzeJobDescription(
            jobDescriptionHtml,
          ));
          await endJd2();
        } catch (err) {
          await endJd2(err.code || err.message);
          if (err.code === LINKEDIN_AUTH_REQUIRED && jobDescriptionText) {
            ({ skills: jobSkills, text: jobDescription } = await analyzeJobDescription(
              jobDescriptionText,
            ));
          } else if (jobDescriptionText) {
            ({ skills: jobSkills, text: jobDescription } = await analyzeJobDescription(
              jobDescriptionText,
            ));
          } else {
            return next(createError(400, 'invalid jobDescriptionUrl'));
          }
        }
      } else {
        ({ skills: jobSkills, text: jobDescription } = await analyzeJobDescription(
          jobDescriptionText,
        ));
        await endJd2('job_description_text');
      }

      let linkedinData = {};
      try {
        linkedinData = await fetchLinkedInProfile(linkedinProfileUrl, req.signal);
        linkedinData.languages = selectedLanguagesArr;
      } catch {}

      let credlyCertifications = selectedCertificationsArr;
      if (!credlyCertifications.length && credlyProfileUrl) {
        try {
          credlyCertifications = await fetchCredlyProfile(
            credlyProfileUrl,
            req.signal
          );
        } catch {}
      }

      const cvFile = await openaiUploadFile(
        cvBuffer,
        'cv.pdf',
        'assistants',
        { signal: req.signal }
      );
      const jdBuffer = await convertToPdfLogged(req, jobDescription);
      const jdFile = await openaiUploadFile(
        jdBuffer,
        'job.pdf',
        'assistants',
        { signal: req.signal }
      );
      let liFile;
      if (Object.keys(linkedinData).length) {
        const liBuffer = await convertToPdfLogged(req, linkedinData);
        liFile = await openaiUploadFile(
          liBuffer,
          'linkedin.pdf',
          'assistants',
          { signal: req.signal }
        );
      }
      let credlyFile;
      if (credlyCertifications.length) {
        const credlyBuffer = await convertToPdfLogged(req, credlyCertifications);
        credlyFile = await openaiUploadFile(
          credlyBuffer,
          'credly.pdf',
          'assistants',
          { signal: req.signal }
        );
      }

      let coverLetterText;
      try {
        coverLetterText = await requestCoverLetter(
          {
            cvFileId: cvFile.id,
            jobDescFileId: jdFile.id,
            linkedInFileId: liFile?.id,
            credlyFileId: credlyFile?.id,
          },
          { signal: req.signal }
        );
      } catch (err) {
        if (err.code === 'AI_TIMEOUT') {
          console.error('cover letter generation timed out', err);
          return next(
            createError(504, 'The AI service took too long to respond. Please try again later.')
          );
        }
        console.error('cover letter generation failed', err);
        return next(createError(500, 'cover letter generation failed'));
      }

      const sanitizedCover = sanitizeGeneratedText(coverLetterText, {
        skipRequiredSections: true,
        defaultHeading: '',
      });
      const endPdfGen = startStep(req, 'pdf_generation');
      let coverBuffer;
      try {
        coverBuffer = await generatePdf(
          sanitizedCover,
          coverTemplate1,
          {
            skipRequiredSections: true,
            defaultHeading: '',
          },
          generativeModel,
        );
        await endPdfGen();
      } catch (err) {
        await endPdfGen(err.message);
        throw err;
      }
      const coverDate = new Date().toISOString().split('T')[0];
      const coverTimestamp = Date.now();
      const coverBasePath = [
        sanitizedName,
        'enhanced',
        coverDate,
      ];
      const coverKey = buildS3Key(
        coverBasePath,
        `${coverTimestamp}-cover_letter.pdf`,
      );
      const coverTextKey = buildS3Key(
        coverBasePath,
        `${coverTimestamp}-cover_letter.txt`,
      );
      const endCoverPdf = startStep(req, 'uploads');
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: coverKey,
          Body: coverBuffer,
          ContentType: 'application/pdf',
        }),
        { abortSignal: req.signal }
      );
      await endCoverPdf();
      const endCoverText = startStep(req, 'uploads');
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: coverTextKey,
          Body: sanitizedCover,
          ContentType: 'text/plain',
        }),
        { abortSignal: req.signal }
      );
      await endCoverText();

      const cvUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: existingCvKey }),
        { expiresIn: 3600 }
      );
      const coverUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: coverKey }),
        { expiresIn: 3600 },
      );
      const coverTextUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: coverTextKey }),
        { expiresIn: 3600 },
      );

      let atsMetrics;
      const endAts = startStep(req, 'ats_analysis');
      try {
        atsMetrics = await requestAtsAnalysis(cvText, { signal: req.signal });
        await endAts();
      } catch (err) {
        await endAts(err.message);
        console.warn('ATS analysis failed, using heuristic metrics', err);
        atsMetrics = calculateMetrics(cvText);
      }
      const atsScore = Math.round(
        Object.values(atsMetrics).reduce((a, b) => a + b, 0) /
          Math.max(Object.keys(atsMetrics).length, 1)
      );
      const resumeSkills = extractResumeSkills(cvText);
      const { score: skillMatch } = calculateMatchScore(jobSkills, resumeSkills);
      const chanceOfSelection = Math.round((atsScore + skillMatch) / 2);
      const improvement = originalScore
        ? Math.round(((atsScore - Number(originalScore)) / Number(originalScore)) * 100)
        : 0;

      const ipAddress =
        (req.headers['x-forwarded-for'] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)[0] || req.ip;
      const { browser, os, device } = req;

      try {
        await logSession(
          {
            jobId,
            ipAddress,
            userAgent,
            browser,
            os,
            device,
            jobDescriptionUrl,
            linkedinProfileUrl,
            credlyProfileUrl,
            cvKey: existingCvKey,
            coverLetterKey: coverKey,
            atsScore,
            improvement,
          },
          { signal: req.signal }
        );
      } catch (err) {
        console.error('failed to log session', err);
      }

      res.json({
        jobId,
        cvUrl,
        coverLetterUrl: coverUrl,
        coverLetterTextUrl: coverTextUrl,
        coverLetterText: sanitizedCover,
        atsScore,
        chanceOfSelection,
        improvement,
        addedSkills: addedSkillsArr,
        addedLanguages: selectedLanguagesArr,
        designation: designation || '',
      });
    });

    app.post('/api/enhance', async (req, res, next) => {
      const jobId = crypto.randomUUID();
      const s3 = new S3Client({ region: REGION });
      let bucket;
      try {
        const secrets = await getSecrets();
        bucket =
          process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
      } catch (err) {
        console.error('failed to load configuration', err);
        return next(createError(500, 'failed to load configuration'));
      }

      try {
        let {
          cvKey,
          cvText,
          jobDescription,
          linkedinProfileUrl,
          credlyProfileUrl,
        } = req.body || {};
        if (!cvText && !cvKey)
          return next(createError(400, 'cvKey or cvText required'));
        if (!jobDescription)
          return next(createError(400, 'jobDescription required'));

        if (!cvText && cvKey) {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: cvKey }),
            { abortSignal: req.signal }
          );
          const buf = Buffer.from(await obj.Body.transformToByteArray());
          cvText = await extractText({
            originalname: path.basename(cvKey),
            buffer: buf,
          });
        }

        const applicantName = sanitizeName(
          (await extractName(cvText)) || 'candidate'
        );
        const date = new Date().toISOString().split('T')[0];
        const uuid = crypto.randomUUID();
        const basePath = [applicantName, date, uuid, 'generated'];

        const cvPdf = await convertToPdf(cvText);
        const jdPdf = await convertToPdf(jobDescription);
        const cvFile = await openaiUploadFile(cvPdf, 'resume.pdf', 'assistants', {
          signal: req.signal,
        });
        const jdFile = await openaiUploadFile(
          jdPdf,
          'jobdesc.pdf',
          'assistants',
          { signal: req.signal }
        );

        let linkedinFile;
        if (linkedinProfileUrl) {
          const data = await fetchLinkedInProfile(
            linkedinProfileUrl,
            req.signal
          );
          const pdf = await convertToPdf(data);
          linkedinFile = await openaiUploadFile(
            pdf,
            'linkedin.pdf',
            'assistants',
            { signal: req.signal }
          );
        }
        let credlyFile;
        if (credlyProfileUrl) {
          const data = await fetchCredlyProfile(credlyProfileUrl, req.signal);
          const pdf = await convertToPdf(data);
          credlyFile = await openaiUploadFile(
            pdf,
            'credly.pdf',
            'assistants',
            { signal: req.signal }
          );
        }

        const instructions =
          'You are an expert resume writer. Improve the resume to match the job description. Provide two distinct improved CV versions and a cover letter.';
        const raw1 = await requestEnhancedCV(
          {
            cvFileId: cvFile.id,
            jobDescFileId: jdFile.id,
            linkedInFileId: linkedinFile?.id,
            credlyFileId: credlyFile?.id,
            instructions,
          },
          { signal: req.signal }
        );
        const resp1 = JSON.parse(raw1);

        const raw2 = await requestEnhancedCV(
          {
            cvFileId: cvFile.id,
            jobDescFileId: jdFile.id,
            linkedInFileId: linkedinFile?.id,
            credlyFileId: credlyFile?.id,
            instructions,
          },
          { signal: req.signal }
        );
        const resp2 = JSON.parse(raw2);

        const cvVariants = [
          resp1.cv_version1,
          resp1.cv_version2,
          resp2.cv_version1,
          resp2.cv_version2,
        ];
        const coverLetterText =
          resp1.cover_letter1 || resp1.cover_letter2 || resp2.cover_letter1 || '';

        const variantUrls = [];
        for (let i = 0; i < cvVariants.length; i++) {
          const text = cvVariants[i];
          const docxBuf = await generateDocx(text, 'modern', {}, generativeModel);
          const pdfBuf = await generatePdf(text, 'modern', {}, generativeModel);
          const docxKey = buildS3Key(basePath, `cv_variant${i + 1}.docx`);
          const pdfKey = buildS3Key(basePath, `cv_variant${i + 1}.pdf`);
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: docxKey,
              Body: docxBuf,
              ContentType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            })
          );
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: pdfKey,
              Body: pdfBuf,
              ContentType: 'application/pdf',
            })
          );
          const docxUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: bucket, Key: docxKey }),
            { expiresIn: 3600 }
          );
          const pdfUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: bucket, Key: pdfKey }),
            { expiresIn: 3600 }
          );
          variantUrls.push({ text, docxUrl, pdfUrl });
        }

        const coverUrls = {};
        if (coverLetterText) {
          const clDocx = await generateDocx(
            coverLetterText,
            'cover_modern',
            {},
            generativeModel
          );
          const clPdf = await generatePdf(
            coverLetterText,
            'cover_modern',
            {},
            generativeModel
          );
          const clDocxKey = buildS3Key(basePath, 'cover_letter.docx');
          const clPdfKey = buildS3Key(basePath, 'cover_letter.pdf');
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: clDocxKey,
              Body: clDocx,
              ContentType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            })
          );
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: clPdfKey,
              Body: clPdf,
              ContentType: 'application/pdf',
            })
          );
          coverUrls.docxUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: bucket, Key: clDocxKey }),
            { expiresIn: 3600 }
          );
          coverUrls.pdfUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: bucket, Key: clPdfKey }),
            { expiresIn: 3600 }
          );
          coverUrls.text = coverLetterText;
        }

        res.json({ variants: variantUrls, coverLetter: coverUrls });
      } catch (err) {
        console.error('enhance failed', err);
        next(createError(500, 'failed to enhance CV'));
      }
    });
  }

