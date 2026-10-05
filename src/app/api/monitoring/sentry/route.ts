import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export async function GET(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const testSecret = process.env.SENTRY_TEST_SECRET;
  const providedSecret = req.headers.get('x-sentry-test-secret');

  // Strictly block in production unless explicitly authorized with a secret key
  if (!isDev && (!testSecret || providedSecret !== testSecret)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    let eventId = '';
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'monitoring');
      scope.setTag('operation', 'sentry-verification');
      scope.setExtra('timestamp', new Date().toISOString());
      scope.setExtra('environment', process.env.NODE_ENV);
      
      eventId = Sentry.captureException(
        new Error('Saarthi Sentry Verification: Test error generated successfully')
      );
    });

    return NextResponse.json({
      success: true,
      message: 'Sentry test event dispatched successfully',
      eventId: eventId || 'dispatched',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
