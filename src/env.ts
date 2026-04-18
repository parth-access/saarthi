import dotenv from 'dotenv'

// Only load .env.local in development/local environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' })
}

const key = process.env.FIREBASE_ADMIN_KEY_BASE64

if (!key) {
  console.warn("⚠️ FIREBASE_ADMIN_KEY_BASE64 is missing in current environment")
} else {
  console.log("✅ ENV LOADED (Admin Key Available)")
}
