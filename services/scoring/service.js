import {
  calculateMatchScore,
  extractResumeSkills,
  normalizeSkillListInput,
} from '../common/skills.js';

export function scoreResumeAgainstJob(payload = {}) {
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_ID_REQUIRED',
        message: 'jobId is required to score the resume against the job description.',
      },
    };
  }

  const resumeText = typeof payload.resumeText === 'string' ? payload.resumeText : '';
  if (!resumeText.trim()) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'RESUME_TEXT_REQUIRED',
        message: 'resumeText is required to score the resume against the job description.',
      },
    };
  }

  const jobSkills = normalizeSkillListInput(payload.jobSkills);
  if (!jobSkills.length) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_SKILLS_REQUIRED',
        message: 'Provide jobSkills with at least one keyword to calculate a score.',
      },
    };
  }

  const resumeSkills = extractResumeSkills(resumeText);
  const match = calculateMatchScore(jobSkills, resumeSkills);

  return {
    ok: true,
    result: {
      success: true,
      jobId,
      score: match.score,
      missingSkills: match.newSkills,
      alignmentTable: match.table,
    },
  };
}

export function toHttpResponse(outcome) {
  if (!outcome || typeof outcome !== 'object') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Unable to score the resume.',
      }),
    };
  }

  if (!outcome.ok) {
    const { statusCode, code, message, details } = outcome.error || {};
    return {
      statusCode: statusCode || 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: code || 'VALIDATION_ERROR',
        message: message || 'Unable to score the resume against the job description.',
        ...(details !== undefined ? { details } : {}),
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome.result),
  };
}

export default scoreResumeAgainstJob;

