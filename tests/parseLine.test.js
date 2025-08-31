import { parseLine } from '../server.js';

describe('parseLine emphasis handling', () => {
  test('handles nested emphasis markers', () => {
    const tokens = parseLine('*italic **bold** more*');
    const shapes = tokens.map(({ text, style }) => ({ text, style }));
    expect(shapes).toEqual([
      { text: 'italic ', style: 'italic' },
      { text: 'bold', style: 'bolditalic' },
      { text: ' more', style: 'italic' }
    ]);
  });

  test('handles malformed emphasis markers gracefully', () => {
    const tokens = parseLine('This *text **is not closed');
    expect(tokens.map((t) => t.text).join('')).toBe('This text is not closed');
    tokens.forEach((t) => expect(t.style).toBeUndefined());
  });
});
