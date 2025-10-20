import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { gunzipSync } from 'zlib';

const s3 = new S3Client({});
const cloudWatch = new CloudWatchClient({});

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function streamToBuffer(body) {
  if (!body) {
    return Buffer.from([]);
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function normaliseLogPayload(buffer) {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  try {
    return gunzipSync(buffer).toString('utf-8');
  } catch (err) {
    // Not a gzipped payload; fall back to utf-8 decoding.
    return buffer.toString('utf-8');
  }
}

export function parseCloudFrontLog(content) {
  if (!isNonEmptyString(content)) {
    return {
      entries: 0,
      notFoundCount: 0,
    };
  }

  let entries = 0;
  let notFoundCount = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    entries += 1;
    const parts = line.split('\t');
    if (parts.length > 8) {
      const statusCode = Number.parseInt(parts[8], 10);
      if (Number.isInteger(statusCode) && statusCode === 404) {
        notFoundCount += 1;
      }
    }
  }

  return {
    entries,
    notFoundCount,
  };
}

function buildMetricDatum({ distributionId, stageName, notFoundCount }) {
  if (!isNonEmptyString(distributionId)) {
    throw new Error('CLOUDFRONT_DISTRIBUTION_ID must be provided.');
  }

  const dimensions = [
    {
      Name: 'DistributionId',
      Value: distributionId,
    },
  ];

  if (isNonEmptyString(stageName)) {
    dimensions.push({
      Name: 'Stage',
      Value: stageName,
    });
  }

  return {
    MetricName: 'Recurring404Count',
    Dimensions: dimensions,
    Timestamp: new Date(),
    Unit: 'Count',
    Value: notFoundCount,
  };
}

async function publishMetric(datum) {
  const command = new PutMetricDataCommand({
    Namespace: 'ResumeForge/CloudFront',
    MetricData: [datum],
  });

  await cloudWatch.send(command);
}

export async function processCloudFrontLogs(event) {
  if (!event?.Records || !Array.isArray(event.Records)) {
    return;
  }

  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  const stageName = process.env.STAGE_NAME;

  for (const record of event.Records) {
    const bucket = record?.s3?.bucket?.name;
    const key = record?.s3?.object?.key;

    if (!isNonEmptyString(bucket) || !isNonEmptyString(key)) {
      console.warn('Skipping S3 event without bucket/key.', { record });
      continue;
    }

    const command = new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(key.replace(/\+/g, ' ')) });
    const response = await s3.send(command);
    const bodyBuffer = await streamToBuffer(response.Body);
    const content = normaliseLogPayload(bodyBuffer);
    const { notFoundCount, entries } = parseCloudFrontLog(content);

    console.info('Processed CloudFront access log.', {
      bucket,
      key,
      entries,
      notFoundCount,
    });

    const metricDatum = buildMetricDatum({
      distributionId,
      stageName,
      notFoundCount,
    });

    await publishMetric(metricDatum);
  }
}

export default processCloudFrontLogs;
