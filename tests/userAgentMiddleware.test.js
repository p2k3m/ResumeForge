import express from 'express';
import request from 'supertest';
import userAgentMiddleware from '../middlewares/userAgent.js';

describe('userAgent middleware', () => {
  test('attaches parsed user agent info to req', async () => {
    const app = express();
    app.use(userAgentMiddleware);
    app.get('/test', (req, res) => {
      res.json({
        browser: req.browser,
        os: req.os,
        device: req.device,
      });
    });
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1';
    const res = await request(app).get('/test').set('User-Agent', ua);
    expect(res.body).toEqual({
      browser: 'Mobile Safari',
      os: 'iOS',
      device: 'iPhone',
    });
  });
});
