import { calculateMatchScore, extractResumeSkills } from '../server.js';
import { compareMetrics } from '../services/atsMetrics.js';
import {
  calculateAdditionalMetrics,
  aggregateCardScores,
  computeOverallScore,
  calculateSelectionProbability,
} from '../services/additionalMetrics.js';

describe('chance of selection computation', () => {
  test('averages match and ATS scores', () => {
    const jobSkills = ['javascript', 'aws'];
    const text = 'Worked with JavaScript and AWS on projects.';
    const resumeSkills = extractResumeSkills(text);
    const match = calculateMatchScore(jobSkills, resumeSkills);
    const { improved } = compareMetrics(text, text);
    const atsScore = Math.round(
      Object.values(improved).reduce((sum, v) => sum + v, 0) /
        Object.keys(improved).length
    );
    const extra = calculateAdditionalMetrics(text, {
      jobTitle: 'Engineer',
      jobSkills,
      resumeSkills,
    });
    const cardScores = aggregateCardScores(extra, atsScore);
    const overallScore = computeOverallScore(cardScores);
    const chanceOfSelection = calculateSelectionProbability({
      overallScore,
      atsScore,
      keywordMatch: match.score,
    });
    expect(match.table).toEqual([
      { skill: 'javascript', matched: true },
      { skill: 'aws', matched: true }
    ]);
    expect(match.newSkills).toEqual([]);
    expect(typeof chanceOfSelection).toBe('number');
  });

  test('lists job skills missing from resume', () => {
    const jobSkills = ['javascript', 'aws'];
    const text = 'I know JavaScript.';
    const resumeSkills = extractResumeSkills(text);
    const match = calculateMatchScore(jobSkills, resumeSkills);
    expect(match.newSkills).toEqual(['aws']);
  });
});
