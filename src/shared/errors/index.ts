export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // Restore prototype chain
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, metadata);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', metadata?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, metadata);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied', metadata?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, metadata);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, true, metadata);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, metadata);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', metadata?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, metadata);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, true, metadata);
  }
}

export class PaymentError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'PAYMENT_ERROR', 400, true, metadata);
  }
}

export class EmailError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'EMAIL_ERROR', 500, true, metadata);
  }
}

export class InfrastructureError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'INFRASTRUCTURE_ERROR', 500, false, metadata);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'INVALID_STATE_TRANSITION', 400, true, metadata);
  }
}
