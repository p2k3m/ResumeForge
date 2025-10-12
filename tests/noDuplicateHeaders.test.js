import { parseContent } from '../lib/resume/content.js';

describe('heading normalization removes duplicates', () => {
  test('normalizes to title case and merges sections', () => {
    const input = [
      'Jane Doe',
      '# experience',
      '- Job A',
      '# EXPERIENCE!',
      '- Job B',
      '# education',
      '- School A',
      '# EDUCATION ',
      '- School B'
    ].join('\n');
    const data = parseContent(input);
    const counts = data.sections.reduce((acc, s) => {
      acc[s.heading] = (acc[s.heading] || 0) + 1;
      return acc;
    }, {});
    expect(counts['Work Experience']).toBe(1);
    expect(counts['Education']).toBe(1);
  });
});
