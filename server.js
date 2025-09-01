import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import fs from 'fs/promises';
import fsSync from 'fs';
import { logEvent } from './logger.js';
import Handlebars from './lib/handlebars.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import JSON5 from 'json5';

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

const DEFAULT_SECRET_ID = 'ResumeForge';
const DEFAULT_AWS_REGION = 'ap-south-1';

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
  // Ensure one template is 'ucmo' and the other is from a different group
  const pickNonUcmo = (tpl) => {
    if (tpl && tpl !== 'ucmo' && CV_TEMPLATE_GROUPS[tpl] !== CV_TEMPLATE_GROUPS['ucmo']) {
      return tpl;
    }
    const candidates = CV_TEMPLATES.filter(
      (t) => t !== 'ucmo' && CV_TEMPLATE_GROUPS[t] !== CV_TEMPLATE_GROUPS['ucmo']
    );
    return candidates[Math.floor(Math.random() * candidates.length)] || CV_TEMPLATES.find((t) => t !== 'ucmo');
  };

  if (template1 === 'ucmo') {
    template2 = pickNonUcmo(template2);
  } else if (template2 === 'ucmo') {
    template1 = pickNonUcmo(template1);
  } else if (template1 && !template2) {
    template1 = pickNonUcmo(template1);
    template2 = 'ucmo';
  } else if (!template1 && template2) {
    template2 = pickNonUcmo(template2);
    template1 = 'ucmo';
  } else if (template1 && template2) {
    template1 = pickNonUcmo(template1);
    template2 = 'ucmo';
  } else {
    template1 = 'ucmo';
    template2 = pickNonUcmo();
  }

  if (
    !template2 ||
    template1 === template2 ||
    CV_TEMPLATE_GROUPS[template1] === CV_TEMPLATE_GROUPS[template2]
  ) {
    const candidates = CV_TEMPLATES.filter(
      (t) => t !== template1 && CV_TEMPLATE_GROUPS[t] !== CV_TEMPLATE_GROUPS[template1]
    );
    template2 =
      candidates[Math.floor(Math.random() * candidates.length)] ||
      CV_TEMPLATES[0];
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

process.env.SECRET_ID = process.env.SECRET_ID || DEFAULT_SECRET_ID;
process.env.AWS_REGION = process.env.AWS_REGION || DEFAULT_AWS_REGION;

const region = process.env.AWS_REGION || 'ap-south-1';
const secretsClient = new SecretsManagerClient({ region });

let secretCache;
async function getSecrets() {
  if (secretCache) return secretCache;
  const secretId = process.env.SECRET_ID;
  if (!secretId) {
    try {
      const data = await fs.readFile(path.resolve('local-secrets.json'), 'utf-8');
      secretCache = JSON.parse(data);
      return secretCache;
    } catch (err) {
      throw new Error('SECRET_ID environment variable is required');
    }
  }
  const { SecretString } = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  secretCache = JSON.parse(SecretString ?? '{}');
  return secretCache;
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
      const linkRegex = /\[([^\]]+)\]\((https?:\/\/\S+?)\)|(https?:\/\/\S+)/g;
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
        if (match.index > lastIndex) {
          let segment = piece.slice(lastIndex, match.index);
          if (segment.endsWith('(')) segment = segment.slice(0, -1);
          flushSegment(segment);
        }
        if (match[1] && match[2]) {
          let href = match[2];
          if (href.endsWith(')')) href = href.slice(0, -1);
          tokens.push({
            type: 'link',
            text: match[1].replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        } else if (match[3]) {
          let href = match[3];
          if (href.endsWith(')')) href = href.slice(0, -1);
          const domainMap = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub' };
          let label = href;
          try {
            const hostname = new URL(href).hostname.replace(/^www\./, '');
            label = domainMap[hostname] || href;
          } catch {
            label = href;
          }
          tokens.push({
            type: 'link',
            text: label.replace(/[*_]/g, ''),
            href,
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        }
        if (piece[linkRegex.lastIndex] === ')') linkRegex.lastIndex++;
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
  if (
    /^certifications?$/.test(lower) ||
    /^trainings?$/.test(lower) ||
    /^trainings?\s*[\/&]\s*certifications?$/.test(lower)
  ) {
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
    skipRequiredSections = false
  } = {},
) {
  if (skipRequiredSections) {
    data.sections = data.sections.filter((s) => s.items && s.items.length);
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
      const existing = section.items
        .map((tokens) => {
          const parts = [];
          for (const t of tokens) {
            if (t.type === 'newline') break;
            if (t.text) parts.push(t.text);
          }
          const line = parts.join('').trim();
          if (!line) return null;
          const parsed = extractExperience([line])[0];
          if (!parsed) return null;
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

      section.items = all.length
        ? all.map((e) => e.tokens)
        : [parseLine('Information not provided')];
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
    deduped.push(cert);
  });

  if (deduped.length) {
    if (!certSection) {
      certSection = { heading: certHeading, items: [] };
      data.sections.push(certSection);
    }
    certSection.heading = certHeading;
    certSection.items = deduped.map((cert) => {
      const base = [cert.name, cert.provider].filter(Boolean).join(' - ');
      const tokens = parseLine(base);
      if (cert.url) {
        if (tokens.length) tokens[tokens.length - 1].continued = true;
        tokens.push({ type: 'paragraph', text: ' (', continued: true });
        tokens.push({ type: 'link', text: 'Credly', href: cert.url, continued: true });
        tokens.push({ type: 'paragraph', text: ')' });
      }
      if (tokens[0]?.type !== 'bullet') tokens.unshift({ type: 'bullet' });
      return tokens;
    });
    if (credlyProfileUrl) {
      const profileTokens = [
        { type: 'bullet' },
        { type: 'link', text: 'Credly Profile', href: credlyProfileUrl }
      ];
      certSection.items.push(profileTokens);
    }
  } else if (certSection) {
    data.sections = data.sections.filter((s) => s !== certSection);
  }

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
    if (!((sec.heading || '').toLowerCase().includes('skill'))) return;
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
      if ((existing.items || []).length === 0 && items.length > 0) {
        const copy = { ...sec, heading, items };
        const idx = result.indexOf(existing);
        if (idx !== -1) result.splice(idx, 1);
        seen.set(key, copy);
        result.push(copy);
      } else {
        existing.items = existing.items.concat(items);
      }
    } else {
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
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
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
    const mergedSections = mergeDuplicateSections(sections);
    const prunedSections = pruneEmptySections(mergedSections);
    const ensured = ensureRequiredSections(
      { name, sections: prunedSections },
      rest
    );
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

let generatePdf = async function (text, templateId = 'modern', options = {}) {
  if (!ALL_TEMPLATES.includes(templateId)) templateId = 'modern';
  const data = parseContent(text, options);
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
              const space = next && next.text && !/^\s/.test(next.text) ? ' ' : '';
              return `<a href="${t.href}">${text.trim()}</a>${space}`;
            }
            if (t.style === 'bolditalic') return `<strong><em>${text}</em></strong>`;
            if (t.style === 'bold') return `<strong>${text}</strong>`;
            if (t.style === 'italic') return `<em>${text}</em>`;
            if (t.type === 'heading') return `<strong>${text}</strong>`;
            if (t.type === 'newline') return '<br>';
            if (t.type === 'tab') return '<span class="tab"></span>';
            if (t.type === 'bullet') {
              if (sec.heading.toLowerCase() === 'education') {
                return '<span class="edu-bullet">-</span> ';
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
  let html = Handlebars.compile(templateSource)(htmlData);
  if (css) {
    html = html.replace('</head>', `<style>${css}</style></head>`);
  }
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
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
        eduBullet: '-',
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
        eduBullet: '-',
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
        eduBullet: '-',
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
        eduBullet: '-',
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
        eduBullet: '-',
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
                sec.heading.toLowerCase() === 'education'
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

function isResume(text) {
  const indicators = ['education', 'experience', 'skills'];
  const lower = text.toLowerCase();
  return indicators.some((i) => lower.includes(i));
}

function extractName(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
}

function sanitizeName(name) {
  return name.trim().split(/\s+/).slice(0, 2).join('_').toLowerCase();
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
    const jobMatch = line.match(/^[-*]\s+(.*)/) || (!line.match(/^\s/) ? [null, trimmed] : null);
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
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : '';
    if (url) text = text.replace(url, '').trim();

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
    console.error('No JSON object found in AI response:', text);
    return null;
  }
  try {
    return JSON5.parse(block);
  } catch (e) {
    console.error('Failed to parse AI JSON:', text);
    return null;
  }
}

function removeGuidanceLines(text = '') {
  const guidanceRegex =
    /^\s*(?:\([^)]*\)|\[[^\]]*\])\s*$|\b(?:consolidate relevant experience|add other relevant experience|list key skills|previous roles summarized|for brevity)\b/i;
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
          .map((t) => (t.type === 'bullet' ? '- ' : t.text || ''))
          .join('')
      );
    });
  });
  return lines.join('\n');
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

app.post('/api/process-cv', (req, res, next) => {
  uploadResume(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const jobId = Date.now().toString();
  const date = new Date().toISOString().slice(0, 10);
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

  const { jobDescriptionUrl, linkedinProfileUrl, credlyProfileUrl } = req.body;
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

  const text = await extractText(req.file);
  if (!isResume(text)) {
    return res
      .status(400)
      .json({ error: 'It does not look like your CV, please upload a CV' });
  }
  const applicantName = extractName(text);
  const sanitizedName = sanitizeName(applicantName);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const prefix = `first/${date}/${sanitizedName}/`;
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

    const { data: jobDescriptionHtml } = await axios.get(jobDescriptionUrl);
    await logEvent({ s3, bucket, key: logKey, jobId, event: 'fetched_job_description' });
    const {
      title: jobTitle,
      skills: jobSkills,
      text: jobDescription
    } = analyzeJobDescription(jobDescriptionHtml);
    const resumeSkills = extractResumeSkills(text);
    const originalMatch = calculateMatchScore(jobSkills, resumeSkills);

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

    const combinedProfile = mergeResumeWithLinkedIn(text, linkedinData, jobTitle);
    const resumeExperience = extractExperience(text);
    const linkedinExperience = extractExperience(linkedinData.experience || []);
    const resumeEducation = extractEducation(text);
    const linkedinEducation = extractEducation(linkedinData.education || []);
    const resumeCertifications = extractCertifications(text);
    const linkedinCertifications = extractCertifications(
      linkedinData.certifications || []
    );

    // Use GEMINI_API_KEY from environment or secrets
    const geminiApiKey = process.env.GEMINI_API_KEY || secrets.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const generativeModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const versionsTemplate = `
  You are an expert resume writer and career coach. Your task is to analyze a candidate's CV and a job description to generate two distinct, highly optimized resumes.

  **Goal:** Maximize the candidate's chances of passing ATS screenings and impressing hiring managers.

  **Input Data:**
  - **Raw CV Text:** {{cvText}}
  - **Job Description Text:** {{jdText}}
  - **Official Job Title:** {{jobTitle}}
  - **Key Skills from Job Description:** {{jobSkills}}

  **Instructions:**
  Return ONLY a valid JSON object with two keys: \`version1\` and \`version2\`. Each value must be a full resume string.

  **For each version, ensure you perform the following enhancements:**
  1. Rewrite the candidate's most recent job title to exactly match the job description's title.
  2. Recast responsibilities to mirror those in the job description.
  3. Incorporate relevant projects and required technical terminology from the job description. Fabricate or emphasize one project that showcases the key skills if necessary.
  4. Enhance content clarity and impact while preserving factual accuracy.
  5. Maintain an ATS-friendly format with appropriate keywords.
  6. Keep any URLs from the original CV unchanged.
  7. Include "Work Experience" and "Education" sections in every resume, adding empty sections if necessary.
  `;

    const versionsPrompt =
      versionsTemplate
        .replace('{{cvText}}', combinedProfile)
        .replace('{{jdText}}', jobDescription)
        .replace('{{jobTitle}}', jobTitle)
        .replace('{{jobSkills}}', jobSkills.join(', ')) +
      '\n\nNote: The candidate performed duties matching the job description in their last role.';

    let versionData = {};
    try {
      const result = await generativeModel.generateContent(versionsPrompt);
      const responseText = result.response.text();
      const parsed = parseAiJson(responseText);
      if (parsed) {
        const projectField =
          parsed.project || parsed.projects || parsed.Projects;
        let projectText = Array.isArray(projectField)
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
          project: projectText
        };
        versionData.version1 = sanitizeGeneratedText(
          parsed.version1,
          sanitizeOptions
        );
        versionData.version2 = sanitizeGeneratedText(
          parsed.version2,
          sanitizeOptions
        );
      }
    } catch (e) {
      console.error('Failed to generate resume versions:', e);
    }

    if (!versionData.version1 || !versionData.version2) {
      await logEvent({ s3, bucket, key: logKey, jobId, event: 'invalid_ai_response', level: 'error', message: 'AI response invalid' });
      return res.status(500).json({ error: 'AI response invalid' });
    }

    const version1Skills = extractResumeSkills(versionData.version1);
    const match1 = calculateMatchScore(jobSkills, version1Skills);
    const version2Skills = extractResumeSkills(versionData.version2);
    const match2 = calculateMatchScore(jobSkills, version2Skills);
    const bestMatch = match1.score >= match2.score ? match1 : match2;

    const coverTemplate = `Using the resume and job description below, craft exactly two tailored cover letters. Return a JSON object with keys "cover_letter1" and "cover_letter2". Ensure any URLs from the resume are preserved.\n\nOfficial Job Title: {{jobTitle}}\nKey Skills: {{jobSkills}}\n\nResume:\n{{cvText}}\n\nJob Description:\n{{jdText}}`;

    const coverPrompt = coverTemplate
      .replace('{{cvText}}', combinedProfile)
      .replace('{{jdText}}', jobDescription)
      .replace('{{jobTitle}}', jobTitle)
      .replace('{{jobSkills}}', jobSkills.join(', '));

    let coverData = {};
    try {
      const coverResult = await generativeModel.generateContent(coverPrompt);
      const coverText = coverResult.response.text();
      const parsed = parseAiJson(coverText);
      if (parsed) coverData = parsed;
    } catch (e) {
      console.error('Failed to generate cover letters:', e);
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
              jobSkills
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
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
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
          device: { S: device }
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
    const originalScore = originalMatch.score;
    const enhancedScore = bestMatch.score;
    const { table, newSkills: missingSkills } = bestMatch;
    const addedSkills = table
      .filter(
        (r) =>
          r.matched &&
          originalMatch.table.some(
            (o) => o.skill === r.skill && !o.matched
          )
      )
      .map((r) => r.skill);
    res.json({
      urls,
      applicantName,
      originalScore,
      enhancedScore,
      table,
      addedSkills,
      missingSkills
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
  ensureRequiredSections,
  extractExperience,
  extractEducation,
  extractCertifications,
  splitSkills,
  fetchLinkedInProfile,
  fetchCredlyProfile,
  mergeResumeWithLinkedIn,
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
  relocateProfileLinks
};
