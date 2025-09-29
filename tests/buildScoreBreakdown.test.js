import { buildScoreBreakdown } from '../server.js';

const jobDescription = `We are hiring a senior software engineer to lead React and Node.js initiatives.
You will optimize performance, mentor teammates, and deliver measurable outcomes.
Key requirements: React, Node.js, TypeScript, leadership, optimization, cloud platforms.`;

const jobSkills = ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'Cloud'];

const strongResume = `JANE DOE\n\nSUMMARY\nFull-stack engineer delivering measurable outcomes for SaaS platforms.\n\nEXPERIENCE\nSenior Software Engineer at Growth Labs (2019 - Present)\n- Led a React redesign that increased activation rates by 22% while reducing load time 35%.\n- Built Node.js and TypeScript services to optimize deployment pipelines and cut incidents 40%.\n- Mentored 4 engineers and partnered with product to launch cloud cost dashboards.\n\nEDUCATION\nB.S. Computer Science, University of Example\n\nSKILLS\nReact, Node.js, TypeScript, Leadership, Optimization, AWS`;

const weakResume = `John Smith\n\nExperience\nWorked on software stuff\nResponsible for various duties\n\nEducation\nCollege\n\nSkills\nMicrosoft Office, Communication`;

const wordyResume = `John Smith\n\nSUMMARY\nExperienced engineer.\n\nEXPERIENCE\nSoftware Engineer at Generic Corp (2020 - Present)\n- Collaborated with a wide array of global stakeholders across multiple divisions and departments to design, negotiate, document, and finally implement numerous overlapping initiatives that attempted to improve the customer support platform and therefore add value.\n- Responsible for working on tasks.\n\nEDUCATION\nState University\n\nSKILLS\nReact, Node.js`;

const denseParagraphResume = `JANE DOE\n\nSUMMARY\n${'Built scalable systems and collaborated with partners. '.repeat(20)}\n\nEXPERIENCE\nSenior Software Engineer at Growth Labs (2019 - Present)\n${'Led initiatives across cross-functional squads to optimize deployment and coaching processes while partnering with stakeholders to deliver measurable results. '.repeat(12)}\n\nEDUCATION\nB.S. Computer Science, University of Example\n\nSKILLS\nReact, Node.js, TypeScript, Leadership, Optimization, AWS`;

const multiPageResume =
  'JANE DOE\n\nSUMMARY\nSeasoned leader.\n\nEXPERIENCE\n' +
  Array.from({ length: 180 })
    .map((_, idx) => `- Delivered initiative ${idx + 1} with cross-functional partners across regions.`)
    .join('\n') +
  '\n\nEDUCATION\nState University\n\nSKILLS\nReact, Node.js, TypeScript';

const summaryNoKeywordsResume = `John Smith\n\nSUMMARY\nExperienced engineer delivering results for stakeholders.\n\nEXPERIENCE\nWorked on software stuff\nResponsible for various duties\n\nEDUCATION\nCollege\n\nSKILLS\nMicrosoft Office, Communication`;

const summaryKeywordResume = `John Smith\n\nSUMMARY\nExperienced engineer leading React and Node.js optimization initiatives in the cloud.\n\nEXPERIENCE\nWorked on software stuff\nResponsible for various duties\n\nEDUCATION\nCollege\n\nSKILLS\nReact, Node.js, Communication`;

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
          rating: expect.any(String),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        atsReadability: expect.objectContaining({
          category: 'ATS Readability',
          score: expect.any(Number),
          rating: expect.any(String),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        impact: expect.objectContaining({
          category: 'Impact',
          score: expect.any(Number),
          rating: expect.any(String),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        crispness: expect.objectContaining({
          category: 'Crispness',
          score: expect.any(Number),
          rating: expect.any(String),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
        otherQuality: expect.objectContaining({
          category: 'Other Quality Metrics',
          score: expect.any(Number),
          rating: expect.any(String),
          ratingLabel: expect.any(String),
          tips: expect.arrayContaining([expect.any(String)]),
        }),
      })
    );

    Object.values(breakdown).forEach(({ tips }) => {
      expect(tips.length).toBeGreaterThan(0);
      tips.forEach((tip) => expect(typeof tip).toBe('string'));
    });

    Object.values(breakdown).forEach(({ score }) => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
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
    Object.values(good).forEach((metric) => {
      expect(metric.ratingLabel).toBe(metric.rating);
    });
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
      rambling.crispness.tips.some((tip) =>
        tip.toLowerCase().includes('tighten') || tip.toLowerCase().includes('responsible')
      )
    ).toBe(true);
  });

  test('ratings surface needs improvement on weak resumes', () => {
    const breakdown = buildScoreBreakdown(weakResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['Microsoft Office', 'Communication'],
    });

    const allowedRatings = ['EXCELLENT', 'GOOD', 'NEEDS_IMPROVEMENT'];
    Object.values(breakdown).forEach((metric) => {
      expect(allowedRatings).toContain(metric.rating);
      expect(metric.ratingLabel).toBe(metric.rating);
      expect(metric.tips.length).toBeGreaterThan(0);
    });

    expect(
      Object.values(breakdown).some((metric) => metric.rating === 'NEEDS_IMPROVEMENT')
    ).toBe(true);
  });

  test('other quality metric reacts to missing and added keywords', () => {
    const bare = buildScoreBreakdown(weakResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['Microsoft Office'],
    });

    const improvedResume = `${weakResume}\n\nSUMMARY\nSeasoned engineer building measurable outcomes.\nSKILLS\nReact, Node.js, TypeScript, Leadership, Optimization, Cloud`;
    const improved = buildScoreBreakdown(improvedResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'Cloud'],
    });

    expect(improved.otherQuality.score).toBeGreaterThan(bare.otherQuality.score);
    expect(
      bare.otherQuality.tips.some((tip) =>
        tip.toLowerCase().includes('keyword') || tip.toLowerCase().includes('summary')
      )
    ).toBe(true);
    expect(improved.otherQuality.tips.length).toBeGreaterThan(0);
  });

  test('ats readability penalizes tables and images', () => {
    const problematicResume = `${strongResume}\n\nTABLE OF CONTENTS\n| Skill | Years |\nPage 1 of 1\n![graph](http://example.com/chart.png)`;
    const clean = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    const messy = buildScoreBreakdown(problematicResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    expect(messy.atsReadability.score).toBeLessThan(clean.atsReadability.score);
    expect(messy.atsReadability.tips[0].toLowerCase()).toContain('remove');
  });

  test('layout metric rewards adding bullet structure', () => {
    const minimal = buildScoreBreakdown('Name\nExperience\nWorked on stuff', {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['Communication'],
    });

    const structured = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    expect(structured.layoutSearchability.score).toBeGreaterThan(minimal.layoutSearchability.score);
    expect(minimal.layoutSearchability.tips.some((tip) => tip.toLowerCase().includes('section'))).toBe(true);
  });

  test('layout penalizes dense paragraphs that reduce scanability', () => {
    const structured = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    const dense = buildScoreBreakdown(denseParagraphResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    expect(dense.layoutSearchability.score).toBeLessThan(structured.layoutSearchability.score);
    expect(dense.layoutSearchability.tips.some((tip) => tip.toLowerCase().includes('paragraph'))).toBe(true);
  });

  test('layout flags overly long resumes and suggests trimming pages', () => {
    const shortForm = buildScoreBreakdown(strongResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript', 'Leadership', 'Optimization', 'AWS'],
    });

    const longForm = buildScoreBreakdown(multiPageResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'TypeScript'],
    });

    expect(longForm.layoutSearchability.score).toBeLessThan(shortForm.layoutSearchability.score);
    expect(longForm.layoutSearchability.tips.some((tip) => tip.toLowerCase().includes('page'))).toBe(true);
  });

  test('summary alignment with job keywords improves impact and other metrics', () => {
    const genericSummary = buildScoreBreakdown(summaryNoKeywordsResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['Microsoft Office', 'Communication'],
    });

    const keywordSummary = buildScoreBreakdown(summaryKeywordResume, {
      jobText: jobDescription,
      jobSkills,
      resumeSkills: ['React', 'Node.js', 'Communication'],
    });

    expect(keywordSummary.impact.score).toBeGreaterThanOrEqual(genericSummary.impact.score);
    expect(keywordSummary.otherQuality.score).toBeGreaterThan(genericSummary.otherQuality.score);
    expect(
      genericSummary.otherQuality.tips.some((tip) =>
        tip.toLowerCase().includes('summary') || tip.toLowerCase().includes('headline')
      )
    ).toBe(true);
  });
});
