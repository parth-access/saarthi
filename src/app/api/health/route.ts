import { NextResponse } from "next/server";
import { adminDb } from '@/lib/firebase/admin';
import { logger } from "../_lib/logger";

export async function GET(request: Request) {
  const diagnostics: Record<string, any> = {
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

  try {
    const snap = await adminDb.collection("therapists").limit(1).get();
    diagnostics.services.firestore = 'ok';
    
    if (process.env.RESEND_API_KEY) {
       diagnostics.services.resend = 'configured';
    } else {
       diagnostics.services.resend = 'missing_key';
    }

    logger.info('SYSTEM', 'Health check performed successfully', diagnostics);
    return NextResponse.json({ status: 'healthy', diagnostics }, { status: 200 });

  } catch (error: any) {
    diagnostics.services.firestore = 'error';
    diagnostics.lastError = error.message;
    logger.error('SYSTEM', 'Health check failed', error, diagnostics);
    return NextResponse.json({ status: 'unhealthy', diagnostics }, { status: 500 });
  }
}
