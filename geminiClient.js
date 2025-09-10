import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecrets } from './config/secrets.js';

let generativeModel;

// Verify Gemini credentials at startup outside of tests.
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      const secrets = await getSecrets();
      const apiKey = process.env.GEMINI_API_KEY || secrets.GEMINI_API_KEY;
      if (!apiKey) {
        console.error(
          'GEMINI_API_KEY is required. Set GEMINI_API_KEY in the environment or secrets JSON.'
        );
        process.exit(1);
        return;
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      generativeModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
    } catch (err) {
      console.error('Failed to initialize Gemini', err);
    }
  })();
}

export { generativeModel };
