import { describe, it, expect } from 'vitest';
import { SecurityAuditor } from '../src/auditors/security.js';
import type { PageData } from '../src/types.js';

function createMockPage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com',
    statusCode: 200,
    responseTimeMs: 100,
    contentType: 'text/html',
    contentLength: 1000,
    html: '<html><head><title>Test</title></head><body>Hello</body></html>',
    headers: {},
    redirectChain: [],
    ...overrides,
  };
}

describe('SecurityAuditor', () => {
  const auditor = new SecurityAuditor();

  it('detects missing HSTS header', () => {
    const page = createMockPage({ headers: {} });
    const { issues, headers } = auditor.audit(page);
    expect(headers.hasHSTS).toBe(false);
    expect(issues.some(i => i.rule === 'no-hsts')).toBe(true);
  });

  it('passes HSTS check when header is present', () => {
    const page = createMockPage({
      headers: { 'strict-transport-security': 'max-age=31536000' },
    });
    const { issues, headers } = auditor.audit(page);
    expect(headers.hasHSTS).toBe(true);
    expect(issues.some(i => i.rule === 'no-hsts')).toBe(false);
  });

  it('detects missing CSP header', () => {
    const page = createMockPage({ headers: {} });
    const { issues } = auditor.audit(page);
    expect(issues.some(i => i.rule === 'no-csp')).toBe(true);
  });

  it('detects missing X-Frame-Options header', () => {
    const page = createMockPage({ headers: {} });
    const { issues } = auditor.audit(page);
    expect(issues.some(i => i.rule === 'no-xframe')).toBe(true);
  });

  it('detects missing X-Content-Type-Options header', () => {
    const page = createMockPage({ headers: {} });
    const { issues } = auditor.audit(page);
    expect(issues.some(i => i.rule === 'no-xcontent')).toBe(true);
  });

  it('detects non-HTTPS pages', () => {
    const page = createMockPage({ url: 'http://example.com' });
    const { issues } = auditor.audit(page);
    expect(issues.some(i => i.rule === 'no-https')).toBe(true);
  });

  it('does not flag HTTPS pages for no-https', () => {
    const page = createMockPage({ url: 'https://example.com' });
    const { issues } = auditor.audit(page);
    expect(issues.some(i => i.rule === 'no-https')).toBe(false);
  });

  it('detects X-Powered-By leaking technology', () => {
    const page = createMockPage({
      headers: { 'x-powered-by': 'Express' },
    });
    const { issues, headers } = auditor.audit(page);
    expect(headers.poweredBy).toBe('Express');
    expect(issues.some(i => i.rule === 'powered-by')).toBe(true);
  });

  it('detects server header exposure', () => {
    const page = createMockPage({
      headers: { server: 'nginx/1.18' },
    });
    const { issues, headers } = auditor.audit(page);
    expect(headers.server).toBe('nginx/1.18');
    expect(issues.some(i => i.rule === 'server-header')).toBe(true);
  });

  it('reports no issues when all security headers present', () => {
    const page = createMockPage({
      url: 'https://secure.example.com',
      headers: {
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin',
        'permissions-policy': 'camera=()',
      },
    });
    const { issues } = auditor.audit(page);
    expect(issues.length).toBe(0);
  });
});
