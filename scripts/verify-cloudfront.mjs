import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CloudFrontClient, GetDistributionCommand } from '@aws-sdk/client-cloudfront';
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

function normalizeOriginPath(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, '').replace(/\/+/gu, '/');
}

function domainMatchesBucket(domainName, bucket) {
  if (!domainName || !bucket) {
    return false;
  }

  const normalizedDomain = domainName.trim().toLowerCase();
  const normalizedBucket = bucket.trim().toLowerCase();
  if (!normalizedDomain.includes('amazonaws.com')) {
    return false;
  }

  return normalizedDomain.startsWith(`${normalizedBucket}.`);
}

function domainMatchesRegion(domainName, region) {
  if (!region) {
    return true;
  }

  const normalizedDomain = domainName.trim().toLowerCase();
  const normalizedRegion = region.trim().toLowerCase();
  return (
    normalizedDomain.includes(`.${normalizedRegion}.amazonaws.com`) ||
    normalizedDomain.includes(`-${normalizedRegion}.amazonaws.com`)
  );
}

async function verifyDistributionOrigin(metadata) {
  const distributionId =
    typeof metadata?.distributionId === 'string' ? metadata.distributionId.trim() : '';
  if (!distributionId) {
    console.warn(
      'Skipping CloudFront origin verification because no distributionId is recorded in config/published-cloudfront.json.',
    );
    return;
  }

  const expectedBucket =
    typeof metadata?.originBucket === 'string' ? metadata.originBucket.trim() : '';
  if (!expectedBucket) {
    console.warn(
      `Skipping CloudFront origin verification for distribution ${distributionId} because originBucket is not recorded.`,
    );
    return;
  }

  const expectedRegion =
    typeof metadata?.originRegion === 'string' ? metadata.originRegion.trim() : '';
  const expectedOriginPath = normalizeOriginPath(metadata?.originPath || '');

  const client = new CloudFrontClient({});

  let response;
  try {
    response = await client.send(new GetDistributionCommand({ Id: distributionId }));
  } catch (error) {
    throw new Error(
      `Failed to load CloudFront distribution ${distributionId}: ${error?.message || error}`,
    );
  }

  const origins = response?.Distribution?.DistributionConfig?.Origins?.Items || [];
  if (origins.length === 0) {
    throw new Error(
      `[verify-cloudfront] Distribution ${distributionId} does not define any origins.`,
    );
  }

  const matchingOrigin = origins.find((origin) => {
    const domainName = origin?.DomainName;
    if (!domainName || !domainMatchesBucket(domainName, expectedBucket)) {
      return false;
    }

    if (!domainMatchesRegion(domainName, expectedRegion)) {
      return false;
    }

    return true;
  });

  if (!matchingOrigin) {
    const originSummary = origins
      .map((origin) => origin?.DomainName || '(unknown)')
      .join(', ');
    throw new Error(
      `[verify-cloudfront] Distribution ${distributionId} is not pointing at bucket ${expectedBucket}` +
        (expectedRegion ? ` in region ${expectedRegion}` : '') +
        `. Found origins: ${originSummary}.`,
    );
  }

  const configuredPath = normalizeOriginPath(matchingOrigin.OriginPath || '');
  if (expectedOriginPath && configuredPath !== expectedOriginPath) {
    throw new Error(
      `[verify-cloudfront] Distribution ${distributionId} origin path ${
        configuredPath || '/'
      } does not match expected ${expectedOriginPath}.`,
    );
  }

  const pathLabel = configuredPath || '/';
  const regionSuffix = expectedRegion ? ` in ${expectedRegion}` : '';
  console.log(
    `[verify-cloudfront] Distribution ${distributionId} origin ${matchingOrigin.DomainName}${
      pathLabel === '/' ? '' : pathLabel
    } matches bucket ${expectedBucket}${regionSuffix}.`,
  );
}

async function main() {
  let allowFailureFlag = false;
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const { targetUrl: cliTargetUrl } = parsed;
    allowFailureFlag = parsed.allowFailure;

    let metadata = null;
    let metadataError = null;
    try {
      metadata = await readPublishedMetadata();
    } catch (error) {
      metadataError = error;
    }

    let targetUrl = hasValue(cliTargetUrl) ? cliTargetUrl.trim() : '';

    if (!targetUrl) {
      if (metadataError) {
        throw metadataError;
      }

      metadata = metadata || (await readPublishedMetadata());
      targetUrl = resolvePublishedCloudfrontUrl(metadata);
      if (!targetUrl) {
        throw new Error('No CloudFront URL is recorded in config/published-cloudfront.json.');
      }
      console.log(`Loaded CloudFront URL from config: ${targetUrl}`);
    } else {
      console.log(`Verifying provided CloudFront URL: ${targetUrl}`);

      if (metadataError) {
        if (metadataError.code === 'ENOENT') {
          console.warn(
            'config/published-cloudfront.json is not available; origin configuration verification will be skipped.',
          );
        } else {
          throw metadataError;
        }
      }
    }

    if (metadata) {
      await verifyDistributionOrigin(metadata);
    } else {
      console.warn(
        'Skipping CloudFront origin verification because configuration metadata is unavailable.',
      );
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
