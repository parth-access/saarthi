import { Response } from 'express';

export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(res: Response, error: unknown) {
  console.error('API Error:', error);
  
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message
    });
  }
  
  return res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
}
