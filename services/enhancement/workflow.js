import { normalizeSkillListInput } from '../common/skills.js';

export const ENHANCEMENT_TYPES = [
  'improve-summary',
  'add-missing-skills',
  'change-designation',
  'align-experience',
  'improve-certifications',
  'improve-projects',
  'improve-highlights',
];

const SECTION_LABELS = {
  summary: ['summary', 'professional summary', 'profile'],
  skills: ['skills', 'key skills', 'core skills'],
  experience: ['experience', 'work experience', 'professional experience'],
  certifications: ['certifications', 'licenses'],
  projects: ['projects', 'key projects'],
  highlights: ['highlights', 'key highlights', 'career highlights'],
};

function normaliseLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function splitLines(value) {
  if (Array.isArray(value)) return value.map((line) => String(line || '')).join('\n');
  if (typeof value !== 'string') return '';
  return value;
}

function tokenizeLines(text) {
  if (!text) return [];
  if (Array.isArray(text)) return text.map((line) => String(line || ''));
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n');
}

function normaliseHeading(value) {
  return normaliseLine(value).replace(/:$/, '').toLowerCase();
}

function findHeadingIndex(lines, labels) {
  if (!Array.isArray(lines) || !lines.length) return { index: -1, matchedLabel: '' };
  const candidates = labels.map((label) => normaliseHeading(label));
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = normaliseHeading(lines[index]);
    if (!candidate) continue;
    if (candidates.includes(candidate)) {
      return { index, matchedLabel: lines[index] };
    }
  }
  return { index: -1, matchedLabel: '' };
}

function resolveSectionBounds(lines, labels) {
  const { index } = findHeadingIndex(lines, labels);
  if (index === -1) {
    return { start: -1, end: -1 };
  }
  let end = lines.length;
  for (let offset = index + 1; offset < lines.length; offset += 1) {
    const line = normaliseHeading(lines[offset]);
    if (!line) {
      end = offset;
      break;
    }
    const isHeading = Object.values(SECTION_LABELS).some((section) =>
      section.some((candidate) => normaliseHeading(candidate) === line)
    );
    if (isHeading) {
      end = offset;
      break;
    }
  }
  return { start: index, end };
}

function replaceSection(resumeText, labels, lines) {
  const list = tokenizeLines(resumeText);
  const { start, end } = resolveSectionBounds(list, labels);
  const replacement = Array.isArray(lines) ? lines : tokenizeLines(lines);
  if (start === -1) {
    const heading = labels[0] ? labels[0].toUpperCase() : 'SUMMARY';
    const output = [...list];
    if (output.length && output[output.length - 1].trim()) {
      output.push('');
    }
    output.push(heading.toUpperCase());
    output.push(...replacement);
    return output.join('\n');
  }
  const output = [...list];
  output.splice(start, Math.max(end - start, 1), list[start], ...replacement);
  return output.join('\n');
}

function appendSection(resumeText, labels, lines) {
  const list = tokenizeLines(resumeText);
  const replacement = Array.isArray(lines) ? lines : tokenizeLines(lines);
  const heading = labels[0] ? labels[0].toUpperCase() : 'SECTION';
  const { start } = resolveSectionBounds(list, labels);
  if (start !== -1) {
    const output = [...list];
    output.splice(start + 1, 0, ...replacement);
    return output.join('\n');
  }
  const output = [...list];
  if (output.length && output[output.length - 1].trim()) {
    output.push('');
  }
  output.push(heading.toUpperCase());
  output.push(...replacement);
  return output.join('\n');
}

function replaceFirstLine(resumeText, value) {
  const list = tokenizeLines(resumeText);
  if (!list.length) {
    return value ? value : '';
  }
  const updated = [...list];
  updated[0] = value ? value.toUpperCase() : list[0];
  return updated.join('\n');
}

function appendUniqueLines(resumeText, labels, lines) {
  const list = tokenizeLines(resumeText);
  const additions = Array.isArray(lines) ? lines : tokenizeLines(lines);
  const { start } = resolveSectionBounds(list, labels);
  const output = [...list];
  if (start === -1) {
    const heading = labels[0] ? labels[0].toUpperCase() : 'SECTION';
    if (output.length && output[output.length - 1].trim()) {
      output.push('');
    }
    output.push(heading.toUpperCase());
    output.push(...additions);
    return output.join('\n');
  }
  const seen = new Set();
  for (let index = start + 1; index < output.length; index += 1) {
    const line = normaliseHeading(output[index]);
    if (!line) break;
    seen.add(line);
  }
  const insertionPoint = start + 1;
  const unique = additions.filter((line) => {
    const normalised = normaliseHeading(line);
    if (!normalised) return false;
    if (seen.has(normalised)) return false;
    seen.add(normalised);
    return true;
  });
  if (!unique.length) {
    return resumeText;
  }
  output.splice(insertionPoint, 0, ...unique);
  return output.join('\n');
}

function summariseJob(jobDescription = '', jobSkills = []) {
  const description = normaliseLine(jobDescription);
  if (!description) {
    if (jobSkills.length) {
      return `Seasoned professional aligning ${jobSkills.join(', ')} impact with hiring needs.`;
    }
    return 'Results-driven professional aligning experience with key hiring priorities.';
  }
  const sentences = description.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (!sentences.length) {
    return description;
  }
  const primary = sentences.slice(0, 2).join('. ');
  if (jobSkills.length) {
    return `${primary}. Demonstrates strengths across ${jobSkills.slice(0, 5).join(', ')}.`;
  }
  return `${primary}.`;
}

function buildSkillsBullets(skills = []) {
  if (!skills.length) {
    return [];
  }
  return skills.slice(0, 10).map((skill) => `• ${skill}`);
}

function buildExperienceBullets(jobDescription = '', jobSkills = []) {
  const focus = jobSkills.slice(0, 3).join(', ');
  const descriptor = focus
    ? `key responsibilities across ${focus}`
    : 'key responsibilities from the job description';
  return [
    `• Reframed accomplishments to spotlight ${descriptor}.`,
    `• Quantified impact to mirror recruiter expectations from the job description.`,
  ];
}

function buildProjectsBullets(jobSkills = []) {
  if (!jobSkills.length) {
    return [
      '• Highlighted a recent project with measurable outcomes tied to business goals.',
    ];
  }
  const focus = jobSkills.slice(0, 2).join(' and ');
  return [
    `• Added a featured project demonstrating ${focus} with measurable results.`,
  ];
}

function buildHighlights(jobSkills = []) {
  return [
    '• Surfaced two accomplishment bullets that communicate speed-to-impact.',
    ...(jobSkills.length
      ? [`• Brought ${jobSkills[0]} wins to the top of the page for quick scanning.`]
      : []),
  ];
}

function buildCertificationLines(manualCertificates = [], jobSkills = []) {
  if (manualCertificates.length) {
    return manualCertificates.map((cert) => `• ${cert}`);
  }
  if (jobSkills.length) {
    return [
      `• Recommended certification paths to reinforce ${jobSkills[0]} credibility.`,
    ];
  }
  return ['• Suggested certifications that reinforce credibility for the target role.'];
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export function generateEnhancementPatch(event = {}) {
  const type = event.type || 'improve-summary';
  const resumeText = splitLines(event.resumeText || '');
  const jobDescription = splitLines(event.jobDescription || '');
  const jobSkills = normalizeSkillListInput(event.jobSkills);
  const missingSkills = ensureArray(event.missingSkills);
  const targetTitle = normaliseLine(event.targetTitle || event.jobTitle);
  const manualCertificates = ensureArray(event.manualCertificates);

  const patches = {
    'improve-summary': () => {
      const summaryLabels = SECTION_LABELS.summary;
      const currentSummaryBounds = resolveSectionBounds(tokenizeLines(resumeText), summaryLabels);
      const beforeLines = currentSummaryBounds.start === -1
        ? []
        : tokenizeLines(resumeText).slice(
            currentSummaryBounds.start + 1,
            Math.max(currentSummaryBounds.end, currentSummaryBounds.start + 1)
          );
      const beforeExcerpt = beforeLines.join('\n');
      const headline = targetTitle
        ? `${targetTitle.toUpperCase()}`
        : tokenizeLines(resumeText)[0] || '';
      const summaryBody = summariseJob(jobDescription, jobSkills);
      const afterLines = [summaryBody];
      const updatedResume = replaceSection(resumeText, summaryLabels, afterLines);
      return {
        type,
        title: 'Rewrite summary',
        explanation: 'Focused the opening summary on the target role and key hiring themes.',
        beforeExcerpt,
        afterExcerpt: afterLines.join('\n'),
        patch: {
          op: 'replace-section',
          sectionLabels: summaryLabels,
          lines: afterLines,
        },
        updatedResume,
      };
    },
    'add-missing-skills': () => {
      const skills = missingSkills.length ? missingSkills : jobSkills;
      const lines = buildSkillsBullets(skills);
      const updatedResume = appendUniqueLines(resumeText, SECTION_LABELS.skills, lines);
      return {
        type,
        title: 'Add missing skills',
        explanation: 'Appended skills directly sourced from the job description.',
        beforeExcerpt: '',
        afterExcerpt: lines.join('\n'),
        patch: {
          op: 'append-unique-lines',
          sectionLabels: SECTION_LABELS.skills,
          lines,
        },
        updatedResume,
      };
    },
    'change-designation': () => {
      if (!targetTitle) {
        return {
          type,
          title: 'Align designation',
          explanation: 'No target title supplied; skipped designation alignment.',
          beforeExcerpt: tokenizeLines(resumeText)[0] || '',
          afterExcerpt: tokenizeLines(resumeText)[0] || '',
          patch: null,
          updatedResume: resumeText,
        };
      }
      const before = tokenizeLines(resumeText)[0] || '';
      const updatedResume = replaceFirstLine(resumeText, targetTitle);
      return {
        type,
        title: 'Align designation',
        explanation: 'Updated the visible designation to match the target job title.',
        beforeExcerpt: before,
        afterExcerpt: targetTitle.toUpperCase(),
        patch: {
          op: 'replace-first-line',
          value: targetTitle,
        },
        updatedResume,
      };
    },
    'align-experience': () => {
      const lines = buildExperienceBullets(jobDescription, jobSkills);
      const updatedResume = appendUniqueLines(resumeText, SECTION_LABELS.experience, lines);
      return {
        type,
        title: 'Align experience',
        explanation: 'Inserted measurable accomplishments that mirror the JD expectations.',
        beforeExcerpt: '',
        afterExcerpt: lines.join('\n'),
        patch: {
          op: 'append-unique-lines',
          sectionLabels: SECTION_LABELS.experience,
          lines,
        },
        updatedResume,
      };
    },
    'improve-certifications': () => {
      const lines = buildCertificationLines(manualCertificates, jobSkills);
      const updatedResume = appendUniqueLines(resumeText, SECTION_LABELS.certifications, lines);
      return {
        type,
        title: 'Improve certifications',
        explanation: 'Suggested certifications to reinforce credibility.',
        beforeExcerpt: '',
        afterExcerpt: lines.join('\n'),
        patch: {
          op: 'append-unique-lines',
          sectionLabels: SECTION_LABELS.certifications,
          lines,
        },
        updatedResume,
      };
    },
    'improve-projects': () => {
      const lines = buildProjectsBullets(jobSkills);
      const updatedResume = appendUniqueLines(resumeText, SECTION_LABELS.projects, lines);
      return {
        type,
        title: 'Improve projects',
        explanation: 'Highlighted projects that echo the job description.',
        beforeExcerpt: '',
        afterExcerpt: lines.join('\n'),
        patch: {
          op: 'append-unique-lines',
          sectionLabels: SECTION_LABELS.projects,
          lines,
        },
        updatedResume,
      };
    },
    'improve-highlights': () => {
      const lines = buildHighlights(jobSkills);
      const updatedResume = appendUniqueLines(resumeText, SECTION_LABELS.highlights, lines);
      return {
        type,
        title: 'Improve highlights',
        explanation: 'Surfaced quick-scan achievements for recruiters.',
        beforeExcerpt: '',
        afterExcerpt: lines.join('\n'),
        patch: {
          op: 'append-unique-lines',
          sectionLabels: SECTION_LABELS.highlights,
          lines,
        },
        updatedResume,
      };
    },
  };

  const generator = patches[type] || patches['improve-summary'];
  return generator();
}

export function applyPatch(resumeText, patch) {
  if (!patch || typeof patch !== 'object') {
    return resumeText;
  }
  const op = patch.op;
  if (op === 'replace-section') {
    return replaceSection(resumeText, patch.sectionLabels || [], patch.lines || []);
  }
  if (op === 'append-unique-lines') {
    return appendUniqueLines(resumeText, patch.sectionLabels || [], patch.lines || []);
  }
  if (op === 'replace-first-line') {
    return replaceFirstLine(resumeText, patch.value || '');
  }
  return resumeText;
}

export function normaliseFanOutTypes(types) {
  if (Array.isArray(types) && types.length) {
    return types.filter((type) => ENHANCEMENT_TYPES.includes(type));
  }
  return [...ENHANCEMENT_TYPES];
}

