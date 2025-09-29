import { buildScoreBreakdown } from '../server.js';

const jobDescription = `We are hiring a senior software engineer to lead React and Node.js initiatives.
You will optimize performance, mentor teammates, and deliver measurable outcomes.
Key requirements: React, Node.js, TypeScript, leadership, optimization, cloud platforms.`;

const jobSkills = ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'Cloud'];

const strongResume = `JANE DOE\n\nSUMMARY\nFull-stack engineer delivering measurable outcomes for SaaS platforms.\n\nEXPERIENCE\nSenior Software Engineer at Growth Labs (2019 - Present)\n- Led a React redesign that increased activation rates by 22% while reducing load time 35%.\n- Built Node.js and TypeScript services to optimize deployment pipelines and cut incidents 40%.\n- Mentored 4 engineers and partnered with product to launch cloud cost dashboards.\n\nEDUCATION\nB.S. Computer Science, University of Example\n\nSKILLS\nReact, Node.js, TypeScript, Leadership, Optimization, AWS`;

const weakResume = `John Smith\n\nExperience\nWorked on software stuff\nResponsible for various duties\n\nEducation\nCollege\n\nSkills\nMicrosoft Office, Communication`;

const wordyResume = `John Smith\n\nSUMMARY\nExperienced engineer.\n\nEXPERIENCE\nSoftware Engineer at Generic Corp (2020 - Present)\n- Collaborated with a wide array of global stakeholders across multiple divisions and departments to design, negotiate, document, and finally implement numerous overlapping initiatives that attempted to improve the customer support platform and therefore add value.\n- Responsible for working on tasks.\n\nEDUCATION\nState University\n\nSKILLS\nReact, Node.js`;

describe('buildScoreBreakdown', () => {
  test('returns structured metrics with actionable tips', () => {
    const breakdown = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    expect(breakdown).toEqual(
      expect.objectContaining({
        layoutSearchability: expect.objectContaining({
          category: 'Layout & Searchability',
          score: expect.any(Number),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        atsReadability: expect.objectContaining({
          category: 'ATS Readability',
          score: expect.any(Number),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        impact: expect.objectContaining({
          category: 'Impact',
          score: expect.any(Number),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        crispness: expect.objectContaining({
          category: 'Crispness',
          score: expect.any(Number),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        otherQuality: expect.objectContaining({
          category: 'Other Quality Metrics',
          score: expect.any(Number),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
      })
    );

    Object.values(breakdown).forEach(({ tips }) => {
      expect(tips.length).toBeGreaterThan(0);
      tips.forEach((tip) => expect(typeof tip).toBe('string'));
    });
  });

  test('scores improve when resume addresses layout, impact, and keywords', () => {
    const good = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    const bad = buildScoreBreakdown(weakResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['Microsoft Office', 'Communication'],
    });

    expect(good.layoutSearchability.score).toBeGreaterThan(bad.layoutSearchability.score);
    expect(good.impact.score).toBeGreaterThan(bad.impact.score);
    expect(good.otherQuality.score).toBeGreaterThan(bad.otherQuality.score);
    expect(good.atsReadability.score).toBeGreaterThanOrEqual(bad.atsReadability.score);
  });

  test('crispness penalizes rambling bullets and filler language', () => {
    const strong = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    const rambling = buildScoreBreakdown(wordyResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js'],
    });

    expect(strong.crispness.score).toBeGreaterThan(rambling.crispness.score);
    expect(
      rambling.crispness.tips.some((tip) => tip.toLowerCase().includes('tighten') || tip.toLowerCase().includes('responsible'))
    ).toBe(true);
  });
});
