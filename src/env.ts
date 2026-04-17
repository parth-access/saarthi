import dotenv from 'dotenv'

// Load ONLY .env.local
dotenv.config({ path: '.env.local' })

const key = process.env.FIREBASE_ADMIN_KEY_BASE64

if (!key) {
  console.error("❌ FIREBASE_ADMIN_KEY_BASE64 is missing")
} else {
  console.log("✅ ENV LOADED:", key.slice(0, 20))
}