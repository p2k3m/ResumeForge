// Utility functions to compute ATS-related metrics for CVs
// Each metric returns a score between 0 and 100

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  // Basic heuristic: count vowel groups
  const groups = w.match(/[aeiouy]+/g);
  const count = groups ? groups.length : 1;
  // Silent 'e'
  return w.endsWith('e') && count > 1 ? count - 1 : count;
}

export function scoreLayoutSearchability(text) {
  const lines = text.split(/\n+/).filter(Boolean);
  if (lines.length === 0) return 0;
  const bulletLines = lines.filter((l) => /^\s*[-*\u2022]/.test(l)).length;
  return Math.min(100, Math.round((bulletLines / lines.length) * 100));
}

export function scoreAtsReadability(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wps = words.length / (sentences.length || 1);
  const spw = syllables / (words.length || 1);
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
  return Math.max(0, Math.min(100, Math.round(flesch)));
}

export function scoreImpact(text) {
  const strongVerbs = [
    'achieved',
    'improved',
    'led',
    'managed',
    'created',
    'developed',
    'increased',
    'reduced',
    'built',
    'designed'
  ];
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const count = strongVerbs.reduce((sum, v) => sum + words.filter((w) => w === v).length, 0);
  return Math.min(100, Math.round((count / (words.length || 1)) * 500));
}

export function scoreCrispness(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  const avg = words.length / (sentences.length || 1);
  const score = 100 - Math.max(0, avg - 12) * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreKeywordDensity(text) {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  if (words.length === 0) return 0;
  const freq = words.reduce((map, w) => {
    map[w] = (map[w] || 0) + 1;
    return map;
  }, {});
  const repeated = Object.values(freq).filter((c) => c > 1).length;
  const density = repeated / words.length;
  return Math.min(100, Math.round(density * 500));
}

export function scoreSectionHeadingClarity(text) {
  const lines = text.split(/\n+/).map((l) => l.toLowerCase());
  const headings = [
    'experience',
    'education',
    'skills',
    'projects',
    'summary',
    'contact'
  ];
  const found = headings.filter((h) => lines.some((l) => l.includes(h)));
  return Math.round((found.length / headings.length) * 100);
}

export function scoreContactInfoCompleteness(text) {
  const email = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text);
  const phone = /\b(?:\+?\d{1,2}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]?\d{3}[\s-]?\d{4}\b/.test(
    text
  );
  const components = [email, phone];
  const score = components.filter(Boolean).length / components.length;
  return Math.round(score * 100);
}

export function scoreGrammar(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const errors = sentences.filter((s) => !/^[A-Z]/.test(s.trim())).length;
  const score = 100 - (errors / sentences.length) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateMetrics(text) {
  return {
    layoutSearchability: scoreLayoutSearchability(text),
    atsReadability: scoreAtsReadability(text),
    impact: scoreImpact(text),
    crispness: scoreCrispness(text),
    keywordDensity: scoreKeywordDensity(text),
    sectionHeadingClarity: scoreSectionHeadingClarity(text),
    contactInfoCompleteness: scoreContactInfoCompleteness(text),
    grammar: scoreGrammar(text),
  };
}

export function compareMetrics(originalText, improvedText) {
  const original = calculateMetrics(originalText);
  const improved = calculateMetrics(improvedText);
  const table = Object.keys(original).map((metric) => {
    const orig = original[metric];
    const imp = improved[metric];
    const improvement = orig === 0 ? 0 : ((imp - orig) / orig) * 100;
    return {
      metric,
      original: orig,
      improved: imp,
      improvement: Math.round(improvement * 100) / 100
    };
  });
  return { original, improved, table };
}
