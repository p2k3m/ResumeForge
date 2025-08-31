import { ensureRequiredSections, parseLine } from '../server.js';

describe('ensureRequiredSections work experience merging', () => {
  test('appends missing roles and sorts chronologically', () => {
    const existingToken = parseLine('- Engineer at Acme (2020 – 2021)');
    const data = { sections: [{ heading: 'Work Experience', items: [existingToken] }] };
    const resumeExperience = [
      { company: 'Beta', title: 'Developer', startDate: '2019', endDate: '2020' }
    ];
    const ensured = ensureRequiredSections(data, { resumeExperience });
    const items = ensured.sections[0].items;
    expect(items).toHaveLength(2);
    const lines = items.map((tokens) =>
      tokens.map((t) => t.text || '').join('').trim()
    );
    expect(lines[0]).toBe('Engineer at Acme (2020 – 2021)');
    expect(lines[1]).toBe('Developer at Beta (2019 – 2020)');
  });

  test('does not duplicate existing roles', () => {
    const existingToken = parseLine('- Engineer at Acme (2020 – 2021)');
    const data = { sections: [{ heading: 'Work Experience', items: [existingToken] }] };
    const resumeExperience = [
      { company: 'Acme', title: 'Engineer', startDate: '2020', endDate: '2021' }
    ];
    const ensured = ensureRequiredSections(data, { resumeExperience });
    expect(ensured.sections[0].items).toHaveLength(1);
  });
});
