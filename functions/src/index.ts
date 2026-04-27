import * as functions from 'firebase-functions';
import express from 'express';
import cors from 'cors';
import { handleError } from './utils/error';

// Import Routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import { verifyUser, requireAdmin } from './middleware/auth';

const app = express();

// Middleware
app.use(cors({ 
  origin: true, // Allows requests from any origin (e.g., localhost:5173 and Vercel domains)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true 
}));
app.options('*', cors()); // Pre-flight across the board

app.use(express.json());

// Main Health Route
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'saarthi-api-functions' });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/admin', verifyUser, requireAdmin, adminRoutes);

// Bookings that require user verification
const protectedBookings = express.Router();
protectedBookings.use(verifyUser);
protectedBookings.get('/get', (req, res) => {
  res.json({ success: true, data: { bookings: [] } });
});
protectedBookings.post('/update', (req, res) => {
  res.json({ success: true });
});
protectedBookings.post('/create', (req, res) => {
  res.json({ success: true });
});
app.use('/bookings', protectedBookings);

app.get('/therapists/get', (req, res) => {
  res.json({ success: true, data: [] });
});

app.get('/availability/get', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/availability/lock', (req, res) => {
  res.json({ success: true, data: { locked: true } });
});

app.post('/contact/send', (req, res) => {
  res.json({ success: true });
});

// Fallback for not-yet-implemented routes to avoid compilation errors 
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

