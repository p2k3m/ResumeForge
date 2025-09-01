import { splitSkills, parseLine } from '../server.js';

describe('splitSkills bullet handling', () => {
  const headings = ['Skills', 'Technical Skills', 'Skills & Tools'];

  test.each(headings)(
    'adds bullet to comma-separated skills for heading %s',
    (heading) => {
      const sections = [{ heading, items: [parseLine('Python, Java')] }];
      splitSkills(sections);
      expect(sections[0].items).toHaveLength(2);
      sections[0].items.forEach((tokens) => {
        expect(tokens[0].type).toBe('bullet');
      });
    }
  );

  test.each(headings)(
    'adds bullet to newline-separated skills for heading %s',
    (heading) => {
      const sections = [
        { heading, items: [parseLine('Python'), parseLine('Java')] }
      ];
      splitSkills(sections);
      expect(sections[0].items).toHaveLength(2);
      sections[0].items.forEach((tokens) => {
        expect(tokens[0].type).toBe('bullet');
      });
    }
  );
});

describe('splitSkills filtering and grouping', () => {
  test('only job relevant skills are kept', () => {
    const sections = [
      { heading: 'Skills', items: [parseLine('Python, Java, AWS, Oracle')] }
    ];
    splitSkills(sections, ['python', 'aws', 'oracle']);
    const texts = sections[0].items.map((tokens) =>
      tokens.filter((t) => t.text).map((t) => t.text).join('')
    );
    expect(texts.join(' ')).toMatch(/Python/);
    expect(texts.join(' ')).toMatch(/AWS/);
    expect(texts.join(' ')).toMatch(/Oracle/);
    expect(texts.join(' ')).not.toMatch(/Java/);
  });

  test('limits to at most five bullets', () => {
    const skills =
      'Python, Java, AWS, Docker, Kubernetes, Terraform, React, Node, HTML, CSS';
    const sections = [{ heading: 'Skills', items: [parseLine(skills)] }];
    splitSkills(
      sections,
      skills.split(',').map((s) => s.trim().toLowerCase())
    );
    expect(sections[0].items.length).toBeLessThanOrEqual(5);
  });

  test('groups database related skills', () => {
    const sections = [{ heading: 'Skills', items: [parseLine('MySQL, Oracle')] }];
    splitSkills(sections, ['mysql', 'oracle']);
    expect(sections[0].items).toHaveLength(1);
    const text = sections[0].items[0]
      .filter((t) => t.text)
      .map((t) => t.text)
      .join('')
      .toLowerCase();
    expect(text).toBe('database, mysql, oracle');
  });
});
