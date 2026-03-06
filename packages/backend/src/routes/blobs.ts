import { Router, Request, Response } from 'express';
import { getBlobKit } from '../blobkit';
import { getDb } from '../db';
import { logger } from '../logger';

const router = Router();

// GET /api/blobs/gas  ← MUST be before /:txHash
router.get('/gas', async (_req: Request, res: Response) => {
  try {
    const blobkit = await getBlobKit();
    const sample = new Uint8Array(1024);
    const estimate = await blobkit.estimateCost(sample);

    return res.json({
      blobGasPrice: estimate.blobGasPrice,
      baseFee: estimate.baseFee,
      estimatedETHPerBlob: estimate.totalETH,
    });

  } catch (err: any) {
    logger.error('Gas estimate failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/blobs/refund  ← MUST be before /:txHash
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

    const blobkit = await getBlobKit();
    const tx = await blobkit.refundIfExpired(jobId);
    await tx.wait();

    const db = getDb();
    db.prepare(`UPDATE blob_jobs SET status = 'refunded' WHERE job_id = ?`).run(jobId);

    logger.info('Refund successful', { jobId });
    return res.json({ success: true, jobId, txHash: tx.hash });

  } catch (err: any) {
    logger.error('Refund failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/blobs/:txHash/status
router.get('/:txHash/status', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;
    const db = getDb();

    const job = db.prepare(`
      SELECT * FROM blob_jobs WHERE blob_tx_hash = ?
    `).get(txHash) as any;

    if (!job) {
      const blobkit = await getBlobKit();
      try {
        const result = await blobkit.readBlob(txHash);
        return res.json({
          txHash,
          status: 'confirmed',
          source: result.source,
          blockNumber: result.blockNumber,
        });
      } catch {
        return res.status(404).json({ error: 'Blob not found' });
      }
    }

    if (job.status === 'pending') {
      const blobkit = await getBlobKit();
      const status = await blobkit.getJobStatus(job.job_id);

      if (status.completed) {
        db.prepare(`
          UPDATE blob_jobs SET status = 'confirmed', confirmed_at = ?, blob_tx_hash = ?
          WHERE job_id = ?
        `).run(Date.now(), status.blobTxHash || job.blob_tx_hash, job.job_id);

        job.status = 'confirmed';
        job.blob_tx_hash = status.blobTxHash || job.blob_tx_hash;
      }
    }

    return res.json({
      jobId: job.job_id,
      txHash: job.blob_tx_hash,
      status: job.status,
      jobType: job.job_type,
      datasetId: job.dataset_id,
      createdAt: job.created_at,
      confirmedAt: job.confirmed_at,
    });

  } catch (err: any) {
    logger.error('Status check failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/blobs/:txHash  ← MUST be last
router.get('/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;
    const blobkit = await getBlobKit();

    const result = await blobkit.readBlob(txHash);

    return res.json({
      txHash,
      data: Buffer.from(result.data).toString('base64'),
      source: result.source,
      commitment: result.commitment,
      blockNumber: result.blockNumber,
    });

  } catch (err: any) {
    logger.error('Blob read failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

export default router;