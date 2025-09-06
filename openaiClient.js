import OpenAI from 'openai';
import { File } from 'node:buffer';
import path from 'path';
import { getSecrets } from './config/secrets.js';

// Ordered list of supported models. Unavailable or experimental models should
// be placed at the end or removed to avoid unnecessary `model_not_found`
// warnings during résumé generation.
const preferredModels = ['gpt-4.1', 'gpt-4o-mini'];

const metricNames = [
  'layoutSearchability',
  'atsReadability',
  'impact',
  'crispness',
  'keywordDensity',
  'sectionHeadingClarity',
  'contactInfoCompleteness',
];

let clientPromise;
async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const secrets = await getSecrets();
      const apiKey = process.env.OPENAI_API_KEY || secrets.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required');
      }
      return new OpenAI({ apiKey });
    })();
  }
  return clientPromise;
}

export async function uploadFile(buffer, filename, purpose = 'assistants') {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf') {
    throw new Error('Only .pdf files are allowed');
  }
  const client = await getClient();
  const file = await client.files.create({
    file: new File([buffer], filename, { type: 'application/pdf' }),
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
  priorCvFileId,
}) {
  if (typeof instructions !== 'string' || !instructions.trim()) {
    throw new Error('instructions must be a non-empty string');
  }
  const client = await getClient();
  const refinedInstructions = priorCvFileId
    ? `${instructions}\nRefine the already improved CV.`
    : instructions;
  const content = [
    { type: 'input_text', text: refinedInstructions },
    { type: 'input_file', file_id: cvFileId },
  ];
  if (priorCvFileId)
    content.push({ type: 'input_file', file_id: priorCvFileId });
  content.push({ type: 'input_file', file_id: jobDescFileId });
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
      metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            metric: { type: 'string', enum: metricNames },
            original: { type: 'number' },
            improved: { type: 'number' },
            improvement: { type: 'number' }
          },
          required: ['metric', 'original', 'improved', 'improvement'],
          additionalProperties: false
        }
      }
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
      'metrics',
    ],
    additionalProperties: false,
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
            schema,
            strict: true,
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

export async function requestSectionImprovement({ sectionName, sectionText, jobDescription }) {
  if (!sectionText) {
    throw new Error('sectionText is required');
  }
  const client = await getClient();
  const prompt = `You are an expert resume writer. Improve the ${sectionName} section of a resume so that it aligns with the job description. Return only the rewritten ${sectionName} text.\nJob Description: ${jobDescription}\n${sectionName}: ${sectionText}`;
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      });
      return response.output_text;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      throw err;
    }
  }
  throw lastError;
}
