import { clamp } from '../scoring/atsMetrics.js';

/**
 * Canonical set of technology and job-related keywords used when extracting
 * skills from resumes or job descriptions. Shared across microservices so that
 * skill extraction remains consistent regardless of deployment target.
 */
export const TECHNICAL_TERMS = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c++',
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
  'ansible',
];

const escapeForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function extractResumeSkills(text = '') {
  const lower = text.toLowerCase();
  const skills = [];
  for (const term of TECHNICAL_TERMS) {
    const regex = new RegExp(`\\b${escapeForRegex(term)}\\b`, 'g');
    if (regex.test(lower)) {
      skills.push(term);
    }
  }
  return skills;
}

export function calculateMatchScore(jobSkills = [], resumeSkills = []) {
  const table = jobSkills.map((skill) => {
    const matched = resumeSkills.some(
      (candidate) => candidate.toLowerCase() === skill.toLowerCase()
    );
    return { skill, matched };
  });
  const matchedCount = table.filter((entry) => entry.matched).length;
  const score = jobSkills.length
    ? Math.round((matchedCount / jobSkills.length) * 100)
    : 0;
  const newSkills = table.filter((entry) => !entry.matched).map((entry) => entry.skill);
  return { score, table, newSkills };
}

export function normalizeSkillListInput(value) {
  const values = [];

  const pushValues = (input) => {
    if (input === null || input === undefined) {
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((entry) => pushValues(entry));
      return;
    }
    if (typeof input === 'object') {
      Object.values(input).forEach((entry) => pushValues(entry));
      return;
    }
    if (typeof input === 'string') {
      input
        .split(/[\n,]/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => values.push(token));
    }
  };

  pushValues(value);

  const seen = new Set();
  const normalized = [];
  for (const entry of values) {
    const key = entry.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(entry);
  }
  return normalized;
}

export function computeResumeScoreSummary({ jobSkills = [], resumeText = '', jobText = '' }) {
  const resumeSkills = extractResumeSkills(resumeText);
  const match = calculateMatchScore(jobSkills, resumeSkills);

  return {
    match,
    resumeSkills,
    resumeText,
    jobText,
  };
}

export function sanitizeScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 0;
  }
  return clamp(score, 0, 100);
}

export default {
  TECHNICAL_TERMS,
  extractResumeSkills,
  calculateMatchScore,
  normalizeSkillListInput,
  computeResumeScoreSummary,
  sanitizeScore,
};
