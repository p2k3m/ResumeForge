import { generativeModel } from '../geminiClient.js';

const prompt =
  'Classify the following document. Respond with a short phrase such as "resume", "cover letter", "essay", etc.';

export async function describeDocument(text) {
  if (!generativeModel?.generateContent) {
    throw new Error('Gemini model not initialized');
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
