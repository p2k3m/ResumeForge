import express from 'express';
import request from 'supertest';
import { withTimeout } from '../routes/processCv.js';

function longTask(signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve('done'), 5000);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('aborted'));
    });
  });
}

test('withTimeout aborts long-running task', async () => {
  const app = express();
  app.get(
    '/slow',
    withTimeout(async (req, res) => {
      await longTask(req.signal);
      res.json({ ok: true });
    }, 100)
  );
  const start = Date.now();
  const res = await request(app).get('/slow');
  const duration = Date.now() - start;
  expect(res.status).toBe(503);
  expect(duration).toBeLessThan(1000);
});
