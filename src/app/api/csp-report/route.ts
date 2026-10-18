import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '../_lib/rateLimit';
import { logger } from '../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Receives Content-Security-Policy violation reports from browsers (the
 * report-only policy in vercel.json). Reports are logged so we can see what a
 * stricter policy WOULD block before enforcing it. Unauthenticated by nature,
 * so it is size-capped, rate-limited, and only a few fields are logged.
 */
const MAX_BYTES = 8_000;

function pickReport(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  // Legacy `report-uri` format: { "csp-report": {...} }; Reporting API: [{ body: {...} }]
  const raw =
    (body as Record<string, unknown>)['csp-report'] ??
    (Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined)?.body : undefined);
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : undefined);
  return {
    directive: s(r['violated-directive'] ?? r['effectiveDirective'] ?? r['effective-directive']),
    blocked: s(r['blocked-uri'] ?? r['blockedURL']),
    page: s(r['document-uri'] ?? r['documentURL']),
    source: s(r['source-file'] ?? r['sourceFile']),
    sample: s(r['script-sample'] ?? r['sample']),
  };
}

export async function POST(req: Request) {
  if (!checkRateLimit(getClientIp(req), 'csp_report', 30, 60_000).success) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return new NextResponse(null, { status: 204 });
    const report = pickReport(JSON.parse(text));
    if (report) logger.warn('SYSTEM', 'CSP violation (report-only)', report);
  } catch {
    /* malformed report — ignore */
  }
  return new NextResponse(null, { status: 204 });
}
