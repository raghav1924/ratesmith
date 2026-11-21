import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { RateLimitLinter } from '../core/linter.js';

describe('Rate Limit Header Linter Suite', () => {
  it('should flag HTTP 429 missing Retry-After as CRITICAL (RL-001)', () => {
    const res = RateLimitLinter.lint(429, {
      'RateLimit-Limit': '100',
      'RateLimit-Remaining': '0'
    });

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.grade !== 'A+', true);
    const rl001 = res.issues.find(i => i.code === 'RL-001');
    assert.ok(rl001, 'RL-001 should be reported');
    assert.strictEqual(rl001?.severity, 'CRITICAL');
  });

  it('should flag invalid non-numeric Retry-After string as HIGH (RL-002)', () => {
    const res = RateLimitLinter.lint(429, {
      'Retry-After': 'invalid-time-format',
      'RateLimit-Limit': '100',
      'RateLimit-Remaining': '0'
    });

    const rl002 = res.issues.find(i => i.code === 'RL-002');
    assert.ok(rl002, 'RL-002 should be reported');
    assert.strictEqual(rl002?.severity, 'HIGH');
  });

  it('should award A+ grade and IETF compliance for fully compliant 429 response', () => {
    const res = RateLimitLinter.lint(429, {
      'Retry-After': '60',
      'RateLimit-Limit': '100',
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': '60',
      'RateLimit-Policy': '100;w=60'
    });

    assert.strictEqual(res.grade, 'A+');
    assert.strictEqual(res.score, 100);
    assert.strictEqual(res.ietfCompliant, true);
    assert.strictEqual(res.issues.length, 0);
  });

  it('should detect conflicting remaining values between legacy and standard headers (RL-004)', () => {
    const res = RateLimitLinter.lint(200, {
      'RateLimit-Limit': '100',
      'RateLimit-Remaining': '50',
      'RateLimit-Reset': '30',
      'RateLimit-Policy': '100;w=60',
      'X-RateLimit-Remaining': '10'
    });

    const rl004 = res.issues.find(i => i.code === 'RL-004');
    assert.ok(rl004, 'RL-004 should be reported for mismatch');
  });
});
