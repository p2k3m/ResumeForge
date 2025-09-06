import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSecrets } from '../config/secrets.js';
import { logEvent } from '../logger.js';
import { requestSectionImprovement } from '../openaiClient.js';
import { compareMetrics } from '../services/atsMetrics.js';

import {
  uploadResume,
  parseUserAgent,
  validateUrl,
  allowedDomains,
  extractText,
  classifyDocument,
  extractName,
  sanitizeName,
  CV_TEMPLATES,
  CL_TEMPLATES,
  selectTemplates,
  analyzeJobDescription,
  fetchLinkedInProfile,
  fetchCredlyProfile,
  extractExperience,
  extractEducation,
  extractCertifications,
  collectSectionText,
  region,
  REQUEST_TIMEOUT_MS
} from '../server.js';

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

async function withRetry(fn, retries = 3, delay = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export default function registerProcessCv(app) {
  app.post(
    '/api/process-cv',
    (req, res, next) => {
      uploadResume(req, res, (err) => {
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    async (req, res, next) => {
    const jobId = crypto.randomUUID();
    const s3 = new S3Client({ region });
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

    let { jobDescriptionUrl, linkedinProfileUrl, credlyProfileUrl, existingCvKey, iteration } = req.body;
    iteration = parseInt(iteration) || 0;
    const ipAddress =
      (req.headers['x-forwarded-for'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0] || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    let browser, os, device;
    try {
      ({ browser, os, device } = await parseUserAgent(userAgent));
    } catch (err) {
      console.error('User agent parsing failed', err);
      return next(createError(500, 'Failed to parse user agent'));
    }
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
    let { template1, template2, coverTemplate1, coverTemplate2 } = selection;
    console.log(
      `Selected templates: template1=${template1}, template2=${template2}, coverTemplate1=${coverTemplate1}, coverTemplate2=${coverTemplate2}`
    );
    if (!req.file) {
      return next(createError(400, 'resume file required'));
    }
    if (!jobDescriptionUrl) {
      return next(createError(400, 'jobDescriptionUrl required'));
    }
    if (!linkedinProfileUrl) {
      return next(createError(400, 'linkedinProfileUrl required'));
    }
    jobDescriptionUrl = validateUrl(jobDescriptionUrl, allowedDomains);
    if (!jobDescriptionUrl) {
      return next(createError(400, 'invalid jobDescriptionUrl'));
    }
    linkedinProfileUrl = validateUrl(linkedinProfileUrl, ['linkedin.com']);
    if (!linkedinProfileUrl) {
      return next(createError(400, 'invalid linkedinProfileUrl'));
    }
    if (credlyProfileUrl) {
      credlyProfileUrl = validateUrl(credlyProfileUrl, ['credly.com']);
      if (!credlyProfileUrl) {
        return next(createError(400, 'invalid credlyProfileUrl'));
      }
    }

    let text, docType, applicantName, sanitizedName, ext, prefix, logKey, existingCvBuffer, originalText;
    try {
      originalText = await extractText(req.file);
      docType = classifyDocument(originalText);
      if (docType !== 'resume') {
        return next(
          createError(
            400,
            `Uploaded document classified as ${docType}; please upload a resume`
          )
        );
      }
      applicantName = extractName(originalText);
      sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) sanitizedName = 'candidate';
      ext = path.extname(req.file.originalname).toLowerCase();
      prefix = `sessions/${sanitizedName}/${jobId}/`;
      logKey = `${prefix}logs/processing.jsonl`;
      text = originalText;
      if (existingCvKey) {
        const existingObj = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: existingCvKey })
        );
        const arr = await existingObj.Body.transformToByteArray();
        existingCvBuffer = Buffer.from(arr);
        text = await extractText({
          originalname: path.basename(existingCvKey),
          buffer: existingCvBuffer,
        });
      }
    } catch (err) {
      console.error('Failed to extract text from PDF', err);
      return next(createError(500, 'Failed to extract text from PDF'));
    }

    // Store raw file to configured bucket
    const initialS3 = new S3Client({ region });
    try {
      await initialS3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${prefix}${sanitizedName}${ext}`,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );
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
        });
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'selected_templates',
          message: `template1=${template1}; template2=${template2}`,
        });
      } catch (err) {
        console.error('initial logging failed', err);
      }

      let jobDescriptionHtml;
      try {
        const { data } = await withRetry(
          () => axios.get(jobDescriptionUrl, { timeout: REQUEST_TIMEOUT_MS }),
          2
        );
        jobDescriptionHtml = data;
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'fetched_job_description'
        });
      } catch (err) {
        console.error('Job description fetch failed', err);
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'job_description_fetch_failed',
          level: 'error',
          message: err.message
        });
        return next(createError(500, 'Job description fetch failed'));
      }
      const { title: jobTitle, skills: jobSkills, text: jobDescription } =
        analyzeJobDescription(jobDescriptionHtml);
      // Original skills and score can be computed here if needed in future

      let linkedinData = {};
      try {
        linkedinData = await withRetry(
          () => fetchLinkedInProfile(linkedinProfileUrl),
          2
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
          event: 'fetched_linkedin_profile'
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
          message: err.message + (err.status ? ` (status ${err.status})` : '')
        });
      }

      let credlyCertifications = [];
      if (credlyProfileUrl) {
        try {
          credlyCertifications = await withRetry(
            () => fetchCredlyProfile(credlyProfileUrl),
            2
          );
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'fetched_credly_profile'
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
            message: err.message
          });
        }
      }

      const resumeExperience = extractExperience(text);
      const linkedinExperience = extractExperience(linkedinData.experience || []);
      const resumeEducation = extractEducation(text);
      const linkedinEducation = extractEducation(linkedinData.education || []);
      const resumeCertifications = extractCertifications(text);
      const linkedinCertifications = extractCertifications(
        linkedinData.certifications || []
      );

      const originalTitle =
        resumeExperience[0]?.title || linkedinExperience[0]?.title || '';

      const sections = collectSectionText(text, linkedinData, credlyCertifications);
      const improvedSections = {};
      for (const key of ['summary', 'experience', 'education', 'certifications']) {
        improvedSections[key] = await requestSectionImprovement({
          sectionName: key,
          sectionText: sections[key] || '',
          jobDescription,
        });
      }
      const improvedCv = [
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
      const { table: atsMetrics } = compareMetrics(text, improvedCv);
      return res.json({
        applicantName,
        sections: improvedSections,
        cv: improvedCv,
        metrics: atsMetrics,
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
          });
        } catch (e) {
          console.error('failed to log error', e);
        }
      }
      return next(createError(500, 'processing failed'));
    }
  });

  app.post('/api/improve-metric', async (req, res, next) => {
    const jobId = crypto.randomUUID();
    const s3 = new S3Client({ region });
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
      linkedinProfileUrl,
      credlyProfileUrl,
      existingCvKey,
      iteration,
    } = req.body;
    iteration = parseInt(iteration) || 0;
    if (!metric) return next(createError(400, 'metric required'));
    if (!jobDescriptionUrl)
      return next(createError(400, 'jobDescriptionUrl required'));
    if (!linkedinProfileUrl)
      return next(createError(400, 'linkedinProfileUrl required'));
    if (!existingCvKey)
      return next(createError(400, 'existingCvKey required'));

    jobDescriptionUrl = validateUrl(jobDescriptionUrl, allowedDomains);
    if (!jobDescriptionUrl)
      return next(createError(400, 'invalid jobDescriptionUrl'));
    linkedinProfileUrl = validateUrl(linkedinProfileUrl, ['linkedin.com']);
    if (!linkedinProfileUrl)
      return next(createError(400, 'invalid linkedinProfileUrl'));
    if (credlyProfileUrl) {
      credlyProfileUrl = validateUrl(credlyProfileUrl, ['credly.com']);
      if (!credlyProfileUrl)
        return next(createError(400, 'invalid credlyProfileUrl'));
    }

    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: existingCvKey })
      );
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      const existingCvBuffer = Buffer.concat(chunks);
      const originalText = await extractText(existingCvBuffer);
      const applicantName = extractName(originalText);
      let sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) sanitizedName = 'candidate';

      let jobDescription = '';
      let jobTitle = '';
      try {
        ({ jobDescription, jobTitle } = await analyzeJobDescription(
          jobDescriptionUrl
        ));
      } catch {}

      let linkedinData = {};
      try {
        linkedinData = await fetchLinkedInProfile(linkedinProfileUrl);
      } catch {}

      let credlyCertifications = [];
      if (credlyProfileUrl) {
        try {
          credlyCertifications = await fetchCredlyProfile(credlyProfileUrl);
        } catch {}
      }

      const cvFile = await openaiUploadFile(existingCvBuffer, 'cv.pdf');
      const jdBuffer = await convertToPdf(jobDescription);
      const jdFile = await openaiUploadFile(jdBuffer, 'job.pdf');
      let liFile;
      if (Object.keys(linkedinData).length) {
        const liBuffer = await convertToPdf(linkedinData);
        liFile = await openaiUploadFile(liBuffer, 'linkedin.pdf');
      }
      let credlyFile;
      if (credlyCertifications.length) {
        const credlyBuffer = await convertToPdf(credlyCertifications);
        credlyFile = await openaiUploadFile(credlyBuffer, 'credly.pdf');
      }

      const instructions =
        `You are an expert resume writer and career coach. Focus on improving the ${metric} metric in the resume. Use the provided resume, job description, and optional LinkedIn or Credly data to create two improved resume versions and two tailored cover letters. Return a JSON object with keys cv_version1, cv_version2, cover_letter1, cover_letter2, original_score, enhanced_score, skills_added, improvement_summary, metrics.`;

      const responseText = await requestEnhancedCV({
        cvFileId: cvFile.id,
        jobDescFileId: jdFile.id,
        linkedInFileId: liFile?.id,
        credlyFileId: credlyFile?.id,
        instructions,
      });

      const parsed = parseAiJson(responseText);
      let improvedText = '';
      if (parsed) {
        improvedText = sanitizeGeneratedText(parsed.cv_version1, { jobTitle });
      }
      const { table: metricTable } = compareMetrics(originalText, improvedText);

      const improvedPdf = await convertToPdf(improvedText);
      const key = path.join(sanitizedName, `${Date.now()}-improved.pdf`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: improvedPdf,
          ContentType: 'application/pdf',
        })
      );
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );

      res.json({
        iteration,
        urls: [
          {
            type: 'version1',
            url,
            expiresAt: Date.now() + 3600 * 1000,
          },
        ],
        metrics: metricTable,
        bestCvKey: key,
      });
    } catch (err) {
      console.error('metric improvement failed', err);
      next(createError(500, 'failed to improve metric'));
    }
  });
}

