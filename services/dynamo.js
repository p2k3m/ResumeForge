import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getSecrets } from '../config/secrets.js';
import { region } from '../server.js';

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

export async function logEvaluation({ jobId, ipAddress, userAgent, browser = '', os = '', device = '' }) {
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
    ipAddress: { S: ipAddress || '' },
    userAgent: { S: userAgent || '' },
    browser: { S: browser || '' },
    os: { S: os || '' },
    device: { S: device || '' },
    createdAt: { N: String(Date.now()) }
  };
  await client.send(new PutItemCommand({ TableName: tableName, Item: item }));
}

export async function logSession({
  jobId,
  ipAddress,
  userAgent,
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
    ipAddress: { S: ipAddress || '' },
    userAgent: { S: userAgent || '' },
    browser: { S: browser || '' },
    os: { S: os || '' },
    device: { S: device || '' },
    jobDescriptionUrl: { S: jobDescriptionUrl || '' },
    linkedinProfileUrl: { S: linkedinProfileUrl || '' },
    credlyProfileUrl: { S: credlyProfileUrl || '' },
    cvKey: { S: cvKey || '' },
    coverLetterKey: { S: coverLetterKey || '' },
    atsScore: { N: String(atsScore || 0) },
    improvement: { N: String(improvement || 0) },
    createdAt: { N: String(Date.now()) },
  };
  await client.send(new PutItemCommand({ TableName: tableName, Item: item }));
}

export default { logEvaluation, logSession };
