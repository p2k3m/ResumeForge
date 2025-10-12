import { scoreResumeAgainstJob } from '../lib/resume/scoring.js';
import { normalizeSkillListInput } from '../lib/resume/skills.js';

function normalizeJobSkills(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return normalizeSkillListInput(value);
}

export const handler = async (event = {}) => {
  const jobId = typeof event.jobId === 'string' ? event.jobId.trim() : '';
  const resumeText = typeof event.resumeText === 'string' ? event.resumeText : '';
  const jobSkills = normalizeJobSkills(event.jobSkills);
  const jobDescription = typeof event.jobDescription === 'string' ? event.jobDescription : '';

  const outcome = scoreResumeAgainstJob({ jobId, resumeText, jobSkills, jobDescription });
  if (!outcome.ok) {
    const error = new Error(outcome.error?.message || 'Unable to score resume');
    error.code = outcome.error?.code || 'SCORING_FAILED';
    error.details = outcome.error;
    throw error;
  }

  return {
    jobId,
    score: outcome.result.score,
    missingSkills: outcome.result.missingSkills || [],
    alignmentTable: outcome.result.alignmentTable || [],
  };
};

export default handler;
