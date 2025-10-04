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

const ENHANCEMENT_TOKEN_PATTERN = /\{\{RF_ENH_[A-Z0-9_]+\}\}/g;

function resolveTokenText(value = '', tokenMap) {
  if (typeof value !== 'string' || !value) {
    return typeof value === 'string' ? value : '';
  }
  if (!tokenMap || typeof tokenMap !== 'object') {
    return value;
  }
  return value.replace(ENHANCEMENT_TOKEN_PATTERN, (match) => {
    const replacement = tokenMap[match];
    return typeof replacement === 'string' ? replacement : match;
  });
}

export function tokensToEntry(tokens = [], options = {}) {
  const entry = {
    text: '',
    bullet: false,
    links: [],
    tokens: [],
    styleRanges: [],
    linkRanges: []
  };
  if (!Array.isArray(tokens)) return entry;

  const parts = [];
  const normalizedTokens = [];
  const seenLinks = new Set();
  let cursor = 0;

  const enhancementTokenMap =
    options && typeof options.enhancementTokenMap === 'object'
      ? options.enhancementTokenMap
      : null;

  const pushRange = (collection, range) => {
    if (range.start >= range.end) return;
    collection.push(range);
  };

  for (const token of tokens) {
    if (!token) continue;

    const copy = {};
    if (token.type) copy.type = token.type;
    if (typeof token.text === 'string') {
      copy.text = resolveTokenText(token.text, enhancementTokenMap);
    }
    if (token.style) copy.style = token.style;
    if (token.href) copy.href = token.href;
    normalizedTokens.push(copy);

    switch (token.type) {
      case 'bullet':
        entry.bullet = true;
        break;
      case 'newline':
        parts.push('\n');
        cursor += 1;
        break;
      case 'tab': {
        const tab = '    ';
        parts.push(tab);
        cursor += tab.length;
        break;
      }
      case 'jobsep':
        break;
      case 'link': {
        const resolved = resolveTokenText(token.text || '', enhancementTokenMap);
        const text = resolved.replace(/\u00a0/g, ' ');
        if (!text) break;
        parts.push(text);
        const start = cursor;
        cursor += text.length;
        const end = cursor;
        const linkKey = `${token.href || ''}|${text}`.toLowerCase();
        if (token.href && !seenLinks.has(linkKey)) {
          seenLinks.add(linkKey);
          entry.links.push({ text: text.trim() || token.href, href: token.href });
        }
        pushRange(entry.linkRanges, { start, end, href: token.href });
        if (token.style) {
          pushRange(entry.styleRanges, { start, end, style: token.style });
        }
        break;
      }
      default: {
        const resolved = resolveTokenText(token.text || '', enhancementTokenMap);
        const text = resolved.replace(/\u00a0/g, ' ');
        if (!text) break;
        parts.push(text);
        const start = cursor;
        cursor += text.length;
        if (token.style) {
          pushRange(entry.styleRanges, { start, end: cursor, style: token.style });
        }
        break;
      }
    }
  }

  const raw = parts.join('').replace(/\r/g, '');
  entry.text = raw;
  entry.tokens = normalizedTokens;
  entry.styleRanges.sort((a, b) => a.start - b.start || a.end - b.end);
  entry.linkRanges.sort((a, b) => a.start - b.start || a.end - b.end);
  return entry;
}

export function extractEntries(section, options = {}) {
  if (!section || !Array.isArray(section.items)) return [];
  return section.items
    .map((tokens) => tokensToEntry(tokens, options))
    .filter((entry) => /[^\s]/.test(entry.text || ''));
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
