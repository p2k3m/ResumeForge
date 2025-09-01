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

function selectTemplates({
  defaultCvTemplate = CV_TEMPLATES[0],
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
  if (!template1 && !template2) {
    // Default to the classic "ucmo" template paired with a contrasting style
    template1 = 'ucmo';
    const candidates = CV_TEMPLATES.filter(
      (t) => t !== 'ucmo' && CV_TEMPLATE_GROUPS[t] !== CV_TEMPLATE_GROUPS['ucmo']
    );
    template2 =
      candidates[Math.floor(Math.random() * candidates.length)] ||
      CV_TEMPLATES[0];
  } else {
    template1 = template1 || defaultCvTemplate;
    if (!template2) {
      // Try to find a contrasting template for the specified template1
      const pair = CONTRASTING_PAIRS.find((p) => p.includes(template1));
      if (pair) {
        template2 = pair.find((t) => t !== template1);
      } else {
        template2 = CV_TEMPLATES.find(
          (t) => t !== template1 && CV_TEMPLATE_GROUPS[t] !== CV_TEMPLATE_GROUPS[template1]
        );
      }
    } else {
      template2 = template2;
    }
  }
  if (
    template1 === template2 ||
    CV_TEMPLATE_GROUPS[template1] === CV_TEMPLATE_GROUPS[template2]
  ) {
    template2 =
      CV_TEMPLATES.find(
        (t) => t !== template1 && CV_TEMPLATE_GROUPS[t] !== CV_TEMPLATE_GROUPS[template1]
      ) || CV_TEMPLATES[0];
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
      skills: extractList('skills')
    };
  } catch (err) {
    throw new Error('LinkedIn profile fetch failed');
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

  const technicalTerms = [
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

  const lower = text.toLowerCase();
  const skills = [];
  for (const term of technicalTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'g');
    const matches = lower.match(regex);
    if (matches && matches.length > 1) {
      skills.push(term.replace(/\\+\\+/g, '++'));
    }
  }

  return { title, skills, text };
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
          flushSegment(piece.slice(lastIndex, match.index));
        }
        if (match[1] && match[2]) {
          tokens.push({
            type: 'link',
            text: match[1].replace(/[*_]/g, ''),
            href: match[2],
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        } else if (match[3]) {
          const domainMap = { 'linkedin.com': 'LinkedIn', 'github.com': 'GitHub' };
          let label = match[3];
          try {
            const hostname = new URL(match[3]).hostname.replace(/^www\./, '');
            label = domainMap[hostname] || match[3];
          } catch {
            label = match[3];
          }
          tokens.push({
            type: 'link',
            text: label.replace(/[*_]/g, ''),
            href: match[3],
            continued: true,
            ...(forceBold ? { style: 'bold' } : {})
          });
        }
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
  const lower = base.toLowerCase().replace(/\s+/g, ' ');
  if (
    /^certifications?$/.test(lower) ||
    /^trainings?$/.test(lower) ||
    /^trainings?\s*[\/&]\s*certifications?$/.test(lower)
  ) {
    return 'Certification';
  }
  return base;
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
    const key = normalizeHeading(heading).toLowerCase();
    let section = data.sections.find(
      (s) => normalizeHeading(s.heading).toLowerCase() === key
    );
    if (!section) {
      section = { heading: normalizeHeading(heading), items: [] };
      data.sections.push(section);
    } else {
      section.heading = normalizeHeading(section.heading);
    }
    if (heading.toLowerCase() === 'work experience') {
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
          return { key, exp: parsed, tokens };
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

      const formattedAdditions = additions.map((exp) => {
        const tokens = parseLine(format(exp));
        if (!tokens.some((t) => t.type === 'bullet')) {
          tokens.unshift({ type: 'bullet' });
        }
        if (exp.responsibilities && exp.responsibilities.length) {
          exp.responsibilities.forEach((r) => {
            tokens.push({ type: 'newline' });
            tokens.push({ type: 'tab' });
            let respTokens = parseLine(String(r));
            if (!respTokens.some((t) => t.type === 'bullet')) {
              respTokens.unshift({ type: 'bullet' });
            }
            tokens.push(...respTokens);
          });
        }
        return { key: exp.key, exp, tokens };
      });

      const all = [...existing, ...formattedAdditions];
      all.sort((a, b) => {
        const aDate = Date.parse(a.exp.endDate || a.exp.startDate || '');
        const bDate = Date.parse(b.exp.endDate || b.exp.startDate || '');
        return (isNaN(bDate) ? 0 : bDate) - (isNaN(aDate) ? 0 : aDate);
      });

      section.items = all.length
        ? all.map((e) => e.tokens)
        : [parseLine('Information not provided')];
    } else if (!section.items || section.items.length === 0) {
      if (heading.toLowerCase() === 'education') {
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
  const existing = certSection
    ? certSection.items.map((tokens) => {
        if (tokens[0]?.type !== 'bullet') {
          const idx = tokens.findIndex((t) => t.type === 'bullet');
          if (idx > -1) {
            const [bullet] = tokens.splice(idx, 1);
            tokens.unshift(bullet);
          } else {
            tokens.unshift({ type: 'bullet' });
          }
        }
        const text = tokens
          .map((t) => t.text || t.href || '')
          .join(' ')
          .trim();
        const parsed = extractCertifications([text])[0] || {};
        const key = [
          parsed.name || '',
          parsed.provider || '',
          parsed.url || ''
        ]
          .map((s) => s.toLowerCase())
          .join('|');
        return { key, tokens };
      })
    : [];

  const seenCerts = new Set(existing.map((e) => e.key));
  const combinedCerts = [...resumeCertifications, ...linkedinCertifications];
  const certAdditions = [];
  combinedCerts.forEach((cert) => {
    const key = [cert.name || '', cert.provider || '', cert.url || '']
      .map((s) => s.toLowerCase())
      .join('|');
    if (seenCerts.has(key)) return;
    seenCerts.add(key);
    let line = cert.name || '';
    if (cert.provider) line += ` - ${cert.provider}`;
    if (cert.url) line += ` ${cert.url}`;
    let tokens = parseLine(line);
    if (tokens[0]?.type !== 'bullet') {
      tokens.unshift({ type: 'bullet' });
    }
    certAdditions.push({ key, tokens });
  });

  if (!certSection && (existing.length || certAdditions.length)) {
    certSection = { heading: certHeading, items: [] };
    data.sections.push(certSection);
  }

  if (certSection) {
    certSection.heading = normalizeHeading(certSection.heading || certHeading);
    certSection.items = [...existing.map((e) => e.tokens), ...certAdditions.map((c) => c.tokens)];
    if (!certSection.items.length) {
      certSection.items = [parseLine('Information not provided')];
    }
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

function splitSkills(sections = []) {
  sections.forEach((sec) => {
    if (!sec.heading || sec.heading.toLowerCase() !== 'skills') return;
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
  });
}

function moveSummaryJobEntries(sections = []) {
  const summary = sections.find(
    (s) => s.heading && s.heading.toLowerCase() === 'summary'
  );
  if (!summary) return;
  let work = sections.find(
    (s) => s.heading && s.heading.toLowerCase() === 'work experience'
  );
  if (!work) {
    work = { heading: 'Work Experience', items: [] };
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
  return result;
}

function pruneEmptySections(sections = []) {
  return sections.filter((sec) => {
    sec.items = (sec.items || []).filter((tokens) =>
      tokens.some((t) => t.text && t.text.trim())
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
    splitSkills(sections);
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
      if (!line.trim()) {
        if (current.length) current.push({ type: 'newline' });
        continue;
      }
      const headingMatch = line.trim().match(/^#{1,6}\s+(.*)/);
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
    splitSkills(sections);
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
            if (t.type === 'newline') return '<br>';
            if (t.type === 'tab') return '<span class="tab"></span>';
            if (t.type === 'bullet') {
              if (sec.heading === 'Education') {
                return '<span class="edu-bullet">–</span> ';
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
        eduBullet: '–',
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
        eduBullet: '–',
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
        eduBullet: '–',
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
        eduBullet: '–',
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
        eduBullet: '–',
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
                sec.heading === 'Education'
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
      const parts = dateMatch[1].split(/[-–to]+/);
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
    return { company, title, startDate, endDate, responsibilities: [] };
  };
  if (Array.isArray(source)) {
    return source.map((s) => (typeof s === 'string' ? parseEntry(s) : s));
  }
  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^experience/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*$/.test(trimmed)) {
      inSection = false;
      current = null;
      continue;
    }
    if (inSection) {
      const jobMatch = line.match(/^[-*]\s+(.*)/);
      if (jobMatch) {
        current = parseEntry(jobMatch[1].trim());
        entries.push(current);
        continue;
      }
      const respMatch = line.match(/^\s+[-*]\s+(.*)/);
      if (current && respMatch) {
        current.responsibilities.push(respMatch[1].trim());
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
      const url =
        item.url || item.credentialUrl || item.link || item.certUrl || '';
      if (url || name || provider) return { name, provider, url };
      return parseEntry(String(item));
    });
  }

  const lines = String(source).split(/\r?\n/);
  const entries = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
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
    if (section) {
      section.items.push(projectTokens);
    } else {
      section = data.sections.find((s) => /work experience/i.test(s.heading));
      if (section) section.items.push(projectTokens);
      else data.sections.push({ heading: 'Projects', items: [projectTokens] });
    }
  }

  const lines = [data.name];
  data.sections.forEach((sec) => {
    lines.push(`# ${sec.heading}`);
    sec.items.forEach((tokens) => {
      lines.push(tokens.map((t) => t.text || '').join(''));
    });
  });
  return lines.join('\n');
}

function sanitizeGeneratedText(text, options = {}) {
  if (!text) return text;
  const cleaned = removeGuidanceLines(text);
  if (options.defaultHeading === '') return cleaned;
  return reparseAndStringify(cleaned, options);
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

  const { jobDescriptionUrl, linkedinProfileUrl } = req.body;
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
      message: `jobDescriptionUrl=${jobDescriptionUrl}; linkedinProfileUrl=${linkedinProfileUrl}`
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
        const projectText = Array.isArray(projectField)
          ? projectField[0]
          : projectField;
        const sanitizeOptions = {
          resumeExperience,
          linkedinExperience,
          resumeEducation,
          linkedinEducation,
          resumeCertifications,
          linkedinCertifications,
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
              jobTitle
            }
          : name === 'cover_letter1' || name === 'cover_letter2'
          ? { skipRequiredSections: true, defaultHeading: '' }
          : {};
      const inputText =
        name === 'cover_letter1' || name === 'cover_letter2'
          ? sanitizeGeneratedText(text, options)
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
    res.json({ urls, applicantName });
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
  mergeResumeWithLinkedIn,
  TEMPLATE_IDS,
  CV_TEMPLATES,
  CL_TEMPLATES,
  CV_TEMPLATE_GROUPS,
  CONTRASTING_PAIRS,
  selectTemplates,
  removeGuidanceLines,
  sanitizeGeneratedText
};
