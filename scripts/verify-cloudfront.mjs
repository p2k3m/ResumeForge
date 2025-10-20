import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkCloudfrontHealth, resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js';
import { verifyClientAssets } from '../lib/cloudfrontAssetCheck.js';

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

    const result = await checkCloudfrontHealth({ url: targetUrl });
    console.log(
      `CloudFront distribution responded with status "${result.payload.status}" at ${result.url}.`
    );

    await verifyClientAssets({
      baseUrl: targetUrl,
      retries: 1,
      retryDelayMs: 15000,
      logger: console,
    });
    console.log('Verified client assets are accessible after deployment.');
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
