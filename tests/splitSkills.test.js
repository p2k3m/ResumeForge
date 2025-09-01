import { splitSkills, parseLine } from '../server.js';

describe('splitSkills bullet handling', () => {
  test('adds bullet to comma-separated skills', () => {
    const sections = [{ heading: 'Skills', items: [parseLine('Python, Java')] }];
    splitSkills(sections);
    expect(sections[0].items).toHaveLength(2);
    sections[0].items.forEach((tokens) => {
      expect(tokens[0].type).toBe('bullet');
    });
  });

  test('adds bullet to newline-separated skills', () => {
    const sections = [
      { heading: 'Skills', items: [parseLine('Python'), parseLine('Java')] }
    ];
    splitSkills(sections);
    expect(sections[0].items).toHaveLength(2);
    sections[0].items.forEach((tokens) => {
      expect(tokens[0].type).toBe('bullet');
    });
  });
});
