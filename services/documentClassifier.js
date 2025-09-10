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

function classifyLocally(text = '') {
  const heuristic = keywordHeuristic(text);
  if (heuristic) return heuristic;
  return localClassifier(text);
}

export async function describeDocument(text) {
  if (!generativeModel?.generateContent) {
    console.warn('Gemini model not initialized; using OpenAI fallback');
    try {
      const { classifyDocument } = await import('../openaiClient.js');
      const classification = await classifyDocument(text);
      console.info('Document classification used OpenAI fallback');
      return classification || classifyLocally(text) || 'unknown';
    } catch (err) {
      console.warn('OpenAI fallback failed, using local classifiers', err);
      return classifyLocally(text) || 'unknown';
    }
  }
  try {
    const result = await generativeModel.generateContent(
      `${prompt}\n\n${text.slice(0, 4000)}`
    );
    const classification = result?.response?.text?.().trim().toLowerCase();
    return classification || classifyLocally(text) || 'unknown';
  } catch (err) {
    console.error('describeDocument error', err);
    return classifyLocally(text) || 'unknown';
  }
}

export default { describeDocument };
