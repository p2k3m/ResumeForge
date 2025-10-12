import { buildScoreBreakdown, scoreBreakdownToArray } from '../scoring/atsMetrics.js';
import {
  calculateMatchScore,
  extractResumeSkills,
  normalizeSkillListInput,
} from './skills.js';

function pickJobSkills(payload = {}) {
  const candidates = [
    payload.jobSkills,
    payload.prioritySkills,
    payload.requiredSkills,
    payload.jobKeywords,
  ];

  for (const candidate of candidates) {
    const skills = normalizeSkillListInput(candidate);
    if (skills.length) {
      return skills;
    }
  }
  return [];
}

/**
 * Evaluate how well a resume aligns with a job description and compute ATS
 * metrics describing the overlap.
 */
export function evaluateJobDescription(payload = {}) {
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_ID_REQUIRED',
        message: 'jobId is required to evaluate the job description fit.',
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
        message: 'resumeText is required to evaluate the job description fit.',
      },
    };
  }

  const jobSkills = pickJobSkills(payload);
  if (!jobSkills.length) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        code: 'JOB_SKILLS_REQUIRED',
        message: 'Provide jobSkills with at least one keyword to evaluate the fit.',
      },
    };
  }

  const jobDescriptionText =
    typeof payload.jobDescriptionText === 'string' ? payload.jobDescriptionText : '';

  const resumeSkills = extractResumeSkills(resumeText);
  const match = calculateMatchScore(jobSkills, resumeSkills);
  const breakdown = buildScoreBreakdown(resumeText, {
    jobText: jobDescriptionText,
    jobSkills,
    resumeSkills,
  });
  const atsMetrics = scoreBreakdownToArray(breakdown);

  return {
    ok: true,
    result: {
      success: true,
      jobId,
      score: match.score,
      missingSkills: match.newSkills,
      matchedSkills: match.table
        .filter((entry) => entry.matched)
        .map((entry) => entry.skill),
      breakdown: atsMetrics,
    },
  };
}

export function jobEvaluationHttpResponse(outcome) {
  if (!outcome || typeof outcome !== 'object') {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Unable to evaluate job description.',
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
        message: message || 'Unable to evaluate the job description fit.',
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

export default evaluateJobDescription;
