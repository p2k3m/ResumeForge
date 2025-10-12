import '../config/environment.js';
import { generateEnhancementPatch } from '../lib/resume/enhancement.js';

export const handler = async (event = {}) => {
  const type = typeof event.type === 'string' ? event.type : 'improve-summary';
  const result = generateEnhancementPatch({ ...event, type });
  return result;
};

export default handler;
