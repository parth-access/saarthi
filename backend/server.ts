import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleError } from '../lib/utils/error.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import therapistRoutes from './routes/therapist.js';
import bookingsRoutes from './routes/bookings.js';
import availabilityRoutes from './routes/availability.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Main Health Route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'saarthi-api', environment: process.env.NODE_ENV });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/therapist', therapistRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  handleError(res, err);
});

// Start Server (If not running in Vercel)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

export default app;
