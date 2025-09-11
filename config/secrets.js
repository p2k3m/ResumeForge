import path from 'path';
import fs from 'fs/promises';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { REGION } from './aws.js';

const secretsClient = new SecretsManagerClient({ region: REGION });

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
      console.warn(`Failed to load AWS secrets for ${secretId}: ${err.message}`);
    }
  } else {
    console.warn('SECRET_ID not set; skipping AWS Secrets Manager lookup.');
  }

  return loadLocalSecrets();
}

async function loadLocalSecrets() {
  try {
    const data = await fs.readFile(path.resolve('local-secrets.json'), 'utf-8');
    secretCache = JSON.parse(data);
    return secretCache;
  } catch (err) {
    console.warn('local-secrets.json not found; proceeding without secrets');
    secretCache = {};
    return secretCache;
  }
}
