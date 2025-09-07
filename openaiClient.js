import OpenAI from 'openai';
import { File } from 'node:buffer';
import path from 'path';
import { getSecrets } from './config/secrets.js';
import { generativeModel } from './geminiClient.js';

// Ordered list of supported models. Unavailable or experimental models should
// be placed at the end or removed to avoid unnecessary `model_not_found`
// warnings during résumé generation.
const preferredModels = ['gpt-4.1', 'gpt-4o-mini'];

const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '10000', 10);

function withTimeout(promise, ms = AI_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const err = new Error('AI request timed out');
      err.code = 'AI_TIMEOUT';
      setTimeout(() => reject(err), ms);
    }),
  ]);
}

const metricNames = [
  'layoutSearchability',
  'atsReadability',
  'impact',
  'crispness',
  'keywordDensity',
  'sectionHeadingClarity',
  'contactInfoCompleteness',
];

// Gemini responses may wrap JSON in additional text or code fences.
// This helper extracts the first JSON object for parsing.
function extractJson(text) {
  const match = text?.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  return JSON.parse(match[0]);
}

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
  if (!cvFileId) throw new Error('cvFileId is required');
  if (!jobDescFileId) throw new Error('jobDescFileId is required');
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
      languages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            proficiency: { type: 'string' }
          },
          required: ['language'],
          additionalProperties: false
        }
      },
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
      'languages',
      'improvement_summary',
      'metrics',
    ],
    additionalProperties: false,
  };
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
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
        })
      );
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
  if (generativeModel?.generateContent) {
    try {
      const prompt = `${refinedInstructions}\nReturn JSON with keys cv_version1, cv_version2, cover_letter1, cover_letter2, original_score, enhanced_score, skills_added, languages, improvement_summary, metrics (metric, original, improved, improvement).`;
      const result = await withTimeout(generativeModel.generateContent(prompt));
      return result?.response?.text?.();
    } catch (err) {
      lastError = err;
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
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        })
      );
      return response.output_text;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      throw err;
    }
  }
  throw lastError;
}

export async function requestCoverLetter({
  cvFileId,
  jobDescFileId,
  linkedInFileId,
  credlyFileId,
}) {
  if (!cvFileId) throw new Error('cvFileId is required');
  if (!jobDescFileId) throw new Error('jobDescFileId is required');
  const client = await getClient();
  const content = [
    {
      type: 'input_text',
      text: 'You are an expert career coach. Write a concise and professional cover letter tailored to the provided job description and resume.',
    },
    { type: 'input_file', file_id: cvFileId },
    { type: 'input_file', file_id: jobDescFileId },
  ];
  if (linkedInFileId)
    content.push({ type: 'input_file', file_id: linkedInFileId });
  if (credlyFileId)
    content.push({ type: 'input_file', file_id: credlyFileId });
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [{ role: 'user', content }],
        })
      );
      return response.output_text;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      throw err;
    }
  }
  if (generativeModel?.generateContent) {
    try {
      const prompt =
        'You are an expert career coach. Write a concise and professional cover letter tailored to the provided job description and resume.';
      const result = await withTimeout(generativeModel.generateContent(prompt));
      return result?.response?.text?.();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function requestAtsAnalysis(text) {
  if (!text) throw new Error('text is required');
  const client = await getClient();
  const schema = {
    type: 'object',
    properties: metricNames.reduce((acc, metric) => {
      acc[metric] = { type: 'number' };
      return acc;
    }, {}),
    required: metricNames,
    additionalProperties: false,
  };
  const prompt = `You are an ATS evaluation expert. Analyze the resume text and score each metric from 0-100: ${metricNames.join(
    ', '
  )}. Return a JSON object with these metrics.`;
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: `${prompt}\n\n${text}` }],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'AtsAnalysis',
              schema,
              strict: true,
            },
          },
        })
      );
      const parsed = JSON.parse(response.output_text);
      if (!metricNames.every((m) => typeof parsed[m] === 'number')) {
        throw new Error('invalid metrics');
      }
      return parsed;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
    }
  }
  if (generativeModel?.generateContent) {
    try {
      const result = await withTimeout(
        generativeModel.generateContent(`${prompt}\n\n${text}`)
      );
      const parsed = extractJson(result?.response?.text?.());
      if (!metricNames.every((m) => typeof parsed[m] === 'number')) {
        throw new Error('invalid metrics');
      }
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function classifyDocument(text) {
  const client = await getClient();
  const prompt =
    'Classify the following document. Respond with a short phrase such as "resume", "cover letter", "essay", etc.';
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [
            {
              role: 'user',
              content: [{
                type: 'input_text',
                text: `${prompt}\n\n${text.slice(0, 4000)}`,
              }],
            },
          ],
        })
      );
      return response.output_text.trim().toLowerCase();
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      throw err;
    }
  }
  throw lastError;
}
