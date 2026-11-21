/**
 * Rate Limit Header & Protocol Linter
 * Audits HTTP 429 responses and IETF RateLimit-* header compliance.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { RateLimitAuditResult, AuditIssue } from '../types.js';

export class RateLimitLinter {
  /**
   * Lint an HTTP response status code and set of headers
   */
  static lint(statusCode: number, headers: Record<string, string | string[] | undefined>, url = 'https://api.example.com'): RateLimitAuditResult {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(headers)) {
      if (val !== undefined) {
        normalizedHeaders[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : String(val);
      }
    }

    const issues: AuditIssue[] = [];

    // Helper to get normalized header
    const getHeader = (name: string): string | undefined => normalizedHeaders[name.toLowerCase()];

    const retryAfter = getHeader('retry-after');
    const rateLimitLimit = getHeader('ratelimit-limit');
    const rateLimitRemaining = getHeader('ratelimit-remaining');
    const rateLimitReset = getHeader('ratelimit-reset');
    const rateLimitPolicy = getHeader('ratelimit-policy');

    const xLimit = getHeader('x-ratelimit-limit');
    const xRemaining = getHeader('x-ratelimit-remaining');
    const xReset = getHeader('x-ratelimit-reset');

    const hasRetryAfter = !!retryAfter;
    const hasRateLimitLimit = !!rateLimitLimit;
    const hasRateLimitRemaining = !!rateLimitRemaining;
    const hasRateLimitReset = !!rateLimitReset;
    const hasRateLimitPolicy = !!rateLimitPolicy;
    const hasLegacyXRateLimit = !!(xLimit || xRemaining || xReset);

    // Heuristic RL-001: Missing Retry-After on 429
    if (statusCode === 429 && !hasRetryAfter) {
      issues.push({
        code: 'RL-001',
        severity: 'CRITICAL',
        message: 'HTTP 429 Too Many Requests response is missing the required Retry-After header.',
        recommendation: 'Always return Retry-After with the number of seconds (or HTTP-Date) the client must wait before retrying to prevent automated client hammering.',
        headerKey: 'Retry-After'
      });
    }

    // Heuristic RL-002: Invalid Retry-After format
    if (retryAfter) {
      const isSeconds = /^\d+$/.test(retryAfter.trim());
      const isHttpDate = !isNaN(Date.parse(retryAfter));
      if (!isSeconds && !isHttpDate) {
        issues.push({
          code: 'RL-002',
          severity: 'HIGH',
          message: `Retry-After value "${retryAfter}" is neither a valid non-negative integer of seconds nor a valid RFC 7231 HTTP-Date.`,
          recommendation: 'Set Retry-After to an integer number of seconds (e.g. "60") or a standard HTTP-Date string.',
          headerKey: 'Retry-After',
          receivedValue: retryAfter
        });
      } else if (isSeconds && parseInt(retryAfter, 10) > 86400) {
        // Heuristic RL-010: Excessively large Retry-After
        issues.push({
          code: 'RL-010',
          severity: 'HIGH',
          message: `Retry-After value is greater than 24 hours (${retryAfter} seconds).`,
          recommendation: 'Ensure Retry-After does not exceed realistic retry horizons unless permanent quota exhaustion has occurred.',
          headerKey: 'Retry-After',
          receivedValue: retryAfter
        });
      }
    }

    // Heuristic RL-003: Legacy X-RateLimit headers without modern IETF headers
    if (hasLegacyXRateLimit && !hasRateLimitLimit && !hasRateLimitRemaining) {
      issues.push({
        code: 'RL-003',
        severity: 'MEDIUM',
        message: 'API uses deprecated non-standard X-RateLimit-* headers instead of the IETF RateLimit-* specification.',
        recommendation: 'Transition to standard IETF RateLimit-Limit, RateLimit-Remaining, and RateLimit-Reset headers (draft-ietf-httpapi-ratelimit-headers).',
        headerKey: 'RateLimit-Limit'
      });
    }

    // Heuristic RL-004: Conflicting remaining values between X- and standard headers
    if (rateLimitRemaining && xRemaining && rateLimitRemaining !== xRemaining) {
      issues.push({
        code: 'RL-004',
        severity: 'HIGH',
        message: `Conflicting remaining counts detected: RateLimit-Remaining is "${rateLimitRemaining}" while X-RateLimit-Remaining is "${xRemaining}".`,
        recommendation: 'Synchronize legacy and standard rate limit headers to prevent client SDK confusion.',
        headerKey: 'RateLimit-Remaining',
        receivedValue: `Standard: ${rateLimitRemaining}, Legacy: ${xRemaining}`
      });
    }

    // Heuristic RL-005: Non-numeric or negative RateLimit-Remaining
    if (rateLimitRemaining) {
      const val = parseInt(rateLimitRemaining, 10);
      if (isNaN(val) || val < 0) {
        issues.push({
          code: 'RL-005',
          severity: 'HIGH',
          message: `RateLimit-Remaining value "${rateLimitRemaining}" must be a non-negative integer.`,
          recommendation: 'Ensure RateLimit-Remaining is set to Math.max(0, remaining).',
          headerKey: 'RateLimit-Remaining',
          receivedValue: rateLimitRemaining
        });
      }
    }

    // Heuristic RL-006: Missing RateLimit-Policy header
    if ((hasRateLimitLimit || hasRateLimitRemaining) && !hasRateLimitPolicy) {
      issues.push({
        code: 'RL-006',
        severity: 'MEDIUM',
        message: 'IETF RateLimit-Policy header is missing.',
        recommendation: 'Add RateLimit-Policy indicating quota and window size (e.g. `RateLimit-Policy: 100;w=60` for 100 req per 60 seconds).',
        headerKey: 'RateLimit-Policy'
      });
    }

    // Heuristic RL-007: Remaining is 0 but status is 200 or remaining > 0 but status is 429
    if (rateLimitRemaining !== undefined) {
      const rem = parseInt(rateLimitRemaining, 10);
      if (rem === 0 && statusCode === 200) {
        issues.push({
          code: 'RL-007',
          severity: 'MEDIUM',
          message: 'RateLimit-Remaining is 0 but response status code is 200 OK. Next request will be throttled.',
          recommendation: 'Ensure client handles upcoming 429 transition gracefully.',
          headerKey: 'RateLimit-Remaining',
          receivedValue: '0'
        });
      } else if (rem > 0 && statusCode === 429) {
        issues.push({
          code: 'RL-007',
          severity: 'HIGH',
          message: `HTTP 429 returned while RateLimit-Remaining indicates ${rem} requests still available.`,
          recommendation: 'Verify whether secondary rate limits (e.g. concurrent connection limit) triggered the 429, and document the policy in RateLimit-Policy.',
          headerKey: 'RateLimit-Remaining',
          receivedValue: String(rem)
        });
      }
    }

    // Heuristic RL-008: RateLimit-Reset invalid delta
    if (rateLimitReset) {
      const resetNum = parseInt(rateLimitReset, 10);
      if (isNaN(resetNum) || resetNum < 0) {
        issues.push({
          code: 'RL-008',
          severity: 'MEDIUM',
          message: `RateLimit-Reset value "${rateLimitReset}" is invalid.`,
          recommendation: 'Set RateLimit-Reset to the number of seconds until the window resets.',
          headerKey: 'RateLimit-Reset',
          receivedValue: rateLimitReset
        });
      }
    }

    // Heuristic RL-009: Missing Vary header on rate-limited route
    const varyHeader = getHeader('vary');
    const authHeader = getHeader('authorization') || getHeader('x-api-key');
    if ((hasRateLimitLimit || hasLegacyXRateLimit) && authHeader && (!varyHeader || !varyHeader.toLowerCase().includes('authorization'))) {
      issues.push({
        code: 'RL-009',
        severity: 'LOW',
        message: 'Endpoint limits by client credential but omits `Vary: Authorization` or `Vary: X-API-Key`.',
        recommendation: 'Add `Vary: Authorization` to prevent intermediate CDNs and shared caches from serving cached rate-limit responses across different users.',
        headerKey: 'Vary'
      });
    }

    // Heuristic RL-011: Zero or negative capacity limit
    if (rateLimitLimit) {
      const lim = parseInt(rateLimitLimit, 10);
      if (isNaN(lim) || lim <= 0) {
        issues.push({
          code: 'RL-011',
          severity: 'MEDIUM',
          message: `RateLimit-Limit value "${rateLimitLimit}" must be a positive integer.`,
          recommendation: 'Set RateLimit-Limit to the maximum request quota allowed within the window.',
          headerKey: 'RateLimit-Limit',
          receivedValue: rateLimitLimit
        });
      }
    }

    // Compute health score (0 - 100)
    let score = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'CRITICAL':
          score -= 35;
          break;
        case 'HIGH':
          score -= 20;
          break;
        case 'MEDIUM':
          score -= 10;
          break;
        case 'LOW':
          score -= 5;
          break;
        case 'INFO':
          break;
      }
    }
    score = Math.max(0, Math.min(100, score));

    // Grade assignment
    let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F';
    if (score >= 95) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else grade = 'F';

    const ietfCompliant = hasRateLimitLimit && hasRateLimitRemaining && hasRateLimitReset && issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length === 0;

    return {
      url,
      statusCode,
      score,
      grade,
      ietfCompliant,
      issues,
      headers: normalizedHeaders,
      standardHeadersDetected: {
        hasRetryAfter,
        hasRateLimitLimit,
        hasRateLimitRemaining,
        hasRateLimitReset,
        hasRateLimitPolicy,
        hasLegacyXRateLimit
      }
    };
  }
}
