import { buildSelectionInsights } from '../server.js'

describe('buildSelectionInsights', () => {
  test('identifies gaps and computes probability', () => {
    const insights = buildSelectionInsights({
      jobTitle: 'Senior Software Engineer',
      originalTitle: 'Software Developer',
      modifiedTitle: 'Software Developer',
      jobDescriptionText:
        'We need a Senior Software Engineer with 5+ years experience delivering React and Node.js platforms and AWS expertise.',
      bestMatch: { score: 60 },
      originalMatch: { score: 40 },
      missingSkills: ['GraphQL', 'AWS'],
      addedSkills: ['GraphQL'],
      scoreBreakdown: {
        impact: { score: 52 },
        crispness: { score: 58 },
        otherQuality: { score: 64 },
        atsReadability: { score: 82 },
        layoutSearchability: { score: 76 },
      },
      resumeExperience: [
        { startDate: 'Jan 2018', endDate: 'Dec 2020' },
        { startDate: 'Jan 2021', endDate: 'Present' },
      ],
      linkedinExperience: [],
      knownCertificates: [],
      certificateSuggestions: ['AWS Certified Solutions Architect'],
      manualCertificatesRequired: false,
    })

    expect(insights.probability).toBeGreaterThan(0)
    const skillFlag = insights.flags.find((flag) => flag.key === 'skills')
    expect(skillFlag?.type).toBe('warning')
    const designationFlag = insights.flags.find((flag) => flag.key === 'designation')
    expect(designationFlag?.type).toBe('warning')
    expect(insights.experience.requiredYears).toBe(5)
    expect(insights.experience.candidateYears).toBeGreaterThan(5)
    expect(Array.isArray(insights.jobFitScores)).toBe(true)
    const jobFitDesignation = insights.jobFitScores.find((metric) => metric.key === 'designation')
    expect(jobFitDesignation).toEqual(expect.objectContaining({ score: expect.any(Number) }))
    expect(typeof insights.jobFitAverage).toBe('number')
    expect(insights.before).toEqual(
      expect.objectContaining({
        probability: expect.any(Number),
        message: expect.any(String),
      })
    )
    expect(insights.after).toEqual(
      expect.objectContaining({
        probability: expect.any(Number),
        message: expect.any(String),
      })
    )
  })

  test('rewards aligned designation and strong metrics', () => {
    const insights = buildSelectionInsights({
      jobTitle: 'Product Manager',
      originalTitle: 'Product Manager',
      modifiedTitle: 'Product Manager',
      jobDescriptionText:
        'Minimum 3 years experience leading product strategy and owning agile roadmaps.',
      bestMatch: { score: 88 },
      originalMatch: { score: 70 },
      missingSkills: [],
      addedSkills: ['Roadmapping'],
      scoreBreakdown: {
        impact: { score: 90 },
        crispness: { score: 85 },
        otherQuality: { score: 92 },
        atsReadability: { score: 94 },
        layoutSearchability: { score: 90 },
      },
      resumeExperience: [{ startDate: '2016', endDate: 'Present' }],
      linkedinExperience: [],
      knownCertificates: [{ name: 'CSPO' }],
      certificateSuggestions: [],
      manualCertificatesRequired: false,
    })

    expect(insights.level).toBe('High')
    expect(insights.flags.length).toBeGreaterThan(0)
    expect(insights.flags.every((flag) => flag.type === 'success' || flag.type === 'info')).toBe(true)
    expect(insights.probability).toBeGreaterThanOrEqual(75)
    const jobFitSkills = insights.jobFitScores.find((metric) => metric.key === 'skills')
    expect(jobFitSkills?.score).toBeGreaterThanOrEqual(80)
    expect(insights.before.level).toBeDefined()
    expect(insights.after.level).toBe('High')
  })

  test('averages key alignment metrics to calculate selection probability', () => {
    const insights = buildSelectionInsights({
      jobTitle: 'Data Scientist',
      originalTitle: 'Data Scientist',
      modifiedTitle: 'Data Scientist',
      jobDescriptionText:
        'Seeking a Data Scientist with 4+ years experience in Python, machine learning, and model deployment.',
      bestMatch: { score: 90 },
      originalMatch: { score: 70 },
      missingSkills: [],
      addedSkills: ['Model Deployment'],
      scoreBreakdown: {
        impact: { score: 88 },
        crispness: { score: 86 },
        otherQuality: { score: 90 },
        atsReadability: { score: 90 },
      },
      resumeExperience: [{ startDate: '2018', endDate: 'Present' }],
      linkedinExperience: [],
      knownCertificates: [],
      certificateSuggestions: [],
      manualCertificatesRequired: false,
    })

    const selectionMetrics = ['designation', 'skills', 'experience', 'tasks', 'highlights']
    const expectedAverage = Math.round(
      insights.jobFitScores
        .filter((metric) => selectionMetrics.includes(metric.key))
        .reduce((total, metric) => total + metric.score, 0) / selectionMetrics.length,
    )

    expect(insights.probability).toBe(expectedAverage)
    expect(insights.level).toBe('High')
    expect(insights.before.probability).toBeLessThanOrEqual(insights.probability)
  })
})
