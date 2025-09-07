import path from 'path';
import fs from 'fs/promises';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const DEFAULT_AWS_REGION = 'ap-south-1';

process.env.AWS_REGION = process.env.AWS_REGION || DEFAULT_AWS_REGION;

const region = process.env.AWS_REGION || DEFAULT_AWS_REGION;
const secretsClient = new SecretsManagerClient({ region });

let secretCache;
export async function getSecrets() {
  if (secretCache) return secretCache;

  const secretId = process.env.SECRET_ID;
  if (secretId) {
    try {
      const { SecretString } = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretId })
      );
      secretCache = JSON.parse(SecretString ?? '{}');
      return secretCache;
    } catch (err) {
      // If AWS lookup fails, fall back to local file
    }
  }

  try {
    const data = await fs.readFile(path.resolve('local-secrets.json'), 'utf-8');
    secretCache = JSON.parse(data);
    return secretCache;
  } catch (err) {
    if (secretId) {
      throw new Error(`Failed to load secrets for ${secretId} and local-secrets.json is missing`);
    }
    throw new Error('SECRET_ID environment variable is not set and local-secrets.json is missing');
  }
}
