import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkCloudfrontHealth, resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js';

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
    process.exit(0);
  } catch (err) {
    console.error('CloudFront verification failed:');
    console.error(err?.message || err);
    process.exit(1);
  }
}

main();
