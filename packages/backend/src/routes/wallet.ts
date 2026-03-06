import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { getBlobKit } from '../blobkit';
import { getDb } from '../db';
import { logger } from '../logger';

const router = Router();

// GET /api/wallet/balance
router.get('/balance', async (_req: Request, res: Response) => {
  try {
    const blobkit = await getBlobKit();

    const address = await blobkit.getAddress();
    const balanceWei = await blobkit.getBalance();

    return res.json({
      address,
      balanceWei: balanceWei.toString(),
      balanceETH: ethers.formatEther(balanceWei),
    });

  } catch (err: any) {
    logger.error('Balance fetch failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/wallet/metrics
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const totalBlobs = db.prepare(`
      SELECT COUNT(*) as count FROM blob_jobs WHERE status = 'confirmed'
    `).get() as { count: number };

    const totalChunks = db.prepare(`
      SELECT COUNT(*) as count FROM blob_jobs WHERE status = 'confirmed' AND job_type = 'chunk'
    `).get() as { count: number };

    const totalManifests = db.prepare(`
      SELECT COUNT(*) as count FROM blob_jobs WHERE status = 'confirmed' AND job_type = 'manifest'
    `).get() as { count: number };

    const totalDatasets = db.prepare(`
      SELECT COUNT(*) as count FROM datasets WHERE active = 1
    `).get() as { count: number };

    const totalPurchases = db.prepare(`
      SELECT COUNT(*) as count FROM purchases
    `).get() as { count: number };

    const totalVolumeWei = db.prepare(`
      SELECT SUM(CAST(amount_wei AS INTEGER)) as total FROM purchases
    `).get() as { total: number | null };

    const pendingJobs = db.prepare(`
      SELECT COUNT(*) as count FROM blob_jobs WHERE status = 'pending'
    `).get() as { count: number };

    return res.json({
      blobs: {
        total: totalBlobs.count,
        chunks: totalChunks.count,
        manifests: totalManifests.count,
        pending: pendingJobs.count,
      },
      datasets: {
        total: totalDatasets.count,
      },
      purchases: {
        total: totalPurchases.count,
        totalVolumeWei: totalVolumeWei.total?.toString() || '0',
        totalVolumeETH: ethers.formatEther(BigInt(totalVolumeWei.total || 0)),
      },
    });

  } catch (err: any) {
    logger.error('Metrics fetch failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

export default router;