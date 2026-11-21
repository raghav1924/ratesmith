# RateSmith 🛡️⚡

> **Developer-First API Rate Limiter & Throttling Simulator, IETF Header Linter, Jitter & Backoff Visualizer & Bento Grid Studio.**
> Built with zero external runtime dependencies in TypeScript 5.9 on Node.js v22.
>
> **Author:** Jatin Sharma — [Website](https://jatinsh.netlify.app/) • [GitHub](https://github.com/raghav1924) • [LinkedIn](https://linkedin.com/in/raghav1924) • [X](https://x.com/raghav1924)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v22-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success.svg)](#)
[![Tests Passing](https://img.shields.io/badge/Tests-17%2F17%20Passed-brightgreen.svg)](#)

---

## ⚡ Why RateSmith?

In modern cloud applications and Generative AI infrastructure, rate limits are an unavoidable reality. Every developer building with OpenAI, Anthropic, Stripe, or GitHub faces rate limits. Yet production teams routinely encounter four severe failure modes:

1. **Thundering Herd Retry Storms:** Simple exponential backoff without randomized jitter causes hundreds of client workers to retry at synchronized intervals, hammering recovered upstream servers back into immediate failure.
2. **IETF Protocol Header Violations:** Inconsistent mixing of deprecated `X-RateLimit-*` headers with standard IETF `RateLimit-*` headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`), often omitting the critical `Retry-After` header on HTTP 429 responses.
3. **Algorithm Mismatch:** Choosing the wrong rate limiting algorithm (e.g. Fixed Window Counter allowing double bursts on window boundaries vs Token Bucket allowing controlled bursts vs Leaky Bucket enforcing constant outflow).
4. **Painful Local 429 Testing:** Forcing HTTP 429 Too Many Requests in local development without burning production quotas or getting developer accounts banned.

**RateSmith** resolves all of these challenges in one cohesive, zero-dependency developer toolkit.

---

## 🏗️ Architecture Overview

```
======================================================================
                 RATESMITH SYSTEM ARCHITECTURE
======================================================================
  [ Rate Limiter Algorithms Engine ] --> [ Jitter & Backoff Simulator ]
  • Token Bucket (burst-tolerant)        • AWS Full Jitter Formulation
  • Leaky Bucket (smooth egress)         • Equal Jitter Formulations
  • Fixed Window Counter                 • Decorrelated Jitter
  • Sliding Window Counter (weighted)    • Thundering Herd Collision Calc
                 │                                      │
                 ▼                                      ▼
  [ 14+ IETF Protocol Heuristics ]   --> [ Local Throttling Proxy ]
  • RL-001 Missing Retry-After (429)     • Zero-config port 8085 listener
  • RL-002 Ambiguous Retry-After format  • Injects IETF & RFC 7231 headers
  • RL-003 Deprecated X-RateLimit-*      • Emulates 429 Too Many Requests
  • RL-006 Missing RateLimit-Policy      • Real-time request event stream
                 │                                      │
                 ▼                                      ▼
  [ Bento Grid Studio (Port 6767) ]  --> [ Multi-Framework Codegen ]
  • Pattern #12 Bento Grid layout        • Next.js 14/15 App Router
  • Pattern #20 Dark Mode Obsidian       • Express.js & Fastify
  • Pattern #24 Cybercore HUD Reticle    • Cloudflare Workers & Hono
  • Pattern #10 Glassmorphism Panels     • FastAPI (Python async stream)
======================================================================
```

---

## 🎨 Master Design Patterns Catalog Citations

RateSmith implements core design paradigms from the Master Design System catalog:

1. **Pattern #12 — Bento Grid Architecture:** Modular asymmetric dashboard grouping the animated Token Bucket cylinder, Thundering Herd histogram, live linter form, and framework code generator.
2. **Pattern #20 — High-Contrast Dark Mode:** Deep obsidian canvas (`#070a0f`), crisp slate dividers (`#1e293b`), with neon cyan (`#06b6d4`), emerald (`#10b981`), amber (`#f59e0b`), and rose (`#f43f5e`) status pills.
3. **Pattern #24 — Cybercore Telemetry HUD:** Real-time request collision histogram and dynamic water level indicator plotting token drain and replenishment deltas.
4. **Pattern #10 — Glassmorphism:** Translucent frosted metric cards with `backdrop-filter: blur(16px)` and subtle border highlights.
5. **Pattern #3 — Swiss Design Typography:** Strict typographical hierarchy with monospace tabular metrics aligned on a mathematical grid.

---

## 🚀 Quick Start

### Installation & Run

```bash
# Clone and enter directory
git clone https://github.com/raghav1924/ratesmith.git
cd ratesmith

# Build and run tests
npm test

# Launch embedded Bento Grid Web Studio on Port 6767
npm run studio
```

---

## 💻 CLI Commands

### 1. Audit Live API Rate Limit Headers
```bash
ratesmith audit https://api.github.com/users/octocat
```
Inspects response headers, evaluates against 14+ heuristics, checks IETF draft compliance, and awards a grade from **A+** to **F**.

### 2. Simulate Request Bursts
```bash
ratesmith sim --algo token-bucket --capacity 10 --burst 15
```
Simulates consecutive requests against the rate limiter algorithm and prints an ANSI timeline showing allowed/throttled transitions and exact `Retry-After` values.

### 3. Benchmark Thundering Herd Jitter
```bash
ratesmith jitter --workers 100
```
Runs a concurrent multi-worker collision simulation across **No-Jitter**, **Full Jitter**, **Equal Jitter**, and **Decorrelated Jitter**, comparing server-side collision rates and p95 latency.

### 4. Launch Local Throttling Proxy
```bash
ratesmith proxy --port 8085 --capacity 5 --algo token-bucket
```
Starts a local HTTP proxy on port 8085. Requests exceeding 5 calls are throttled with HTTP 429, emitting full IETF headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`).

### 5. Generate Multi-Framework Middleware
```bash
ratesmith generate --framework nextjs
ratesmith generate --framework express
ratesmith generate --framework fastify
ratesmith generate --framework cloudflare
ratesmith generate --framework hono
ratesmith generate --framework fastapi
```

---

## 🧪 Test Suite

All 17 unit and integration tests run in under 300ms with zero runtime dependencies:

```bash
$ npm test

✔ TokenBucketRateLimiter should allow burst up to capacity and throttle when depleted
✔ LeakyBucketRateLimiter should leak requests steadily and reject queue overflow
✔ FixedWindowRateLimiter should enforce quotas per fixed time boundary
✔ SlidingWindowCounter should weight previous and current windows smoothly
✔ No-Jitter should follow deterministic 2^attempt exponential growth
✔ Full-Jitter delay should always be bounded between 0 and capped exponential backoff
✔ Equal-Jitter delay should have minimum half-deterministic floor
✔ Thundering Herd benchmark should show Full Jitter has lower collision than No Jitter
✔ should flag HTTP 429 missing Retry-After as CRITICAL (RL-001)
✔ should flag invalid non-numeric Retry-After string as HIGH (RL-002)
✔ should award A+ grade and IETF compliance for fully compliant 429 response
✔ should detect conflicting remaining values between legacy and standard headers (RL-004)
✔ should serve requests with decrementing headers and throttle with 429
✔ should generate valid, production-ready middleware for nextjs
✔ should generate valid, production-ready middleware for express
✔ should generate valid, production-ready middleware for fastify
✔ should generate valid, production-ready middleware for cloudflare
✔ should generate valid, production-ready middleware for hono
✔ should generate valid, production-ready middleware for fastapi

ℹ tests 17
ℹ suites 5
ℹ pass 17
ℹ fail 0
```

---

## 👨‍💻 Author

**Jatin Sharma**  
Full Stack Developer & Product Engineer  
- **Portfolio:** [https://jatinsh.netlify.app/](https://jatinsh.netlify.app/)  
- **GitHub:** [@raghav1924](https://github.com/raghav1924)  
- **LinkedIn:** [linkedin.com/in/raghav1924](https://linkedin.com/in/raghav1924)  
- **X:** [@raghav1924](https://x.com/raghav1924)  

---

## 📄 License

MIT License. Designed and engineered by Jatin Sharma.
