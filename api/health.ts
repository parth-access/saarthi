import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { logger } from "./_lib/logger.js";
import { Resend } from "resend";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
      resend: 'unknown' // can't reliably test pinging Resend without sending, but auth is validated by presence
    },
    uptime: process.uptime()
  };

  try {
    // Quick Firestore test
    const snap = await adminDb.collection("therapists").limit(1).get();
    diagnostics.services.firestore = 'ok';
    
    if (process.env.RESEND_API_KEY) {
       diagnostics.services.resend = 'configured';
    } else {
       diagnostics.services.resend = 'missing_key';
    }

    logger.info('SYSTEM', 'Health check performed successfully', diagnostics);
    return res.status(200).json({ status: 'healthy', diagnostics });

  } catch (error: any) {
    diagnostics.services.firestore = 'error';
    diagnostics.lastError = error.message;
    logger.error('SYSTEM', 'Health check failed', error, diagnostics);
    return res.status(500).json({ status: 'unhealthy', diagnostics });
  }
}
