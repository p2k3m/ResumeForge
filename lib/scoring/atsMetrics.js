const STOP_WORDS = new Set(
  'a,an,and,are,as,at,be,by,for,from,has,have,in,is,it,of,on,or,that,the,to,with,will,our,your,they,them,into,about,over,more,than,who,what,when,where,which,were,while,within,under,across,through,using,per'
    .split(',')
    .map((word) => word.trim())
);

export const ATS_METRIC_DEFINITIONS = [
  { key: 'layoutSearchability', category: 'Layout & Searchability' },
  { key: 'atsReadability', category: 'ATS Readability' },
  { key: 'impact', category: 'Impact' },
  { key: 'crispness', category: 'Crispness' },
  { key: 'otherQuality', category: 'Other Quality Metrics' },
];

export const ATS_METRIC_WEIGHTS = {
  layoutSearchability: 0.2,
  atsReadability: 0.25,
  impact: 0.25,
  crispness: 0.15,
  otherQuality: 0.15,
};

export function scoreRatingLabel(score) {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  return 'NEEDS_IMPROVEMENT';
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function summarizeList(values = [], { limit = 3, conjunction = 'and' } = {}) {
  if (!values.length) return '';
  const unique = Array.from(new Set(values)).filter(Boolean);
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} ${conjunction} ${unique[1]}`;

  const display = unique.slice(0, limit);
  const remaining = unique.length - display.length;
  if (remaining > 0) {
    return `${display.join(', ')} and ${remaining} more`;
  }

  const head = display.slice(0, -1).join(', ');
  const tail = display.slice(-1);
  return head ? `${head} ${conjunction} ${tail}` : tail.join('');
}

export function createMetric(category, score, tips = [], options = {}) {
  const boundedScore = clamp(score, 0, 100);
  const roundedScore = Math.round(boundedScore);
  const rating = scoreRatingLabel(roundedScore);
  const sanitizedTips = Array.from(
    new Set(
      (tips || [])
        .map((tip) => (typeof tip === 'string' ? tip.trim() : ''))
        .filter(Boolean)
    )
  );

  const details = options && typeof options === 'object' ? options.details : undefined;

  if (!sanitizedTips.length) {
    if (rating === 'EXCELLENT') {
      sanitizedTips.push(
        `Keep refining your ${category.toLowerCase()} as you add new achievements so the resume stays future-proof.`
      );
    } else {
      sanitizedTips.push(
        `Focus on improving ${category.toLowerCase()} to raise this score—tighten structure and mirror the job requirements.`
      );
    }
  }

  return {
    category,
    score: roundedScore,
    rating,
    ratingLabel: rating,
    tips: sanitizedTips,
    ...(details ? { details } : {}),
  };
}

function idealRatioScore(value, { ideal = 0.4, tolerance = 0.25 } = {}) {
  if (!isFinite(value) || value <= 0) return 0;
  const diff = Math.abs(value - ideal);
  return clamp01(1 - diff / tolerance);
}

function idealRangeScore(
  value,
  { idealMin = 0, idealMax = 1, tolerance = (idealMax - idealMin) / 2 } = {}
) {
  if (!isFinite(value) || value <= 0) return 0;
  if (value >= idealMin && value <= idealMax) return 1;
  const distance = value < idealMin ? idealMin - value : value - idealMax;
  if (tolerance <= 0) return 0;
  return clamp01(1 - distance / tolerance);
}

export function sanitizeMetric(metric, category) {
  if (!metric || typeof metric !== 'object') {
    return createMetric(category, 0);
  }

  const boundedScore = typeof metric.score === 'number' ? clamp(metric.score, 0, 100) : 0;
  const roundedScore = Math.round(boundedScore);
  const rating = scoreRatingLabel(roundedScore);
  const tips = Array.from(
    new Set(
      []
        .concat(typeof metric.tip === 'string' ? metric.tip : [])
        .concat(Array.isArray(metric.tips) ? metric.tips : [])
        .map((tip) => (typeof tip === 'string' ? tip.trim() : ''))
        .filter(Boolean)
    )
  );

  const defaultTips = createMetric(category, roundedScore, tips).tips;

  return {
    ...metric,
    category: metric.category || category,
    score: roundedScore,
    rating,
    ratingLabel: rating,
    tips: tips.length ? tips : defaultTips,
  };
}

export function ensureScoreBreakdownCompleteness(source = {}) {
  return ATS_METRIC_DEFINITIONS.reduce((acc, { key, category }) => {
    const metric = sanitizeMetric(source[key], category);
    return { ...acc, [key]: metric };
  }, {});
}

export function scoreBreakdownToArray(scoreBreakdown = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  return ATS_METRIC_DEFINITIONS.map(({ key }) => normalized[key]);
}

export function computeCompositeAtsScore(scoreBreakdown = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  let weightedSum = 0;
  let totalWeight = 0;

  ATS_METRIC_DEFINITIONS.forEach(({ key }) => {
    const weight = ATS_METRIC_WEIGHTS[key] ?? 1;
    const metricScore =
      typeof normalized[key]?.score === 'number' && Number.isFinite(normalized[key].score)
        ? clamp(normalized[key].score, 0, 100)
        : 0;
    weightedSum += metricScore * weight;
    totalWeight += weight;
  });

  if (!totalWeight) {
    return 0;
  }

  return Math.round(weightedSum / totalWeight);
}

export function buildAtsScoreExplanation(scoreBreakdown = {}, { phase = 'uploaded' } = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  const totalWeight = ATS_METRIC_DEFINITIONS.reduce(
    (sum, { key }) => sum + (ATS_METRIC_WEIGHTS[key] ?? 1),
    0
  );

  const parts = ATS_METRIC_DEFINITIONS.map(({ key, category }) => {
    const metricScore =
      typeof normalized[key]?.score === 'number' && Number.isFinite(normalized[key].score)
        ? Math.round(clamp(normalized[key].score, 0, 100))
        : 0;
    const weight = ATS_METRIC_WEIGHTS[key] ?? 1;
    const weightShare = totalWeight ? Math.round((weight / totalWeight) * 100) : 0;
    return `${category} ${metricScore}% (${weightShare}% weight)`;
  });

  const phaseLabel = phase === 'enhanced' ? 'enhanced' : 'uploaded';
  return `Weighted ATS composite for the ${phaseLabel} resume using ${parts.join(', ')}. Metrics are derived from JD keywords, structure, and formatting cues.`;
}

const METRIC_ACTION_VERBS = [
  'accelerated',
  'achieved',
  'built',
  'delivered',
  'developed',
  'drove',
  'enhanced',
  'expanded',
  'improved',
  'increased',
  'launched',
  'led',
  'optimized',
  'reduced',
  'scaled',
  'spearheaded',
  'streamlined',
];

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSummaryText(text = '') {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const headingPattern = /^[A-Z][A-Z0-9\s/&-]{2,}$/;
  const summaryHeadingPattern = /^(summary|professional summary|profile|overview)$/i;
  let collecting = false;
  const collected = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!collecting) {
      if (trimmed && summaryHeadingPattern.test(trimmed)) {
        collecting = true;
      }
      continue;
    }
    if (!trimmed) {
      collected.push('');
      continue;
    }
    const isHeading =
      headingPattern.test(trimmed) && trimmed === trimmed.toUpperCase();
    if (isHeading) {
      break;
    }
    if (
      /^(experience|work experience|employment history|education|skills|projects|certifications|awards|accomplishments)$/i.test(
        trimmed
      )
    ) {
      break;
    }
    collected.push(trimmed.replace(/\s+/g, ' '));
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

function analyzeResumeForMetrics(
  text = '',
  { jobText = '', jobSkills = [], resumeSkills = [] } = {}
) {
  const normalizedResume = text.toLowerCase();
  const normalizedJobText = (jobText || '').toLowerCase();
  const allLines = text.split(/\r?\n/);
  const lines = allLines.map((line) => line.trim()).filter(Boolean);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const denseParagraphs = paragraphs.filter((block) => {
    if (/^[-•\u2022\u2023\u25e6\*]/.test(block)) return false;
    const wordCount = block.split(/\s+/).filter(Boolean).length;
    return wordCount >= 70;
  });
  const bulletLines = lines.filter((line) => /^[-•\u2022\u2023\u25e6\*]/.test(line));
  const headingLines = lines.filter((line) => {
    if (line.length > 42) return false;
    const upper = line.replace(/[^A-Za-z]/g, '').toUpperCase();
    return upper.length >= 4 && line === line.toUpperCase();
  });
  const headingSet = new Set(
    headingLines.map((line) => line.replace(/[^a-z]/gi, '').toLowerCase())
  );

  const multiColumnIndicators = lines.filter((line) => line.split(/\s{3,}/).length >= 2);
  const bulletRatio = lines.length ? bulletLines.length / lines.length : 0;
  const bulletWordCounts = bulletLines.map((line) =>
    line
      .replace(/^[-•\u2022\u2023\u25e6\*]\s*/, '')
      .split(/\s+/)
      .filter(Boolean).length
  );
  const longBulletLines = [];
  const shortBulletLines = [];
  bulletLines.forEach((line, index) => {
    const wordCount = bulletWordCounts[index] || 0;
    if (wordCount > 28) {
      longBulletLines.push(line);
    }
    if (wordCount > 0 && wordCount < 8) {
      shortBulletLines.push(line);
    }
  });
  const avgBulletWords = bulletWordCounts.length
    ? bulletWordCounts.reduce((sum, val) => sum + val, 0) / bulletWordCounts.length
    : 0;
  const fillerBullets = bulletLines.filter((line) =>
    /\b(responsible for|duties included|tasked with)\b/i.test(line)
  );

  const achievementLines = bulletLines.filter((line) =>
    METRIC_ACTION_VERBS.some((verb) =>
      new RegExp(`\\b${escapeRegex(verb)}\\b`, 'i').test(line)
    ) || /[+\d%$]/.test(line)
  );

  const normalizedJobSkills = new Set(
    (jobSkills || []).map((skill) => skill.toLowerCase()).filter(Boolean)
  );
  const normalizedResumeSkills = new Set(
    (resumeSkills || []).map((skill) => skill.toLowerCase()).filter(Boolean)
  );

  const jobKeywordCandidates = (normalizedJobText.match(/[a-z0-9+.#]+/g) || [])
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .slice(0, 80);
  const jobKeywordSet = new Set([...normalizedJobSkills, ...jobKeywordCandidates]);
  const bulletKeywordHits = bulletLines.filter((line) =>
    Array.from(jobKeywordSet).some((keyword) =>
      new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(line)
    )
  );

  const jobKeywordMatches = Array.from(jobKeywordSet).filter((keyword) =>
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text)
  );

  const summaryText = extractSummaryText(text);
  const summaryKeywordHits = summaryText
    ? Array.from(jobKeywordSet).filter((keyword) =>
        new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(summaryText)
      )
    : [];
  const summarySkillHits = summaryText
    ? Array.from(normalizedJobSkills).filter((skill) =>
        new RegExp(`\\b${escapeRegex(skill)}\\b`, 'i').test(summaryText)
      )
    : [];

  const rawLineCount = allLines.length;
  const estimatedPageCount = Math.max(1, Math.ceil(rawLineCount / 55));

  const nonAsciiCharacters = (text.match(/[\u2460-\u24ff\u2500-\u257f]/g) || []).length;
  const hasContactInfo =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    /\b\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text);
  const summaryPresent = Array.from(headingSet).some((heading) =>
    /summary|profile|overview/.test(heading)
  );

  return {
    text,
    normalizedResume,
    normalizedJobText,
    lines,
    bulletLines,
    headingLines,
    headingSet,
    multiColumnIndicators,
    bulletRatio,
    bulletWordCounts,
    avgBulletWords,
    fillerBullets,
    paragraphs,
    denseParagraphs,
    achievementLines,
    longBulletLines,
    shortBulletLines,
    normalizedJobSkills,
    normalizedResumeSkills,
    jobKeywordSet,
    bulletKeywordHits,
    jobKeywordMatches,
    summaryText,
    summaryKeywordHits,
    summarySkillHits,
    nonAsciiCharacters,
    hasContactInfo,
    summaryPresent,
    rawLineCount,
    estimatedPageCount,
  };
}

function evaluateLayoutMetric(analysis) {
  const {
    headingLines,
    headingSet,
    bulletRatio,
    bulletLines,
    lines,
    hasContactInfo,
    denseParagraphs,
    estimatedPageCount,
    rawLineCount,
  } = analysis;

  const keySections = ['experience', 'education', 'skills', 'summary'];
  const sectionPresence = keySections.filter((section) =>
    Array.from(headingSet).some((heading) => heading.includes(section))
  );

  const headingScore = clamp01(headingLines.length / 6);
  const sectionScore = clamp01(sectionPresence.length / keySections.length);
  const bulletScore = bulletLines.length
    ? idealRatioScore(bulletRatio, { ideal: 0.42, tolerance: 0.28 })
    : 0;
  const contactScore = hasContactInfo ? 1 : 0;

  const paragraphPenalty = denseParagraphs.length
    ? Math.min(0.25, denseParagraphs.length * 0.08)
    : 0;

  const pagePenalty = estimatedPageCount > 2 ? Math.min(0.3, (estimatedPageCount - 2) * 0.18) : 0;
  const lengthPenalty = rawLineCount > 130 ? Math.min(0.2, (rawLineCount - 130) * 0.003) : 0;

  const layoutScore =
    100 *
    clamp01(
      headingScore * 0.23 +
        sectionScore * 0.24 +
        bulletScore * 0.33 +
        contactScore * 0.14 -
        paragraphPenalty -
        pagePenalty -
        lengthPenalty
    );

  const missingHeadings = keySections
    .filter((section) => !sectionPresence.includes(section))
    .map((heading) => heading.charAt(0).toUpperCase() + heading.slice(1));

  const layoutTips = [];
  if (missingHeadings.length) {
    layoutTips.push(
      `Add clear section headers for ${summarizeList(missingHeadings)} so ATS bots can index your resume (only ${headingLines.length} heading${headingLines.length === 1 ? '' : 's'} detected).`
    );
  }
  if (bulletLines.length && bulletScore < 0.55) {
    layoutTips.push(
      `Adjust your bullet usage—${bulletLines.length} bullet${bulletLines.length === 1 ? '' : 's'} across ${lines.length} lines makes scanning harder for recruiters.`
    );
  }
  if (!bulletLines.length) {
    layoutTips.push('Break dense paragraphs into bullets so scanners can pick out wins.');
  }
  if (!hasContactInfo) {
    layoutTips.push('Add contact details (email or phone) so hiring teams can reach you quickly.');
  }
  if (denseParagraphs.length) {
    layoutTips.push(
      `Break up ${denseParagraphs.length} dense paragraph${denseParagraphs.length === 1 ? '' : 's'} with bullet points so resume scanners do not skip your achievements.`
    );
  }
  if (estimatedPageCount > 2) {
    layoutTips.push(
      `Tighten the document to two pages—ATS scoring drops once resumes stretch to ${estimatedPageCount} pages.`
    );
  }
  if (rawLineCount > 130 && estimatedPageCount <= 2) {
    layoutTips.push(
      'Trim excess line spacing or sections so the resume stays within a quick-scan length.'
    );
  }
  if (!layoutTips.length) {
    layoutTips.push(
      'Your structure is solid—keep the consistent headings and bullet patterns to remain searchable.'
    );
  }

  const layoutDetails = {
    headingCount: headingLines.length,
    headingDensity: Number((headingScore * 100).toFixed(1)),
    sectionCoverage: Number((sectionScore * 100).toFixed(1)),
    bulletCount: bulletLines.length,
    bulletUsageScore: Number((bulletScore * 100).toFixed(1)),
    contactInfoPresent: Boolean(hasContactInfo),
    contactInfoScore: contactScore ? 100 : 0,
    paragraphPenalty: Math.round(paragraphPenalty * 100),
    pagePenalty: Math.round(pagePenalty * 100),
    lengthPenalty: Math.round(lengthPenalty * 100),
    estimatedPageCount,
    rawLineCount,
  };

  return createMetric('Layout & Searchability', layoutScore, layoutTips, {
    details: layoutDetails,
  });
}

function evaluateAtsMetric(analysis) {
  const { normalizedResume, text, multiColumnIndicators, nonAsciiCharacters } = analysis;
  const atsIssues = [];

  const hasTableLikeFormatting = /\btable\b/.test(normalizedResume) && /\|/.test(text);
  const hasTableOfContents = normalizedResume.includes('table of contents');
  const hasPageNumberFooters = /\bpage \d+ of \d+/i.test(text);
  const hasEmbeddedImages = /https?:\/\/\S+\.(png|jpg|jpeg|gif|svg)/i.test(text);
  const hasDecorativeCharacters = /[{}<>]/.test(text);

  const penaltyBreakdown = {
    tableLikeFormatting: hasTableLikeFormatting ? 22 : 0,
    tableOfContents: hasTableOfContents ? 18 : 0,
    pageNumberFooters: hasPageNumberFooters ? 12 : 0,
    embeddedImages: hasEmbeddedImages ? 16 : 0,
    multiColumnSpacing:
      multiColumnIndicators.length > 0 ? Math.min(5 + multiColumnIndicators.length * 3, 20) : 0,
    decorativeCharacters: hasDecorativeCharacters ? 8 : 0,
    nonAsciiCharacters: Math.min(nonAsciiCharacters * 1.5, 18),
  };

  let penalty = 0;
  Object.entries(penaltyBreakdown).forEach(([key, value]) => {
    if (value > 0) {
      penalty += value;
      if (key === 'tableLikeFormatting') atsIssues.push('table-like formatting');
      if (key === 'tableOfContents') atsIssues.push('a table of contents');
      if (key === 'pageNumberFooters') atsIssues.push('page number footers');
      if (key === 'embeddedImages') atsIssues.push('embedded images');
      if (key === 'multiColumnSpacing') atsIssues.push('multi-column spacing that ATS bots misread');
      if (key === 'decorativeCharacters') atsIssues.push('decorative characters or HTML brackets');
      if (key === 'nonAsciiCharacters' && nonAsciiCharacters > 0) {
        atsIssues.push('non-standard symbols that confuse parsers');
      }
    }
  });

  const atsScore = clamp(100 - penalty, 0, 100);

  const atsTips = [];
  if (!atsIssues.length) {
    atsTips.push('Formatting is ATS-safe—keep the clean structure as you update content.');
  } else {
    atsTips.push(`Remove ${summarizeList(atsIssues)}—they frequently break ATS parsing engines.`);
  }

  if (multiColumnIndicators.length >= 6) {
    atsTips.push('Switch to a single-column layout so ATS parsers read left-to-right cleanly.');
  }
  if (nonAsciiCharacters > 10) {
    atsTips.push('Replace decorative symbols with plain text—ATS parsers misread special characters.');
  }

  const atsDetails = {
    baseScore: 100,
    penaltyTotal: Math.round(Math.min(penalty, 100)),
    penaltyBreakdown: Object.fromEntries(
      Object.entries(penaltyBreakdown).map(([key, value]) => [key, Number(value.toFixed(2))])
    ),
    multiColumnIndicators: multiColumnIndicators.length,
    nonAsciiCharacters,
  };

  return createMetric('ATS Readability', atsScore, atsTips, { details: atsDetails });
}

function evaluateImpactMetric(analysis) {
  const {
    achievementLines,
    bulletLines,
    bulletKeywordHits,
    jobKeywordSet,
    summaryText,
    summaryKeywordHits,
    summarySkillHits,
    normalizedJobSkills,
    normalizedResumeSkills,
  } = analysis;

  const bulletCount = bulletLines.length;
  const achievementRatio = bulletCount ? achievementLines.length / bulletCount : 0;
  const achievementVolumeScore = clamp01(achievementLines.length / Math.max(3, bulletCount * 0.6));
  const keywordHitRatio = bulletLines.length ? bulletKeywordHits.length / bulletLines.length : 0;

  const summaryPresent = Boolean(summaryText);
  const summarySkillScore = summaryPresent
    ? clamp01(summarySkillHits.length / Math.max(1, Math.min(normalizedJobSkills.size, 6)))
    : 0;
  const summaryKeywordScore = summaryPresent
    ? clamp01(
        (summaryKeywordHits.length + summarySkillScore * Math.min(jobKeywordSet.size, 6)) /
          Math.max(2, Math.min(jobKeywordSet.size, 10))
      )
    : 0;

  const keywordMatchCount = jobKeywordSet.size
    ? jobKeywordSet.size - (jobKeywordSet.size - new Set(bulletKeywordHits).size)
    : 0;

  const normalizedKeywordMatchCount = clamp01(keywordMatchCount / Math.max(4, jobKeywordSet.size));

  const impactScore =
    100 *
    clamp01(
      achievementRatio * 0.45 +
        keywordHitRatio * 0.22 +
        achievementVolumeScore * 0.23 +
        Math.max(summaryKeywordScore, summarySkillScore) * 0.1
    );

  const impactTips = [];
  if (!achievementLines.length) {
    impactTips.push(
      'Add metrics or outcome verbs (e.g., increased, reduced) to your bullets—none of the bullet points currently show quantified results.'
    );
  } else if (achievementLines.length < Math.max(3, Math.ceil(bulletLines.length * 0.4))) {
    impactTips.push(
      `Strengthen impact statements by pairing more bullets with numbers—only ${achievementLines.length} of ${bulletLines.length || 'your'} bullet${achievementLines.length === 1 ? '' : 's'} include metrics or performance verbs.`
    );
  } else {
    impactTips.push(
      'Your bullets already show strong impact—keep pairing metrics with outcome-driven verbs.'
    );
  }

  if (
    jobKeywordSet.size > 0 &&
    bulletKeywordHits.length < Math.max(2, Math.ceil(jobKeywordSet.size * 0.1))
  ) {
    const keywordSample = Array.from(jobKeywordSet)
      .slice(0, 5)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    if (keywordSample.length) {
      impactTips.push(
        `Mirror the job posting by weaving in keywords such as ${summarizeList(keywordSample)} inside your accomplishment bullets.`
      );
    }
  }

  if (summaryPresent && summarySkillHits.length === 0 && normalizedJobSkills.size > 0) {
    impactTips.push(
      'Rework your summary to echo critical job keywords so reviewers immediately see the alignment.'
    );
  }

  if (normalizedResumeSkills.size && normalizedJobSkills.size) {
    const missingSkills = Array.from(normalizedJobSkills).filter(
      (skill) => !normalizedResumeSkills.has(skill)
    );
    if (missingSkills.length) {
      impactTips.push(
        `Explicitly list ${summarizeList(
          missingSkills.map((skill) => skill.charAt(0).toUpperCase() + skill.slice(1)),
          { limit: 5 }
        )} to mirror the job posting.`
      );
    }
  }

  if (!impactTips.length) {
    impactTips.push('Impact storytelling is strong—keep quantifying wins as you add new roles.');
  }

  const impactDetails = {
    bulletCount,
    achievementBullets: achievementLines.length,
    achievementRatio: Number((achievementRatio * 100).toFixed(1)),
    achievementVolumeScore: Number((achievementVolumeScore * 100).toFixed(1)),
    keywordHitRatio: Number((keywordHitRatio * 100).toFixed(1)),
    summaryPresent,
    summaryKeywordScore: Number((summaryKeywordScore * 100).toFixed(1)),
    summarySkillScore: Number((summarySkillScore * 100).toFixed(1)),
    jobKeywordCount: jobKeywordSet.size,
    bulletKeywordHits: bulletKeywordHits.length,
  };

  return createMetric('Impact', impactScore, impactTips, { details: impactDetails });
}

function evaluateCrispnessMetric(analysis) {
  const { bulletLines, avgBulletWords, fillerBullets, longBulletLines, shortBulletLines } = analysis;

  const bulletsStartingWithVerbs = bulletLines.filter((line) =>
    METRIC_ACTION_VERBS.some((verb) =>
      new RegExp(`^[-•\u2022\u2023\u25e6\*]?\s*${escapeRegex(verb)}\b`, 'i').test(line)
    )
  );

  const lengthScore = idealRangeScore(avgBulletWords, {
    idealMin: 12,
    idealMax: 22,
    tolerance: 10,
  });
  const fillerRatio = bulletLines.length ? fillerBullets.length / bulletLines.length : 1;
  const fillerScore = clamp01(1 - fillerRatio);
  const verbStartRatio = bulletLines.length
    ? bulletsStartingWithVerbs.length / bulletLines.length
    : 0;

  const longBulletRatio = bulletLines.length
    ? longBulletLines.length / bulletLines.length
    : 0;
  const shortBulletRatio = bulletLines.length
    ? shortBulletLines.length / bulletLines.length
    : 0;
  const balanceScore = clamp01(1 - Math.min(1, longBulletRatio * 1.1 + Math.max(0, shortBulletRatio - 0.3)));

  const crispnessScore =
    100 * clamp01(lengthScore * 0.3 + fillerScore * 0.25 + verbStartRatio * 0.25 + balanceScore * 0.2);

  const crispnessTips = [];
  if (!bulletLines.length) {
    crispnessTips.push(
      'Introduce concise bullet points (12–20 words) so recruiters can skim quickly.'
    );
  }
  if (avgBulletWords && avgBulletWords < 12) {
    crispnessTips.push(
      `Expand key bullets beyond ${Math.round(avgBulletWords)} words to explain scope and outcomes without losing clarity.`
    );
  }
  if (avgBulletWords > 22) {
    crispnessTips.push(
      `Tighten lengthy bullets—your average is ${Math.round(avgBulletWords)} words, above the ATS-friendly 18–22 word sweet spot.`
    );
  }
  if (longBulletLines.length) {
    crispnessTips.push(
      `Break overly long bullets (${longBulletLines.length}) into two lines so each accomplishment pops.`
    );
  }
  if (shortBulletLines.length > Math.ceil(bulletLines.length * 0.4)) {
    crispnessTips.push('Add a bit more context to ultra-short bullets so they explain the impact.');
  }
  if (fillerBullets.length) {
    crispnessTips.push(
      `Replace filler openers like "responsible for" with action verbs—${fillerBullets.length} bullet${fillerBullets.length === 1 ? '' : 's'} use passive phrasing.`
    );
  }
  if (!crispnessTips.length) {
    crispnessTips.push(
      'Bullet length is crisp and skimmable—maintain this balance while adding fresh wins as needed.'
    );
  }

  const crispnessDetails = {
    bulletCount: bulletLines.length,
    averageBulletWords: Number(avgBulletWords.toFixed(2)),
    lengthScore: Number((lengthScore * 100).toFixed(1)),
    fillerBulletRatio: Number((fillerRatio * 100).toFixed(1)),
    fillerScore: Number((fillerScore * 100).toFixed(1)),
    verbStartRatio: Number((verbStartRatio * 100).toFixed(1)),
    balanceScore: Number((balanceScore * 100).toFixed(1)),
    longBullets: longBulletLines.length,
    shortBullets: shortBulletLines.length,
  };

  return createMetric('Crispness', crispnessScore, crispnessTips, { details: crispnessDetails });
}

function evaluateOtherMetric(analysis) {
  const {
    normalizedJobSkills,
    normalizedResumeSkills,
    jobKeywordMatches,
    summaryPresent,
    summaryKeywordHits,
    summarySkillHits,
  } = analysis;

  const skillCoverage = normalizedJobSkills.size
    ? normalizedResumeSkills.size / Math.max(normalizedJobSkills.size, 1)
    : normalizedResumeSkills.size > 0
    ? 1
    : 0;

  const keywordDensity = jobKeywordMatches.length
    ? jobKeywordMatches.length / Math.max(normalizedJobSkills.size || jobKeywordMatches.length, 6)
    : normalizedResumeSkills.size
    ? Math.min(1, normalizedResumeSkills.size / 12)
    : 0;

  const summaryWeight = summaryPresent ? 0.2 : 0;
  const skillWeight = normalizedJobSkills.size ? 0.45 : 0.25;
  const keywordWeight = normalizedJobSkills.size ? 0.35 : 0.5;

  const summaryContribution = summaryPresent
    ? clamp01((summaryKeywordHits.length + summarySkillHits.length) / Math.max(2, normalizedJobSkills.size))
    : 0;

  const otherScore =
    100 * clamp01(skillCoverage * skillWeight + keywordDensity * keywordWeight + summaryContribution * summaryWeight);

  const otherTips = [];
  if (!normalizedResumeSkills.size) {
    otherTips.push('Add a dedicated skills section so ATS parsers can map your proficiencies.');
  }
  if (normalizedJobSkills.size && normalizedResumeSkills.size) {
    const missingSkillSet = Array.from(normalizedJobSkills).filter(
      (skill) => !normalizedResumeSkills.has(skill)
    );
    if (missingSkillSet.length) {
      otherTips.push(
        `Incorporate keywords such as ${summarizeList(missingSkillSet)} to mirror the job description.`
      );
    }
  }
  if (summaryPresent && !summaryKeywordHits.length && normalizedJobSkills.size) {
    otherTips.push(
      `Infuse your summary or headline with domain language from the posting—for example ${summarizeList(
        Array.from(normalizedJobSkills).slice(0, 3)
      )}—to reinforce alignment.`
    );
  }
  if (!otherTips.length) {
    otherTips.push('Keyword coverage is solid—keep tailoring skills to each job description.');
  }

  const otherDetails = {
    normalizedJobSkillCount: normalizedJobSkills.size,
    normalizedResumeSkillCount: normalizedResumeSkills.size,
    jobKeywordMatches: jobKeywordMatches.length,
    skillCoverage: Number((skillCoverage * 100).toFixed(1)),
    keywordDensity: Number((keywordDensity * 100).toFixed(1)),
    summaryContribution: Number((summaryContribution * 100).toFixed(1)),
    weights: {
      skillWeight: Number((skillWeight * 100).toFixed(1)),
      keywordWeight: Number((keywordWeight * 100).toFixed(1)),
      summaryWeight: Number((summaryWeight * 100).toFixed(1)),
    },
    summaryPresent,
  };

  return createMetric('Other Quality Metrics', otherScore, otherTips, {
    details: otherDetails,
  });
}

export function buildScoreBreakdown(
  text = '',
  { jobText = '', jobSkills = [], resumeSkills = [] } = {}
) {
  if (!text?.trim()) {
    return ensureScoreBreakdownCompleteness();
  }

  const analysis = analyzeResumeForMetrics(text, { jobText, jobSkills, resumeSkills });

  const layout = evaluateLayoutMetric(analysis);
  const ats = evaluateAtsMetric(analysis);
  const impact = evaluateImpactMetric(analysis);
  const crispness = evaluateCrispnessMetric(analysis);
  const other = evaluateOtherMetric(analysis);

  return ensureScoreBreakdownCompleteness({
    layoutSearchability: layout,
    atsReadability: ats,
    impact,
    crispness,
    otherQuality: other,
  });
}

export function describeScoreBreakdown(scoreBreakdown = {}) {
  const normalized = ensureScoreBreakdownCompleteness(scoreBreakdown);
  return ATS_METRIC_DEFINITIONS.map(({ key }) => normalized[key]);
}

export default {
  ATS_METRIC_DEFINITIONS,
  ATS_METRIC_WEIGHTS,
  scoreRatingLabel,
  clamp,
  clamp01,
  summarizeList,
  createMetric,
  sanitizeMetric,
  ensureScoreBreakdownCompleteness,
  scoreBreakdownToArray,
  computeCompositeAtsScore,
  buildAtsScoreExplanation,
  buildScoreBreakdown,
};
