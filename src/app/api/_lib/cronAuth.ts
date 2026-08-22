import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/app/api/_lib/logger';

export interface CronAuthResult {
  authorized: boolean;
  response?: NextResponse;
}

/**
 * Validates CRON_SECRET authorization for cron route handlers.
 *
 * Rules:
 * 1. CRON_SECRET is a mandatory server-side environment variable.
 * 2. If CRON_SECRET is missing or empty -> returns HTTP 500 (Server Configuration Error).
 * 3. If Authorization header is missing or not exactly `Bearer <CRON_SECRET>` -> returns HTTP 401.
 * 4. Uses constant-time comparison via crypto.timingSafeEqual.
 * 5. Never exposes CRON_SECRET in response bodies, logs, or thrown errors.
 */
export function verifyCronAuth(req: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.trim() === '') {
    logger.error('CRON', 'CRON_SECRET environment variable is missing or unconfigured on server');
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: CRON_SECRET is not configured'
        },
        { status: 500 }
      )
    };
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

  if (!authHeader) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Missing Authorization header'
        },
        { status: 401 }
      )
    };
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  const authBuffer = Buffer.from(authHeader, 'utf-8');
  const expectedBuffer = Buffer.from(expectedHeader, 'utf-8');

  if (authBuffer.length !== expectedBuffer.length) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid authorization token'
        },
        { status: 401 }
      )
    };
  }

  const isMatch = crypto.timingSafeEqual(authBuffer, expectedBuffer);

  if (!isMatch) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Invalid authorization token'
        },
        { status: 401 }
      )
    };
  }

  return { authorized: true };
}
