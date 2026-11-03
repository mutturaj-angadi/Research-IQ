import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createContentSecurityPolicy } from '../../lib/security/csp';

describe('Content Security Policy', () => {
  it('uses the request nonce and does not allow inline scripts in production', () => {
    const policy = createContentSecurityPolicy('test-nonce', true);
    const script = policy.split('; ').find((directive) => directive.startsWith('script-src')) ?? '';
    assert.ok(script.includes("'nonce-test-nonce'"));
    assert.ok(script.includes("'strict-dynamic'"));
    assert.ok(!script.includes("'unsafe-inline'"));
    assert.ok(policy.includes("object-src 'none'"));
    assert.ok(policy.includes("frame-ancestors 'none'"));
  });

  it('allows eval only for the Next.js development server', () => {
    const script = createContentSecurityPolicy('dev-nonce', false).split('; ').find((directive) => directive.startsWith('script-src')) ?? '';
    assert.ok(script.includes("'unsafe-eval'"));
    assert.ok(!createContentSecurityPolicy('prod-nonce', true).includes("'unsafe-eval'"));
  });
});
