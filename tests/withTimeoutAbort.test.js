import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { withTimeout, startStep } from '../routes/processCv.js';

function longTask(signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve('done'), 5000);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('aborted'));
    });
  });
}

test('withTimeout aborts long-running task and logs summary', async () => {
  const app = express();
  app.get(
    '/slow',
    (req, _res, next) => {
      req.jobId = 'slow-id';
      next();
    },
    withTimeout(async (req, res) => {
      await longTask(req.signal);
      res.json({ ok: true });
    }, 100)
  );
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const start = Date.now();
  const res = await request(app).get('/slow');
  const duration = Date.now() - start;
  const logs = logSpy.mock.calls.map((c) => c[0]);
  logSpy.mockRestore();
  const summaryLogs = logs.filter((m) => {
    try {
      return JSON.parse(m)['slow-id'];
    } catch {
      return false;
    }
  });
  expect(summaryLogs).toHaveLength(1);
  const summary = JSON.parse(summaryLogs[0])['slow-id'];
  expect(summary.status).toBe('aborted');
  expect(summary.stage_durations).toEqual({});
  expect(res.status).toBe(503);
  expect(duration).toBeLessThan(1000);
});

test('withTimeout logs stage durations on success', async () => {
  const app = express();
  app.get(
    '/fast',
    withTimeout(async (req, res) => {
      req.jobId = 'fast-id';
      const endA = startStep(req, 'stageA');
      await new Promise((r) => setTimeout(r, 20));
      await endA();
      const endB = startStep(req, 'stageB');
      await new Promise((r) => setTimeout(r, 10));
      await endB();
      res.json({ ok: true });
    }, 1000)
  );
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const res = await request(app).get('/fast');
  const logs = logSpy.mock.calls.map((c) => c[0]);
  logSpy.mockRestore();
  const summaryLogs = logs.filter((m) => {
    try {
      return JSON.parse(m)['fast-id'];
    } catch {
      return false;
    }
  });
  expect(res.status).toBe(200);
  expect(summaryLogs).toHaveLength(1);
  const summary = JSON.parse(summaryLogs[0])['fast-id'];
  expect(summary.status).toBe('finished');
  const entries = Object.entries(summary.stage_durations);
  expect(entries.length).toBe(2);
  expect(entries[0][0]).toBe('stageA');
  expect(entries[0][1]).toBeGreaterThanOrEqual(entries[1][1]);
});
