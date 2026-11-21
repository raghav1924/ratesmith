import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { RateProxy } from '../proxy/rateProxy.js';

describe('Local Throttling Reverse Proxy Integration Suite', () => {
  it('should serve requests with decrementing headers and throttle with 429 when quota is exhausted', async () => {
    const TEST_PORT = 8993;
    const proxy = new RateProxy({
      port: TEST_PORT,
      algorithm: 'token-bucket',
      config: { capacity: 2, refillRate: 0.1, windowMs: 10000 }
    });

    await proxy.start();

    const makeRequest = (): Promise<{ status: number; headers: Record<string, any>; body: string }> => {
      return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${TEST_PORT}/test`, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: data
            });
          });
        });
        req.on('error', reject);
      });
    };

    try {
      // 1st request -> 200 OK, remaining 1
      const res1 = await makeRequest();
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.headers['ratelimit-remaining'], '1');

      // 2nd request -> 200 OK, remaining 0
      const res2 = await makeRequest();
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers['ratelimit-remaining'], '0');

      // 3rd request -> 429 Too Many Requests, Retry-After header present
      const res3 = await makeRequest();
      assert.strictEqual(res3.status, 429);
      assert.ok(res3.headers['retry-after'], 'Retry-After header must be present on 429');
      const parsedBody = JSON.parse(res3.body);
      assert.strictEqual(parsedBody.error, 'Too Many Requests');
    } finally {
      await proxy.stop();
    }
  });
});
