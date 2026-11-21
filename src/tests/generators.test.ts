import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { MiddlewareGenerator } from '../generators/middlewareGen.js';
import { FrameworkType } from '../types.js';

describe('Multi-Framework Middleware Generator Suite', () => {
  const frameworks: FrameworkType[] = ['nextjs', 'express', 'fastify', 'cloudflare', 'hono', 'fastapi'];

  for (const fw of frameworks) {
    it(`should generate valid, production-ready middleware for ${fw}`, () => {
      const generated = MiddlewareGenerator.generate(fw, 'token-bucket', 50, 60);

      assert.strictEqual(generated.framework, fw);
      assert.ok(generated.filename.length > 0);
      assert.ok(generated.code.length > 100);
      assert.ok(generated.instructions.length > 0);

      // Verify core IETF headers and 429 status code are present
      assert.match(generated.code, /RateLimit-Limit/);
      assert.match(generated.code, /RateLimit-Remaining/);
      assert.match(generated.code, /429/);
      assert.match(generated.code, /Retry-After/);
    });
  }
});
