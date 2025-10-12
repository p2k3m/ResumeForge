import { parseEventBody } from '../../lib/http/parseEventBody.js';
import {
  evaluateJobDescription,
  jobEvaluationHttpResponse,
} from '../../lib/resume/jobEvaluation.js';

export async function handler(event, context) {
  void context;
  const payload = parseEventBody(event);
  const result = evaluateJobDescription(payload);
  return jobEvaluationHttpResponse(result);
}

export default handler;

