import { parseEventBody } from '../../lib/http/parseEventBody.js';
import {
  scoreResumeAgainstJob,
  scoreResumeHttpResponse,
} from '../../lib/resume/scoring.js';

export async function handler(event, context) {
  void context;
  const payload = parseEventBody(event);
  const outcome = scoreResumeAgainstJob(payload);
  return scoreResumeHttpResponse(outcome);
}

export default handler;

