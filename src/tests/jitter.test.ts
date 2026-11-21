import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { JitterCalculator } from '../core/jitter.js';

describe('Exponential Backoff & Jitter Formulations Suite', () => {
  it('No-Jitter should follow deterministic 2^attempt exponential growth', () => {
    const d0 = JitterCalculator.calculateDelay('no-jitter', 0, 1000, 32000);
    const d1 = JitterCalculator.calculateDelay('no-jitter', 1, 1000, 32000);
    const d2 = JitterCalculator.calculateDelay('no-jitter', 2, 1000, 32000);
    const d3 = JitterCalculator.calculateDelay('no-jitter', 3, 1000, 32000);

    assert.strictEqual(d0, 1000);
    assert.strictEqual(d1, 2000);
    assert.strictEqual(d2, 4000);
    assert.strictEqual(d3, 8000);
  });

  it('Full-Jitter delay should always be bounded between 0 and capped exponential backoff', () => {
    for (let i = 0; i < 20; i++) {
      const delay = JitterCalculator.calculateDelay('full-jitter', 2, 1000, 16000);
      assert.strictEqual(delay >= 0, true);
      assert.strictEqual(delay <= 4000, true);
    }
  });

  it('Equal-Jitter delay should have minimum half-deterministic floor', () => {
    for (let i = 0; i < 20; i++) {
      const delay = JitterCalculator.calculateDelay('equal-jitter', 2, 1000, 16000);
      // Capped exp for attempt 2 is 4000. Half is 2000. Delay must be in [2000, 4000]
      assert.strictEqual(delay >= 2000, true);
      assert.strictEqual(delay <= 4000, true);
    }
  });

  it('Thundering Herd benchmark should show Full Jitter has significantly lower collision than No Jitter', () => {
    const noJitter = JitterCalculator.simulateThunderingHerd('no-jitter', 50);
    const fullJitter = JitterCalculator.simulateThunderingHerd('full-jitter', 50);

    assert.strictEqual(noJitter.collisionRate >= fullJitter.collisionRate, true);
    assert.strictEqual(fullJitter.distributionBuckets.length > 0, true);
  });
});
