import path from 'node:path';

export const CLOUDFRONT_METADATA_SCRIPT_ID = 'resumeforge-cloudfront-metadata';

export function normalizeMetadataUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const resolved = new URL(trimmed);
    const normalizedPath = resolved.pathname ? resolved.pathname.replace(/\/+$/, '') : '';
    const base = `${resolved.origin}${normalizedPath}`;
    return `${base}${resolved.search || ''}${resolved.hash || ''}`;
  } catch (error) {
    return trimmed;
  }
}

function escapeAttributeValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function updateAttributeInTag(tag, attribute, value) {
  if (!tag || !attribute) {
    return tag;
  }

  const escapedValue = escapeAttributeValue(value);
  const attributePattern = new RegExp(`(${attribute}\\s*=\\s*)(["'])([^"']*)(\\2)`, 'i');
  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, (_, prefix, quote, _existing, suffixQuote) => {
      return `${prefix}${quote}${escapedValue}${suffixQuote}`;
    });
  }

  const closing = tag.endsWith('/>') ? '/>' : '>';
  const withoutClosing = tag.slice(0, tag.length - closing.length);
  return `${withoutClosing} ${attribute}="${escapedValue}"${closing}`;
}

export function updateTagAttribute(html, { tagName, matchAttribute, matchValue, attribute, value }) {
  if (!html || !tagName || !matchAttribute || !matchValue || !attribute) {
    return html;
  }

  const pattern = new RegExp(
    `<${tagName}\\b[^>]*${matchAttribute}\\s*=\\s*(["'])${matchValue.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\1[^>]*>`,
    'i',
  );

  return html.replace(pattern, (match) => updateAttributeInTag(match, attribute, value));
}

const META_API_BASE_PATTERN = /<meta\b[^>]*name=["']resumeforge-api-base["'][^>]*>/i;

export function ensureMetaApiBase(html, defaultValue = '') {
  if (typeof html !== 'string' || !html) {
    return html;
  }

  if (META_API_BASE_PATTERN.test(html)) {
    return html;
  }

  const escapedValue = escapeAttributeValue(defaultValue ?? '');
  const metaTag = `<meta name="resumeforge-api-base" content="${escapedValue}" />`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `    ${metaTag}\n  </head>`);
  }

  return `${html}\n${metaTag}`;
}

export function updateMetaApiBase(html, apiBase) {
  if (!apiBase) {
    return html;
  }

  if (!META_API_BASE_PATTERN.test(html)) {
    return ensureMetaApiBase(html, apiBase);
  }

  return updateTagAttribute(html, {
    tagName: 'meta',
    matchAttribute: 'name',
    matchValue: 'resumeforge-api-base',
    attribute: 'content',
    value: apiBase,
  });
}

export function updateBackupApiInputs(html, apiBase) {
  if (!apiBase) {
    return html;
  }

  const pattern = /<input\b[^>]*data-backup-api-base[^>]*>/gi;
  return html.replace(pattern, (match) => updateAttributeInTag(match, 'value', apiBase));
}

export function createPublishedCloudfrontPayload(metadata) {
  return {
    success: true,
    cloudfront: metadata,
  };
}

export function serializePublishedCloudfrontPayload(metadata, { pretty = true } = {}) {
  const payload = createPublishedCloudfrontPayload(metadata);
  if (pretty) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return JSON.stringify(payload);
}

export function embedCloudfrontMetadataIntoHtml(html, metadata, { scriptId = CLOUDFRONT_METADATA_SCRIPT_ID } = {}) {
  if (!metadata || typeof html !== 'string' || !html) {
    return html;
  }

  const apiBase = normalizeMetadataUrl(metadata.apiGatewayUrl);
  const fallbackBase = apiBase || normalizeMetadataUrl(metadata.url);

  if (!apiBase && !fallbackBase) {
    return html;
  }

  let updatedHtml = html;
  if (apiBase) {
    updatedHtml = updateMetaApiBase(updatedHtml, apiBase);
  }

  if (fallbackBase) {
    updatedHtml = updateBackupApiInputs(updatedHtml, fallbackBase);
  }

  try {
    const payload = createPublishedCloudfrontPayload(metadata);
    const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
    const scriptContent = `window.__RESUMEFORGE_CLOUDFRONT_METADATA__ = ${safePayload};`;
    const safeScript = scriptContent.replace(/<\/script/gi, '\\u003c/script');
    const scriptTag = `<script id="${scriptId}">${safeScript}</script>`;
    const scriptPattern = new RegExp(
      `<script\\b[^>]*id=["']${scriptId}["'][^>]*>[\\s\\S]*?<\\/script>`,
      'i',
    );

    if (scriptPattern.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(scriptPattern, scriptTag);
    } else if (updatedHtml.includes('</head>')) {
      updatedHtml = updatedHtml.replace('</head>', `${scriptTag}\n</head>`);
    } else if (updatedHtml.includes('</body>')) {
      updatedHtml = updatedHtml.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      updatedHtml += scriptTag;
    }
  } catch (error) {
    return updatedHtml;
  }

  return updatedHtml;
}

export function resolvePublishedCloudfrontPath({ projectRoot, fallback = 'config/published-cloudfront.json' } = {}) {
  const override = process.env.PUBLISHED_CLOUDFRONT_PATH;
  if (typeof override === 'string' && override.trim()) {
    return path.isAbsolute(override.trim())
      ? override.trim()
      : path.join(projectRoot || process.cwd(), override.trim());
  }

  if (!projectRoot) {
    return path.resolve(process.cwd(), fallback);
  }

  return path.join(projectRoot, fallback);
}
