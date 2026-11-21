/**
 * Rate Limiter Algorithms Engine
 * Implements Token Bucket, Leaky Bucket, Fixed Window, and Sliding Window Counter.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { RateLimiterAlgorithm, RateLimitConfig, RateLimitResult } from '../types.js';

export interface IRateLimiter {
  readonly algorithm: RateLimiterAlgorithm;
  readonly capacity: number;
  consume(key: string, cost?: number, now?: number): RateLimitResult;
  getState(key: string, now?: number): { remaining: number; resetMs: number };
  reset(key?: string): void;
}

/**
 * 1. Token Bucket Algorithm
 * Allows instantaneous bursts up to capacity while refilling at a constant tokens/second rate.
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  readonly algorithm: RateLimiterAlgorithm = 'token-bucket';
  readonly capacity: number;
  readonly refillRate: number; // tokens per second
  readonly windowMs: number;
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(config: RateLimitConfig) {
    this.capacity = Math.max(1, config.capacity);
    this.refillRate = Math.max(0.001, config.refillRate || this.capacity / (config.windowMs / 1000));
    this.windowMs = config.windowMs || 1000;
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    let state = this.buckets.get(key);
    if (!state) {
      state = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, state);
    }

    // Refill tokens based on elapsed time
    const elapsedSeconds = Math.max(0, (now - state.lastRefill) / 1000);
    const addedTokens = elapsedSeconds * this.refillRate;
    state.tokens = Math.min(this.capacity, state.tokens + addedTokens);
    state.lastRefill = now;

    const allowed = state.tokens >= cost;
    if (allowed) {
      state.tokens -= cost;
    }

    const remaining = Math.max(0, Math.floor(state.tokens));
    const deficit = allowed ? 0 : cost - state.tokens;
    const resetSeconds = Math.ceil(deficit / this.refillRate);
    const resetMs = Math.max(100, Math.ceil(resetSeconds * 1000));
    const retryAfter = allowed ? 0 : Math.max(1, resetSeconds);

    return {
      allowed,
      limit: this.capacity,
      remaining,
      resetMs,
      retryAfterSeconds: retryAfter,
      headers: this.formatHeaders(this.capacity, remaining, resetSeconds, retryAfter, allowed)
    };
  }

  getState(key: string, now = Date.now()): { remaining: number; resetMs: number } {
    const state = this.buckets.get(key);
    if (!state) return { remaining: this.capacity, resetMs: 0 };
    const elapsedSeconds = Math.max(0, (now - state.lastRefill) / 1000);
    const currentTokens = Math.min(this.capacity, state.tokens + elapsedSeconds * this.refillRate);
    const remaining = Math.max(0, Math.floor(currentTokens));
    const deficit = this.capacity - currentTokens;
    const resetMs = Math.ceil((deficit / this.refillRate) * 1000);
    return { remaining, resetMs };
  }

  reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }

  private formatHeaders(
    limit: number,
    remaining: number,
    resetSec: number,
    retryAfter: number,
    allowed: boolean
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'RateLimit-Limit': String(limit),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(Math.max(1, resetSec)),
      'RateLimit-Policy': `${limit};w=${Math.round(this.windowMs / 1000)}`
    };
    if (!allowed) {
      headers['Retry-After'] = String(retryAfter);
    }
    return headers;
  }
}

/**
 * 2. Leaky Bucket Algorithm
 * Smooths out traffic spikes to a constant leak rate, queuing or rejecting overflow.
 */
export class LeakyBucketRateLimiter implements IRateLimiter {
  readonly algorithm: RateLimiterAlgorithm = 'leaky-bucket';
  readonly capacity: number;
  readonly leakRate: number; // requests leaked per second
  readonly windowMs: number;
  private buckets = new Map<string, { queueDepth: number; lastLeak: number }>();

  constructor(config: RateLimitConfig) {
    this.capacity = Math.max(1, config.capacity);
    this.leakRate = Math.max(0.001, config.refillRate || this.capacity / (config.windowMs / 1000));
    this.windowMs = config.windowMs || 1000;
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    let state = this.buckets.get(key);
    if (!state) {
      state = { queueDepth: 0, lastLeak: now };
      this.buckets.set(key, state);
    }

    // Leak water from bucket based on elapsed time
    const elapsedSeconds = Math.max(0, (now - state.lastLeak) / 1000);
    const leaked = elapsedSeconds * this.leakRate;
    state.queueDepth = Math.max(0, state.queueDepth - leaked);
    state.lastLeak = now;

    const allowed = state.queueDepth + cost <= this.capacity;
    if (allowed) {
      state.queueDepth += cost;
    }

    const remaining = Math.max(0, Math.floor(this.capacity - state.queueDepth));
    const overflow = allowed ? 0 : (state.queueDepth + cost) - this.capacity;
    const resetSeconds = Math.ceil((state.queueDepth || overflow) / this.leakRate);
    const resetMs = Math.max(100, Math.ceil(resetSeconds * 1000));
    const retryAfter = allowed ? 0 : Math.max(1, resetSeconds);

    return {
      allowed,
      limit: this.capacity,
      remaining,
      resetMs,
      retryAfterSeconds: retryAfter,
      headers: {
        'RateLimit-Limit': String(this.capacity),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(Math.max(1, resetSeconds)),
        'RateLimit-Policy': `${this.capacity};w=${Math.round(this.windowMs / 1000)};burst=${this.capacity}`,
        ...(allowed ? {} : { 'Retry-After': String(retryAfter) })
      }
    };
  }

  getState(key: string, now = Date.now()): { remaining: number; resetMs: number } {
    const state = this.buckets.get(key);
    if (!state) return { remaining: this.capacity, resetMs: 0 };
    const elapsedSeconds = Math.max(0, (now - state.lastLeak) / 1000);
    const depth = Math.max(0, state.queueDepth - elapsedSeconds * this.leakRate);
    return {
      remaining: Math.max(0, Math.floor(this.capacity - depth)),
      resetMs: Math.ceil((depth / this.leakRate) * 1000)
    };
  }

  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}

/**
 * 3. Fixed Window Rate Limiter
 * Restricts requests per fixed time block (e.g. 100 req per minute 12:00:00 to 12:01:00).
 */
export class FixedWindowRateLimiter implements IRateLimiter {
  readonly algorithm: RateLimiterAlgorithm = 'fixed-window';
  readonly capacity: number;
  readonly windowMs: number;
  private windows = new Map<string, { windowStart: number; count: number }>();

  constructor(config: RateLimitConfig) {
    this.capacity = Math.max(1, config.capacity);
    this.windowMs = Math.max(100, config.windowMs || 1000);
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let state = this.windows.get(key);

    if (!state || state.windowStart !== currentWindowStart) {
      state = { windowStart: currentWindowStart, count: 0 };
      this.windows.set(key, state);
    }

    const allowed = state.count + cost <= this.capacity;
    if (allowed) {
      state.count += cost;
    }

    const remaining = Math.max(0, this.capacity - state.count);
    const windowEnd = currentWindowStart + this.windowMs;
    const resetMs = Math.max(100, windowEnd - now);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    const retryAfter = allowed ? 0 : resetSeconds;

    return {
      allowed,
      limit: this.capacity,
      remaining,
      resetMs,
      retryAfterSeconds: retryAfter,
      headers: {
        'RateLimit-Limit': String(this.capacity),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(resetSeconds),
        'RateLimit-Policy': `${this.capacity};w=${Math.round(this.windowMs / 1000)}`,
        ...(allowed ? {} : { 'Retry-After': String(retryAfter) })
      }
    };
  }

  getState(key: string, now = Date.now()): { remaining: number; resetMs: number } {
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const state = this.windows.get(key);
    if (!state || state.windowStart !== currentWindowStart) {
      return { remaining: this.capacity, resetMs: this.windowMs };
    }
    const remaining = Math.max(0, this.capacity - state.count);
    const resetMs = Math.max(0, (state.windowStart + this.windowMs) - now);
    return { remaining, resetMs };
  }

  reset(key?: string): void {
    if (key) this.windows.delete(key);
    else this.windows.clear();
  }
}

/**
 * 4. Sliding Window Counter
 * Approximates request rate by weighting the previous window and the current window,
 * solving the boundary double-burst vulnerability without high memory overhead.
 */
export class SlidingWindowCounter implements IRateLimiter {
  readonly algorithm: RateLimiterAlgorithm = 'sliding-window';
  readonly capacity: number;
  readonly windowMs: number;
  private windows = new Map<string, { currentStart: number; currentCount: number; prevCount: number }>();

  constructor(config: RateLimitConfig) {
    this.capacity = Math.max(1, config.capacity);
    this.windowMs = Math.max(100, config.windowMs || 1000);
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let state = this.windows.get(key);

    if (!state) {
      state = { currentStart: currentWindowStart, currentCount: 0, prevCount: 0 };
      this.windows.set(key, state);
    } else if (state.currentStart !== currentWindowStart) {
      if (state.currentStart === currentWindowStart - this.windowMs) {
        state.prevCount = state.currentCount;
      } else {
        state.prevCount = 0;
      }
      state.currentStart = currentWindowStart;
      state.currentCount = 0;
    }

    // Weight of previous window decreases as time advances into current window
    const timeIntoCurrentWindow = now - currentWindowStart;
    const prevWeight = Math.max(0, (this.windowMs - timeIntoCurrentWindow) / this.windowMs);
    const estimatedCount = state.prevCount * prevWeight + state.currentCount;

    const allowed = estimatedCount + cost <= this.capacity;
    if (allowed) {
      state.currentCount += cost;
    }

    const remaining = Math.max(0, Math.floor(this.capacity - (estimatedCount + (allowed ? cost : 0))));
    const resetMs = Math.max(100, (currentWindowStart + this.windowMs) - now);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    const retryAfter = allowed ? 0 : resetSeconds;

    return {
      allowed,
      limit: this.capacity,
      remaining,
      resetMs,
      retryAfterSeconds: retryAfter,
      headers: {
        'RateLimit-Limit': String(this.capacity),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(resetSeconds),
        'RateLimit-Policy': `${this.capacity};w=${Math.round(this.windowMs / 1000)}`,
        ...(allowed ? {} : { 'Retry-After': String(retryAfter) })
      }
    };
  }

  getState(key: string, now = Date.now()): { remaining: number; resetMs: number } {
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const state = this.windows.get(key);
    if (!state) return { remaining: this.capacity, resetMs: this.windowMs };
    const timeIntoCurrentWindow = now - currentWindowStart;
    const prevWeight = Math.max(0, (this.windowMs - timeIntoCurrentWindow) / this.windowMs);
    const estimated = state.prevCount * prevWeight + state.currentCount;
    return {
      remaining: Math.max(0, Math.floor(this.capacity - estimated)),
      resetMs: Math.max(0, (currentWindowStart + this.windowMs) - now)
    };
  }

  reset(key?: string): void {
    if (key) this.windows.delete(key);
    else this.windows.clear();
  }
}

/**
 * Rate Limiter Factory
 */
export function createRateLimiter(algorithm: RateLimiterAlgorithm, config: RateLimitConfig): IRateLimiter {
  switch (algorithm) {
    case 'token-bucket':
      return new TokenBucketRateLimiter(config);
    case 'leaky-bucket':
      return new LeakyBucketRateLimiter(config);
    case 'fixed-window':
      return new FixedWindowRateLimiter(config);
    case 'sliding-window':
      return new SlidingWindowCounter(config);
    default:
      return new TokenBucketRateLimiter(config);
  }
}
