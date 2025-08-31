import { sanitizeGeneratedText } from '../server.js';

describe('sanitizeGeneratedText', () => {
  test('removes bracketed guidance lines', () => {
    const input = [
      'John Doe',
      '[Optional note]',
      '# Experience',
      '- Did things'
    ].join('\n');

    const output = sanitizeGeneratedText(input, { skipRequiredSections: true });
    expect(output).toBe(['John Doe', '# Experience', 'Did things'].join('\n'));
  });
});
