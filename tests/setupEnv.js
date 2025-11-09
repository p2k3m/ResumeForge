// Ensure all tests run under an isolated "test" stage so environment-aware
// tagging, bucket resolution, and manifest fallbacks behave deterministically.
// Some tests also mutate NODE_ENV temporarily; setting a default here prevents
// accidental fallback to development/production in CI.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DEPLOYMENT_ENVIRONMENT = process.env.DEPLOYMENT_ENVIRONMENT || 'test';
process.env.STAGE_NAME = process.env.STAGE_NAME || 'test';

process.env.S3_BUCKET = process.env.S3_BUCKET || 'test-bucket';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.CLOUDFRONT_ORIGINS =
  process.env.CLOUDFRONT_ORIGINS || 'https://test.cloudfront.net';
