import { removeGuidanceLines } from '../server.js';

describe('removeGuidanceLines', () => {
  test('removes guidance phrases and parenthetical lines', () => {
    const input = [
      'Professional Summary',
      '(Tailor this section)',
      '[Customize this section]',
      'Add other relevant experience',
      'Previous roles summarized above.',
      'List key skills.',
      'Details omitted for brevity.',
      'Consolidate relevant experience',
      'Final line'
    ].join('\n');

    const output = removeGuidanceLines(input);
    expect(output).toBe(['Professional Summary', 'Final line'].join('\n'));
  });
});
