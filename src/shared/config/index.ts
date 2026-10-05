export const config = {
  env: process.env.NODE_ENV || 'development',
  razorpay: {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'support@saarthilife.com',
  },
  firebase: {
    adminKeyBase64: process.env.FIREBASE_ADMIN_KEY_BASE64 || '',
  },
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',

  // Helpers
  isDevelopment: () => config.env === 'development',
  isProduction: () => config.env === 'production',
  hasFirebaseAdmin: () => Boolean(config.firebase.adminKeyBase64),
  hasRazorpay: () => Boolean(config.razorpay.keyId && config.razorpay.keySecret),
};

// Basic validation on boot (can throw if required vars are missing in production)
if (config.isProduction()) {
  const missing = [];
  if (!config.hasRazorpay()) missing.push('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
  if (!config.hasFirebaseAdmin()) missing.push('FIREBASE_ADMIN_KEY_BASE64');
  
  if (missing.length > 0) {
    console.warn(`[CONFIG WARNING] Missing environment variables: ${missing.join(', ')}`);
  }
}
