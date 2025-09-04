import express from 'express';
import cors from 'cors';
import multer from 'multer';
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
import fs from 'fs/promises';
import fsSync from 'fs';
import { logEvent } from './logger.js';
import { uploadFile as openaiUploadFile, requestEnhancedCV } from './openaiClient.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { getSecrets } from './config/secrets.js';
import puppeteer from 'puppeteer';
import JSON5 from 'json5';
import { convertToPdf } from './lib/convertToPdf.js';
import registerProcessCv from './routes/processCv.js';
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
} from './services/parseContent.js';

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

function validateUrl(input, allowedDomains = []) {
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (
      allowedDomains.length &&
      !allowedDomains.some(
        (d) => host === d || host.endsWith(`.${d}`)
      )
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Only .pdf, .doc, .docx files are allowed'));
    }
    if (ext === '.doc') {
      return cb(new Error('Legacy .doc files are not supported. Please upload a .pdf or .docx file.'));
    }
    cb(null, true);
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
  // Default CV templates to '2025' unless explicitly provided
  if (!template1) template1 = '2025';
  if (!template2) template2 = '2025';

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

async function fetchLinkedInProfile(url) {
  const valid = validateUrl(url, ['linkedin.com']);
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
  const valid = validateUrl(url, ['credly.com']);
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
    extractEducation(resumeText).join('\n'),
    extractEducation(linkedinData.education || []).join('\n'),
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
  const projects = sectionMap.projects || '';

  return {
    summary,
    experience,
    education,
    certifications,
    certificationUrls,
    skills,
    projects
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
      `Return only JSON with keys summary, experience, education, certifications, skills, projects, projectSnippet, latestRoleTitle, latestRoleDescription, mandatorySkills, addedSkills.` +
      `\nSections: ${JSON.stringify(sectionData)}\nJob Description: ${jobDescription}`;
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
      const certWithLinks = (parsed.certifications || []).map((c, i) => {
        const url = certificationUrls[i];
        return url ? `[${c}](${url})` : c;
      });
      lines.push(...mk('Certifications', certWithLinks));
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
  if (!ALL_TEMPLATES.includes(templateId)) templateId = 'modern';
  const data = parseContent(text, options);
  data.sections.forEach((sec) => {
    sec.heading = normalizeHeading(sec.heading);
  });
  data.sections = mergeDuplicateSections(data.sections);
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
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    let css = '';
    try {
      css = await fs.readFile(path.resolve('templates', `${templateId}.css`), 'utf-8');
    } catch {}
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
  }
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return pdfBuffer;
  } catch (err) {
    // Fallback for environments without Chromium dependencies
    const { default: PDFDocument } = await import('pdfkit');
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
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      // Optional font embedding for Roboto/Helvetica families if available
      try {
        const fontsDir = path.resolve('fonts');
        const rReg = path.join(fontsDir, 'Roboto-Regular.ttf');
        const rBold = path.join(fontsDir, 'Roboto-Bold.ttf');
        const rItalic = path.join(fontsDir, 'Roboto-Italic.ttf');
        const haveRoboto = [rReg, rBold, rItalic].every((p) => fsSync.existsSync(p));
        if (haveRoboto) {
          doc.registerFont('Roboto', rReg);
          doc.registerFont('Roboto-Bold', rBold);
          doc.registerFont('Roboto-Italic', rItalic);
          ['modern', 'vibrant'].forEach((tpl) => {
            styleMap[tpl].font = 'Roboto';
            styleMap[tpl].bold = 'Roboto-Bold';
            styleMap[tpl].italic = 'Roboto-Italic';
          });
        } else {
          const missing = [rReg, rBold, rItalic].filter((p) => !fsSync.existsSync(p));
          if (missing.length) console.warn('Roboto fonts missing:', missing.map((m) => path.basename(m)));
        }

        const hReg = path.join(fontsDir, 'Helvetica.ttf');
        const hBold = path.join(fontsDir, 'Helvetica-Bold.ttf');
        const hItalic = path.join(fontsDir, 'Helvetica-Oblique.ttf');
        [
          [hReg, 'Helvetica'],
          [hBold, 'Helvetica-Bold'],
          [hItalic, 'Helvetica-Oblique']
        ].forEach(([p, name]) => {
          if (fsSync.existsSync(p)) doc.registerFont(name, p);
        });
      } catch (err) {
        console.warn('Font registration error', err);
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
  } finally {
    if (browser) await browser.close();
  }
};

function setGeneratePdf(fn) {
  generatePdf = fn;
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }
  return file.buffer.toString();
}

function classifyDocument(text) {
  const lower = text.toLowerCase();
  const resumeIndicators = [
    'education',
    'experience',
    'skills',
    'work history',
    'professional summary',
  ];
  const coverLetterIndicators = ['dear', 'sincerely', 'cover letter'];

  const resumeScore = resumeIndicators.filter((i) => lower.includes(i)).length;
  const coverLetterScore = coverLetterIndicators.filter((i) => lower.includes(i)).length;

  if (resumeScore >= 2) return 'resume';
  if (coverLetterScore >= 1 && resumeScore === 0) return 'cover letter';
  return 'unknown';
}

function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
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

registerProcessCv(app);

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
  REQUEST_TIMEOUT_MS
};
