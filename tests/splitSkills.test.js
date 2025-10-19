import { splitSkills, parseLine } from '../lib/resume/content.js';

const headings = [
  'Skills',
  'Technical Skills',
  'Technical skills',
  'Skills & Tools',
  'Skills and Tools'
];

describe('splitSkills bullet handling', () => {
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

describe.each(headings)(
  'splitSkills filtering and grouping for heading %s',
  (heading) => {
    test('only job relevant skills are kept', () => {
      const sections = [
        { heading, items: [parseLine('Python, Java, AWS, Oracle')] }
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

    test('trims whitespace when matching job relevant skills', () => {
      const sections = [
        { heading, items: [parseLine('Python, Java, AWS')] }
      ];
      splitSkills(sections, ['  python  ', '\tAWS\n']);
      const texts = sections[0].items.map((tokens) =>
        tokens.filter((t) => t.text).map((t) => t.text).join('')
      );
      expect(texts.join(' ')).toMatch(/Python/);
      expect(texts.join(' ')).toMatch(/AWS/);
      expect(texts.join(' ')).not.toMatch(/Java/);
    });

    test('retains every job-relevant skill bullet', () => {
      const skills =
        'Python, Java, AWS, Docker, Kubernetes, Terraform, React, Node, HTML, CSS';
      const sections = [{ heading, items: [parseLine(skills)] }];
      const jobSkills = skills.split(',').map((s) => s.trim().toLowerCase());
      splitSkills(sections, jobSkills);
      const rendered = sections[0].items.filter((tokens) =>
        Array.isArray(tokens) && tokens.length > 0
      );
      expect(rendered).toHaveLength(jobSkills.length);
      rendered.forEach((tokens) => {
        expect(tokens[0].type).toBe('bullet');
      });
    });

    test('preserves hyperlinks for relevant skills', () => {
      const sections = [
        { heading, items: [parseLine('AWS, [Kubernetes](https://k8s.io)')] }
      ];
      splitSkills(sections, ['aws', 'kubernetes']);
      const [, kubernetesTokens] = sections[0].items;
      const linkToken = kubernetesTokens.find((token) => token.type === 'link');
      expect(linkToken).toMatchObject({
        text: 'Kubernetes',
        href: 'https://k8s.io',
      });
    });

    test('groups database related skills', () => {
      const sections = [{ heading, items: [parseLine('MySQL, Oracle')] }];
      splitSkills(sections, ['mysql', 'oracle']);
      expect(sections[0].items).toHaveLength(1);
      const tokens = sections[0].items[0].filter((t) => t.type !== 'bullet');
      const text = tokens.map((t) => t.text).join('').toLowerCase();
      expect(text).toBe('database, mysql, oracle');
    });
  }
);

