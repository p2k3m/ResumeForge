import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSecrets } from '../config/secrets.js';
import { logEvent } from '../logger.js';
import {
  requestSectionImprovement,
  uploadFile as openaiUploadFile,
  requestEnhancedCV,
} from '../openaiClient.js';
import { compareMetrics, calculateMetrics } from '../services/atsMetrics.js';
import { convertToPdf } from '../lib/convertToPdf.js';
import { logEvaluation } from '../services/dynamo.js';

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
  extractResumeSkills,
  calculateMatchScore,
  region,
  REQUEST_TIMEOUT_MS,
  sanitizeGeneratedText,
  parseAiJson
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

export async function improveSections(sections, jobDescription) {
  const improvedSections = {};
  for (const key of ['summary', 'experience', 'education', 'certifications']) {
    const text = sections[key]?.trim();
    if (!text) {
      improvedSections[key] = '';
      continue;
    }
    improvedSections[key] = await requestSectionImprovement({
      sectionName: key,
      sectionText: text,
      jobDescription,
    });
  }
  return improvedSections;
}

export default function registerProcessCv(app) {
  app.post(
    '/api/evaluate',
    (req, res, next) => {
      uploadResume(req, res, (err) => {
        if (err) return next(createError(400, err.message));
        next();
      });
    },
    async (req, res, next) => {
      const jobId = crypto.randomUUID();
      const ipAddress =
        (req.headers['x-forwarded-for'] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)[0] || req.ip;
      const userAgent = req.headers['user-agent'] || '';
      let browser = '', os = '', device = '';
      try {
        ({ browser, os, device } = await parseUserAgent(userAgent));
      } catch {}
      try {
        if (!req.file) return next(createError(400, 'resume file required'));
        let { jobDescriptionUrl } = req.body;
        if (!jobDescriptionUrl)
          return next(createError(400, 'jobDescriptionUrl required'));
        jobDescriptionUrl = validateUrl(jobDescriptionUrl, allowedDomains);
        if (!jobDescriptionUrl)
          return next(createError(400, 'invalid jobDescriptionUrl'));

        const { data: jobHtml } = await axios.get(jobDescriptionUrl, {
          timeout: REQUEST_TIMEOUT_MS,
        });
        const { title: jobTitle, skills: jobSkills } =
          analyzeJobDescription(jobHtml);
        const resumeText = await extractText(req.file);
        const resumeSkills = extractResumeSkills(resumeText);
        const match = calculateMatchScore(jobSkills, resumeSkills);
        const atsMetrics = calculateMetrics(resumeText);
        const atsScore = Math.round(
          Object.values(atsMetrics).reduce((a, b) => a + b, 0) /
            Math.max(Object.keys(atsMetrics).length, 1)
        );
        const experience = extractExperience(resumeText);
        const candidateTitle = experience[0]?.title || '';
        const designationMatch =
          candidateTitle && jobTitle
            ? candidateTitle.toLowerCase() === jobTitle.toLowerCase()
            : false;

        await logEvaluation({
          jobId,
          ipAddress,
          userAgent,
          browser,
          os,
          device,
        });

        res.json({
          atsScore,
          jobTitle,
          candidateTitle,
          designationMatch,
          missingSkills: match.newSkills,
        });
      } catch (err) {
        console.error('evaluation failed', err);
        next(createError(500, 'evaluation failed'));
      }
    }
  );
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

    let {
      jobDescriptionUrl,
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
    let defaultCvTemplate =
      req.body.template || req.query.template || CV_TEMPLATES[0];
    if (!CV_TEMPLATES.includes(defaultCvTemplate))
      defaultCvTemplate = CV_TEMPLATES[0];
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

    let text,
      docType,
      applicantName,
      sanitizedName,
      ext,
      prefix,
      logKey,
      existingCvBuffer,
      originalText,
      originalTitle;
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
      const lines = originalText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      applicantName = extractName(originalText);
      originalTitle = lines[1] || '';
      sanitizedName = sanitizeName(applicantName);
      if (!sanitizedName) sanitizedName = 'candidate';
      ext = path.extname(req.file.originalname).toLowerCase();
      prefix = `sessions/${sanitizedName}/${jobId}/`;
      logKey = `${prefix}logs/processing.jsonl`;
      text = null;
      if (existingCvTextKey) {
        try {
          const textObj = await s3.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: existingCvTextKey,
            })
          );
          text = await textObj.Body.transformToString();
        } catch (err) {
          console.error('failed to fetch existing CV text', err);
        }
      } else if (existingCvKey) {
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
      if (!text) text = originalText;
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

      const sections = collectSectionText(text, linkedinData, credlyCertifications);
      const improvedSections = await improveSections(sections, jobDescription);
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
      const resumeSkills = extractResumeSkills(text);
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
      const improvedPdf = await convertToPdf(improvedCv);
      const ts = Date.now();
      const key = `${prefix}generated/cv/${ts}-improved.pdf`;
      const textKey = `${prefix}generated/cv/${ts}-improved.txt`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: improvedPdf,
          ContentType: 'application/pdf',
        })
      );
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: textKey,
          Body: improvedCv,
          ContentType: 'text/plain',
        })
      );
      const cvUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );
      iteration += 1;
      return res.json({
        applicantName,
        sections: improvedSections,
        cv: improvedCv,
        metrics: atsMetrics,
        table: enhancedMatch.table,
        addedSkills,
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

    let existingCvBuffer;
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: existingCvKey })
      );
      const chunks = [];
      for await (const chunk of obj.Body) chunks.push(chunk);
      existingCvBuffer = Buffer.concat(chunks);
      let originalText;
      if (existingCvTextKey) {
        try {
          const textObj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: existingCvTextKey })
          );
          originalText = await textObj.Body.transformToString();
        } catch (err) {
          console.error('failed to fetch saved CV text', err);
        }
      }
      if (!originalText) {
        originalText = await extractText({
          originalname: path.basename(existingCvKey),
          buffer: existingCvBuffer,
        });
      }
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
      let cvVersion1 = '';
      let cvVersion2 = '';
      let coverLetter1 = '';
      let coverLetter2 = '';
      if (parsed) {
        cvVersion1 = sanitizeGeneratedText(parsed.cv_version1, { jobTitle });
        cvVersion2 = sanitizeGeneratedText(parsed.cv_version2, { jobTitle });
        coverLetter1 = sanitizeGeneratedText(parsed.cover_letter1, {
          skipRequiredSections: true,
          defaultHeading: '',
        });
        coverLetter2 = sanitizeGeneratedText(parsed.cover_letter2, {
          skipRequiredSections: true,
          defaultHeading: '',
        });
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

      const pdf1 = await convertToPdf(cvVersion1);
      const key1 = path.join(sanitizedName, `${ts}-version1.pdf`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key1,
          Body: pdf1,
          ContentType: 'application/pdf',
        })
      );
      const url1 = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key1 }),
        { expiresIn: 3600 }
      );

      const pdf2 = await convertToPdf(cvVersion2);
      const key2 = path.join(sanitizedName, `${ts}-version2.pdf`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key2,
          Body: pdf2,
          ContentType: 'application/pdf',
        })
      );
      const url2 = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key2 }),
        { expiresIn: 3600 }
      );

      const clPdf1 = await convertToPdf(coverLetter1);
      const clKey1 = path.join(sanitizedName, `${ts}-cover_letter1.pdf`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: clKey1,
          Body: clPdf1,
          ContentType: 'application/pdf',
        })
      );
      const clUrl1 = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: clKey1 }),
        { expiresIn: 3600 }
      );

      const clPdf2 = await convertToPdf(coverLetter2);
      const clKey2 = path.join(sanitizedName, `${ts}-cover_letter2.pdf`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: clKey2,
          Body: clPdf2,
          ContentType: 'application/pdf',
        })
      );
      const clUrl2 = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: clKey2 }),
        { expiresIn: 3600 }
      );

      let metricTable = metrics1.table;
      let bestKey = key1;
      if (avg2 > avg1) {
        metricTable = metrics2.table;
        bestKey = key2;
      }

      iteration += 1;
      res.json({
        iteration,
        urls: [
          { type: 'version1', url: url1, expiresAt: Date.now() + 3600 * 1000 },
          { type: 'version2', url: url2, expiresAt: Date.now() + 3600 * 1000 },
          {
            type: 'cover_letter1',
            url: clUrl1,
            expiresAt: Date.now() + 3600 * 1000,
          },
          {
            type: 'cover_letter2',
            url: clUrl2,
            expiresAt: Date.now() + 3600 * 1000,
          },
        ],
        metrics: metricTable,
        bestCvKey: bestKey,
      });
    } catch (err) {
      console.error('metric improvement failed', err);
      next(createError(500, 'failed to improve metric'));
    }
  });
}

