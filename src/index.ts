import 'express-async-errors';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

import prisma from './config/database';
import { authMiddleware, adminMiddleware } from './middleware/auth';

// Routes
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import clientRoutes from './routes/clients';
import estimateRoutes from './routes/estimates';
import contractRoutes from './routes/contracts';
import invoiceRoutes from './routes/invoices';
import paymentRoutes from './routes/payments';
import appointmentRoutes from './routes/appointments';
import slotRoutes from './routes/slots';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Protected routes (require authentication)
app.use('/api/clients', authMiddleware, adminMiddleware, clientRoutes);
app.use('/api/estimates', authMiddleware, adminMiddleware, estimateRoutes);
app.use('/api/contracts', authMiddleware, adminMiddleware, contractRoutes);
app.use('/api/invoices', authMiddleware, adminMiddleware, invoiceRoutes);
app.use('/api/payments', authMiddleware, adminMiddleware, paymentRoutes);
app.use('/api/appointments', authMiddleware, adminMiddleware, appointmentRoutes);
app.use('/api/slots', authMiddleware, adminMiddleware, slotRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL?.split('/').pop()}`);
});

export default app;
