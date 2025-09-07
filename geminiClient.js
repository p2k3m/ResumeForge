import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecrets } from './config/secrets.js';

let generativeModel;
try {
  const { GEMINI_API_KEY } = await getSecrets();
  const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    generativeModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
  }
} catch (err) {
  console.error('Failed to initialize Gemini', err);
}

export { generativeModel };
