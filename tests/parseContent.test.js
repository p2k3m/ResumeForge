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

describe('parseContent summary reclassification', () => {
  test('moves job-like lines from Summary to Work Experience', () => {
    const input = [
      'John Doe',
      'Acme Corp | Developer | Jan 2020 - Present',
      'Passionate engineer',
      '# Skills',
      '- JS'
    ].join('\n');
    const data = parseContent(input);
    const summary = data.sections.find((s) => s.heading === 'Summary');
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].map((t) => t.text).join('')).toBe(
      'Passionate engineer'
    );
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe(
      'Acme Corp | Developer | Jan 2020 - Present'
    );
  });
});

describe('parseContent experience fallbacks', () => {
  test('uses resume experience when AI output lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeExperience: ['Did something']
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe('Did something');
  });

  test('uses linkedin experience when resume lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      linkedinExperience: ['LinkedIn item']
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe('LinkedIn item');
  });
});

describe('parseContent education fallbacks', () => {
  test('uses resume education when AI output lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeEducation: ['B.S. in CS - MIT']
    });
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe('B.S. in CS - MIT');
  });

  test('uses linkedin education when resume lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      linkedinEducation: ['Stanford University, BSc']
    });
    const edu = data.sections.find((s) => s.heading === 'Education');
    expect(edu.items).toHaveLength(1);
    expect(edu.items[0].map((t) => t.text).join('')).toBe(
      'Stanford University, BSc'
    );
  });
});

