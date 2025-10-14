const NEWLINE = '\n';

function normaliseSectionBody(body) {
  if (Array.isArray(body)) {
    return body
      .flatMap((entry) => {
        if (entry === null || entry === undefined) {
          return [];
        }
        if (typeof entry === 'string') {
          return entry;
        }
        if (typeof entry === 'number' || typeof entry === 'boolean') {
          return String(entry);
        }
        if (Array.isArray(entry)) {
          return normaliseSectionBody(entry);
        }
        try {
          return JSON.stringify(entry);
        } catch {
          return String(entry);
        }
      })
      .filter((value) => typeof value === 'string' && value.trim())
      .join(NEWLINE);
  }

  if (body === null || body === undefined) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'number' || typeof body === 'boolean') {
    return String(body);
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export function createVersionedPrompt({
  templateId,
  templateVersion,
  description,
  metadata = {},
  sections = [],
}) {
  if (!templateId) {
    throw new Error('templateId is required to build a prompt template.');
  }
  if (!templateVersion) {
    throw new Error('templateVersion is required to build a prompt template.');
  }

  const header = [
    `[[Template:${templateId}]]`,
    `[[Version:${templateVersion}]]`,
  ];

  if (description) {
    header.push(`[[Description:${description}]]`);
  }

  for (const [key, value] of Object.entries(metadata || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    header.push(`[[${key}:${value}]]`);
  }

  header.push('---');

  const sectionBlocks = [];
  for (const entry of sections) {
    if (!entry) continue;
    const title = entry.title ? String(entry.title).trim() : '';
    const body = normaliseSectionBody(entry.body).trim();
    if (!body) {
      continue;
    }
    if (title) {
      sectionBlocks.push(`${title.toUpperCase()}:`);
    }
    sectionBlocks.push(body);
    sectionBlocks.push('');
  }

  const bodyText = sectionBlocks
    .join(NEWLINE)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const promptText = [...header, bodyText].filter(Boolean).join(NEWLINE).trim();

  return {
    text: promptText,
    templateId,
    templateVersion,
  };
}

export const PROMPT_TEMPLATES = {
  resumeImprovement: { templateId: 'resume_improvement', templateVersion: '2024-05-18' },
  learningResources: { templateId: 'learning_resources', templateVersion: '2024-05-18' },
  resumeRewrite: { templateId: 'resume_rewrite', templateVersion: '2024-05-18' },
  projectSummary: { templateId: 'project_summary', templateVersion: '2024-05-18' },
  documentClassification: {
    templateId: 'document_classification',
    templateVersion: '2024-05-18',
  },
};

export default {
  createVersionedPrompt,
  PROMPT_TEMPLATES,
};
