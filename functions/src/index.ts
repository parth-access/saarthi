import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { handleError } from './utils/error';

// Routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';

const app = express();

/**
 * 🔥 GLOBAL CORS FIX (CRITICAL)
 * This MUST come before everything
 */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  // Handle preflight manually
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  next();
});

/**
 * Optional (safe fallback)
 * Not relied upon, but harmless
 */
app.use(cors());

app.use(express.json());

/**
 * Health check
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'saarthi-api-functions',
  });
});

/**
 * API Routes
 * Final URLs:
 * https://...cloudfunctions.net/api/auth/...
 */
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

/**
 * Temporary placeholders
 */
app.use('/therapist', (req, res) => res.json({ message: 'Placeholder' }));
app.use('/bookings', (req, res) => res.json({ message: 'Placeholder' }));
app.use('/availability', (req, res) => res.json({ message: 'Placeholder' }));

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

/**
 * Global error handler
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  handleError(res, err);
});

/**
 * Export Firebase Function
 */
export const api = functions.https.onRequest(app);