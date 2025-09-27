import { render2025Template } from './templates/2025.js';

const RENDERERS = {
  '2025': render2025Template
};

function deriveBaseId(templateId = '') {
  if (!templateId) return '';
  const normalized = templateId.split(':')[0];
  const [base] = normalized.split(/[-_]/);
  return base || normalized;
}

function deriveVariant(templateId = '') {
  if (!templateId) return '';
  const normalized = templateId.split(':')[0];
  const [, ...rest] = normalized.split(/[-_]/);
  return rest.join('-');
}

export async function renderTemplatePdf(requestedId, payload = {}) {
  const baseId = payload.templateId || deriveBaseId(requestedId);
  const renderer = RENDERERS[baseId];
  if (!renderer) {
    throw new Error(`Unsupported PDF template: ${requestedId || baseId}`);
  }
  const variantFromId = deriveVariant(requestedId);
  const templateParams = {
    ...(payload.templateParams && typeof payload.templateParams === 'object'
      ? payload.templateParams
      : {})
  };
  if (variantFromId && !templateParams.variant) {
    templateParams.variant = variantFromId;
  }
  return renderer({
    ...payload,
    templateId: baseId,
    requestedTemplateId: requestedId,
    templateParams
  });
}
