import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { handleError } from './utils/error';

// Import Routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
// import therapistRoutes from './routes/therapist';
// import bookingsRoutes from './routes/bookings';
// import availabilityRoutes from './routes/availability';

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Main Health Route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'saarthi-api-functions' });
});

// API Routes
// Note: In Firebase functions, if the function is named 'api', 
// your base URL will end with /api. 
// So these routes will be mapped to /api/auth, /api/admin, etc.
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Fallback for not-yet-implemented routes to avoid compilation errors 
// while you paste your migrated files
app.use('/therapist', (req, res) => res.json({ message: 'Placeholder' }));
app.use('/bookings', (req, res) => res.json({ message: 'Placeholder' }));
app.use('/availability', (req, res) => res.json({ message: 'Placeholder' }));

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  handleError(res, err);
});

// Export the express app as a Firebase Function
// This creates an endpoint named 'api' -> https://<region>-<project-id>.cloudfunctions.net/api
export const api = functions.https.onRequest(app);
