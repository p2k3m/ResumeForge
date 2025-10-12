import { createHash } from 'crypto';

/**
 * Generate a deterministic digest for resume content. The helper normalises
 * whitespace so identical documents across services produce the same hash.
 *
 * @param {string} value - Resume text or job description input.
 * @returns {string} SHA-256 digest encoded as a hexadecimal string.
 */
export function createTextDigest(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return createHash('sha256').update(normalized).digest('hex');
}

export default {
  createTextDigest,
};
