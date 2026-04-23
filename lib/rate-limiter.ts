import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { AppError } from "./utils/error.js";
import { env } from "./env.js";

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export type Limiter = {
  limit: (ip: string) => Promise<RateLimitResult>;
};

// Initialize Redis only if environment variables are set
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// Fallback implementation if no Redis configured
const createLimiter = (maxRequests: number, windowMs: number): Limiter => {
  if (!redis) {
    if (env.NODE_ENV === 'production') {
      console.warn('❌ Redis not configured in PRODUCTION. Rate limiting is DISABLED.');
    }
    
    return { 
      limit: async () => ({ 
        success: true,
        limit: maxRequests,
        remaining: maxRequests,
        reset: Date.now() + windowMs
      }) 
    };
  }
  
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${Math.floor(windowMs / 1000)} s`),
  });

  return {
    limit: async (ip: string) => {
      const result = await ratelimit.limit(ip);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    }
  };
};

export const LIMITS = {
  BOOKING: { maxRequests: 5, windowMs: 60 * 1000 },
  LOCK: { maxRequests: 10, windowMs: 60 * 1000 },
  CONTACT: { maxRequests: 3, windowMs: 60 * 1000 },
};

const limiters: Record<string, Limiter> = {
  BOOKING: createLimiter(LIMITS.BOOKING.maxRequests, LIMITS.BOOKING.windowMs),
  LOCK: createLimiter(LIMITS.LOCK.maxRequests, LIMITS.LOCK.windowMs),
  CONTACT: createLimiter(LIMITS.CONTACT.maxRequests, LIMITS.CONTACT.windowMs),
};

export async function rateLimit(ip: string, limitConfig: typeof LIMITS.BOOKING) {
  // Identify the correct limiter
  let limiter: Limiter;
  
  if (limitConfig === LIMITS.BOOKING) {
    limiter = limiters.BOOKING;
  } else if (limitConfig === LIMITS.LOCK) {
    limiter = limiters.LOCK;
  } else if (limitConfig === LIMITS.CONTACT) {
    limiter = limiters.CONTACT;
  } else {
    // Dynamic limiter for unlisted configs
    limiter = createLimiter(limitConfig.maxRequests, limitConfig.windowMs);
  }

  const { success, limit, reset, remaining } = await limiter.limit(ip);

  if (!success) {
    throw new AppError('Too many requests. Please try again later.', 429);
  }

  return { success, limit, reset, remaining };
}
