import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { simpleAuth } from './middleware/auth';
import weatherRoutes from './routes/weather';
import rachioRoutes from './routes/rachio';
import automationRoutes from './routes/automation';
import { startScheduler } from './jobs/scheduler';

dotenv.config();

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes (require authentication)
  app.use('/api/weather', simpleAuth, weatherRoutes);
  app.use('/api/rachio', simpleAuth, rachioRoutes);
  app.use('/api/automations', simpleAuth, automationRoutes);

  return app;
}

export function startServer(): void {
  const app = createServer();
  const port = parseInt(process.env.PORT || '3001', 10);

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  // Start job scheduler
  startScheduler();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

