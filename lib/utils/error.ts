import { logger } from '../logger.js';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(res: any, error: any) {
  const meta = {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
  };

  if (error instanceof AppError) {
    logger.warn(`AppError: ${error.message}`, meta);
    return res.status(error.statusCode).json({
      success: false,
      data: null,
      error: error.message,
      code: error.code
    });
  }

  // Zod Error handling
  if (error.name === 'ZodError' || error.name === 'ValidationError') {
    logger.warn(`Validation Error: ${error.message}`, meta);
    return res.status(400).json({
      success: false,
      data: null,
      error: 'Validation failed',
      details: error.errors || error.message
    });
  }

  // Default error
  logger.error('Unexpected System Error', meta, error);
  return res.status(500).json({
    success: false,
    data: null,
    error: process.env.NODE_ENV === 'production' 
      ? 'An internal server error occurred' 
      : error.message
  });
}
