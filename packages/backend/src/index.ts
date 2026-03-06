import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { initBlobKit } from './blobkit';
import { getDb } from './db';
import { logger } from './logger';

import datasetRoutes from './routes/datasets';
import licenseRoutes from './routes/licenses';
import blobRoutes from './routes/blobs';
import walletRoutes from './routes/wallet';

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/datasets', datasetRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/blobs', blobRoutes);
app.use('/api/wallet', walletRoutes);

// Health check
app.get('/health', async (_req, res) => {
  try {
    const db = getDb();
    const datasets = db.prepare('SELECT COUNT(*) as count FROM datasets').get() as { count: number };
    const purchases = db.prepare('SELECT COUNT(*) as count FROM purchases').get() as { count: number };
    const jobs = db.prepare('SELECT COUNT(*) as count FROM blob_jobs').get() as { count: number };

    return res.json({
      status: 'healthy',
      version: '0.1.0',
      chainId: config.chainId,
      proxy: config.proxyUrl,
      db: {
        datasets: datasets.count,
        purchases: purchases.count,
        blobJobs: jobs.count,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    validateConfig();
    logger.info('Config validated');

    getDb();
    logger.info('Database initialized');

    await initBlobKit();
    logger.info('BlobKit initialized');

    app.listen(config.port, () => {
      logger.info(`BlobFS backend running`, {
        port: config.port,
        chainId: config.chainId,
        proxy: config.proxyUrl,
      });
    });

  } catch (err: any) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
}

start();