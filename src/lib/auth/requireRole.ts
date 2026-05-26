import { NextResponse } from 'next/server';
import { verifySession, DecodedSessionInfo } from './verifySession';

export async function requireAuthenticated(request: Request): Promise<DecodedSessionInfo | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

export async function requireTherapist(request: Request): Promise<DecodedSessionInfo | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'therapist' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Therapist role required' }, { status: 403 });
  }
  return session;
}

export async function requireAdmin(request: Request): Promise<DecodedSessionInfo | NextResponse> {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: Admin role required' }, { status: 403 });
  }
  return session;
}
