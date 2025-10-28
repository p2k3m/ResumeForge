import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js';
import { runPostDeploymentApiTests } from '../lib/postDeploymentApiTests.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readPublishedMetadata() {
  const filePath = path.resolve(__dirname, '../config/published-cloudfront.json');
  const raw = await fs.readFile(filePath, 'utf8');
  if (!raw.trim()) {
    throw new Error('config/published-cloudfront.json is empty.');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Unable to parse config/published-cloudfront.json: ${err.message}`);
  }
}

async function main() {
  try {
    const argUrl = process.argv[2];
    let targetUrl = typeof argUrl === 'string' ? argUrl.trim() : '';

    if (!targetUrl) {
      const metadata = await readPublishedMetadata();
      targetUrl = resolvePublishedCloudfrontUrl(metadata);
      if (!targetUrl) {
        throw new Error('No CloudFront URL is recorded in config/published-cloudfront.json.');
      }
      console.log(`Loaded CloudFront URL from config: ${targetUrl}`);
    } else {
      console.log(`Verifying provided CloudFront URL: ${targetUrl}`);
    }

    const verificationResult = await runPostDeploymentApiTests({
      baseUrl: targetUrl,
      healthCheckTimeoutMs: 10000,
      retries: 4,
      retryDelayMs: 30000,
      logger: console,
    });
    const { health, healthChecks = [], assetChecks = [] } = verificationResult;

    const reportedHealthChecks =
      Array.isArray(healthChecks) && healthChecks.length > 0
        ? healthChecks
        : health
          ? [
              {
                profile: 'browser',
                label: 'browser',
                result: health,
              },
            ]
          : [];

    for (const entry of reportedHealthChecks) {
      const { result, label } = entry;
      const status = result?.payload?.status ?? 'unknown';
      const urlForLog = result?.url ?? targetUrl;
      console.log(
        `CloudFront distribution responded with status "${status}" at ${urlForLog} via ${
          label || entry.profile || 'unknown'
        } user agent.`
      );
    }

    if (Array.isArray(assetChecks) && assetChecks.length > 0) {
      for (const entry of assetChecks) {
        console.log(
          `Verified client assets (/, /assets/index-*.js) via ${
            entry.label || entry.profile || 'unknown'
          } user agent.`
        );
      }
    } else {
      console.log('Verified client assets are accessible after deployment.');
    }
    process.exit(0);
  } catch (err) {
    console.error('CloudFront verification failed:');
    console.error(err?.message || err);
    console.error('');
    console.error('Next steps:');
    console.error('- Confirm the recorded domain in config/published-cloudfront.json matches the most recent deployment output.');
    console.error('- If the distribution was replaced or removed, redeploy the SAM stack and republish the CloudFront URL:');
    console.error('    sam validate');
    console.error('    sam build --use-container');
    console.error('    sam deploy --guided');
    console.error('    npm run publish:cloudfront-url -- <stack-name>');
    console.error('- See docs/troubleshooting-cloudfront.md for a detailed runbook.');
    process.exit(1);
  }
}

main();
