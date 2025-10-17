import '../config/environment.js';
import { applyPatch, normaliseFanOutTypes } from '../lib/resume/enhancement.js';
import { withLambdaObservability } from '../lib/observability/lambda.js';

const DEFAULT_ORDER = normaliseFanOutTypes();

function sortResults(results = []) {
  const order = new Map(DEFAULT_ORDER.map((type, index) => [type, index]));
  return [...results].sort((a, b) => {
    const indexA = order.has(a.type) ? order.get(a.type) : DEFAULT_ORDER.length;
    const indexB = order.has(b.type) ? order.get(b.type) : DEFAULT_ORDER.length;
    return indexA - indexB;
  });
}

const baseHandler = async (event = {}) => {
  const resumeText = typeof event.resumeText === 'string' ? event.resumeText : '';
  const sectionResults = Array.isArray(event.sectionResults) ? event.sectionResults : [];
  const sortedResults = sortResults(sectionResults.filter(Boolean));
  let updatedResume = resumeText;
  const changeSummary = [];

  for (const entry of sortedResults) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.patch) {
      updatedResume = applyPatch(updatedResume, entry.patch);
    }
    changeSummary.push({
      type: entry.type,
      title: entry.title,
      explanation: entry.explanation,
      beforeExcerpt: entry.beforeExcerpt,
      afterExcerpt: entry.afterExcerpt,
    });
  }

  return {
    jobId: event.jobId || '',
    updatedResume,
    changeSummary,
  };
};

export const handler = withLambdaObservability(baseHandler, {
  name: 'workflow-combine',
  operationGroup: 'enhancement',
  captureErrorTrace: true,
});

export default handler;
