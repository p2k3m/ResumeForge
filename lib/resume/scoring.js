import {
  ATS_METRIC_DEFINITIONS,
  buildScoreBreakdown,
  computeCompositeAtsScore,
  ensureScoreBreakdownCompleteness,
} from '../scoring/atsMetrics.js';
import {
  calculateMatchScore,
  extractResumeSkills,
  normalizeSkillListInput,
  sanitizeScore,
} from './skills.js';

const SELECTION_METRIC_DEFINITIONS = [
  { key: 'designation', label: 'Designation match' },
  { key: 'experience', label: 'Years / experience' },
  { key: 'skills', label: 'Skill match' },
  { key: 'tasks', label: 'Task overlap' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'certifications', label: 'Certifications' },
];

const PROBABILITY_MIN = 8;
const PROBABILITY_MAX = 97;

function sanitizeText(value) {
  return typeof value === 'string' ? value : '';
}

function sanitizeMultiline(value) {
  return sanitizeText(value).replace(/\r\n/g, '\n');
}

function roundDelta(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value);
}

function describeSelectionStatus(status) {
  switch (status) {
    case 'match':
      return 'a strong match';
    case 'gap':
      return 'a gap';
    case 'partial':
      return 'a partial match';
    case 'info':
      return 'informational coverage';
    default:
      return 'an unknown status';
  }
}

function mapStatusToImpact(status) {
  switch (status) {
    case 'match':
      return 'positive';
    case 'gap':
      return 'negative';
    case 'partial':
      return 'warning';
    default:
      return 'info';
  }
}

function extractDesignationLine(resumeText = '') {
  const lines = sanitizeMultiline(resumeText)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return '';
  }

  const headlineCandidate = lines.slice(0, 4).find((line) => {
    if (!line) return false;
    if (line.length > 80) return false;
    const containsPunctuation = /[.:!?]/.test(line);
    if (containsPunctuation) return false;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 1) return false;
    const upperWords = words.filter((word) => /[A-Z]/.test(word.charAt(0)));
    return upperWords.length >= Math.max(2, Math.floor(words.length / 2));
  });

  return headlineCandidate || lines[0] || '';
}

function normalizeTitle(text = '') {
  return sanitizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeDesignationMetric({ resumeText, jobTitle }) {
  const candidateHeadline = extractDesignationLine(resumeText);
  const normalizedHeadline = normalizeTitle(candidateHeadline);
  const normalizedJobTitle = normalizeTitle(jobTitle);

  let status = 'unknown';
  let score = 60;
  let detail = 'Headline alignment could not be determined.';

  if (normalizedJobTitle && normalizedHeadline) {
    if (
      normalizedHeadline.includes(normalizedJobTitle) ||
      normalizedJobTitle.includes(normalizedHeadline)
    ) {
      status = 'match';
      score = 92;
      detail = 'Headline mirrors the job designation.';
    } else {
      const jobWords = new Set(normalizedJobTitle.split(' ').filter(Boolean));
      const headlineWords = new Set(normalizedHeadline.split(' ').filter(Boolean));
      const overlap = Array.from(jobWords).filter((word) => headlineWords.has(word));
      if (overlap.length >= Math.max(1, Math.floor(jobWords.size / 2))) {
        status = 'partial';
        score = 78;
        detail = `Headline overlaps with the JD designation (${overlap.join(', ')}).`;
      } else {
        status = 'gap';
        score = 58;
        detail = `Headline (“${candidateHeadline || '—'}”) differs from the JD designation.`;
      }
    }
  } else if (normalizedJobTitle) {
    status = 'partial';
    score = 70;
    detail = 'Provide a headline so we can confirm designation alignment.';
  } else if (normalizedHeadline) {
    status = 'info';
    score = 72;
    detail = 'Job title unavailable. Keep headline focused on the target role.';
  }

  return {
    key: 'designation',
    label: 'Designation match',
    score: sanitizeScore(score),
    status,
    detail,
    headline: candidateHeadline,
  };
}

function parseYear(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}$/.test(normalized)) {
    return null;
  }
  const year = Number(normalized);
  return Number.isFinite(year) ? year : null;
}

function estimateExperienceYearsFromText(resumeText = '') {
  const normalized = sanitizeMultiline(resumeText).toLowerCase();
  if (!normalized) {
    return 0;
  }

  const ranges = [];
  const rangeRegex = /(19|20)\d{2}\s*(?:-|–|to)\s*(?:present|current|(19|20)\d{2})/gi;
  let match;
  while ((match = rangeRegex.exec(normalized)) !== null) {
    const startYear = parseYear(match[0].slice(0, 4));
    const endToken = match[0].slice(match[0].lastIndexOf(' ') + 1);
    const endYearToken = endToken.replace(/[^0-9a-z]/gi, '').toLowerCase();
    const currentYear = new Date().getUTCFullYear();
    const endYear =
      endYearToken === 'present' || endYearToken === 'current'
        ? currentYear
        : parseYear(endYearToken);
    if (startYear && endYear && endYear >= startYear) {
      ranges.push([startYear, endYear]);
    }
  }

  const merged = [];
  ranges
    .sort((a, b) => a[0] - b[0])
    .forEach(([start, end]) => {
      if (!merged.length) {
        merged.push([start, end]);
        return;
      }
      const last = merged[merged.length - 1];
      if (start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    });

  let yearsFromRanges = 0;
  merged.forEach(([start, end]) => {
    yearsFromRanges += Math.max(0, end - start + 1);
  });

  const explicitYearsRegex = /(\d{1,2})\s*\+?\s*(years|yrs)/gi;
  let explicitMax = 0;
  let explicitMatch;
  while ((explicitMatch = explicitYearsRegex.exec(normalized)) !== null) {
    const value = Number(explicitMatch[1]);
    if (Number.isFinite(value)) {
      explicitMax = Math.max(explicitMax, value);
    }
  }

  const estimated = Math.max(yearsFromRanges, explicitMax);
  return Math.min(45, Math.round(estimated * 10) / 10);
}

function extractRequiredExperience(jobDescription = '') {
  const text = sanitizeText(jobDescription);
  if (!text) {
    return null;
  }
  const regex = /(?:at\s+least|minimum(?:\s+of)?|min\.?|require(?:s|d)?|with)?\s*(\d+)(?:\s*[-–to]{1,3}\s*(\d+))?\s*(\+|plus)?\s*(?:years|yrs)/gi;
  let highestMin = null;
  let highestMax = null;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const min = Number(match[1]);
    const max = match[2] ? Number(match[2]) : null;
    const hasPlus = Boolean(match[3]);
    if (!Number.isFinite(min)) {
      continue;
    }
    let normalizedMin = min;
    let normalizedMax = max;
    if (normalizedMax !== null && normalizedMax < normalizedMin) {
      [normalizedMax, normalizedMin] = [normalizedMin, normalizedMax];
    }
    if (hasPlus) {
      normalizedMax = null;
    }
    if (highestMin === null || normalizedMin > highestMin) {
      highestMin = normalizedMin;
    }
    if (normalizedMax === null) {
      highestMax = null;
    } else if (highestMax !== null) {
      highestMax = Math.max(highestMax, normalizedMax);
    } else {
      highestMax = normalizedMax;
    }
  }
  if (highestMin === null) {
    return null;
  }
  return { minYears: highestMin, maxYears: highestMax };
}

function computeExperienceMetric({ resumeText, jobDescription }) {
  const candidateYears = estimateExperienceYearsFromText(resumeText);
  const required = extractRequiredExperience(jobDescription);

  let status = 'unknown';
  let detail =
    candidateYears > 0
      ? `Resume indicates roughly ${candidateYears} years of experience.`
      : 'Experience duration not detected—add clear timelines for each role.';
  let score = candidateYears > 0 ? 68 : 52;

  if (required) {
    const { minYears, maxYears } = required;
    if (candidateYears <= 0) {
      status = 'gap';
      score = 42;
      detail = `The JD requests ${minYears}+ years. Add role dates to show your tenure.`;
    } else if (candidateYears >= minYears) {
      status = 'match';
      score = 92;
      detail = `Resume reflects ~${candidateYears} years, meeting the ${minYears}+ year requirement.`;
      if (maxYears && candidateYears > maxYears + 2) {
        status = 'info';
        score = 80;
        detail += ` Frame senior projects so they align with the ${maxYears}-year focus.`;
      }
    } else if (minYears - candidateYears <= 1) {
      status = 'partial';
      score = 74;
      detail = `Within about ${Math.round((minYears - candidateYears) * 10) / 10} years of the ${minYears}+ requirement—surface longer engagements.`;
    } else {
      status = 'gap';
      score = 50;
      detail = `Resume shows about ${candidateYears} years. Highlight earlier roles to close the ${minYears}+ year gap.`;
    }
  } else if (candidateYears > 0) {
    status = 'info';
    score = 76;
    detail = `JD does not specify tenure. Resume signals ~${candidateYears} years of experience.`;
  }

  return {
    key: 'experience',
    label: 'Years / experience',
    score: sanitizeScore(score),
    status,
    detail,
    candidateYears,
    requiredYears: required?.minYears ?? null,
    maximumYears: required?.maxYears ?? null,
  };
}

function computeSkillMetric({ matchScore, missingSkills, addedSkills }) {
  const missing = Array.isArray(missingSkills)
    ? missingSkills.filter(Boolean)
    : [];
  const added = Array.isArray(addedSkills)
    ? addedSkills.filter(Boolean)
    : [];
  const score = sanitizeScore(matchScore);
  let status = 'match';
  let detail = `Resume covers ${score}% of the JD skills.`;
  if (score < 70) {
    status = missing.length ? 'gap' : 'partial';
    detail =
      missing.length > 0
        ? `Still missing ${missing.slice(0, 4).join(', ')} from the JD.`
        : `Resume covers ${score}% of the JD skills—reinforce keywords throughout the experience section.`;
  } else if (added.length) {
    detail = `Now covers ${score}% of JD skills, adding ${added.slice(0, 4).join(', ')}.`;
  }
  return {
    key: 'skills',
    label: 'Skill match',
    score,
    status,
    detail,
    missing,
    added,
  };
}

function computeTaskMetric({ atsBreakdown }) {
  const impactScore = Number(atsBreakdown?.impact?.score) || 0;
  let status = 'unknown';
  let detail = 'Task alignment insights were unavailable.';
  if (impactScore >= 80) {
    status = 'match';
    detail = 'Achievement bullets mirror JD responsibilities.';
  } else if (impactScore >= 55) {
    status = 'partial';
    detail = 'Some bullets align with the JD—add measurable outcomes for task ownership.';
  } else {
    status = 'gap';
    detail = 'Rework bullets to highlight JD-specific tasks and quantifiable results.';
  }
  const normalizedScore = sanitizeScore(
    impactScore >= 80 ? Math.max(impactScore, 82) : impactScore >= 55 ? Math.max(impactScore, 68) : Math.max(impactScore, 45)
  );
  return {
    key: 'tasks',
    label: 'Task overlap',
    score: normalizedScore,
    status,
    detail,
    rawImpactScore: impactScore,
  };
}

function computeHighlightMetric({ atsBreakdown }) {
  const crispnessScore = Number(atsBreakdown?.crispness?.score) || 0;
  const otherScore = Number(atsBreakdown?.otherQuality?.score) || 0;
  const composite = sanitizeScore(Math.round((crispnessScore + otherScore) / 2));
  let status = 'info';
  let detail = 'Highlights are generally clear and skimmable.';
  if (composite >= 80) {
    status = 'match';
    detail = 'Highlights are crisp with measurable outcomes.';
  } else if (composite < 55) {
    status = 'gap';
    detail = 'Tighten bullets and emphasise impact to sharpen highlights.';
  }
  return {
    key: 'highlights',
    label: 'Highlights',
    score: composite,
    status,
    detail,
  };
}

function computeCertificationMetric({ resumeText, jobDescription }) {
  const normalizedResume = sanitizeMultiline(resumeText).toLowerCase();
  const normalizedJob = sanitizeText(jobDescription).toLowerCase();
  const resumeHasCerts =
    /certifications?|licenses?/i.test(resumeText) ||
    /certified|credential|license/i.test(resumeText);
  const jobRequestsCerts = /certification|certified|license|credential/.test(normalizedJob);

  let status = 'info';
  let score = resumeHasCerts ? 82 : 70;
  let detail = resumeHasCerts
    ? 'Resume lists certifications.'
    : 'No dedicated certifications section detected.';

  if (jobRequestsCerts && resumeHasCerts) {
    status = 'match';
    score = 90;
    detail = 'Resume highlights certifications requested in the JD.';
  } else if (jobRequestsCerts && !resumeHasCerts) {
    status = 'gap';
    score = 56;
    detail = 'JD references certifications—add a certifications section or cite credentials in experience bullets.';
  } else if (!jobRequestsCerts && resumeHasCerts) {
    status = 'info';
    score = 84;
    detail = 'Certifications listed—ensure they stay relevant to the role.';
  }

  return {
    key: 'certifications',
    label: 'Certifications',
    score: sanitizeScore(score),
    status,
    detail,
    jobRequestsCerts,
    resumeHasCerts,
  };
}

function computeSelectionMetricSet({
  resumeText,
  jobTitle,
  jobDescription,
  matchScore,
  missingSkills,
  addedSkills,
  atsBreakdown,
}) {
  const metrics = {
    designation: computeDesignationMetric({ resumeText, jobTitle }),
    experience: computeExperienceMetric({ resumeText, jobDescription }),
    skills: computeSkillMetric({ matchScore, missingSkills, addedSkills }),
    tasks: computeTaskMetric({ atsBreakdown }),
    highlights: computeHighlightMetric({ atsBreakdown }),
    certifications: computeCertificationMetric({ resumeText, jobDescription }),
  };

  const values = SELECTION_METRIC_DEFINITIONS.map(({ key }) => {
    const value = metrics[key]?.score;
    return typeof value === 'number' && Number.isFinite(value) ? sanitizeScore(value) : null;
  }).filter((value) => value !== null);

  const average = values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : 0;

  let probability = sanitizeScore(average);
  let normalization = null;
  if (!values.length) {
    probability = PROBABILITY_MIN;
    normalization = `Insufficient signals detected, defaulting to ${PROBABILITY_MIN}% selection probability.`;
  } else if (probability < PROBABILITY_MIN) {
    probability = PROBABILITY_MIN;
    normalization = `Probability lifted to ${PROBABILITY_MIN}% to reflect baseline interview chances.`;
  } else if (probability > PROBABILITY_MAX) {
    probability = PROBABILITY_MAX;
    normalization = `Probability capped at ${PROBABILITY_MAX}% to avoid overstating selection odds.`;
  }

  const level = probability >= 75 ? 'High' : probability >= 55 ? 'Medium' : 'Low';

  const reasons = [];
  Object.values(metrics).forEach((metric) => {
    if (!metric || !metric.status) {
      return;
    }
    if (metric.status === 'gap') {
      reasons.push(metric.detail || `${metric.label} needs attention.`);
    } else if (metric.status === 'match') {
      reasons.push(metric.detail || `${metric.label} aligns with the JD.`);
    }
  });

  if (normalization) {
    reasons.push(normalization);
  }

  const summaryBase = `Projected ${level.toLowerCase()} probability (${probability}%) that this resume will be shortlisted for the JD`;
  const summary = reasons.length
    ? `${summaryBase} because ${reasons.join('; ')}.`
    : `${summaryBase}.`;

  return {
    metrics,
    probability,
    level,
    summary,
  };
}

function buildSelectionDelta(beforeMetrics = {}, afterMetrics = {}) {
  const delta = {};
  SELECTION_METRIC_DEFINITIONS.forEach(({ key, label }) => {
    const beforeScore = sanitizeScore(beforeMetrics[key]?.score ?? 0);
    const afterScore = sanitizeScore(afterMetrics[key]?.score ?? 0);
    delta[key] = {
      key,
      label,
      score: roundDelta(afterScore - beforeScore),
      statusChange: beforeMetrics[key]?.status !== afterMetrics[key]?.status ? afterMetrics[key]?.status : null,
    };
  });
  return delta;
}

function buildSelectionProbabilityFactors(beforeMetrics = {}, afterMetrics = {}) {
  return SELECTION_METRIC_DEFINITIONS.map(({ key, label }) => {
    const before = beforeMetrics[key] || {};
    const after = afterMetrics[key] || {};
    const status = after.status || before.status || 'info';
    const impact = mapStatusToImpact(status);
    const beforeScore = before.score;
    const afterScore = after.score;
    const hasBeforeScore = typeof beforeScore === 'number' && Number.isFinite(beforeScore);
    const hasAfterScore = typeof afterScore === 'number' && Number.isFinite(afterScore);
    const scoreBefore = hasBeforeScore ? sanitizeScore(beforeScore) : null;
    const scoreAfter = hasAfterScore ? sanitizeScore(afterScore) : null;
    const scoreDelta =
      hasBeforeScore && hasAfterScore ? roundDelta(scoreAfter - scoreBefore) : null;

    const changeMessage =
      before.status && after.status && before.status !== after.status
        ? `Status moved from ${describeSelectionStatus(before.status)} to ${describeSelectionStatus(after.status)}.`
        : '';

    const normalizedDetail = sanitizeText(after.detail).trim() || sanitizeText(before.detail).trim();
    let detail = normalizedDetail;

    if (!detail) {
      if (status === 'gap') {
        detail = `${label} needs improvement to align with the JD.`;
      } else if (status === 'match') {
        detail = `${label} aligns with the JD expectations.`;
      } else if (status === 'partial') {
        detail = `${label} is partially aligned—add more role-specific examples.`;
      } else {
        detail = `${label} provides informational signals for selection scoring.`;
      }
    }

    if (changeMessage) {
      detail = `${changeMessage} ${detail}`.trim();
    }

    const factor = {
      key,
      label,
      impact,
      status,
      detail,
    };

    if (scoreBefore !== null) {
      factor.scoreBefore = scoreBefore;
    }
    if (scoreAfter !== null) {
      factor.scoreAfter = scoreAfter;
    }
    if (scoreDelta !== null) {
      factor.scoreDelta = scoreDelta;
    }

    return factor;
  });
}

function buildAtsDelta(beforeBreakdown = {}, afterBreakdown = {}) {
  const delta = {};
  ATS_METRIC_DEFINITIONS.forEach(({ key, category }) => {
    const beforeScore = sanitizeScore(beforeBreakdown[key]?.score ?? 0);
    const afterScore = sanitizeScore(afterBreakdown[key]?.score ?? 0);
    delta[key] = {
      key,
      category,
      score: roundDelta(afterScore - beforeScore),
    };
  });
  return delta;
}

function sanitizeSessionId(value) {
  return sanitizeText(value)
    .replace(/[^a-z0-9\-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

function extractAddedSkills(beforeTable = [], afterTable = []) {
  const beforeMatched = new Set(
    (beforeTable || [])
      .filter((row) => row?.matched)
      .map((row) => (row?.skill || '').toLowerCase())
      .filter(Boolean)
  );
  const added = (afterTable || [])
    .filter((row) => row?.matched)
    .map((row) => row?.skill || '')
    .filter(Boolean)
    .filter((skill) => !beforeMatched.has(skill.toLowerCase()));
  return Array.from(new Set(added));
}

/**
 * Validate the inbound payload and compute a resume to job match score with
 * ATS and selection scoring before/after enhancement.
 */
export function scoreResumeAgainstJob(payload = {}) {
  const jobId = sanitizeText(payload.jobId).trim();
  if (!jobId) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_ID_REQUIRED',
        message: 'jobId is required to score the resume against the job description.',
      },
    };
  }

  const resumeTextBefore = sanitizeText(payload.resumeText);
  if (!resumeTextBefore.trim()) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'RESUME_TEXT_REQUIRED',
        message: 'resumeText is required to score the resume against the job description.',
      },
    };
  }

  const resumeTextAfter = sanitizeText(payload.enhancedResumeText) || resumeTextBefore;
  const jobDescription = sanitizeText(payload.jobDescription || payload.jobDescriptionText);
  const jobSkills = normalizeSkillListInput(payload.jobSkills);

  if (!jobSkills.length) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_SKILLS_REQUIRED',
        message: 'Provide jobSkills with at least one keyword to calculate a score.',
      },
    };
  }

  const jobTitle = sanitizeText(payload.jobTitle || payload.designation || '');
  const sessionId = sanitizeSessionId(payload.sessionId || payload.sessionSegment || '');

  const resumeSkillsBefore = extractResumeSkills(resumeTextBefore);
  const resumeSkillsAfter = extractResumeSkills(resumeTextAfter);

  const matchBefore = calculateMatchScore(jobSkills, resumeSkillsBefore);
  const matchAfter = calculateMatchScore(jobSkills, resumeSkillsAfter);

  const atsBeforeBreakdown = ensureScoreBreakdownCompleteness(
    buildScoreBreakdown(resumeTextBefore, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: resumeSkillsBefore,
    })
  );

  const atsAfterBreakdown = ensureScoreBreakdownCompleteness(
    buildScoreBreakdown(resumeTextAfter, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: resumeSkillsAfter,
    })
  );

  const atsScoreBefore = computeCompositeAtsScore(atsBeforeBreakdown);
  const atsScoreAfter = computeCompositeAtsScore(atsAfterBreakdown);

  const selectionBefore = computeSelectionMetricSet({
    resumeText: resumeTextBefore,
    jobTitle,
    jobDescription,
    matchScore: matchBefore.score,
    missingSkills: matchBefore.newSkills,
    addedSkills: [],
    atsBreakdown: atsBeforeBreakdown,
  });

  const coveredSkills = extractAddedSkills(matchBefore.table, matchAfter.table);

  const selectionAfter = computeSelectionMetricSet({
    resumeText: resumeTextAfter,
    jobTitle,
    jobDescription,
    matchScore: matchAfter.score,
    missingSkills: matchAfter.newSkills,
    addedSkills: coveredSkills,
    atsBreakdown: atsAfterBreakdown,
  });

  const selectionDelta = buildSelectionDelta(selectionBefore.metrics, selectionAfter.metrics);
  const selectionProbabilityFactors = buildSelectionProbabilityFactors(
    selectionBefore.metrics,
    selectionAfter.metrics,
  );
  const atsDelta = buildAtsDelta(atsBeforeBreakdown, atsAfterBreakdown);

  const alignmentTable = Array.isArray(matchAfter.table) ? matchAfter.table : [];

  const result = {
    success: true,
    jobId,
    sessionId: sessionId || null,
    score: matchAfter.score,
    missingSkills: matchAfter.newSkills,
    alignmentTable,
    match: {
      before: {
        score: matchBefore.score,
        missingSkills: matchBefore.newSkills,
        table: matchBefore.table,
      },
      after: {
        score: matchAfter.score,
        missingSkills: matchAfter.newSkills,
        table: matchAfter.table,
      },
      delta: {
        score: roundDelta(matchAfter.score - matchBefore.score),
        coveredSkills,
      },
    },
    ats: {
      before: {
        score: atsScoreBefore,
        breakdown: atsBeforeBreakdown,
      },
      after: {
        score: atsScoreAfter,
        breakdown: atsAfterBreakdown,
      },
      delta: {
        score: roundDelta(atsScoreAfter - atsScoreBefore),
        breakdown: atsDelta,
      },
    },
    selection: {
      before: {
        probability: selectionBefore.probability,
        level: selectionBefore.level,
        summary: selectionBefore.summary,
        metrics: selectionBefore.metrics,
      },
      after: {
        probability: selectionAfter.probability,
        level: selectionAfter.level,
        summary: selectionAfter.summary,
        metrics: selectionAfter.metrics,
      },
      delta: {
        probability: roundDelta(selectionAfter.probability - selectionBefore.probability),
        levelChange:
          selectionBefore.level && selectionAfter.level && selectionBefore.level !== selectionAfter.level
            ? selectionAfter.level
            : null,
        metrics: selectionDelta,
      },
      factors: selectionProbabilityFactors,
    },
    selectionProbabilityBefore: selectionBefore.probability,
    selectionProbabilityAfter: selectionAfter.probability,
    selectionProbabilityDelta: roundDelta(
      selectionAfter.probability - selectionBefore.probability
    ),
    selectionProbabilityFactors,
  };

  return {
    ok: true,
    result,
  };
}

export function scoreResumeHttpResponse(outcome) {
  if (!outcome || typeof outcome !== 'object') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Unable to score the resume.',
      }),
    };
  }

  if (!outcome.ok) {
    const { statusCode, code, message, details } = outcome.error || {};
    return {
      statusCode: statusCode || 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: code || 'VALIDATION_ERROR',
        message: message || 'Unable to score the resume against the job description.',
        ...(details !== undefined ? { details } : {}),
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome.result),
  };
}

export default scoreResumeAgainstJob;
