import { calculateMatchScore } from '../server.js';
import { formatMatchMessage } from '../client/src/formatMatchMessage.js';

describe('match messaging and skills', () => {
  test('improved score reports added skills', () => {
    const jobSkills = ['a', 'b'];
    const original = calculateMatchScore(jobSkills, ['b']);
    const best = calculateMatchScore(jobSkills, ['a', 'b']);
    const addedSkills = best.table
      .filter((r) =>
        r.matched && original.table.some((o) => o.skill === r.skill && !o.matched)
      )
      .map((r) => r.skill);
    expect(addedSkills).toEqual(['a']);
    expect(best.newSkills).toEqual([]);
    expect(formatMatchMessage(original.score, best.score)).toBe(
      'Your score improved from 50% to 100%, indicating a High selection likelihood.'
    );
  });

  test('unchanged score lists missing skills', () => {
    const jobSkills = ['a', 'b'];
    const original = calculateMatchScore(jobSkills, ['b']);
    const best = calculateMatchScore(jobSkills, ['b']);
    const addedSkills = best.table
      .filter((r) =>
        r.matched && original.table.some((o) => o.skill === r.skill && !o.matched)
      )
      .map((r) => r.skill);
    expect(addedSkills).toEqual([]);
    expect(best.newSkills).toEqual(['a']);
    expect(formatMatchMessage(original.score, best.score)).toBe(
      'Unable to improve score'
    );
  });
});
