/**
 * Exponential Backoff & Jitter Formulations
 * Implements Amazon AWS & IETF Exponential Backoff with No-Jitter, Full Jitter,
 * Equal Jitter, and Decorrelated Jitter algorithms.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { JitterStrategy, JitterConfig, JitterComparisonResult, JitterSimulationSample } from '../types.js';

export class JitterCalculator {
  /**
   * Calculate backoff delay for a single attempt based on strategy
   */
  static calculateDelay(
    strategy: JitterStrategy,
    attempt: number,
    baseMs: number,
    maxMs: number,
    prevDelayMs = baseMs
  ): number {
    const cappedExp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)));

    switch (strategy) {
      case 'no-jitter':
        return cappedExp;

      case 'full-jitter':
        // Full Jitter: Uniform random between 0 and capped exponential backoff
        return Math.floor(Math.random() * cappedExp);

      case 'equal-jitter': {
        // Equal Jitter: Half deterministic backoff + half random jitter
        const half = Math.floor(cappedExp / 2);
        return half + Math.floor(Math.random() * half);
      }

      case 'decorrelated-jitter': {
        // Decorrelated Jitter: Uniform random between baseMs and 3x previous delay
        const high = Math.max(baseMs, prevDelayMs * 3);
        const randRange = Math.max(1, high - baseMs);
        const delay = Math.floor(baseMs + Math.random() * randRange);
        return Math.min(maxMs, delay);
      }

      default:
        return cappedExp;
    }
  }

  /**
   * Simulate a thundering herd scenario where N concurrent workers receive a 429
   * and retry repeatedly using the given jitter strategy.
   */
  static simulateThunderingHerd(
    strategy: JitterStrategy,
    workerCount = 100,
    config: JitterConfig = { baseBackoffMs: 1000, maxBackoffMs: 32000, maxAttempts: 4 }
  ): JitterComparisonResult {
    const samples: JitterSimulationSample[] = [];
    const collisionBuckets: Map<number, number> = new Map();
    const allDelays: number[] = [];

    for (let w = 0; w < workerCount; w++) {
      const delays: number[] = [];
      const cumulative: number[] = [];
      let totalTime = 0;
      let prevDelay = config.baseBackoffMs;

      for (let att = 0; att < config.maxAttempts; att++) {
        const delay = this.calculateDelay(strategy, att, config.baseBackoffMs, config.maxBackoffMs, prevDelay);
        delays.push(delay);
        allDelays.push(delay);
        totalTime += delay;
        cumulative.push(totalTime);
        prevDelay = delay;

        // Group into 1-second time buckets to measure server-side retry collisions
        const secBucket = Math.floor(totalTime / 1000);
        collisionBuckets.set(secBucket, (collisionBuckets.get(secBucket) || 0) + 1);
      }

      samples.push({
        workerId: w + 1,
        delays,
        cumulativeTimes: cumulative
      });
    }

    // Calculate metrics
    const sortedDelays = [...allDelays].sort((a, b) => a - b);
    const avgDelayMs = Math.round(allDelays.reduce((sum, d) => sum + d, 0) / (allDelays.length || 1));
    const maxDelayMs = sortedDelays[sortedDelays.length - 1] || 0;
    const p95Index = Math.min(sortedDelays.length - 1, Math.floor(sortedDelays.length * 0.95));
    const p95DelayMs = sortedDelays[p95Index] || 0;

    // A collision occurs when more than 1 worker hits the same 1-second bucket
    let collidedRequests = 0;
    let totalBucketHits = 0;
    collisionBuckets.forEach((count) => {
      totalBucketHits += count;
      if (count > 1) {
        collidedRequests += count;
      }
    });

    const collisionRate = totalBucketHits > 0 ? Math.round((collidedRequests / totalBucketHits) * 100) : 0;

    // Convert collision buckets to sorted array for visual charting
    const distributionBuckets: { bucketSec: number; count: number }[] = [];
    const maxBucketSec = Math.max(0, ...Array.from(collisionBuckets.keys()));
    for (let s = 0; s <= Math.min(60, maxBucketSec); s++) {
      distributionBuckets.push({
        bucketSec: s,
        count: collisionBuckets.get(s) || 0
      });
    }

    const descriptions: Record<JitterStrategy, string> = {
      'no-jitter': 'Deterministic exponential backoff (Severe thundering herd spikes at synchronized intervals)',
      'full-jitter': 'Uniform random jitter (Spreads retries evenly across full timeline, minimizing collisions)',
      'equal-jitter': 'Half fixed backoff with half jitter (Guarantees baseline delay while breaking sync)',
      'decorrelated-jitter': 'Decorrelated multiplicative jitter (Decouples subsequent delays from initial timestamp)'
    };

    return {
      strategy,
      description: descriptions[strategy] || strategy,
      workerCount,
      collisionRate,
      avgDelayMs,
      maxDelayMs,
      p95DelayMs,
      distributionBuckets
    };
  }

  /**
   * Run all 4 strategies side-by-side to produce comparative benchmarks
   */
  static compareAllStrategies(
    workerCount = 100,
    config: JitterConfig = { baseBackoffMs: 1000, maxBackoffMs: 32000, maxAttempts: 4 }
  ): Record<JitterStrategy, JitterComparisonResult> {
    return {
      'no-jitter': this.simulateThunderingHerd('no-jitter', workerCount, config),
      'full-jitter': this.simulateThunderingHerd('full-jitter', workerCount, config),
      'equal-jitter': this.simulateThunderingHerd('equal-jitter', workerCount, config),
      'decorrelated-jitter': this.simulateThunderingHerd('decorrelated-jitter', workerCount, config)
    };
  }
}
