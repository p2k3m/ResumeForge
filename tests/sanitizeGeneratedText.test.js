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

  test('removes bracketed placeholders within cover letters', () => {
    const input = [
      'Dear [Hiring Manager],',
      'I am excited about the [Position Title] role.',
      'Sincerely,',
      'John Doe'
    ].join('\n');

    const output = sanitizeGeneratedText(input, {
      skipRequiredSections: true,
      defaultHeading: ''
    });
    expect(output).toBe(
      ['Dear ,', 'I am excited about the role.', 'Sincerely,', 'John Doe'].join('\n')
    );
  });
});
