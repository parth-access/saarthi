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
  console.error(`[API ERROR] ${error.name}: ${error.message}`, error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }

  // Zod Error handling
  if (error.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.errors
    });
  }

  // Default error
  return res.status(500).json({
    success: false,
    error: 'An internal server error occurred'
  });
}
