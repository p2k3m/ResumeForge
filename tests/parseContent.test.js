import { parseContent } from '../server.js';

describe('parseContent placeholders', () => {
  test('inserts placeholder when Work Experience and Education missing in markdown', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JavaScript');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });

  test('inserts placeholder when Work Experience and Education missing in JSON', () => {
    const json = { name: 'Jane', sections: [{ heading: 'Skills', items: ['JS'] }] };
    const data = parseContent(JSON.stringify(json));
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Information not provided'
    );
  });
});

