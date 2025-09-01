import { sanitizeGeneratedText, relocateProfileLinks, parseLine } from '../server.js';

describe('cover letter link relocation', () => {
  test('moves profile links to final paragraph without parentheses', () => {
    const input = `Hello\nMy projects (https://github.com/user) are public.\nBest regards\nSincerely,\nJane`;
    const sanitized = sanitizeGeneratedText(input, { skipRequiredSections: true, defaultHeading: '' });
    const output = relocateProfileLinks(sanitized);
    const lines = output.split('\n');
    const linkLineIndex = lines.findIndex((l) => l.includes('github.com'));
    const sincereIndex = lines.findIndex((l) => l.startsWith('Sincerely'));
    expect(lines[sincereIndex - 1]).toBe('');
    expect(linkLineIndex).toBe(sincereIndex - 2);
    expect(lines.slice(0, linkLineIndex).join('\n')).not.toMatch(/github.com/);
    const tokens = parseLine(lines[linkLineIndex]);
    const link = tokens.find((t) => t.type === 'link');
    expect(link.href).toBe('https://github.com/user');
    const text = tokens.map((t) => t.text).join('');
    expect(text).not.toContain('(');
    expect(text).not.toContain(')');
  });
});
