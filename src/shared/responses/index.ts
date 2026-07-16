import { NextResponse } from 'next/server';
import { AppError } from '../errors';

export function successResponse(data: unknown = {}, meta: unknown = {}, requestId?: string, status = 200) {
  return NextResponse.json({
    success: true,
    data,
    meta,
    requestId
  }, { status });
}

export function errorResponse(error: unknown, requestId?: string) {
  if (error instanceof AppError) {
    return NextResponse.json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.metadata || {}
      },
      requestId
    }, { status: error.statusCode });
  }

  // Fallback for unknown errors
  return NextResponse.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: {}
    },
    requestId
  }, { status: 500 });
}
