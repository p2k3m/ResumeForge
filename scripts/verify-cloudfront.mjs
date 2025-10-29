import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePublishedCloudfrontUrl } from '../lib/cloudfrontHealthCheck.js';
import { resolveCloudfrontAssetPathPrefixes } from '../lib/cloudfrontAssetPrefixes.js';
import { runPostDeploymentApiTests } from '../lib/postDeploymentApiTests.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseBooleanFlag(value) {
  if (!hasValue(value)) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function parseArguments(argv = []) {
  const result = {
    targetUrl: '',
    allowFailure: false,
  };

  for (const entry of argv) {
    if (!hasValue(entry)) {
      continue;
    }

    if (entry === '--allow-cloudfront-failure' || entry === '--allow-cloudfront-verify-failure') {
      result.allowFailure = true;
      continue;
    }

    if (entry.startsWith('--allow-cloudfront-failure=')) {
      result.allowFailure = parseBooleanFlag(entry.split('=').slice(1).join('='));
      continue;
    }

    if (!entry.startsWith('-') && !result.targetUrl) {
      result.targetUrl = entry;
      continue;
    }
  }

  return result;
}

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
  let allowFailureFlag = false;
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const { targetUrl: cliTargetUrl } = parsed;
    allowFailureFlag = parsed.allowFailure;

    let targetUrl = hasValue(cliTargetUrl) ? cliTargetUrl.trim() : '';

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

    const assetPathPrefixes = resolveCloudfrontAssetPathPrefixes();
    if (assetPathPrefixes.length > 0) {
      const suffix = assetPathPrefixes.length === 1 ? '' : 'es';
      console.log(
        `Using CloudFront asset prefix fallback${suffix}: ${assetPathPrefixes.join(', ')}`,
      );
    }

    const verificationResult = await runPostDeploymentApiTests({
      baseUrl: targetUrl,
      healthCheckTimeoutMs: 10000,
      retries: 4,
      retryDelayMs: 30000,
      logger: console,
      assetPathPrefixes,
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

    if (err?.url) {
      console.error(`Failed URL: ${err.url}`);
    }

    if (typeof err?.status === 'number' && !Number.isNaN(err.status)) {
      console.error(`HTTP status: ${err.status}`);
    }

    if (err?.code) {
      console.error(`Error code: ${err.code}`);
    }

    if (Array.isArray(err?.attemptedAssetPaths) && err.attemptedAssetPaths.length > 0) {
      console.error('Attempted asset paths:');
      for (const assetPath of err.attemptedAssetPaths) {
        console.error(`- ${assetPath}`);
      }
    }

    console.error('');
    console.error('Next steps:');
    console.error('- Confirm the recorded domain in config/published-cloudfront.json matches the most recent deployment output.');
    console.error('- If the distribution was replaced or removed, redeploy the SAM stack and republish the CloudFront URL:');
    console.error('    sam validate');
    console.error('    sam build --use-container');
    console.error('    sam deploy --guided');
    console.error('    npm run publish:cloudfront-url -- <stack-name>');
    console.error('- See docs/troubleshooting-cloudfront.md for a detailed runbook.');

    const allowFailureEnv = parseBooleanFlag(process.env.ALLOW_CLOUDFRONT_VERIFY_FAILURE);
    const allowFailure = allowFailureEnv || allowFailureFlag;

    if (allowFailure) {
      console.error(
        'Continuing because ALLOW_CLOUDFRONT_VERIFY_FAILURE is enabled (or --allow-cloudfront-failure was supplied).',
      );
      console.error(
        'Re-run npm run verify:cloudfront without the override once the distribution is reachable.',
      );
      process.exit(0);
    }

    console.error(
      'Set ALLOW_CLOUDFRONT_VERIFY_FAILURE=true (or pass --allow-cloudfront-failure) to bypass this failure temporarily.',
    );
    process.exit(1);
  }
}

main();
