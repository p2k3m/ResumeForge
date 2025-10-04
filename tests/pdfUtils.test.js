import { describe, expect, test } from '@jest/globals';
import { extractEntries, tokensToEntry } from '../lib/pdf/utils.js';

describe('pdf utils enhancement tokens', () => {
  test('tokensToEntry replaces enhancement tokens while preserving styles', () => {
    const tokens = [
      { text: '{{RF_ENH_BULLET_0001}}', style: 'bold' },
      { type: 'paragraph', text: ' ' },
      { text: 'tail' }
    ];
    const enhancementTokenMap = {
      '{{RF_ENH_BULLET_0001}}': 'Lead'
    };
    const entry = tokensToEntry(tokens, { enhancementTokenMap });
    expect(entry.text).toBe('Lead tail');
    expect(entry.styleRanges).toEqual([
      { start: 0, end: 4, style: 'bold' }
    ]);
  });

  test('extractEntries forwards enhancement token map to tokensToEntry', () => {
    const section = {
      items: [[{ text: '{{RF_ENH_SUMMARY_0001}}', style: 'italic' }]]
    };
    const enhancementTokenMap = {
      '{{RF_ENH_SUMMARY_0001}}': 'Improved summary'
    };
    const [entry] = extractEntries(section, { enhancementTokenMap });
    expect(entry.text).toBe('Improved summary');
    expect(entry.styleRanges).toEqual([
      { start: 0, end: 'Improved summary'.length, style: 'italic' }
    ]);
  });
});
