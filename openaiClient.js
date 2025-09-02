import OpenAI from 'openai';
import { File } from 'node:buffer';
import { getSecrets } from './server.js';

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
    { type: 'file_reference', file_id: cvFileId },
    { type: 'file_reference', file_id: jobDescFileId },
  ];
  if (linkedInFileId) content.push({ type: 'file_reference', file_id: linkedInFileId });
  if (credlyFileId) content.push({ type: 'file_reference', file_id: credlyFileId });
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
  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [{ role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name: 'cv_enhancement', schema, strict: true } },
  });
  return response.output_text;
}
