import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { setupTestServer } from './utils/testServer.js';

async function createServer({ metadata, createFile = true } = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resumeforge-cloudfront-'));
  const filePath = path.join(tmpDir, 'published-cloudfront.json');
  if (createFile && metadata !== undefined) {
    await fs.writeFile(filePath, JSON.stringify(metadata), 'utf8');
  }
  if (!createFile && metadata !== undefined) {
    await fs.writeFile(filePath, metadata, 'utf8');
  }
  process.env.PUBLISHED_CLOUDFRONT_PATH = filePath;
  const server = await setupTestServer();
  async function cleanup() {
    delete process.env.PUBLISHED_CLOUDFRONT_PATH;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  return { ...server, cleanup, filePath };
}

describe('published CloudFront helpers', () => {
  test('returns 404 when metadata file is missing', async () => {
    const { app, cleanup } = await createServer({ metadata: undefined, createFile: false });
    try {
      const response = await request(app).get('/api/published-cloudfront');
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'PUBLISHED_CLOUDFRONT_UNAVAILABLE',
        },
      });
    } finally {
      await cleanup();
    }
  });

  test('responds with published metadata when available', async () => {
    const metadata = {
      stackName: 'ResumeForge',
      url: 'https://d3exampleabcdef8.cloudfront.net/',
      distributionId: 'E123456789ABC',
      updatedAt: '2024-05-28T00:00:00.000Z',
    };
    const { app, cleanup } = await createServer({ metadata });
    try {
      const response = await request(app).get('/api/published-cloudfront');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        cloudfront: {
          stackName: metadata.stackName,
          url: 'https://d3exampleabcdef8.cloudfront.net',
          fileUrl: 'https://d3exampleabcdef8.cloudfront.net',
          typeUrl: 'https://d3exampleabcdef8.cloudfront.net#download',
          distributionId: metadata.distributionId,
          updatedAt: metadata.updatedAt,
        },
      });
    } finally {
      await cleanup();
    }
  });

  test('redirects callers to the published domain', async () => {
    const metadata = {
      stackName: 'ResumeForge',
      url: 'https://d3exampleabcdef8.cloudfront.net/prod',
      distributionId: 'E123456789ABC',
      updatedAt: '2024-05-28T00:00:00.000Z',
    };
    const { app, cleanup } = await createServer({ metadata });
    try {
      const response = await request(app).get('/go/cloudfront');
      expect(response.status).toBe(308);
      expect(response.headers.location).toBe('https://d3exampleabcdef8.cloudfront.net/prod');
    } finally {
      await cleanup();
    }
  });

  test('allows redirecting to a specific path on the published domain', async () => {
    const metadata = {
      stackName: 'ResumeForge',
      url: 'https://d3exampleabcdef8.cloudfront.net',
      distributionId: 'E123456789ABC',
      updatedAt: '2024-05-28T00:00:00.000Z',
    };
    const { app, cleanup } = await createServer({ metadata });
    try {
      const response = await request(app)
        .get('/redirect/latest')
        .query({ path: 'api/process-cv' });
      expect(response.status).toBe(308);
      expect(response.headers.location).toBe(
        'https://d3exampleabcdef8.cloudfront.net/api/process-cv'
      );
    } finally {
      await cleanup();
    }
  });
});
