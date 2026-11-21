/**
 * Zero-Config Local Throttling Reverse Proxy & 429 Simulator
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { EventEmitter } from 'node:events';
import { IRateLimiter, createRateLimiter } from '../core/algorithms.js';
import { RateLimiterAlgorithm, RateLimitConfig, RateLimitResult } from '../types.js';

export interface RateProxyOptions {
  port: number;
  upstreamUrl?: string;
  algorithm: RateLimiterAlgorithm;
  config: RateLimitConfig;
}

export interface ProxyTelemetryEvent {
  timestamp: number;
  clientKey: string;
  method: string;
  url: string;
  statusCode: number;
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

export class RateProxy extends EventEmitter {
  private server: http.Server | null = null;
  private limiter: IRateLimiter;
  readonly options: RateProxyOptions;
  private history: ProxyTelemetryEvent[] = [];

  constructor(options: RateProxyOptions) {
    super();
    this.options = options;
    this.limiter = createRateLimiter(options.algorithm, options.config);
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.options.port, () => {
        resolve(this.options.port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getLimiter(): IRateLimiter {
    return this.limiter;
  }

  getTelemetryHistory(): ProxyTelemetryEvent[] {
    return [...this.history];
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Determine client identifier key (Authorization header, X-API-Key, or IP)
    const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const clientKey = typeof authHeader === 'string' ? authHeader : Array.isArray(ip) ? ip[0] : ip;

    const rateResult: RateLimitResult = this.limiter.consume(clientKey);

    // Apply IETF rate limit headers to response
    for (const [header, val] of Object.entries(rateResult.headers)) {
      res.setHeader(header, val);
    }
    res.setHeader('Vary', 'Authorization, X-API-Key');

    const event: ProxyTelemetryEvent = {
      timestamp: Date.now(),
      clientKey,
      method: req.method || 'GET',
      url: req.url || '/',
      statusCode: rateResult.allowed ? 200 : 429,
      allowed: rateResult.allowed,
      remaining: rateResult.remaining,
      resetMs: rateResult.resetMs,
      retryAfterSeconds: rateResult.retryAfterSeconds
    };
    this.history.unshift(event);
    if (this.history.length > 100) this.history.pop();
    this.emit('request', event);

    if (!rateResult.allowed) {
      // 429 Throttled
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(rateResult.retryAfterSeconds)
      });
      res.end(
        JSON.stringify(
          {
            error: 'Too Many Requests',
            message: `Rate limit quota exceeded. Try again in ${rateResult.retryAfterSeconds} seconds.`,
            limit: rateResult.limit,
            remaining: 0,
            resetMs: rateResult.resetMs,
            retryAfterSeconds: rateResult.retryAfterSeconds,
            algorithm: this.options.algorithm
          },
          null,
          2
        )
      );
      return;
    }

    // Forward to upstream if configured
    if (this.options.upstreamUrl) {
      this.forwardUpstream(req, res);
    } else {
      // Default Mock Target Response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            status: 'ok',
            message: 'StreamSmith Mock Upstream Response',
            clientKey,
            remaining: rateResult.remaining,
            algorithm: this.options.algorithm,
            timestamp: new Date().toISOString()
          },
          null,
          2
        )
      );
    }
  }

  private forwardUpstream(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    try {
      const targetUrl = new URL(clientReq.url || '/', this.options.upstreamUrl);
      const isHttps = targetUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const proxyReq = transport.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          method: clientReq.method,
          path: targetUrl.pathname + targetUrl.search,
          headers: {
            ...clientReq.headers,
            host: targetUrl.host
          }
        },
        (upstreamRes) => {
          clientRes.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
          upstreamRes.pipe(clientRes);
        }
      );

      proxyReq.on('error', (err) => {
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Bad Gateway', details: err.message }));
      });

      clientReq.pipe(proxyReq);
    } catch (e: any) {
      clientRes.writeHead(500, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Proxy Forwarding Error', message: e.message }));
    }
  }
}
