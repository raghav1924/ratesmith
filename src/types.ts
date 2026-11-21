/**
 * RateSmith Core Type Definitions
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

export type RateLimiterAlgorithm =
  | 'token-bucket'
  | 'leaky-bucket'
  | 'fixed-window'
  | 'sliding-window';

export type JitterStrategy =
  | 'no-jitter'
  | 'full-jitter'
  | 'equal-jitter'
  | 'decorrelated-jitter';

export interface RateLimitConfig {
  /** Maximum burst capacity or tokens allowed */
  capacity: number;
  /** Refill rate: tokens added per second (or requests allowed per window) */
  refillRate: number;
  /** Window size in milliseconds (e.g. 1000 for 1s, 60000 for 1m) */
  windowMs: number;
  /** Cost per request (default 1) */
  cost?: number;
}

export interface RateLimitResult {
  /** Whether the request is permitted */
  allowed: boolean;
  /** Total limit capacity */
  limit: number;
  /** Remaining allowance */
  remaining: number;
  /** Time until quota resets or tokens replenish (in milliseconds) */
  resetMs: number;
  /** Recommended Retry-After header in seconds (integer) */
  retryAfterSeconds: number;
  /** Generated IETF & RFC-compliant HTTP response headers */
  headers: Record<string, string>;
}

export interface JitterConfig {
  baseBackoffMs: number;
  maxBackoffMs: number;
  maxAttempts: number;
}

export interface JitterAttempt {
  attempt: number;
  calculatedDelayMs: number;
  sleepMs: number;
}

export interface JitterSimulationSample {
  workerId: number;
  delays: number[];
  cumulativeTimes: number[];
}

export interface JitterComparisonResult {
  strategy: JitterStrategy;
  description: string;
  workerCount: number;
  collisionRate: number; // percentage of workers retrying at the same second bucket
  avgDelayMs: number;
  maxDelayMs: number;
  p95DelayMs: number;
  distributionBuckets: { bucketSec: number; count: number }[];
}

export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AuditIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  recommendation: string;
  headerKey?: string;
  receivedValue?: string;
}

export interface RateLimitAuditResult {
  url: string;
  statusCode: number;
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  ietfCompliant: boolean;
  issues: AuditIssue[];
  headers: Record<string, string>;
  standardHeadersDetected: {
    hasRetryAfter: boolean;
    hasRateLimitLimit: boolean;
    hasRateLimitRemaining: boolean;
    hasRateLimitReset: boolean;
    hasRateLimitPolicy: boolean;
    hasLegacyXRateLimit: boolean;
  };
}

export type FrameworkType =
  | 'nextjs'
  | 'express'
  | 'fastify'
  | 'cloudflare'
  | 'hono'
  | 'fastapi';

export interface GeneratedMiddleware {
  framework: FrameworkType;
  title: string;
  filename: string;
  code: string;
  instructions: string;
}
