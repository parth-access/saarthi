import { NextResponse } from "next/server";
import { adminDb } from '@/lib/firebase/admin';
import { logger } from "../_lib/logger";
import { requireAdmin } from "@/lib/auth/requireRole";

interface Diagnostics {
  env: Record<string, boolean>;
  services: Record<string, string>;
  uptime: number;
  lastError?: string;
}

export async function GET(request: Request) {
  const diagnostics: Diagnostics = {
    env: {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      APP_URL: !!process.env.APP_URL,
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
    },
    services: {
      firestore: 'unknown',
      resend: 'unknown'
    },
    uptime: process.uptime()
  };

  let healthy = true;
  try {
    await adminDb.collection("therapists").limit(1).get();
    diagnostics.services.firestore = 'ok';

    diagnostics.services.resend = process.env.RESEND_API_KEY ? 'configured' : 'missing_key';
  } catch (error) {
    healthy = false;
    diagnostics.services.firestore = 'error';
    diagnostics.lastError = (error instanceof Error ? error.message : String(error));
    logger.error('SYSTEM', 'Health check failed', error, diagnostics);
  }

  // Full diagnostics are admin-only; the public body stays minimal so uptime
  // monitors keep working without leaking configuration detail.
  const authResult = await requireAdmin(request);
  const isAdmin = !(authResult instanceof NextResponse);
  const body = isAdmin
    ? { status: healthy ? 'healthy' : 'unhealthy', diagnostics }
    : { status: healthy ? 'healthy' : 'unhealthy' };

  logger.info('SYSTEM', 'Health check performed', { healthy, adminDiagnosticsServed: isAdmin });

  return NextResponse.json(body, { status: healthy ? 200 : 500 });
}
