const DEFAULT_BINARY_TYPES = [
  'multipart/form-data',
  'application/octet-stream',
  'application/pdf',
];

export const services = {
  resumeUpload: {
    serviceName: 'resume-upload',
    description: 'Accepts resumes and uploads artifacts to S3/DynamoDB.',
    allowedRoutes: [
      { method: 'POST', path: '/api/process-cv' },
    ],
    binaryTypes: DEFAULT_BINARY_TYPES,
  },
  jobEvaluation: {
    serviceName: 'job-evaluation',
    description: 'Evaluates resumes against a supplied job description.',
    allowedRoutes: [
      { method: 'POST', path: '/api/jd/evaluate' },
    ],
  },
  scoring: {
    serviceName: 'scoring',
    description: 'Calculates ATS-style scores and re-scoring operations.',
    allowedRoutes: [
      { method: 'POST', path: '/api/score-match' },
      { method: 'POST', path: '/api/rescore-improvement' },
    ],
  },
  enhancement: {
    serviceName: 'enhancement',
    description: 'Handles AI-driven resume enhancement flows.',
    allowedRoutes: [
      { method: 'POST', path: '/api/improve-summary' },
      { method: 'POST', path: '/api/add-missing-skills' },
      { method: 'POST', path: '/api/change-designation' },
      { method: 'POST', path: '/api/align-experience' },
      { method: 'POST', path: '/api/improve-certifications' },
      { method: 'POST', path: '/api/improve-projects' },
      { method: 'POST', path: '/api/improve-highlights' },
      { method: 'POST', path: '/api/enhance-all' },
    ],
  },
  documentGeneration: {
    serviceName: 'document-generation',
    description: 'Generates CVs and cover letters for download.',
    allowedRoutes: [
      { method: 'POST', path: '/api/generate-enhanced-docs' },
      { method: 'POST', path: '/api/render-cover-letter' },
    ],
  },
  auditing: {
    serviceName: 'auditing',
    description: 'Exposes audit logs, download refreshes and metrics.',
    allowedRoutes: [
      { method: 'POST', path: '/api/change-log' },
      { method: 'POST', path: '/api/refresh-download-link' },
      { method: 'GET', path: '/api/published-cloudfront' },
      { method: 'GET', path: '/healthz' },
    ],
  },
};

export function getServiceConfig(key) {
  if (!key) {
    throw new Error('Service key is required.');
  }
  const config = services[key];
  if (!config) {
    throw new Error(`Unknown microservice "${key}".`);
  }
  return config;
}

export default services;
