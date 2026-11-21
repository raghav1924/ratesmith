import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TokenBucketRateLimiter,
  LeakyBucketRateLimiter,
  FixedWindowRateLimiter,
  SlidingWindowCounter
} from '../core/algorithms.js';

describe('Rate Limiter Algorithms Suite', () => {
  it('TokenBucketRateLimiter should allow burst up to capacity and throttle when depleted', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 3, refillRate: 1, windowMs: 1000 });
    const now = 1000000;

    const r1 = limiter.consume('client1', 1, now);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 2);

    const r2 = limiter.consume('client1', 1, now);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 1);

    const r3 = limiter.consume('client1', 1, now);
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.remaining, 0);

    // 4th request should be throttled
    const r4 = limiter.consume('client1', 1, now);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.remaining, 0);
    assert.strictEqual(r4.retryAfterSeconds >= 1, true);
    assert.strictEqual(r4.headers['Retry-After'], String(r4.retryAfterSeconds));

    // After 2 seconds, 2 tokens should be refilled
    const r5 = limiter.consume('client1', 1, now + 2000);
    assert.strictEqual(r5.allowed, true);
  });

  it('LeakyBucketRateLimiter should leak requests steadily and reject queue overflow', () => {
    const limiter = new LeakyBucketRateLimiter({ capacity: 2, refillRate: 1, windowMs: 1000 });
    const now = 1000000;

    assert.strictEqual(limiter.consume('clientA', 1, now).allowed, true);
    assert.strictEqual(limiter.consume('clientA', 1, now).allowed, true);
    // 3rd exceeds capacity
    const overflow = limiter.consume('clientA', 1, now);
    assert.strictEqual(overflow.allowed, false);
    assert.strictEqual(overflow.remaining, 0);

    // After 1 second, 1 token leaked
    const rAfter = limiter.consume('clientA', 1, now + 1000);
    assert.strictEqual(rAfter.allowed, true);
  });

  it('FixedWindowRateLimiter should enforce quotas per fixed time boundary', () => {
    const limiter = new FixedWindowRateLimiter({ capacity: 2, refillRate: 2, windowMs: 1000 });
    const now = 5000;

    assert.strictEqual(limiter.consume('clientB', 1, now).allowed, true);
    assert.strictEqual(limiter.consume('clientB', 1, now).allowed, true);
    assert.strictEqual(limiter.consume('clientB', 1, now).allowed, false);

    // Advance past window boundary
    assert.strictEqual(limiter.consume('clientB', 1, now + 1001).allowed, true);
  });

  it('SlidingWindowCounter should weight previous and current windows smoothly', () => {
    const limiter = new SlidingWindowCounter({ capacity: 4, refillRate: 4, windowMs: 1000 });
    const now = 10000;

    // Window 1: consume 2
    limiter.consume('clientC', 1, now);
    limiter.consume('clientC', 1, now);

    // Window 2 at 50% into window (500ms): prev window weight is 0.5 -> 2 * 0.5 = 1
    // With capacity 4, we can consume up to 3 more
    assert.strictEqual(limiter.consume('clientC', 1, now + 1500).allowed, true);
    assert.strictEqual(limiter.consume('clientC', 1, now + 1500).allowed, true);
  });
});
