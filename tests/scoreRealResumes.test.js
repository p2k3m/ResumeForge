import { buildScoreBreakdown } from '../server.js';
import { resumeSamples } from './utils/resumeSamples.js';

const METRIC_KEYS = [
  'layoutSearchability',
  'atsReadability',
  'impact',
  'crispness',
  'otherQuality',
];

const expectedCategories = {
  layoutSearchability: 'Layout & Searchability',
  atsReadability: 'ATS Readability',
  impact: 'Impact',
  crispness: 'Crispness',
  otherQuality: 'Other Quality Metrics',
};

describe('buildScoreBreakdown with real-world resume samples', () => {
  it.each(Object.entries(resumeSamples))(
    'returns complete, stable metrics for %s resumes',
    (_name, sample) => {
      const resumeTextBefore = sample.resumeText.slice();
      const resumeSkillsBefore = [...(sample.resumeSkills || [])];

      const breakdown = buildScoreBreakdown(sample.resumeText, {
        jobText: sample.description,
        jobSkills: sample.jobSkills,
        resumeSkills: sample.resumeSkills,
      });

      expect(sample.resumeText).toBe(resumeTextBefore);
      expect(sample.resumeSkills).toEqual(resumeSkillsBefore);

      expect(Object.keys(breakdown)).toEqual(METRIC_KEYS);

      METRIC_KEYS.forEach((key) => {
        const metric = breakdown[key];
        expect(metric.category).toBe(expectedCategories[key]);
        expect(metric.score).toBeGreaterThanOrEqual(0);
        expect(metric.score).toBeLessThanOrEqual(100);
        expect(metric.ratingLabel).toBe(metric.rating);
        expect(metric.tips.length).toBeGreaterThan(0);
        metric.tips.forEach((tip) => {
          expect(typeof tip).toBe('string');
          expect(tip.trim().length).toBeGreaterThan(0);
        });
      });
    }
  );

  it('recognizes strong engineering resumes across all metrics', () => {
    const sample = resumeSamples.productEngineer;
    const breakdown = buildScoreBreakdown(sample.resumeText, {
      jobText: sample.description,
      jobSkills: sample.jobSkills,
      resumeSkills: sample.resumeSkills,
    });

    expect(breakdown.layoutSearchability.score).toBeGreaterThanOrEqual(80);
    expect(breakdown.impact.score).toBeGreaterThanOrEqual(75);
    expect(breakdown.otherQuality.score).toBeGreaterThanOrEqual(70);
    expect(breakdown.crispness.score).toBeGreaterThanOrEqual(70);
    expect(breakdown.atsReadability.score).toBeGreaterThanOrEqual(65);
  });

  it('flags ATS-heavy formatting penalties without losing other sections', () => {
    const sample = resumeSamples.operationsManager;
    const breakdown = buildScoreBreakdown(sample.resumeText, {
      jobText: sample.description,
      jobSkills: sample.jobSkills,
      resumeSkills: sample.resumeSkills,
    });

    expect(breakdown.atsReadability.score).toBeLessThan(60);
    expect(breakdown.layoutSearchability.score).toBeGreaterThanOrEqual(45);
    METRIC_KEYS.forEach((key) => {
      expect(breakdown[key].category).toBe(expectedCategories[key]);
    });
  });

  it('rewards academic resumes for impact while keeping layout intact', () => {
    const sample = resumeSamples.academicResearcher;
    const breakdown = buildScoreBreakdown(sample.resumeText, {
      jobText: sample.description,
      jobSkills: sample.jobSkills,
      resumeSkills: sample.resumeSkills,
    });

    expect(breakdown.impact.score).toBeGreaterThanOrEqual(70);
    expect(breakdown.otherQuality.score).toBeGreaterThanOrEqual(60);
    expect(breakdown.layoutSearchability.score).toBeGreaterThanOrEqual(60);
    expect(breakdown.atsReadability.score).toBeGreaterThanOrEqual(60);
  });

  it('identifies minimalist resumes that need structure without wiping metrics', () => {
    const sample = resumeSamples.minimalistDesigner;
    const breakdown = buildScoreBreakdown(sample.resumeText, {
      jobText: sample.description,
      jobSkills: sample.jobSkills,
      resumeSkills: sample.resumeSkills,
    });

    expect(breakdown.layoutSearchability.score).toBeLessThan(40);
    expect(breakdown.impact.score).toBeLessThan(50);
    expect(breakdown.otherQuality.score).toBeLessThan(60);
    METRIC_KEYS.forEach((key) => {
      expect(Array.isArray(breakdown[key].tips)).toBe(true);
      expect(breakdown[key].tips.length).toBeGreaterThan(0);
    });
  });
});
