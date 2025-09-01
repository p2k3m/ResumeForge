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
