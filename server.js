import express from 'express';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import net from 'net';
import dns from 'dns';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import { logEvent } from './logger.js';
import {
  uploadFile as openaiUploadFile,
  requestEnhancedCV,
  classifyDocument as aiClassifyDocument,
  extractName as openaiExtractName,
} from './openaiClient.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { getSecrets } from './config/secrets.js';
import JSON5 from 'json5';
import { generativeModel } from './geminiClient.js';
import registerProcessCv from './routes/processCv.js';
import { generatePdf as _generatePdf } from './services/generatePdf.js';
import {
  parseContent,
  parseLine,
  ensureRequiredSections,
  splitSkills,
  mergeDuplicateSections,
  pruneEmptySections,
  normalizeHeading,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractLanguages,
} from './services/parseContent.js';

// Prevent crashes when stdout/stderr streams close prematurely
process.stdout.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});
process.stderr.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});

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

async function validateUrl(input) {
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost') return null;
    let ip = host;
    let ipVersion = net.isIP(host);
    if (!ipVersion) {
      try {
        const { address, family } = await dns.promises.lookup(host);
        ip = address;
        ipVersion = family;
      } catch {
        return null;
      }
    }
    if (ipVersion === 4) {
      if (
        /^0\./.test(ip) ||
        /^10\./.test(ip) ||
        /^127\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
      )
        return null;
    } else if (ipVersion === 6) {
      if (
        /^fc00:/i.test(ip) ||
        /^fd00:/i.test(ip) ||
        /^fe80:/i.test(ip) ||
        ip === '::1'
      )
        return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const app = express();
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY);
}

const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false
});
rateLimiter.reset = () => rateLimiter.store?.resetAll?.();
app.use(rateLimiter);
app.use(cors());
app.use(express.json());

if (process.env.ENFORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  });
}


// Multer configuration for resume uploads. Accepts PDFs and modern
// Word documents (.docx) while rejecting legacy .doc files.
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.doc') {
      return cb(
        new Error(
          'Legacy .doc files are not supported. Please upload a .pdf or .docx file.'
        )
      );
    }
    const allowed = ['.pdf', '.docx'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .pdf and .docx files are allowed'));
    }
    cb(null, true);
  }
});

const uploadMiddleware = upload.single('resume');

function detectMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const header = buffer.slice(0, 4).toString('binary');
  if (header === '%PDF') return 'application/pdf';
  if (header === 'PK\u0003\u0004') {
    const ascii = buffer.toString('ascii');
    if (ascii.includes('[Content_Types].xml') && ascii.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }
  return null;
}

function uploadResume(req, res, cb) {
  uploadMiddleware(req, res, (err) => {
    if (err) return cb(err);
    if (!req.file) return cb(null);
    const detected = detectMime(req.file.buffer);
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!detected || !allowed.includes(detected)) {
      return cb(new Error('Invalid file type. Only .pdf and .docx files are allowed'));
    }
    req.file.mimetype = detected;
    cb(null);
  });
}

const CV_TEMPLATES = ['modern', 'ucmo', 'professional', 'vibrant', '2025', 'sleek'];
const CL_TEMPLATES = ['cover_modern', 'cover_classic', 'cover_2025'];
const TEMPLATE_IDS = CV_TEMPLATES; // Backwards compatibility
const ALL_TEMPLATES = [...CV_TEMPLATES, ...CL_TEMPLATES];

// Map each CV template to a style group so we can ensure contrasting picks
const CV_TEMPLATE_GROUPS = {
  modern: 'modern',
  ucmo: 'classic',
  professional: 'professional',
  vibrant: 'creative',
  2025: 'futuristic',
  sleek: 'modern'
};

// Predefined contrasting template pairs used when no explicit templates are provided
const CONTRASTING_PAIRS = [
  ['modern', 'vibrant'],
  ['ucmo', '2025'],
  ['professional', 'vibrant'],
  ['sleek', 'professional']
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
  defaultCvTemplate = '2025',
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
  // Helper to pick a contrasting template based on group
  const pickContrasting = (tpl) => {
    const group = CV_TEMPLATE_GROUPS[tpl];
    const options = CV_TEMPLATES.filter(
      (t) => t !== tpl && CV_TEMPLATE_GROUPS[t] !== group
    );
    return options[Math.floor(Math.random() * options.length)] || tpl;
  };

  if (!template1 && !template2) {
    template1 = defaultCvTemplate;
    template2 = pickContrasting(template1);
  } else {
    if (!template1) template1 = defaultCvTemplate;
    if (!template2) template2 = pickContrasting(template1);
    if (
      template1 === template2 ||
      CV_TEMPLATE_GROUPS[template1] === CV_TEMPLATE_GROUPS[template2]
    ) {
      template2 = pickContrasting(template1);
    }
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

const region = process.env.AWS_REGION || 'ap-south-1';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 5000;
const JOB_FETCH_USER_AGENT =
  process.env.JOB_FETCH_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PUPPETEER_HEADLESS =
  process.env.PUPPETEER_HEADLESS === 'false' ? false : 'new';
const BLOCKED_PATTERNS = [
  /captcha/i,
  /access denied/i,
  /enable javascript/i,
  /bot detection/i
];

async function fetchLinkedInProfile(url) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid LinkedIn URL');
  try {
    const { data: html } = await axios.get(valid, { timeout: REQUEST_TIMEOUT_MS });
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
        } else if (id === 'languages') {
          const nameMatch =
            itemHtml.match(/<h3[^>]*>(.*?)<\/h3>/i) ||
            itemHtml.match(/"name"\s*:\s*"(.*?)"/i);
          const profMatch =
            itemHtml.match(/<span[^>]*>([^<]*proficienc[^<]*)<\/span>/i) ||
            itemHtml.match(/"proficiency"\s*:\s*"(.*?)"/i);
          items.push({
            language: nameMatch ? strip(nameMatch[1]) : strip(text),
            proficiency: profMatch ? strip(profMatch[1]) : '',
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
      languages: extractList('languages'),
    };
  } catch (err) {
    const status = err?.response?.status;
      if (status === 999) {
        return {
          headline: '',
          experience: [],
          education: [],
          skills: [],
          certifications: [],
          languages: []
        };
      }
    const msg = `LinkedIn profile fetch failed: ${err.message}` +
      (status ? ` (status ${status})` : '');
    const error = new Error(msg);
    if (status) error.status = status;
    console.error(msg);
    throw error;
  }
}

async function fetchCredlyProfile(url) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid Credly URL');
  try {
    const { data: html } = await axios.get(valid, { timeout: REQUEST_TIMEOUT_MS });
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
      badges.push({
        name: nameMatch ? strip(nameMatch[1]) : '',
        provider: providerMatch ? strip(providerMatch[1]) : '',
        url: urlMatch ? strip(urlMatch[1]) : '',
        source: 'credly'
      });
    }
    return badges;
  } catch {
    return [];
  }
}

async function fetchHtml(url, { timeout = REQUEST_TIMEOUT_MS, userAgent = JOB_FETCH_USER_AGENT } = {}) {
  const valid = await validateUrl(url);
  if (!valid) throw new Error('Invalid URL');
  try {
    const { data } = await axios.get(valid, {
      timeout,
      headers: { 'User-Agent': userAgent }
    });
    if (
      data &&
      data.trim() &&
      !BLOCKED_PATTERNS.some((re) => re.test(data))
    ) {
      return data;
    }
  } catch {
    // ignore and fall through to puppeteer
  }
  const browser = await puppeteer.launch({
    headless: PUPPETEER_HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.goto(valid, { timeout, waitUntil: 'networkidle2' });
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function analyzeJobDescription(input) {
  let html = input;
  if (/^https?:\/\//i.test(String(input))) {
    html = await fetchHtml(input);
  }
  const strip = (s) =>
    s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const text = strip(html || '');

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
  const fmtCert = (c = {}) => ({
    text: c.provider ? `${c.name} - ${c.provider}` : c.name,
    url: c.url || ''
  });

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
    extractEducation(resumeText)
      .map((e) => e.entry)
      .join('\n'),
    extractEducation(linkedinData.education || [])
      .map((e) => e.entry)
      .join('\n'),
  ]
    .filter(Boolean)
    .join('\n');
  const certObjs = [
    ...extractCertifications(resumeText),
    ...extractCertifications(linkedinData.certifications || []),
    ...(credlyCertifications || [])
  ].map(fmtCert);
  const certifications = certObjs.map((c) => c.text).join('\n');
  const certificationUrls = certObjs.map((c) => c.url);
  const skills = [
    extractResumeSkills(resumeText).join(', '),
    (linkedinData.skills || []).join(', '),
  ]
    .filter(Boolean)
    .join(', ');
  const projects = [
    sectionMap.projects || '',
    (linkedinData.projects || []).join('\n')
  ]
    .filter(Boolean)
    .join('\n');
  const languages = [
    ...extractLanguages(resumeText),
    ...extractLanguages(linkedinData.languages || [])
  ];

  return {
    summary,
    experience,
    education,
    certifications,
    certificationUrls,
    skills,
    projects,
    languages
  };
}

async function rewriteSectionsWithGemini(
  name,
  sections,
  jobDescription,
  generativeModel,
  sanitizeOptions = {}
) {
  const { certificationUrls = [], ...sectionData } = sections || {};
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
    const prompt =
      `You are an expert resume writer. Rewrite the provided resume sections as polished bullet points aligned with the job description. ` +
      `Emphasize that the most recent role should explicitly reference keywords and mandatory skills from the job description. ` +
      `Return only JSON with keys summary, experience, education, certifications, skills, languages, projects, projectSnippet, latestRoleTitle, latestRoleDescription, mandatorySkills, addedSkills. ` +
      `For experience, respond with an array of roles, each having a title and a responsibilities array of bullet points.` +
      `\nSections: ${JSON.stringify(sectionData)}\nJob Description: ${jobDescription}`;
    const result = await generativeModel.generateContent(prompt);
    const parsed = parseAiJson(result?.response?.text?.());
    if (parsed) {
      const mk = (heading, arr) =>
        arr?.length ? [`# ${heading}`, ...arr.map((b) => `- ${b}`)] : [];
      const lines = [name];
      lines.push(...mk('Summary', parsed.summary));

      const expItems = [];
      if (Array.isArray(parsed.experience)) {
        const mandatory = Array.isArray(parsed.mandatorySkills)
          ? parsed.mandatorySkills
          : [];
        parsed.experience.forEach((role, idx) => {
          if (!role?.title) return;
          let responsibilities = Array.isArray(role.responsibilities)
            ? role.responsibilities
            : [];
          if (idx === 0 && mandatory.length) {
            const existing = responsibilities.join(' ').toLowerCase();
            mandatory.forEach((skill) => {
              if (!existing.includes(String(skill).toLowerCase())) {
                responsibilities.push(`Applied ${skill}`);
              }
            });
          }
          expItems.push(`- ${role.title}`);
          if (responsibilities.length) {
            expItems.push(...responsibilities.map((r) => `  - ${r}`));
          }
        });
      }
      if (!expItems.length && (parsed.latestRoleTitle || parsed.latestRoleDescription)) {
        const combined =
          [parsed.latestRoleTitle, parsed.latestRoleDescription]
            .filter(Boolean)
            .join(': ');
        if (combined) expItems.push(`- ${combined}`.trim());
      }
      if (expItems.length) {
        lines.push('# Work Experience', ...expItems);
      }

      lines.push(...mk('Education', parsed.education));
      const certWithLinks = (parsed.certifications || []).map((c, i) => {
        const url = certificationUrls[i];
        return url ? `[${c}](${url})` : c;
      });
      lines.push(...mk('Certifications', certWithLinks));
      const skillsList = Array.from(
        new Set([...(parsed.skills || []), ...(parsed.mandatorySkills || [])])
      );
      lines.push(...mk('Skills', skillsList));
      lines.push(
        ...mk(
          'Languages',
          (parsed.languages || []).map((l) =>
            l.proficiency ? `${l.language} - ${l.proficiency}` : l.language
          )
        )
      );
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

let generatePdf = (text, templateId, options, gm = generativeModel) =>
  _generatePdf(text, templateId, options, gm);

function setGeneratePdf(fn) {
  generatePdf = fn;
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    try {
      const data = await pdfParse(file.buffer);
      return data.text;
    } catch (err) {
      throw new Error('Failed to parse PDF');
    }
  }
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }
  return file.buffer.toString();
}

async function classifyDocument(text) {
  try {
    const docType = await aiClassifyDocument(text);
    if (docType && docType !== 'unknown') return docType;
  } catch {
    /* ignore and fall back */
  }
  if (generativeModel?.generateContent) {
    try {
      const prompt =
        'Classify the following document. Respond with a short phrase such as "resume", "cover letter", "essay", etc.';
      const result = await generativeModel.generateContent(
        `${prompt}\n\n${text.slice(0, 4000)}`
      );
      const docType = result?.response?.text?.().trim().toLowerCase();
      if (docType) return docType;
    } catch {
      /* ignore */
    }
  }
  return 'unknown';
}

async function extractName(text, model = generativeModel) {
  if (!text) return '';
  const prompt =
    `Extract the candidate's full name from the resume text. ` +
    `Return only the name or the word "unknown" if unsure.`;
  const parse = (str) => {
    const name = str?.trim();
    return name && !/^unknown$/i.test(name) ? name : '';
  };
  if (model?.generateContent) {
    try {
      const result = await model.generateContent(`${prompt}\n\n${text}`);
      const name = parse(result?.response?.text?.());
      if (name) return name;
    } catch {
      /* ignore Gemini errors and fall back */
    }
  }
  try {
    const name = parse(await openaiExtractName(text, prompt));
    if (name) return name;
  } catch {
    /* ignore OpenAI errors and fall back to manual entry */
  }
  return '';
}

function sanitizeName(name) {
  return name.trim().split(/\s+/).slice(0, 2).join('_').toLowerCase();
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

function snippet(text, maxLength = 200) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) + '...' : clean;
}

function parseAiJson(text) {
  const block = extractJsonBlock(text);
  if (!block) {
    console.error('No JSON object found in AI response:', snippet(text));
    return null;
  }
  try {
    return JSON5.parse(block);
  } catch (e) {
    console.error('Failed to parse AI JSON:', snippet(text));
    return null;
  }
}

function removeGuidanceLines(text = '') {
  const guidanceRegex =
    /^\s*(?:-\s*\([^)]*\)|\([^)]*\)|\[[^\]]*\])\s*$|\b(?:consolidate relevant experience|add other relevant experience|list key skills|previous roles summarized|for brevity)\b/i;
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\[[^\]]+\](?!\()/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
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
          .map((t) =>
            t.type === 'bullet'
              ? '- '
              : t.href
              ? `[${t.text}](${t.href})`
              : t.text || ''
          )
          .join('')
      );
    });
  });
  return lines.join('\n');
}

function sanitizeGeneratedText(text, options = {}) {
  if (!text) return text;
  const cleaned = removeGuidanceLines(text);
  if (options.defaultHeading === '') return cleaned;
  const reparsed = reparseAndStringify(cleaned, options);
  const data = parseContent(reparsed, { ...options, skipRequiredSections: true });
  const merged = mergeDuplicateSections(data.sections);
  const pruned = pruneEmptySections(merged);
  const lines = [data.name];
  pruned.forEach((sec) => {
    lines.push(`# ${sec.heading}`);
    sec.items.forEach((tokens) => {
      lines.push(
        tokens
          .map((t) =>
            t.type === 'bullet'
              ? '- '
              : t.href
              ? `[${t.text}](${t.href})`
              : t.text || ''
          )
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
    const prompt =
      `You are an expert resume editor. Improve the style and structure of the ` +
      `resume below so it aligns with the job description. Return only the ` +
      `full revised resume text.\n\nResume:\n${text}\n\nJob Description:\n${jobDescription}`;
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

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

registerProcessCv(app, generativeModel);

// Generic error handler to prevent uncaught exceptions from crashing requests
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
export {
  extractText,
  generatePdf,
  setGeneratePdf,
  parseContent,
  parseLine,
  parseAiJson,
  ensureRequiredSections,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractLanguages,
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
  classifyDocument,
  uploadResume,
  parseUserAgent,
  validateUrl,
  extractName,
  sanitizeName,
  region,
  REQUEST_TIMEOUT_MS,
  rateLimiter
};
