import { gzipSync } from 'zlib';
import {
  normaliseLogPayload,
  parseCloudFrontLog,
} from '../services/monitoring/cloudfrontLogProcessor.js';

describe('cloudfront log processor utilities', () => {
  test('parses recurring 404 counts from CloudFront logs', () => {
    const log = [
      '#Version: 1.0',
      '#Fields: date time x-edge-location sc-bytes c-ip cs-method cs(Host) cs-uri-stem sc-status cs(Referer) cs(User-Agent)',
      '2024-05-01\t12:00:00\tIAD79\t123\t203.0.113.1\tGET\tdomain.example.com\t/ok\t200\t-\tTestAgent',
      '2024-05-01\t12:01:00\tIAD79\t456\t198.51.100.24\tGET\tdomain.example.com\t/missing\t404\t-\tTestAgent',
      '2024-05-01\t12:02:00\tIAD79\t789\t198.51.100.99\tGET\tdomain.example.com\t/also-missing\t404\t-\tTestAgent',
    ].join('\n');

    const result = parseCloudFrontLog(log);

    expect(result.entries).toBe(3);
    expect(result.notFoundCount).toBe(2);
  });

  test('returns zero counts when log is empty', () => {
    expect(parseCloudFrontLog('')).toEqual({ entries: 0, notFoundCount: 0 });
    expect(parseCloudFrontLog(undefined)).toEqual({ entries: 0, notFoundCount: 0 });
  });

  test('decompresses gzipped payloads', () => {
    const original = '2024-05-01\t12:01:00\tIAD79\t456\t198.51.100.24\tGET\tdomain.example.com\t/missing\t404\t-\tTestAgent';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));

    expect(normaliseLogPayload(compressed)).toBe(original);
  });
});
