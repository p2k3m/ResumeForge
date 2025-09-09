import OpenAI from 'openai';
import { File } from 'node:buffer';
import path from 'path';
import { getSecrets } from './config/secrets.js';
import { generativeModel } from './geminiClient.js';

const MODEL_NAME = process.env.MODEL_NAME || 'gpt-5';

// Ordered list of supported models. Unavailable or experimental models should
// be placed at the end or removed to avoid unnecessary `model_not_found`
// warnings during résumé generation.
const preferredModels = [MODEL_NAME, 'gpt-4.1', 'gpt-4o'];

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
  'grammar',
];

// Centralized prompt definitions used for all OpenAI requests.
const prompts = {
  enhancedCv: {
    system:
      'You are ResumeForge, a service that rewrites resumes and cover letters to better match a job description.',
    developer:
      'Generate two improved resume versions and two cover letters using the provided files. Respond in JSON matching the EnhancedCV schema.'
  },
  atsAnalysis: {
    system: "You are ResumeForge's ATS evaluation assistant.",
    developer:
      `Score the resume for the following metrics and return a JSON object with numeric values from 0 to 100: ${metricNames.join(', ')}.`
  },
  evaluate: {
    system: "You are ResumeForge's CV evaluation assistant.",
    developer:
      'Compare the resume text with the job description and return JSON with the candidate\'s seniority, lists of must_have and nice_to_have keywords, and improvement tips grouped by category such as experience, education, certifications, and languages.'
  },
  coverLetter: {
    system: 'You are ResumeForge, an expert career coach.',
    developer:
      'Write a concise and professional cover letter tailored to the provided resume and job description.'
  },
  sectionImprovement: {
    system: 'You are ResumeForge, an expert resume writer.',
    developer:
      'Improve the specified resume section to align with the job description. Return only the rewritten section text.'
  },
  classify: {
    system: 'You are ResumeForge, a document classification assistant.',
    developer:
      'Classify the document with a short label such as "resume" or "cover letter".'
  },
  extractName: {
    system: 'You are ResumeForge, an assistant that extracts a person\'s name from text.',
    developer: 'Return only the full name if one is present.'
  }
};

// Gemini responses may wrap JSON in additional text or code fences.
// This helper extracts the first JSON object for parsing.
function extractJson(text) {
  const match = text?.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  return JSON.parse(match[0]);
}

// Normalize Gemini's JSON keys to match the OpenAI schema
function normalizeEnhancedCvJson(data = {}) {
  const mapping = {
    cvVersion1: 'cv_version1',
    cvVersion2: 'cv_version2',
    coverLetter1: 'cover_letter1',
    coverLetter2: 'cover_letter2',
    originalScore: 'original_score',
    enhancedScore: 'enhanced_score',
    skillsAdded: 'skills_added',
    improvementSummary: 'improvement_summary',
  };
  for (const [from, to] of Object.entries(mapping)) {
    if (data[from] !== undefined && data[to] === undefined) {
      data[to] = data[from];
    }
  }
  return data;
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

export async function uploadFile(
  buffer,
  filename,
  purpose = 'assistants',
  { signal } = {}
) {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.pdf') {
    throw new Error('Only .pdf files are allowed');
  }
  const client = await getClient();
  const file = await client.files.create(
    {
      file: new File([buffer], filename, { type: 'application/pdf' }),
      purpose,
    },
    { signal }
  );
  return file;
}

export async function requestEnhancedCV({
  cvFileId,
  jobDescFileId,
  linkedInFileId,
  credlyFileId,
  instructions,
  priorCvFileId,
}, { signal } = {}) {
  if (!cvFileId) throw new Error('cvFileId is required');
  if (!jobDescFileId) throw new Error('jobDescFileId is required');
  if (typeof instructions !== 'string' || !instructions.trim()) {
    throw new Error('instructions must be a non-empty string');
  }
  const client = await getClient();
  const refinedInstructions = priorCvFileId
    ? `${instructions}\nRefine the already improved CV.`
    : instructions;
  const userContent = [
    { type: 'input_text', text: refinedInstructions },
    { type: 'input_file', file_id: cvFileId },
  ];
  if (priorCvFileId)
    userContent.push({ type: 'input_file', file_id: priorCvFileId });
  userContent.push({ type: 'input_file', file_id: jobDescFileId });
  if (linkedInFileId)
    userContent.push({ type: 'input_file', file_id: linkedInFileId });
  if (credlyFileId) userContent.push({ type: 'input_file', file_id: credlyFileId });
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
        client.responses.create(
          {
            model,
            input: [
              {
                role: 'system',
                content: [{ type: 'input_text', text: prompts.enhancedCv.system }],
              },
              {
                role: 'developer',
                content: [{ type: 'input_text', text: prompts.enhancedCv.developer }],
              },
              { role: 'user', content: userContent },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'EnhancedCV',
                schema,
                strict: true,
              },
            },
          },
          { signal }
        )
      );
      console.log(`Using model: ${model}`);
      return response.output_text;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') {
        console.warn(`Model not found: ${model}`);
        continue;
      }
      // For other errors, break to Gemini fallback
      break;
    }
  }
  if (generativeModel?.generateContent) {
    try {
      const parts = [
        {
          text: `${prompts.enhancedCv.system}\n${prompts.enhancedCv.developer}\n${refinedInstructions}`,
        },
        ...userContent
          .slice(1)
          .map((part) => ({
            fileData: { fileUri: part.file_id, mimeType: 'application/pdf' },
          })),
      ];
      const result = await withTimeout(
        generativeModel.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        })
      );
      const parsed = normalizeEnhancedCvJson(
        extractJson(result?.response?.text?.())
      );
      return JSON.stringify(parsed);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function requestSectionImprovement(
  { sectionName, sectionText, jobDescription },
  { signal } = {}
) {
  if (!sectionText) {
    throw new Error('sectionText is required');
  }
  const client = await getClient();
  const userText = `Job Description: ${jobDescription}\n${sectionName}: ${sectionText}`;
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create(
          {
            model,
            input: [
              {
                role: 'system',
                content: [{ type: 'input_text', text: prompts.sectionImprovement.system }],
              },
              {
                role: 'developer',
                content: [{ type: 'input_text', text: prompts.sectionImprovement.developer }],
              },
              { role: 'user', content: [{ type: 'input_text', text: userText }] },
            ],
          },
          { signal }
        )
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

export async function requestCoverLetter(
  {
    cvFileId,
    jobDescFileId,
    linkedInFileId,
    credlyFileId,
  },
  { signal } = {}
) {
  if (!cvFileId) throw new Error('cvFileId is required');
  if (!jobDescFileId) throw new Error('jobDescFileId is required');
  const client = await getClient();
  const userContent = [
    { type: 'input_file', file_id: cvFileId },
    { type: 'input_file', file_id: jobDescFileId },
  ];
  if (linkedInFileId)
    userContent.push({ type: 'input_file', file_id: linkedInFileId });
  if (credlyFileId)
    userContent.push({ type: 'input_file', file_id: credlyFileId });
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create(
          {
            model,
            input: [
              {
                role: 'system',
                content: [{ type: 'input_text', text: prompts.coverLetter.system }],
              },
              {
                role: 'developer',
                content: [{ type: 'input_text', text: prompts.coverLetter.developer }],
              },
              { role: 'user', content: userContent },
            ],
          },
          { signal }
        )
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
      const prompt = `${prompts.coverLetter.system}\n${prompts.coverLetter.developer}`;
      const result = await withTimeout(generativeModel.generateContent(prompt));
      return result?.response?.text?.();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function requestAtsAnalysis(text, { signal } = {}) {
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
  const userText = text;
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create(
          {
            model,
            input: [
              {
                role: 'system',
                content: [{ type: 'input_text', text: prompts.atsAnalysis.system }],
              },
              {
                role: 'developer',
                content: [{ type: 'input_text', text: prompts.atsAnalysis.developer }],
              },
              { role: 'user', content: [{ type: 'input_text', text: userText }] },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'AtsAnalysis',
                schema,
                strict: true,
              },
            },
          },
          { signal }
        )
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
      const prompt = `${prompts.atsAnalysis.system}\n${prompts.atsAnalysis.developer}\n${text}`;
      const result = await withTimeout(generativeModel.generateContent(prompt));
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

export async function requestEvaluation(cvText, jdText, { signal } = {}) {
  if (!cvText) throw new Error('cvText is required');
  if (!jdText) throw new Error('jdText is required');
  const client = await getClient();
  const schema = {
    type: 'object',
    properties: {
      seniority: { type: 'string' },
      keywords: {
        type: 'object',
        properties: {
          must_have: { type: 'array', items: { type: 'string' } },
          nice_to_have: { type: 'array', items: { type: 'string' } },
        },
        required: ['must_have', 'nice_to_have'],
        additionalProperties: false,
      },
      tips: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['seniority', 'keywords', 'tips'],
    additionalProperties: false,
  };
  const userInput = `${cvText}\n\nJD:\n${jdText}`;
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create(
          {
            model,
            input: [
              { role: 'system', content: [{ type: 'input_text', text: prompts.evaluate.system }] },
              { role: 'developer', content: [{ type: 'input_text', text: prompts.evaluate.developer }] },
              { role: 'user', content: [{ type: 'input_text', text: userInput }] },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'Evaluation',
                schema,
                strict: true,
              },
            },
          },
          { signal }
        )
      );
      const parsed = JSON.parse(response.output_text);
      return parsed;
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
    }
  }
  if (generativeModel?.generateContent) {
    try {
      const prompt = `${prompts.evaluate.system}\n${prompts.evaluate.developer}\n${userInput}`;
      const result = await withTimeout(generativeModel.generateContent(prompt));
      const parsed = extractJson(result?.response?.text?.());
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function classifyDocument(text) {
  const client = await getClient();
  const userText = text.slice(0, 4000);
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: prompts.classify.system }],
            },
            {
              role: 'developer',
              content: [{ type: 'input_text', text: prompts.classify.developer }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: userText }],
            },
          ],
        })
      );
      const classification = response.output_text?.trim().toLowerCase();
      if (classification) return classification;
      lastError = new Error('No classification result');
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      // For other errors, break to Gemini fallback
      break;
    }
  }
  if (generativeModel?.generateContent) {
    try {
      const prompt = `${prompts.classify.system}\n${prompts.classify.developer}\n${userText}`;
      const result = await withTimeout(generativeModel.generateContent(prompt));
      const classification = result?.response?.text?.().trim().toLowerCase();
      if (classification) return classification;
      lastError = new Error('No classification result');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function extractName(text, prompt) {
  const client = await getClient();
  let lastError;
  for (const model of preferredModels) {
    try {
      const response = await withTimeout(
        client.responses.create({
          model,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: prompts.extractName.system }],
            },
            {
              role: 'developer',
              content: [{ type: 'input_text', text: prompts.extractName.developer }],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `${prompt}\n\n${text.slice(0, 4000)}`,
                },
              ],
            },
          ],
        })
      );
      const name = response.output_text?.trim();
      if (name) return name;
      lastError = new Error('No name result');
    } catch (err) {
      lastError = err;
      if (err?.code === 'model_not_found') continue;
      break;
    }
  }
  throw lastError;
}
