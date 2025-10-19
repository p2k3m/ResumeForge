import { scoreResumeAgainstJob } from '../lib/resume/scoring.js';

describe('scoreResumeAgainstJob', () => {
  const jobDescription = [
    'We are hiring a Senior Software Engineer to lead Node.js and cloud initiatives.',
    'The role requires 5+ years of experience, GraphQL, AWS, and leadership across agile teams.',
    'Certifications such as AWS Certified Solutions Architect are preferred.',
  ].join(' ');

  const resumeBefore = [
    'Alex Candidate',
    'Software Engineer',
    '# Summary',
    'Engineer shipping backend services with Node.js and React.',
    '# Skills',
    '- JavaScript',
    '- Node.js',
    '- React',
    '# Certifications',
    '- AWS Certified Solutions Architect',
    '# Experience',
    'Senior Software Engineer – Tech Corp (2018 - 2022)',
    '- Built analytics dashboards.',
  ].join('\n');

  const resumeAfter = [
    resumeBefore,
    '# Highlights',
    '- Spearheaded GraphQL adoption improving API throughput by 30%.',
    '- Mentored a team of 6 engineers through agile delivery.',
  ].join('\n');

  it('computes ATS and selection metrics with before/after comparisons', () => {
    const outcome = scoreResumeAgainstJob({
      jobId: 'job-123',
      sessionId: 'Session-ABC',
      jobTitle: 'Senior Software Engineer',
      resumeText: resumeBefore,
      enhancedResumeText: resumeAfter,
      jobDescription,
      jobSkills: ['JavaScript', 'Node.js', 'GraphQL', 'AWS'],
    });

    expect(outcome.ok).toBe(true);
    const result = outcome.result;

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        jobId: 'job-123',
        score: expect.any(Number),
        missingSkills: expect.any(Array),
        alignmentTable: expect.any(Array),
        sessionId: expect.any(String),
      })
    );

    expect(result.match).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          score: expect.any(Number),
          missingSkills: expect.any(Array),
          table: expect.any(Array),
        }),
        after: expect.objectContaining({
          score: expect.any(Number),
          missingSkills: expect.any(Array),
          table: expect.any(Array),
        }),
        delta: expect.objectContaining({
          score: expect.any(Number),
          coveredSkills: expect.any(Array),
        }),
      })
    );

    expect(result.ats).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          score: expect.any(Number),
          breakdown: expect.objectContaining({ layoutSearchability: expect.any(Object) }),
        }),
        after: expect.objectContaining({
          score: expect.any(Number),
          breakdown: expect.objectContaining({ layoutSearchability: expect.any(Object) }),
        }),
        delta: expect.objectContaining({
          score: expect.any(Number),
          breakdown: expect.objectContaining({ impact: expect.any(Object) }),
        }),
      })
    );

    expect(result.selection).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          probability: expect.any(Number),
          level: expect.any(String),
          metrics: expect.objectContaining({ designation: expect.any(Object) }),
        }),
        after: expect.objectContaining({
          probability: expect.any(Number),
          level: expect.any(String),
          metrics: expect.objectContaining({ skills: expect.any(Object) }),
        }),
        delta: expect.objectContaining({
          probability: expect.any(Number),
          metrics: expect.objectContaining({ skills: expect.any(Object) }),
        }),
      })
    );

    const skillsBefore = result.selection.before.metrics.skills.score;
    const skillsAfter = result.selection.after.metrics.skills.score;
    expect(skillsAfter).toBeGreaterThanOrEqual(skillsBefore);

    expect(result.selectionProbabilityBefore).toBe(result.selection.before.probability);
    expect(result.selectionProbabilityAfter).toBe(result.selection.after.probability);
    expect(result.selectionProbabilityDelta).toBe(
      result.selection.after.probability - result.selection.before.probability
    );
    expect(result.selectionProbabilityFactors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'designation', label: 'Designation match' }),
        expect.objectContaining({ key: 'experience', label: 'Years / experience' }),
        expect.objectContaining({ key: 'skills', label: 'Skill match' }),
        expect.objectContaining({ key: 'tasks', label: 'Task overlap' }),
        expect.objectContaining({ key: 'highlights', label: 'Highlights' }),
        expect.objectContaining({ key: 'certifications', label: 'Certifications' }),
      ])
    );
    expect(Array.isArray(result.selection.factors)).toBe(true);
    expect(result.selection.factors).toBe(result.selectionProbabilityFactors);
  });

  it('validates required fields and returns descriptive errors', () => {
    const missingJobId = scoreResumeAgainstJob({ resumeText: resumeBefore, jobSkills: ['JavaScript'] });
    expect(missingJobId.ok).toBe(false);
    expect(missingJobId.error).toEqual(
      expect.objectContaining({ code: 'JOB_ID_REQUIRED', statusCode: 400 })
    );

    const missingResume = scoreResumeAgainstJob({ jobId: 'job-456', jobSkills: ['JavaScript'] });
    expect(missingResume.ok).toBe(false);
    expect(missingResume.error).toEqual(
      expect.objectContaining({ code: 'RESUME_TEXT_REQUIRED', statusCode: 400 })
    );

    const missingSkills = scoreResumeAgainstJob({ jobId: 'job-789', resumeText: resumeBefore });
    expect(missingSkills.ok).toBe(false);
    expect(missingSkills.error).toEqual(
      expect.objectContaining({ code: 'JOB_SKILLS_REQUIRED', statusCode: 400 })
    );
  });

  it('treats enhanced resume as baseline when no improvements are supplied', () => {
    const outcome = scoreResumeAgainstJob({
      jobId: 'job-xyz',
      resumeText: resumeBefore,
      jobSkills: ['JavaScript', 'Node.js'],
    });

    expect(outcome.ok).toBe(true);
    const { selection, ats, match } = outcome.result;
    expect(selection.delta.probability).toBe(0);
    expect(ats.delta.score).toBe(0);
    expect(match.delta.score).toBe(0);
    expect(match.before.score).toBe(match.after.score);
  });
});
