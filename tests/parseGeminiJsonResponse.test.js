import { jest } from '@jest/globals';

import { parseGeminiJsonResponse } from '../lib/llm/gemini.js';

describe('parseGeminiJsonResponse', () => {
  test('parses JSON when braces appear inside string literals', () => {
    const logger = { error: jest.fn() };
    const response = [
      'Here is the structured data you requested:',
      '{',
      '  "letter": "Dear Hiring Manager {Team}",',
      '  "body": "I am excited to apply to the {Role} position."',
      '}',
      'Thanks!',
    ].join('\n');

    const parsed = parseGeminiJsonResponse(response, { logger });

    expect(parsed).toEqual({
      letter: 'Dear Hiring Manager {Team}',
      body: 'I am excited to apply to the {Role} position.',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('parses fenced JSON blocks with escaped characters', () => {
    const response = [
      '```json',
      '{',
      '  "summary": "Escaped quote: \"{example}\"",',
      '  "items": ["first", "second"]',
      '}',
      '```',
    ].join('\n');

    const parsed = parseGeminiJsonResponse(response);

    expect(parsed).toEqual({
      summary: 'Escaped quote: "{example}"',
      items: ['first', 'second'],
    });
  });
});
