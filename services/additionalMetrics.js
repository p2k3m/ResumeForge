// Additional resume evaluation metrics and scoring utilities
import {
  scoreSectionHeadingClarity,
  scoreContactInfoCompleteness,
} from './atsMetrics.js';

export function scoreRoleTitleMatch(text = '', jobTitle = '') {
  if (!jobTitle) return 0;
  const words = jobTitle.toLowerCase().split(/\W+/).filter(Boolean);
  const resumeLower = text.toLowerCase();
  const matched = words.filter((w) => resumeLower.includes(w)).length;
  return words.length ? Math.round((matched / words.length) * 100) : 0;
}

export function scoreExperienceRelevance(resumeSkills = [], jobSkills = []) {
  if (!jobSkills.length) return 0;
  const resumeSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const matched = jobSkills.filter((s) => resumeSet.has(s.toLowerCase())).length;
  return Math.round((matched / jobSkills.length) * 100);
}

export function scoreAccomplishmentDensity(text = '') {
  const bullets = text
    .split(/\n+/)
    .filter((l) => /^\s*[-*\u2022]/.test(l.trim()));
  if (!bullets.length) return 0;
  const quantified = bullets.filter((l) => /\d/.test(l)).length;
  return Math.round((quantified / bullets.length) * 100);
}

export function scoreFormatParsability(text = '') {
  const total = text.length || 1;
  const badChars = text.match(/[|]{2,}|_{2,}|\t+/g) || [];
  const badLen = badChars.join('').length;
  const score = 100 - Math.round((badLen / total) * 100);
  return Math.max(0, Math.min(100, score));
}

export function scoreSectionCompleteness(text = '') {
  return scoreSectionHeadingClarity(text);
}

export function scoreContactHygiene(text = '') {
  return scoreContactInfoCompleteness(text);
}

export function scoreDateConsistency(text = '') {
  const dates = Array.from(text.matchAll(/(?:19|20)\d{2}/g)).map((m) =>
    parseInt(m[0], 10)
  );
  if (dates.length < 2) return 100;
  let inconsistencies = 0;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] > dates[i - 1]) inconsistencies++;
  }
  const score = 100 - Math.round((inconsistencies / (dates.length - 1)) * 100);
  return Math.max(0, score);
}

export function scoreRedFlagScan(text = '') {
  const flags = [
    'fired',
    'terminated',
    'arrest',
    'criminal',
    'misconduct',
    'lawsuit',
    'inappropriate',
    'sued',
    'probation',
    'guilty',
    'convicted',
    'layoff',
  ];
  const lower = text.toLowerCase();
  const count = flags.reduce(
    (sum, flag) => sum + (lower.includes(flag) ? 1 : 0),
    0
  );
  return Math.max(0, 100 - count * 20);
}

export function calculateAdditionalMetrics(
  text = '',
  { jobTitle = '', jobSkills = [], resumeSkills = [] } = {}
) {
  return {
    roleTitleMatch: scoreRoleTitleMatch(text, jobTitle),
    experienceRelevance: scoreExperienceRelevance(resumeSkills, jobSkills),
    accomplishmentDensity: scoreAccomplishmentDensity(text),
    formatParsability: scoreFormatParsability(text),
    sectionCompleteness: scoreSectionCompleteness(text),
    contactHygiene: scoreContactHygiene(text),
    dateConsistency: scoreDateConsistency(text),
    redFlagScan: scoreRedFlagScan(text),
  };
}

export const CARD_METRICS = {
  alignment: ['roleTitleMatch', 'experienceRelevance'],
  accomplishments: ['accomplishmentDensity'],
  format: ['formatParsability', 'sectionCompleteness'],
  hygiene: ['contactHygiene', 'dateConsistency'],
  risk: ['redFlagScan'],
};
export const METRIC_WEIGHTS = {
  atsReadability: 0.18,
  keywordDensity: 0.22,
  impact: 0.15,
  crispness: 0.1,
  experienceRelevance: 0.12,
  layoutSearchability: 0.08,
  grammar: 0.05,
  formatParsability: 0.05,
  sectionCompleteness: 0.03,
};

export function aggregateCardScores(metrics = {}, atsScore = 0) {
  const cardScores = { ats: Math.round(atsScore) };
  for (const [card, metricList] of Object.entries(CARD_METRICS)) {
    const vals = metricList
      .map((m) => metrics[m])
      .filter((v) => typeof v === 'number');
    cardScores[card] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
  }
  return cardScores;
}

export function computeOverallScore(metrics = {}) {
  const score =
    (metrics.atsReadability || 0) * METRIC_WEIGHTS.atsReadability +
    (metrics.keywordDensity || 0) * METRIC_WEIGHTS.keywordDensity +
    (metrics.impact || 0) * METRIC_WEIGHTS.impact +
    (metrics.crispness || 0) * METRIC_WEIGHTS.crispness +
    (metrics.experienceRelevance || 0) *
      METRIC_WEIGHTS.experienceRelevance +
    (metrics.layoutSearchability || 0) * METRIC_WEIGHTS.layoutSearchability +
    (metrics.grammar || 0) * METRIC_WEIGHTS.grammar +
    (metrics.formatParsability || 0) * METRIC_WEIGHTS.formatParsability +
    (metrics.sectionCompleteness || 0) *
      METRIC_WEIGHTS.sectionCompleteness;
  const penalty = ((100 - (metrics.redFlagScan ?? 100)) / 100) * 8;
  return Math.round(Math.max(0, score - penalty));
}

export function calculateSelectionProbability({
  overallScore = 0,
  atsScore = 0,
  keywordMatch = 0,
} = {}) {
  const logistic = (x) => 1 / (1 + Math.exp(-(x - 50) / 10));
  const prob =
    0.5 * logistic(overallScore) +
    0.3 * logistic(keywordMatch) +
    0.2 * logistic(atsScore);
  return Math.round(prob * 100);
}

export default {
  calculateAdditionalMetrics,
  aggregateCardScores,
  computeOverallScore,
  calculateSelectionProbability,
};
