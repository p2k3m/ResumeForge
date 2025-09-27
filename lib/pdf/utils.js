import JSON5 from 'json5';

export function normalizeHeadingKey(heading = '') {
  return heading
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildSectionMap(sections = []) {
  const map = new Map();
  for (const section of sections || []) {
    if (!section) continue;
    const key = normalizeHeadingKey(section.heading || '');
    if (!key) continue;
    if (!map.has(key)) map.set(key, section);
  }
  return map;
}

export function tokensToEntry(tokens = []) {
  const entry = { text: '', bullet: false, links: [] };
  if (!Array.isArray(tokens)) return entry;
  const parts = [];
  for (const token of tokens) {
    if (!token) continue;
    switch (token.type) {
      case 'bullet':
        entry.bullet = true;
        break;
      case 'newline':
        parts.push('\n');
        break;
      case 'tab':
        parts.push('    ');
        break;
      case 'link': {
        const text = (token.text || '').replace(/\s+/g, ' ').trim();
        if (text) parts.push(text);
        if (token.href) {
          entry.links.push({
            text: text || token.href,
            href: token.href
          });
        }
        break;
      }
      case 'paragraph':
        if (token.text) parts.push(token.text);
        break;
      default:
        if (token.text) parts.push(token.text);
        break;
    }
  }
  const raw = parts.join('');
  const normalized = raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0);
  entry.text = lines.join('\n');
  return entry;
}

export function extractEntries(section) {
  if (!section || !Array.isArray(section.items)) return [];
  return section.items
    .map((tokens) => tokensToEntry(tokens))
    .filter((entry) => entry.text && entry.text.length > 0);
}

export function parseTemplateParams(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return JSON5.parse(trimmed);
  } catch {
    const result = {};
    const pairs = trimmed.split(/[;,]/);
    for (const pair of pairs) {
      const [key, val] = pair.split(/[:=]/);
      if (!key || !val) continue;
      result[key.trim()] = val.trim();
    }
    return result;
  }
}

function mergeParams(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

export function resolveTemplateParams(config, templateId, outputName) {
  if (!config || typeof config !== 'object') return {};
  const resolved = {};
  mergeParams(resolved, config.default);
  mergeParams(resolved, config.all);
  if (config.templates) {
    mergeParams(resolved, config.templates.default);
    mergeParams(resolved, config.templates.all);
  }
  if (templateId) {
    mergeParams(resolved, config[templateId]);
    if (config.templates) mergeParams(resolved, config.templates[templateId]);
  }
  if (outputName) {
    mergeParams(resolved, config[outputName]);
    if (config.outputs) mergeParams(resolved, config.outputs[outputName]);
  }
  if (templateId && outputName) {
    const compositeKey = `${outputName}:${templateId}`;
    mergeParams(resolved, config[compositeKey]);
    if (config.outputs && config.outputs[outputName]) {
      mergeParams(resolved, config.outputs[outputName][templateId]);
    }
  }
  return resolved;
}

export function uniqueByLowercase(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}
