import { generativeModel } from '../geminiClient.js';

const prompt =
  'Classify the following document. Respond with a short phrase such as "resume", "cover letter", "essay", etc.';

function keywordHeuristic(text = '') {
  const lower = text.toLowerCase();
  if (
    lower.includes('resume') ||
    lower.includes('curriculum vitae') ||
    lower.includes('cv')
  )
    return 'resume';
  if (lower.includes('cover letter')) return 'cover letter';
  if (lower.includes('essay')) return 'essay';

  const sections = ['experience', 'education', 'skills', 'work history'];
  const matches = sections.filter((section) => lower.includes(section));
  if (matches.length >= 2) return 'resume';

  return null;
}

export async function describeDocument(text) {
  if (!generativeModel?.generateContent) {
    console.warn('Gemini model not initialized; using OpenAI fallback');
    try {
      const { classifyDocument } = await import('../openaiClient.js');
      const classification = await classifyDocument(text);
      console.info('Document classification used OpenAI fallback');
      return classification || 'unknown';
    } catch (err) {
      console.warn('OpenAI fallback failed, using keyword heuristic', err);
      const heuristic = keywordHeuristic(text);
      if (heuristic) {
        console.info('Document classification used keyword heuristic');
        return heuristic;
      }
      return 'unknown';
    }
  }
  try {
    const result = await generativeModel.generateContent(
      `${prompt}\n\n${text.slice(0, 4000)}`
    );
    const classification = result?.response?.text?.().trim().toLowerCase();
    return classification || 'unknown';
  } catch (err) {
    console.error('describeDocument error', err);
    return 'unknown';
  }
}

export default { describeDocument };
