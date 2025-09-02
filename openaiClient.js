import OpenAI from 'openai';
import { File } from 'node:buffer';
import { getSecrets } from './server.js';

// Ordered list of supported models. Unavailable or experimental models should
// be placed at the end or removed to avoid unnecessary `model_not_found`
// warnings during résumé generation.
const preferredModels = ['gpt-4.1', 'gpt-4o-mini'];

let clientPromise;
async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const secrets = await getSecrets();
      let apiKey = process.env.OPENAI_API_KEY || secrets.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('OPENAI_API_KEY missing, using dummy key');
        apiKey = 'test';
      }
      return new OpenAI({ apiKey });
    })();
  }
  return clientPromise;
}

export async function uploadFile(buffer, filename, purpose = 'assistants') {
  const client = await getClient();
  const file = await client.files.create({
    file: new File([buffer], filename),
    purpose,
  });
  return file;
}

export async function requestEnhancedCV({
  cvFileId,
  jobDescFileId,
  linkedInFileId,
  credlyFileId,
  instructions,
}) {
  const client = await getClient();
  const content = [
    { type: 'input_text', text: instructions },
    { type: 'input_file', file_id: cvFileId },
    { type: 'input_file', file_id: jobDescFileId },
  ];
  if (linkedInFileId) content.push({ type: 'input_file', file_id: linkedInFileId });
  if (credlyFileId) content.push({ type: 'input_file', file_id: credlyFileId });
  const schema = {
    type: 'object',
    properties: {
      cv_version1: { type: 'string' },
      cv_version2: { type: 'string' },
      cover_letter1: { type: 'string' },
      cover_letter2: { type: 'string' },
      original_score: { type: 'number' },
      enhanced_score: { type: 'number' },
      skills_added: { type: 'array', items: { type: 'string' } },
      improvement_summary: { type: 'string' },
    },
    required: [
      'cv_version1',
      'cv_version2',
      'cover_letter1',
      'cover_letter2',
      'original_score',
      'enhanced_score',
      'skills_added',
      'improvement_summary',
    ],
  };
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content }],
        text: {
          format: {
            type: 'json_schema',
            name: 'EnhancedCV',
            json_schema: { schema, strict: true },
          },
        },
      });
      console.log(`Using model: ${model}`);
      return response.output_text;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') {
        console.warn(`Model not found: ${model}`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
