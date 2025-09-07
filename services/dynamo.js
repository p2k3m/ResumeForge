import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import { getSecrets } from '../config/secrets.js';
import { region } from '../server.js';

async function resolveLocation(ipAddress) {
  if (!ipAddress) return 'unknown';
  try {
    const res = await fetch(`https://ipapi.co/${ipAddress}/json/`);
    const data = await res.json();
    const city = data?.city;
    const country = data?.country_name || data?.country;
    if (city && country) return `${city}, ${country}`;
    if (country) return country;
  } catch {
    /* ignore errors */
  }
  return 'unknown';
}

async function ensureTable(client, tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [{ AttributeName: 'jobId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'jobId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST'
    })
  );
  let status = 'CREATING';
  while (status !== 'ACTIVE') {
    await new Promise((r) => setTimeout(r, 1000));
    const { Table } = await client.send(
      new DescribeTableCommand({ TableName: tableName })
    );
    status = Table?.TableStatus;
  }
}

export async function logEvaluation({
  jobId,
  ipAddress = '',
  userAgent = '',
  browser = '',
  os = '',
  device = '',
  jobDescriptionUrl = '',
  linkedinProfileUrl = '',
  credlyProfileUrl = '',
  cvKey = '',
  docType = '',
}) {
  const client = new DynamoDBClient({ region });
  let tableName = process.env.DYNAMO_TABLE;
  if (!tableName) {
    try {
      const secrets = await getSecrets();
      tableName = secrets.DYNAMO_TABLE || 'ResumeForge';
    } catch {
      tableName = 'ResumeForge';
    }
  }
  await ensureTable(client, tableName);

  const item = {
    jobId: { S: jobId },
    createdAt: { N: String(Date.now()) }
  };

  const safeLinkedin =
    typeof linkedinProfileUrl === 'string' && linkedinProfileUrl.trim()
      ? linkedinProfileUrl
      : 'unknown';
  item.linkedinProfileUrl = { S: safeLinkedin };

  const addString = (key, value) => {
    if (typeof value === 'string' && value.trim()) {
      item[key] = { S: value };
    }
  };

  const location = await resolveLocation(ipAddress);
  addString('ipAddress', ipAddress);
  addString('location', location);
  addString('userAgent', userAgent);
  addString('browser', browser);
  addString('os', os);
  addString('device', device);
  addString('jobDescriptionUrl', jobDescriptionUrl);
  addString('credlyProfileUrl', credlyProfileUrl);
  addString('cvKey', cvKey);
  addString('docType', docType);

  await client.send(new PutItemCommand({ TableName: tableName, Item: item }));
}

export async function logSession({
  jobId,
  ipAddress = '',
  userAgent = '',
  browser = '',
  os = '',
  device = '',
  jobDescriptionUrl = '',
  linkedinProfileUrl = '',
  credlyProfileUrl = '',
  cvKey = '',
  coverLetterKey = '',
  atsScore = 0,
  improvement = 0,
}) {
  const client = new DynamoDBClient({ region });
  let tableName = process.env.DYNAMO_TABLE;
  if (!tableName) {
    try {
      const secrets = await getSecrets();
      tableName = secrets.DYNAMO_TABLE || 'ResumeForge';
    } catch {
      tableName = 'ResumeForge';
    }
  }
  await ensureTable(client, tableName);

  const item = {
    jobId: { S: jobId },
    createdAt: { N: String(Date.now()) },
    atsScore: { N: String(atsScore || 0) },
    improvement: { N: String(improvement || 0) }
  };

  const safeLinkedin =
    typeof linkedinProfileUrl === 'string' && linkedinProfileUrl.trim()
      ? linkedinProfileUrl
      : 'unknown';
  item.linkedinProfileUrl = { S: safeLinkedin };

  const addString = (key, value) => {
    if (typeof value === 'string' && value.trim()) {
      item[key] = { S: value };
    }
  };

  const location = await resolveLocation(ipAddress);
  addString('ipAddress', ipAddress);
  addString('location', location);
  addString('userAgent', userAgent);
  addString('browser', browser);
  addString('os', os);
  addString('device', device);
  addString('jobDescriptionUrl', jobDescriptionUrl);
  addString('credlyProfileUrl', credlyProfileUrl);
  addString('cvKey', cvKey);
  addString('coverLetterKey', coverLetterKey);

  await client.send(new PutItemCommand({ TableName: tableName, Item: item }));
}

export { resolveLocation };
export default { logEvaluation, logSession, resolveLocation };
