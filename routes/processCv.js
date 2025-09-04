import path from 'path';
import axios from 'axios';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import { getSecrets } from '../config/secrets.js';
import { logEvent } from '../logger.js';
import { convertToPdf } from '../lib/convertToPdf.js';
import { uploadFile as openaiUploadFile, requestEnhancedCV } from '../openaiClient.js';

import {
  uploadResume,
  parseUserAgent,
  validateUrl,
  extractText,
  classifyDocument,
  extractName,
  sanitizeName,
  CV_TEMPLATES,
  CL_TEMPLATES,
  selectTemplates,
  analyzeJobDescription,
  extractResumeSkills,
  calculateMatchScore,
  fetchLinkedInProfile,
  fetchCredlyProfile,
  extractExperience,
  extractEducation,
  extractCertifications,
  sanitizeGeneratedText,
  relocateProfileLinks,
  generatePdf,
  parseAiJson,
  region,
  REQUEST_TIMEOUT_MS
} from '../server.js';

export default function registerProcessCv(app) {
  app.post('/api/process-cv', (req, res, next) => {
    uploadResume(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req, res) => {
    const jobId = Date.now().toString();
    const s3 = new S3Client({ region });
    let bucket;
    let secrets;
    try {
      secrets = await getSecrets();
      bucket = process.env.S3_BUCKET || secrets.S3_BUCKET || 'resume-forge-data';
    } catch (err) {
      console.error('failed to load configuration', err);
      return res.status(500).json({ error: 'failed to load configuration' });
    }

    let { jobDescriptionUrl, linkedinProfileUrl, credlyProfileUrl } = req.body;
    const ipAddress =
      (req.headers['x-forwarded-for'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0] || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const { browser, os, device } = await parseUserAgent(userAgent);
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
      return res.status(400).json({ error: 'resume file required' });
    }
    if (!jobDescriptionUrl) {
      return res.status(400).json({ error: 'jobDescriptionUrl required' });
    }
    if (!linkedinProfileUrl) {
      return res.status(400).json({ error: 'linkedinProfileUrl required' });
    }
    jobDescriptionUrl = validateUrl(jobDescriptionUrl);
    if (!jobDescriptionUrl) {
      return res.status(400).json({ error: 'invalid jobDescriptionUrl' });
    }
    linkedinProfileUrl = validateUrl(linkedinProfileUrl, ['linkedin.com']);
    if (!linkedinProfileUrl) {
      return res.status(400).json({ error: 'invalid linkedinProfileUrl' });
    }
    if (credlyProfileUrl) {
      credlyProfileUrl = validateUrl(credlyProfileUrl, ['credly.com']);
      if (!credlyProfileUrl) {
        return res.status(400).json({ error: 'invalid credlyProfileUrl' });
      }
    }

    let text = await extractText(req.file);
    const docType = classifyDocument(text);
    if (docType !== 'resume') {
      return res
        .status(400)
        .json({ error: `Uploaded document classified as ${docType}; please upload a resume` });
    }
    const applicantName = extractName(text);
    let sanitizedName = sanitizeName(applicantName);
    if (!sanitizedName) sanitizedName = 'candidate';
    const ext = path.extname(req.file.originalname).toLowerCase();
    const prefix = `sessions/${sanitizedName}/${jobId}/`;
    const logKey = `${prefix}logs/processing.jsonl`;

    // Store raw file to configured bucket
    const initialS3 = new S3Client({ region });
    try {
      await initialS3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${prefix}${sanitizedName}${ext}`,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
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
          message: `Failed to upload to bucket ${bucket}: ${message}`
        });
      } catch (logErr) {
        console.error('failed to log initial upload error', logErr);
      }
      return res
        .status(500)
        .json({ error: `Initial S3 upload to bucket ${bucket} failed: ${message}` });
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

      const { data: jobDescriptionHtml } = await axios.get(jobDescriptionUrl, {
        timeout: REQUEST_TIMEOUT_MS
      });
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'fetched_job_description' });
      const {
        title: jobTitle,
        skills: jobSkills,
        text: jobDescription
      } = analyzeJobDescription(jobDescriptionHtml);
      const resumeSkills = extractResumeSkills(text);
      const originalMatch = calculateMatchScore(jobSkills, resumeSkills);
      const originalScore = originalMatch.score;

      let linkedinData = {};
      try {
        linkedinData = await fetchLinkedInProfile(linkedinProfileUrl);
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'fetched_linkedin_profile'
        });
      } catch (err) {
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

      let credlyCertifications = [];
      if (credlyProfileUrl) {
        try {
          credlyCertifications = await fetchCredlyProfile(credlyProfileUrl);
          await logEvent({
            s3,
            bucket,
            key: logKey,
            jobId,
            event: 'fetched_credly_profile'
          });
        } catch (err) {
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

      let projectText = '';
      let modifiedTitle = '';
      let versionData = {};
      let coverData = {};
      let aiOriginalScore = 0;
      let aiEnhancedScore = 0;
      let aiSkillsAdded = [];
      let improvementSummary = '';
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
      };
      try {
        const cvBuffer = await convertToPdf(text);
        const cvFile = await openaiUploadFile(
          cvBuffer,
          'cv.pdf'
        );
        const jdBuffer = await convertToPdf(jobDescription);
        const jdFile = await openaiUploadFile(
          jdBuffer,
          'job.pdf'
        );
        let liFile;
        if (Object.keys(linkedinData).length) {
          const liBuffer = await convertToPdf(linkedinData);
          liFile = await openaiUploadFile(
            liBuffer,
            'linkedin.pdf'
          );
        }
        let credlyFile;
        if (credlyCertifications.length) {
          const credlyBuffer = await convertToPdf(credlyCertifications);
          credlyFile = await openaiUploadFile(
            credlyBuffer,
            'credly.pdf'
          );
        }
        const instructions =
          'You are an expert resume writer and career coach. Use the provided resume, job description, and optional LinkedIn or Credly data to create two improved resume versions and two tailored cover letters. Return a JSON object with keys cv_version1, cv_version2, cover_letter1, cover_letter2, original_score, enhanced_score, skills_added, improvement_summary.';
        const responseText = await requestEnhancedCV({
          cvFileId: cvFile.id,
          jobDescFileId: jdFile.id,
          linkedInFileId: liFile?.id,
          credlyFileId: credlyFile?.id,
          instructions,
        });
        const parsed = parseAiJson(responseText);
        if (parsed) {
          versionData.version1 = sanitizeGeneratedText(
            parsed.cv_version1,
            sanitizeOptions
          );
          versionData.version2 = sanitizeGeneratedText(
            parsed.cv_version2,
            sanitizeOptions
          );
          coverData.cover_letter1 = parsed.cover_letter1;
          coverData.cover_letter2 = parsed.cover_letter2;
          aiOriginalScore = parsed.original_score;
          aiEnhancedScore = parsed.enhanced_score;
          aiSkillsAdded = Array.isArray(parsed.skills_added)
            ? parsed.skills_added
            : [];
          improvementSummary = parsed.improvement_summary;
        }
      } catch (e) {
        console.error('Failed to generate enhanced CV:', e);
      }

      if (
        !versionData.version1 ||
        !versionData.version2 ||
        !coverData.cover_letter1 ||
        !coverData.cover_letter2
      ) {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'invalid_ai_response',
          level: 'error',
          message: 'AI response invalid',
        });
        return res.status(500).json({ error: 'AI response invalid' });
      }

      const version1Skills = extractResumeSkills(versionData.version1);
      const match1 = calculateMatchScore(jobSkills, version1Skills);
      const version2Skills = extractResumeSkills(versionData.version2);
      const match2 = calculateMatchScore(jobSkills, version2Skills);
      const bestImproved = [match1, match2].reduce(
        (best, current) => (current.score > best.score ? current : best),
        match1
      );
      const enhancedScore = bestImproved.score;
      if (enhancedScore <= originalScore) {
        await logEvent({
          s3,
          bucket,
          key: logKey,
          jobId,
          event: 'unable_to_improve',
          message: `originalScore=${originalScore}, match1Score=${match1.score}, match2Score=${match2.score}, aiEnhancedScore=${aiEnhancedScore}`
        });
        console.error('Unable to improve score', {
          originalScore,
          match1Score: match1.score,
          match2Score: match2.score,
          aiEnhancedScore
        });
        return res.status(422).json({ error: 'score was not improved' });
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
      for (const [name, text] of Object.entries(outputs)) {
        if (!text) continue;
        let fileName;
        if (name === 'version1') {
          fileName = sanitizedName;
        } else if (name === 'version2') {
          fileName = `${sanitizedName}_2`;
        } else {
          fileName = name;
        }
        const subdir =
          name === 'version1' || name === 'version2'
            ? 'cv/'
            : name === 'cover_letter1' || name === 'cover_letter2'
            ? 'cover_letter/'
            : '';
        const key = `${generatedPrefix}${subdir}${fileName}.pdf`;
        const tpl =
          name === 'version1'
            ? template1
            : name === 'version2'
            ? template2
            : name === 'cover_letter1'
            ? coverTemplate1
            : coverTemplate2;
        const options =
          name === 'version1' || name === 'version2'
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
                project: projectText
              }
            : name === 'cover_letter1' || name === 'cover_letter2'
            ? { skipRequiredSections: true, defaultHeading: '' }
            : {};
        const inputText =
          name === 'cover_letter1' || name === 'cover_letter2'
            ? relocateProfileLinks(sanitizeGeneratedText(text, options))
            : text;
        const pdfBuffer = await generatePdf(inputText, tpl, options);
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf'
          })
        );
        await logEvent({ s3, bucket, key: logKey, jobId, event: `uploaded_${name}_pdf` });
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        urls.push({ type: name, url });
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
        return res.status(500).json({ error: 'AI response invalid' });
      }

      const dynamo = new DynamoDBClient({ region });
      const tableName = 'ResumeForge';
      async function ensureTableExists() {
        try {
          await dynamo.send(new DescribeTableCommand({ TableName: tableName }));
        } catch (err) {
          if (err.name !== 'ResourceNotFoundException') throw err;
          try {
            await dynamo.send(
              new CreateTableCommand({
                TableName: tableName,
                AttributeDefinitions: [
                  { AttributeName: 'jobId', AttributeType: 'S' }
                ],
                KeySchema: [
                  { AttributeName: 'jobId', KeyType: 'HASH' }
                ],
                BillingMode: 'PAY_PER_REQUEST'
              })
            );
          } catch (createErr) {
            if (createErr.name !== 'ResourceInUseException') throw createErr;
          }
          while (true) {
            const desc = await dynamo.send(
              new DescribeTableCommand({ TableName: tableName })
            );
            if (desc.Table && desc.Table.TableStatus === 'ACTIVE') break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      await ensureTableExists();
      const urlMap = Object.fromEntries(urls.map((u) => [u.type, u.url]));
      await dynamo.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            jobId: { S: jobId },
            linkedinProfileUrl: { S: linkedinProfileUrl },
            candidateName: { S: applicantName },
            timestamp: { S: new Date().toISOString() },
            cv1Url: { S: urlMap.version1 || '' },
            cv2Url: { S: urlMap.version2 || '' },
            coverLetter1Url: { S: urlMap.cover_letter1 || '' },
            coverLetter2Url: { S: urlMap.cover_letter2 || '' },
            ipAddress: { S: ipAddress },
            userAgent: { S: userAgent },
            os: { S: os },
            browser: { S: browser },
            device: { S: device },
            aiOriginalScore: { N: aiOriginalScore.toString() },
            aiEnhancedScore: { N: aiEnhancedScore.toString() },
            aiSkillsAdded: { L: aiSkillsAdded.map((s) => ({ S: s })) },
            improvementSummary: { S: improvementSummary }
          }
        })
      );

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
      const { table, newSkills: missingSkills } = bestImproved;
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
        )
      );
      res.json({
        urls,
        applicantName,
        originalScore,
        enhancedScore,
        table,
        addedSkills,
        missingSkills,
        originalTitle,
        modifiedTitle: modifiedTitle || originalTitle,
        aiOriginalScore,
        aiEnhancedScore,
        aiSkillsAdded,
        improvementSummary,
      });
    } catch (err) {
      console.error('processing failed', err);
      if (bucket) {
        try {
          await logEvent({ s3, bucket, key: logKey, jobId, event: 'error', level: 'error', message: err.message });
        } catch (e) {
          console.error('failed to log error', e);
        }
      }
      res.status(500).json({ error: 'processing failed' });
    }
  });
}

