/**
 * RateSmith Interactive Command-Line Interface (CLI)
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { createRateLimiter } from './core/algorithms.js';
import { JitterCalculator } from './core/jitter.js';
import { RateLimitLinter } from './core/linter.js';
import { RateProxy } from './proxy/rateProxy.js';
import { MiddlewareGenerator } from './generators/middlewareGen.js';
import { StudioServer } from './studio/server.js';
import { FrameworkType, JitterStrategy, RateLimiterAlgorithm } from './types.js';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function printBanner(): void {
  console.log(`
${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════════════════════╗
║   RATE-SMITH — Developer-First API Rate Limiter & Throttling Simulator       ║
║   IETF Header Linter, Thundering Herd Jitter & Bento Grid Studio             ║
╚══════════════════════════════════════════════════════════════════════════════╝${RESET}
${DIM}Author: Jatin Sharma (https://jatinsh.netlify.app/)${RESET}
`);
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const cmd = argv[0] || 'help';

  switch (cmd) {
    case 'audit':
      await runAuditCmd(argv.slice(1));
      break;
    case 'sim':
      runSimCmd(argv.slice(1));
      break;
    case 'jitter':
      runJitterCmd(argv.slice(1));
      break;
    case 'proxy':
      await runProxyCmd(argv.slice(1));
      break;
    case 'generate':
      runGenerateCmd(argv.slice(1));
      break;
    case 'studio':
      await runStudioCmd(argv.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

async function runAuditCmd(args: string[]): Promise<void> {
  const urlArg = args[0];
  if (!urlArg) {
    console.error(`${RED}Error: Missing target URL. Usage: ratesmith audit <url>${RESET}`);
    return;
  }

  printBanner();
  console.log(`${CYAN}Auditing rate limit headers for:${RESET} ${urlArg}\n`);

  try {
    const targetUrl = new URL(urlArg);
    const transport = targetUrl.protocol === 'https:' ? https : http;

    const req = transport.request(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'RateSmith/1.0 (+https://jatinsh.netlify.app/)'
        }
      },
      (res: http.IncomingMessage) => {
        const audit = RateLimitLinter.lint(res.statusCode || 200, res.headers as any, urlArg);
        const gradeColor = audit.grade === 'A+' || audit.grade === 'A' ? GREEN : audit.grade === 'B' ? YELLOW : RED;

        console.log(`HTTP Status:       ${res.statusCode}`);
        console.log(`Compliance Grade:  ${gradeColor}${BOLD}${audit.grade} (${audit.score}/100)${RESET}`);
        console.log(`IETF Compliant:    ${audit.ietfCompliant ? `${GREEN}YES${RESET}` : `${RED}NO${RESET}`}`);
        console.log('');
        console.log(`${BOLD}STANDARD HEADERS DETECTED:${RESET}`);
        console.log(`  Retry-After:           ${audit.standardHeadersDetected.hasRetryAfter ? `${GREEN}✔ Present${RESET}` : `${RED}✘ Missing${RESET}`}`);
        console.log(`  RateLimit-Limit:       ${audit.standardHeadersDetected.hasRateLimitLimit ? `${GREEN}✔ Present${RESET}` : `${RED}✘ Missing${RESET}`}`);
        console.log(`  RateLimit-Remaining:   ${audit.standardHeadersDetected.hasRateLimitRemaining ? `${GREEN}✔ Present${RESET}` : `${RED}✘ Missing${RESET}`}`);
        console.log(`  RateLimit-Reset:       ${audit.standardHeadersDetected.hasRateLimitReset ? `${GREEN}✔ Present${RESET}` : `${RED}✘ Missing${RESET}`}`);
        console.log(`  RateLimit-Policy:      ${audit.standardHeadersDetected.hasRateLimitPolicy ? `${GREEN}✔ Present${RESET}` : `${YELLOW}✘ Missing${RESET}`}`);
        console.log(`  Legacy X-RateLimit-*:  ${audit.standardHeadersDetected.hasLegacyXRateLimit ? `${YELLOW}⚠ Present${RESET}` : `${DIM}None${RESET}`}`);

        if (audit.issues.length > 0) {
          console.log(`\n${BOLD}ISSUES & REMEDIATIONS (${audit.issues.length}):${RESET}`);
          audit.issues.forEach((iss) => {
            const sevColor = iss.severity === 'CRITICAL' ? RED : iss.severity === 'HIGH' ? YELLOW : CYAN;
            console.log(`  [${sevColor}${iss.severity}${RESET}] ${BOLD}${iss.code}${RESET}: ${iss.message}`);
            console.log(`    ${DIM}Fix: ${iss.recommendation}${RESET}`);
          });
        } else {
          console.log(`\n${GREEN}✔ Zero rate limit protocol violations detected! Perfect compliance.${RESET}`);
        }
      }
    );

    req.on('error', (err) => {
      console.error(`${RED}Request failed: ${err.message}${RESET}`);
    });
    req.end();
  } catch (e: any) {
    console.error(`${RED}Invalid URL: ${e.message}${RESET}`);
  }
}

function runSimCmd(args: string[]): void {
  printBanner();
  const algo = (getArgValue(args, '--algo') || 'token-bucket') as RateLimiterAlgorithm;
  const capacity = parseInt(getArgValue(args, '--capacity') || '10', 10);
  const burst = parseInt(getArgValue(args, '--burst') || '15', 10);

  console.log(`${CYAN}Simulating Burst Execution:${RESET} ${algo.toUpperCase()} (Capacity: ${capacity}, Burst: ${burst} reqs)\n`);

  const limiter = createRateLimiter(algo, { capacity, refillRate: 2, windowMs: 5000 });
  console.log(`${BOLD}Req # | Allowed? | Remaining | Retry-After | Status Code${RESET}`);
  console.log(`------|----------|-----------|-------------|------------`);

  for (let i = 1; i <= burst; i++) {
    const res = limiter.consume('cli-sim-client');
    const allowStr = res.allowed ? `${GREEN}ALLOWED${RESET} ` : `${RED}BLOCKED${RESET} `;
    const remStr = String(res.remaining).padStart(9, ' ');
    const retryStr = res.allowed ? '          -  ' : `${YELLOW}${String(res.retryAfterSeconds).padStart(8, ' ')}s  ${RESET}`;
    const statusStr = res.allowed ? `${GREEN}200 OK${RESET}` : `${RED}429 Too Many Requests${RESET}`;
    console.log(`${String(i).padStart(5, ' ')} | ${allowStr} | ${remStr} | ${retryStr}| ${statusStr}`);
  }
}

function runJitterCmd(args: string[]): void {
  printBanner();
  const workers = parseInt(getArgValue(args, '--workers') || '100', 10);
  console.log(`${CYAN}Simulating Thundering Herd Post-429 Retry Storm (${workers} concurrent workers):${RESET}\n`);

  const results = JitterCalculator.compareAllStrategies(workers);

  console.log(`${BOLD}Strategy             | Collision Rate | Avg Delay (ms) | Max Delay (ms) | p95 Delay (ms)${RESET}`);
  console.log(`---------------------|----------------|----------------|----------------|---------------`);

  for (const [strat, res] of Object.entries(results)) {
    const colColor = res.collisionRate > 50 ? RED : GREEN;
    const nameStr = strat.padEnd(20, ' ');
    const colStr = `${colColor}${String(res.collisionRate + '%').padStart(13, ' ')}${RESET} `;
    const avgStr = String(res.avgDelayMs).padStart(14, ' ');
    const maxStr = String(res.maxDelayMs).padStart(14, ' ');
    const p95Str = String(res.p95DelayMs).padStart(13, ' ');
    console.log(`${nameStr} | ${colStr} | ${avgStr} | ${maxStr} | ${p95Str}`);
  }

  console.log(`\n${DIM}Observation: Full Jitter and Decorrelated Jitter distribute retries smoothly across time, preventing catastrophic server re-saturation.${RESET}`);
}

async function runProxyCmd(args: string[]): Promise<void> {
  printBanner();
  const port = parseInt(getArgValue(args, '--port') || '8085', 10);
  const upstream = getArgValue(args, '--upstream');
  const capacity = parseInt(getArgValue(args, '--capacity') || '10', 10);
  const algo = (getArgValue(args, '--algo') || 'token-bucket') as RateLimiterAlgorithm;

  const proxy = new RateProxy({
    port,
    upstreamUrl: upstream,
    algorithm: algo,
    config: { capacity, refillRate: 2, windowMs: 5000 }
  });

  await proxy.start();
  console.log(`${GREEN}✔ RateSmith Throttling Reverse Proxy is active on port ${port}!${RESET}`);
  console.log(`  Target Upstream: ${upstream || `${DIM}Built-in Mock 200 API${RESET}`}`);
  console.log(`  Algorithm:       ${algo}`);
  console.log(`  Capacity:        ${capacity} requests (refill +2/s)`);
  console.log(`\n${CYAN}Send requests to: http://localhost:${port}/${RESET}\n`);

  proxy.on('request', (evt) => {
    const statusColor = evt.statusCode === 200 ? GREEN : RED;
    console.log(`[${new Date(evt.timestamp).toLocaleTimeString()}] ${evt.method} ${evt.url} -> ${statusColor}${evt.statusCode}${RESET} (Remaining: ${evt.remaining}, Retry-After: ${evt.retryAfterSeconds}s)`);
  });
}

function runGenerateCmd(args: string[]): void {
  printBanner();
  const fw = (getArgValue(args, '--framework') || 'nextjs') as FrameworkType;
  const gen = MiddlewareGenerator.generate(fw, 'token-bucket', 60, 60);

  console.log(`${CYAN}Generated ${gen.title} (${gen.filename}):${RESET}\n`);
  console.log(gen.code);
  console.log(`\n${DIM}Integration: ${gen.instructions}${RESET}`);
}

async function runStudioCmd(args: string[]): Promise<void> {
  printBanner();
  const port = parseInt(getArgValue(args, '--port') || '6767', 10);
  const studio = new StudioServer(port);
  await studio.start();

  console.log(`${GREEN}✔ RateSmith Bento Grid Web Studio launched successfully!${RESET}`);
  console.log(`  ${BOLD}URL:${RESET} ${CYAN}http://localhost:${port}/${RESET}`);
  console.log(`  Interactive Token Bucket, Jitter Visualizer, and Header Linter active.`);
  console.log(`  Press Ctrl+C to terminate studio session.`);
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function printHelp(): void {
  printBanner();
  console.log(`
${BOLD}USAGE:${RESET}
  $ ratesmith <command> [options]

${BOLD}COMMANDS:${RESET}
  ${CYAN}audit <url>${RESET}           Audit a live API endpoint for IETF RateLimit and 429 headers
  ${CYAN}sim [options]${RESET}         Simulate request burst behavior across rate limiter algorithms
  ${CYAN}jitter [options]${RESET}      Benchmark thundering herd retry collision rates across jitter models
  ${CYAN}proxy [options]${RESET}       Launch a local throttling reverse proxy and 429 generator
  ${CYAN}generate [options]${RESET}    Generate production rate limiter middleware for popular frameworks
  ${CYAN}studio [options]${RESET}      Start the embedded Bento Grid Web Studio on port 6767
  ${CYAN}help${RESET}                  Display this help manual

${BOLD}OPTIONS:${RESET}
  --algo <type>         Rate limiting algorithm (token-bucket, leaky-bucket, fixed-window, sliding-window)
  --capacity <num>      Maximum burst capacity / token ceiling (default: 10)
  --burst <num>         Number of consecutive requests to fire in simulation (default: 15)
  --workers <num>       Concurrent workers for jitter collision simulation (default: 100)
  --port <num>          Port to bind proxy or studio (default: 8085 for proxy, 6767 for studio)
  --upstream <url>      Target upstream server URL to forward non-throttled proxy requests to
  --framework <name>    Framework target for code generator (nextjs, express, fastify, cloudflare, hono, fastapi)
`);
}

if (process.argv[1]?.endsWith('cli.js')) {
  runCli();
}
