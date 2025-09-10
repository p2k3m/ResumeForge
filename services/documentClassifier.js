import { generativeModel } from '../geminiClient.js';

const prompt =
  'Classify the following document. Respond with a short phrase such as "resume", "cover letter", "essay", etc.';

function normalizeText(text = '') {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ');
}

function keywordHeuristic(text = '') {
  const lower = normalizeText(text);
  if (
    lower.includes('resume') ||
    lower.includes('curriculum vitae') ||
    lower.includes('curriculumvitae') ||
    lower.includes('cv')
  )
    return 'resume';
  if (lower.includes('cover letter')) return 'cover letter';
  if (lower.includes('essay')) return 'essay';

  const sections = [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
    'work history',
    'education',
    'skills',
    'professional summary',
    'summary',
  ];
  const matches = sections.filter((section) => lower.includes(section));
  if (matches.length >= 2) return 'resume';

  return null;
}

function localClassifier(text = '') {
  const lower = normalizeText(text);
  const categories = {
    resume: [
      'work experience',
      'experience',
      'education',
      'skills',
      'professional summary',
      'objective',
    ],
    'cover letter': [
      'dear',
      'hiring manager',
      'sincerely',
      'application',
      'position',
    ],
    essay: ['introduction', 'conclusion', 'thesis'],
  };
  let bestScore = 0;
  let bestLabel = null;
  for (const [label, keywords] of Object.entries(categories)) {
    let score = 0;
    keywords.forEach((k) => {
      if (lower.includes(k)) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  return bestScore > 0 ? bestLabel : null;
}

function mlModelClassifier(text = '') {
  // Placeholder for a local ML model classifier; currently leverages the
  // simple keyword-based local classifier.
  return localClassifier(text);
}

export async function describeDocument(text) {
  const classifiers = [
    // Gemini classifier
    async () => {
      if (!generativeModel?.generateContent) {
        console.warn('Gemini model not initialized');
        return null;
      }
      try {
        const result = await generativeModel.generateContent(
          `${prompt}\n\n${text.slice(0, 4000)}`
        );
        return result?.response?.text?.().trim().toLowerCase() || null;
      } catch (err) {
        console.warn('Gemini classification failed', err);
        return null;
      }
    },
    // OpenAI classifier
    async () => {
      try {
        const { classifyDocument } = await import('../openaiClient.js');
        return await classifyDocument(text);
      } catch (err) {
        console.warn('OpenAI classification failed', err);
        return null;
      }
    },
    // Heuristic keyword classifier
    async () => keywordHeuristic(text),
    // Local ML model classifier
    async () => mlModelClassifier(text),
  ];

  let fallback = 'unknown';
  for (const classify of classifiers) {
    const label = await classify();
    if (!label) continue;
    if (label === 'resume') {
      fallback = 'resume';
      continue;
    }
    return label;
  }
  return fallback;
}

export default { describeDocument };
