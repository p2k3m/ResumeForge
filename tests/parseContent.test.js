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

  test('omits required sections when skipRequiredSections is true', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JavaScript', {
      skipRequiredSections: true
    });
    const headings = data.sections.map((s) => s.heading);
    expect(headings).not.toContain('Work Experience');
    expect(headings).not.toContain('Education');
    data.sections.forEach((s) =>
      s.items.forEach((tokens) => {
        expect(tokens.map((t) => t.text).join('')).not.toBe(
          'Information not provided'
        );
      })
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
      'Acme Corp Developer Jan 2020 - Present'
    );
  });
});

describe('parseContent skills list handling', () => {
  test('splits comma or semicolon separated skills into bullets', () => {
    const input = 'Jane Doe\n# Skills\nJavaScript, Python; Go';
    const data = parseContent(input);
    const skills = data.sections.find((s) => s.heading === 'Skills');
    const items = skills.items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(items).toEqual(['JavaScript', 'Python', 'Go']);
  });
});

describe('parseContent experience fallbacks', () => {
  test('uses resume experience when AI output lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      resumeExperience: [
        { title: 'Did something', company: '', startDate: '', endDate: '' }
      ]
    });
    const work = data.sections.find((s) => s.heading === 'Work Experience');
    expect(work.items).toHaveLength(1);
    expect(work.items[0].map((t) => t.text).join('')).toBe('Did something');
  });

  test('uses linkedin experience when resume lacks it', () => {
    const data = parseContent('Jane Doe\n# Skills\n- JS', {
      linkedinExperience: [
        { title: 'LinkedIn item', company: '', startDate: '', endDate: '' }
      ]
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

