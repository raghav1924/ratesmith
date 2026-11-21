/**
 * RateSmith Embedded Bento Grid Web Studio & Interactive Telemetry HUD
 * Runs locally on Port 6767 with zero external runtime dependencies.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'node:http';
import { URL } from 'node:url';
import { TokenBucketRateLimiter } from '../core/algorithms.js';
import { JitterCalculator } from '../core/jitter.js';
import { RateLimitLinter } from '../core/linter.js';
import { MiddlewareGenerator } from '../generators/middlewareGen.js';
import { FrameworkType, JitterStrategy } from '../types.js';

export class StudioServer {
  private server: http.Server | null = null;
  readonly port: number;
  private demoLimiter: TokenBucketRateLimiter;

  constructor(port = 6767) {
    this.port = port;
    this.demoLimiter = new TokenBucketRateLimiter({ capacity: 15, refillRate: 3, windowMs: 5000 });
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.route(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, () => {
        resolve(this.port);
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

  private route(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);

    // CORS & Common Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderHtml());
      return;
    }

    if (url.pathname === '/api/consume') {
      const burst = parseInt(url.searchParams.get('burst') || '1', 10);
      const results = [];
      for (let i = 0; i < burst; i++) {
        results.push(this.demoLimiter.consume('studio-demo-client'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ burst, lastResult: results[results.length - 1], history: results }));
      return;
    }

    if (url.pathname === '/api/state') {
      const state = this.demoLimiter.getState('studio-demo-client');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ capacity: this.demoLimiter.capacity, ...state }));
      return;
    }

    if (url.pathname === '/api/reset') {
      this.demoLimiter.reset();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'reset', capacity: this.demoLimiter.capacity }));
      return;
    }

    if (url.pathname === '/api/jitter-sim') {
      const workers = parseInt(url.searchParams.get('workers') || '100', 10);
      const comparisons = JitterCalculator.compareAllStrategies(workers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(comparisons));
      return;
    }

    if (url.pathname === '/api/audit' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const status = parsed.status || 429;
          const headers = parsed.headers || {};
          const audit = RateLimitLinter.lint(status, headers, parsed.url || 'https://api.example.com');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(audit));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    if (url.pathname === '/api/codegen') {
      const framework = (url.searchParams.get('framework') || 'nextjs') as FrameworkType;
      const code = MiddlewareGenerator.generate(framework, 'token-bucket', 60, 60);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(code));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RateSmith Studio — API Rate Limiter & Jitter HUD</title>
  <style>
    :root {
      --bg: #070a0f;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(51, 65, 85, 0.6);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --cyan: #06b6d4;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --indigo: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      width: 36px; height: 36px; border-radius: 8px;
      background: linear-gradient(135deg, var(--cyan), var(--indigo));
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 20px; color: #fff;
    }
    .brand h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .badge {
      display: inline-block; padding: 3px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      background: rgba(6, 182, 212, 0.15); color: var(--cyan); border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .author-badge {
      font-size: 13px; color: var(--text-muted); text-decoration: none;
      display: flex; align-items: center; gap: 6px;
    }
    .author-badge span { color: var(--emerald); font-weight: 600; }

    /* Bento Grid Layout */
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 20px;
    }
    .cell {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .cell-title {
      font-size: 14px; font-weight: 600; color: var(--text-muted);
      margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;
    }

    /* Cell Spanning */
    .col-4 { grid-column: span 4; }
    .col-8 { grid-column: span 8; }
    .col-6 { grid-column: span 6; }
    .col-12 { grid-column: span 12; }

    /* Bucket Visualizer */
    .bucket-visualizer {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    .bucket-container {
      width: 140px; height: 180px; border: 3px solid var(--cyan);
      border-top: none; border-radius: 0 0 16px 16px;
      position: relative; overflow: hidden; background: rgba(6, 182, 212, 0.05);
      box-shadow: 0 0 20px rgba(6, 182, 212, 0.2);
    }
    .bucket-water {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(180deg, var(--cyan), var(--indigo));
      transition: height 0.3s ease; opacity: 0.85;
    }
    .bucket-metrics {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%;
    }
    .metric-card {
      background: rgba(0,0,0,0.3); border: 1px solid var(--card-border);
      border-radius: 8px; padding: 10px; text-align: center;
    }
    .metric-val { font-size: 20px; font-weight: 700; font-family: monospace; }
    .metric-lbl { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

    /* Buttons */
    .btn-group { display: flex; gap: 10px; width: 100%; margin-top: 10px; }
    .btn {
      flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; font-size: 13px;
      cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
    }
    .btn-primary { background: var(--cyan); color: #000; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text-main); border-color: var(--card-border); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .btn-danger { background: rgba(244, 63, 94, 0.2); color: var(--rose); border-color: rgba(244, 63, 94, 0.4); }

    /* Jitter Chart */
    .jitter-bars {
      display: flex; align-items: flex-end; gap: 4px; height: 140px;
      padding: 10px 0; border-bottom: 1px solid var(--card-border);
    }
    .jitter-bar-col {
      flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end;
    }
    .jitter-bar {
      width: 100%; background: var(--indigo); border-radius: 3px 3px 0 0;
      transition: height 0.4s ease; min-height: 2px;
    }
    .bar-lbl { font-size: 9px; color: var(--text-muted); margin-top: 4px; }

    /* Code & Tabs */
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
    .tab {
      padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; background: rgba(255,255,255,0.05); color: var(--text-muted);
      border: 1px solid transparent;
    }
    .tab.active { background: rgba(6, 182, 212, 0.15); color: var(--cyan); border-color: rgba(6, 182, 212, 0.3); }
    pre {
      background: #000; border: 1px solid var(--card-border); border-radius: 8px;
      padding: 14px; font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 12px; overflow-x: auto; color: #a5f3fc; max-height: 280px;
    }

    /* Linter Form */
    .linter-input {
      width: 100%; height: 80px; background: #000; border: 1px solid var(--card-border);
      border-radius: 8px; color: var(--text-main); font-family: monospace; font-size: 12px;
      padding: 10px; margin-bottom: 10px; resize: none;
    }
    .audit-result {
      background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; margin-top: 10px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-logo">R</div>
      <div>
        <h1>RateSmith <span class="badge">v1.0.0</span></h1>
        <p style="font-size: 12px; color: var(--text-muted);">API Rate Limiter, IETF Header Linter & Jitter Simulator</p>
      </div>
    </div>
    <a href="https://jatinsh.netlify.app/" target="_blank" class="author-badge">
      Engineered by <span>Jatin Sharma</span>
    </a>
  </header>

  <div class="bento-grid">
    <!-- 1. Interactive Token Bucket Visualizer -->
    <div class="cell col-4">
      <div class="cell-title">
        <span>TOKEN BUCKET EMULATOR</span>
        <span class="badge" id="rate-badge">READY</span>
      </div>
      <div class="bucket-visualizer">
        <div class="bucket-container">
          <div class="bucket-water" id="bucket-fill" style="height: 100%;"></div>
        </div>
        <div class="bucket-metrics">
          <div class="metric-card">
            <div class="metric-val" id="metric-remaining" style="color: var(--cyan);">15</div>
            <div class="metric-lbl">REMAINING</div>
          </div>
          <div class="metric-card">
            <div class="metric-val" style="color: var(--emerald);">15</div>
            <div class="metric-lbl">CAPACITY</div>
          </div>
          <div class="metric-card">
            <div class="metric-val" style="color: var(--amber);">+3/s</div>
            <div class="metric-lbl">REFILL</div>
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" onclick="consumeBurst(1)">Consume 1</button>
          <button class="btn btn-primary" onclick="consumeBurst(5)">Burst 5</button>
          <button class="btn btn-danger" onclick="consumeBurst(15)">Deplete 15</button>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="resetBucket()">Reset Tokens</button>
        </div>
      </div>
    </div>

    <!-- 2. Thundering Herd Jitter Simulator -->
    <div class="cell col-8">
      <div class="cell-title">
        <span>THUNDERING HERD JITTER SIMULATION (100 WORKERS RETRYING POST-429)</span>
        <span class="badge" style="color: var(--indigo); border-color: var(--indigo);">AWS FULL JITTER SPEC</span>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Comparing collision density across retry strategies. Full and Decorrelated Jitter eliminate synchronized thundering herd spikes on recovered backends.
      </p>
      <div class="jitter-bars" id="jitter-chart"></div>
      <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px;">
        <div>Collision Rate: <strong id="jitter-collision" style="color: var(--emerald);">0%</strong></div>
        <div>Avg Backoff: <strong id="jitter-avg" style="color: var(--cyan);">0 ms</strong></div>
        <div>p95 Latency: <strong id="jitter-p95" style="color: var(--amber);">0 ms</strong></div>
      </div>
      <div class="btn-group" style="margin-top: 14px;">
        <button class="btn btn-secondary" onclick="loadJitter('no-jitter')">No Jitter (Spike)</button>
        <button class="btn btn-secondary" onclick="loadJitter('full-jitter')">Full Jitter</button>
        <button class="btn btn-secondary" onclick="loadJitter('equal-jitter')">Equal Jitter</button>
        <button class="btn btn-secondary" onclick="loadJitter('decorrelated-jitter')">Decorrelated Jitter</button>
      </div>
    </div>

    <!-- 3. IETF RateLimit Header Linter -->
    <div class="cell col-6">
      <div class="cell-title">
        <span>IETF RATELIMIT & 429 LINTER</span>
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="runAudit()">Run Audit</button>
      </div>
      <textarea class="linter-input" id="linter-headers">HTTP/1.1 429 Too Many Requests
Retry-After: 60
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 60
RateLimit-Policy: 100;w=60</textarea>
      <div class="audit-result" id="audit-output">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 700;">Compliance Grade: <strong id="audit-grade" style="color: var(--emerald);">A+</strong> (100/100)</span>
          <span class="badge" id="audit-ietf">IETF COMPLIANT</span>
        </div>
        <div id="audit-issues" style="font-size: 12px; margin-top: 8px; color: var(--text-muted);">
          No protocol violations detected. All required retry and quota headers adhere to standards.
        </div>
      </div>
    </div>

    <!-- 4. Multi-Framework Middleware Synthesizer -->
    <div class="cell col-6">
      <div class="cell-title">
        <span>PRODUCTION MIDDLEWARE GENERATOR</span>
        <span class="badge">ZERO EXTERNAL DEPS</span>
      </div>
      <div class="tabs">
        <div class="tab active" onclick="loadCode('nextjs', this)">Next.js 15</div>
        <div class="tab" onclick="loadCode('express', this)">Express.js</div>
        <div class="tab" onclick="loadCode('fastify', this)">Fastify</div>
        <div class="tab" onclick="loadCode('cloudflare', this)">Cloudflare</div>
        <div class="tab" onclick="loadCode('hono', this)">Hono</div>
        <div class="tab" onclick="loadCode('fastapi', this)">FastAPI</div>
      </div>
      <pre id="code-output">// Loading production middleware...</pre>
    </div>
  </div>

  <script>
    let currentJitterData = null;

    async function pollState() {
      try {
        const res = await fetch('/api/state');
        const data = await res.json();
        const fillPercent = Math.min(100, Math.max(0, (data.remaining / data.capacity) * 100));
        document.getElementById('bucket-fill').style.height = fillPercent + '%';
        document.getElementById('metric-remaining').textContent = data.remaining;
        const badge = document.getElementById('rate-badge');
        if (data.remaining === 0) {
          badge.textContent = 'THROTTLED (429)';
          badge.style.color = 'var(--rose)';
          badge.style.borderColor = 'var(--rose)';
        } else {
          badge.textContent = 'READY';
          badge.style.color = 'var(--cyan)';
          badge.style.borderColor = 'var(--cyan)';
        }
      } catch (e) {}
    }

    async function consumeBurst(n) {
      await fetch('/api/consume?burst=' + n);
      pollState();
    }

    async function resetBucket() {
      await fetch('/api/reset');
      pollState();
    }

    async function loadJitter(strategy) {
      if (!currentJitterData) {
        const res = await fetch('/api/jitter-sim');
        currentJitterData = await res.json();
      }
      const data = currentJitterData[strategy];
      if (!data) return;

      document.getElementById('jitter-collision').textContent = data.collisionRate + '%';
      document.getElementById('jitter-collision').style.color = data.collisionRate > 50 ? 'var(--rose)' : 'var(--emerald)';
      document.getElementById('jitter-avg').textContent = data.avgDelayMs + ' ms';
      document.getElementById('jitter-p95').textContent = data.p95DelayMs + ' ms';

      const chart = document.getElementById('jitter-chart');
      chart.innerHTML = '';
      const buckets = data.distributionBuckets.slice(0, 30);
      const maxCount = Math.max(1, ...buckets.map(b => b.count));

      buckets.forEach(b => {
        const col = document.createElement('div');
        col.className = 'jitter-bar-col';
        const bar = document.createElement('div');
        bar.className = 'jitter-bar';
        const heightPct = (b.count / maxCount) * 100;
        bar.style.height = Math.max(4, heightPct) + '%';
        if (data.collisionRate > 50 && b.count > maxCount * 0.7) {
          bar.style.background = 'var(--rose)';
        } else {
          bar.style.background = 'linear-gradient(180deg, var(--cyan), var(--indigo))';
        }
        col.appendChild(bar);
        const lbl = document.createElement('div');
        lbl.className = 'bar-lbl';
        lbl.textContent = b.bucketSec % 5 === 0 ? b.bucketSec + 's' : '';
        col.appendChild(lbl);
        chart.appendChild(col);
      });
    }

    async function runAudit() {
      const text = document.getElementById('linter-headers').value;
      const lines = text.split('\\n');
      let status = 200;
      const headers = {};
      lines.forEach(line => {
        if (line.startsWith('HTTP/')) {
          const parts = line.split(' ');
          if (parts[1]) status = parseInt(parts[1], 10);
        } else if (line.includes(':')) {
          const idx = line.indexOf(':');
          const k = line.substring(0, idx).trim();
          const v = line.substring(idx + 1).trim();
          headers[k] = v;
        }
      });

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, headers })
      });
      const data = await res.json();
      document.getElementById('audit-grade').textContent = data.grade;
      const gradeEl = document.getElementById('audit-grade');
      if (data.grade === 'A+' || data.grade === 'A') gradeEl.style.color = 'var(--emerald)';
      else if (data.grade === 'B') gradeEl.style.color = 'var(--amber)';
      else gradeEl.style.color = 'var(--rose)';

      document.getElementById('audit-ietf').textContent = data.ietfCompliant ? 'IETF COMPLIANT' : 'NON-COMPLIANT';
      const issuesDiv = document.getElementById('audit-issues');
      if (data.issues.length === 0) {
        issuesDiv.innerHTML = '<span style="color: var(--emerald);">✔ No protocol violations detected. Perfect score.</span>';
      } else {
        issuesDiv.innerHTML = data.issues.map(i => '<div style="margin-top: 4px; color: var(--rose);">[' + i.code + '] ' + i.message + '</div>').join('');
      }
    }

    async function loadCode(framework, el) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      if (el) el.classList.add('active');
      const res = await fetch('/api/codegen?framework=' + framework);
      const data = await res.json();
      document.getElementById('code-output').textContent = data.code;
    }

    setInterval(pollState, 1000);
    pollState();
    loadJitter('full-jitter');
    loadCode('nextjs');
  </script>
</body>
</html>`;
  }
}
