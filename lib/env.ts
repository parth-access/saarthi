import { z } from 'zod';

const envSchema = z.object({
  // Firebase
  FIREBASE_ADMIN_KEY_BASE64: z.string().min(1),
  
  // Resend
  RESEND_API_KEY: z.string().min(1),
  
  // Admin
  ADMIN_SECRET_KEY: z.string().min(8),
  BOOTSTRAP_ADMIN_EMAILS: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('a-very-long-and-secure-fallback-secret-key-123'),
  
  // Redis (for Rate Limiting)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  
  // QStash (for Background Jobs)
  QSTASH_TOKEN: z.string().min(1).optional(),
  QSTASH_URL: z.string().url().optional(),

  // Sentry
  VITE_SENTRY_DSN: z.string().url().optional(),
  
  // Node Env
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const validateEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.issues.map(issue => issue.path.join('.')).join(', ');
      console.error(`❌ Invalid environment variables: ${missing}`);
    } else {
      console.error('❌ Environment validation failed');
    }
    // In production, we want to crash if critical envs are missing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return process.env;
  }
};

export const env = validateEnv() as z.infer<typeof envSchema>;
