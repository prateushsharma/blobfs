import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getBlobKit } from '../blobkit';
import { getDb } from '../db';
import { logger } from '../logger';
import { validateBlobSize, calculatePayloadHash } from '@blobkit/sdk';
// ✅ FIX: Removed bytesToHex import — calculatePayloadHash already returns a hex string

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

const CHUNK_SIZE = 120 * 1024;

function chunkBuffer(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    chunks.push(buffer.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function toDatasetDTO(row: any) {
  return {
    id: row.dataset_id,
    name: row.name,
    description: row.description,
    contentType: row.content_type,
    fileSize: row.file_size,
    chunkCount: row.chunk_count,
    priceWei: row.price_wei,
    licenseType: row.license_type,
    creatorAddress: row.creator_address,
    manifestTxHash: row.manifest_tx_hash,
    fileHash: row.file_hash,
    createdAt: row.created_at,
    active: !!row.active,
  };
}

// POST /api/datasets/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const creatorAddress =
      req.body.creatorAddress ||
      (req.headers['x-wallet-address'] as string);

    const { name, description, priceWei, licenseType } = req.body;

    if (!name || !priceWei || !licenseType || !creatorAddress) {
      return res.status(400).json({
        error: 'Missing required fields: name, priceWei, licenseType, creatorAddress',
      });
    }

    const blobkit = await getBlobKit();
    const fileBuffer = req.file.buffer;
    const chunks = chunkBuffer(fileBuffer);

    const fileHash = 'sha256:' + crypto.createHash('sha256').update(fileBuffer).digest('hex');

    let totalCostETH = 0;
    for (const chunk of chunks) {
      const estimate = await blobkit.estimateCost(chunk.length);
      totalCostETH += parseFloat(estimate.totalETH || '0');
    }

    const datasetId = uuidv4();
    const db = getDb();

    const chunkReceipts: {
      index: number;
      blobTxHash: string;
      blobHash: string;
      size: number;
    }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkUint8 = new Uint8Array(chunk);

      validateBlobSize(chunkUint8);

      // ✅ FIX: calculatePayloadHash returns a hex string directly — no bytesToHex wrapper needed
      const chunkPayloadHash = calculatePayloadHash(chunkUint8) as string;

      const receipt = await blobkit.writeBlob(chunkUint8, {
        appId: 'blobfs',
        codec: 'application/octet-stream',
      });

      // ✅ FIX: Use let, not const — needs reassignment in polling loop
      let chunkCompleted = !!receipt.blobTxHash;
      let chunkAttempts = 0;
      while (!chunkCompleted && chunkAttempts < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await blobkit.getJobStatus(receipt.jobId);
        chunkCompleted = status.completed;
        chunkAttempts++;
      }

      if (!chunkCompleted) {
        logger.warn('Chunk job timed out', { jobId: receipt.jobId, chunkIndex: i });
      }

      db.prepare(`
        INSERT OR REPLACE INTO blob_jobs (job_id, blob_tx_hash, status, dataset_id, job_type, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        receipt.jobId,
        receipt.blobTxHash || null,
        chunkCompleted ? 'confirmed' : 'pending',
        datasetId,
        'chunk',
        Date.now(),
        chunkCompleted ? Date.now() : null
      );

      chunkReceipts.push({
        index: i,
        blobTxHash: receipt.blobTxHash || '',
        blobHash: receipt.blobHash || '',
        size: chunk.length,
      });

      logger.info('Chunk uploaded', {
        chunkIndex: i,
        total: chunks.length,
        txHash: receipt.blobTxHash,
        payloadHash: chunkPayloadHash,
      });
    }

    // ✅ FIX: calculatePayloadHash returns hex string directly
    const payloadHash = calculatePayloadHash(new Uint8Array(fileBuffer)) as string;

    const manifest = {
      type: 'blobfs-manifest',
      version: '0.1.0',
      name,
      description: description || '',
      contentType: req.file.mimetype,
      totalSize: fileBuffer.length,
      fileHash,
      payloadHash,
      uploader: creatorAddress,
      uploadedAt: Math.floor(Date.now() / 1000),
      licenseType,
      priceWei,
      chunks: chunkReceipts,
    };

    const manifestReceipt = await blobkit.writeBlob(manifest, {
      appId: 'blobfs',
      codec: 'application/json',
    });

    // ✅ FIX: Use let, not const
    let manifestConfirmed = !!manifestReceipt.blobTxHash;
    let manifestAttempts = 0;
    while (!manifestConfirmed && manifestAttempts < 30) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await blobkit.getJobStatus(manifestReceipt.jobId);
      manifestConfirmed = status.completed;
      manifestAttempts++;
    }

    db.prepare(`
      INSERT OR REPLACE INTO blob_jobs (job_id, blob_tx_hash, status, dataset_id, job_type, created_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      manifestReceipt.jobId,
      manifestReceipt.blobTxHash || null,
      manifestConfirmed ? 'confirmed' : 'pending',
      datasetId,
      'manifest',
      Date.now(),
      manifestConfirmed ? Date.now() : null
    );

    db.prepare(`
      INSERT INTO datasets (
        dataset_id, manifest_tx_hash, creator_address, name, description,
        content_type, file_size, chunk_count, price_wei, license_type,
        file_hash, payload_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      datasetId,
      manifestReceipt.blobTxHash || null,
      creatorAddress,
      name,
      description || '',
      req.file.mimetype,
      fileBuffer.length,
      chunks.length,
      priceWei,
      licenseType,
      fileHash,
      payloadHash,
      Date.now()
    );

    logger.info('Dataset uploaded', {
      datasetId,
      manifestTxHash: manifestReceipt.blobTxHash,
      payloadHash,
    });

    return res.json({
      datasetId,
      manifestTxHash: manifestReceipt.blobTxHash,
      chunkTxHashes: chunkReceipts.map((c) => c.blobTxHash),
      chunkCount: chunks.length,
      fileHash,
      payloadHash,
      estimatedETH: totalCostETH.toFixed(6),
    });

  } catch (err: any) {
    logger.error('Upload failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/datasets/publish
router.post('/publish', async (req: Request, res: Response) => {
  try {
    const { datasetId, manifestTxHash, priceWei, licenseType } = req.body;
    if (!datasetId || !manifestTxHash) {
      return res.status(400).json({ error: 'Missing datasetId or manifestTxHash' });
    }

    const db = getDb();
    db.prepare(`
      UPDATE datasets SET manifest_tx_hash = ?, price_wei = ?, license_type = ?, active = 1
      WHERE dataset_id = ?
    `).run(manifestTxHash, priceWei, licenseType, datasetId);

    logger.info('Dataset published', { datasetId, manifestTxHash });
    return res.json({ success: true, datasetId, manifestTxHash });

  } catch (err: any) {
    logger.error('Publish failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/datasets
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const datasets = db.prepare(`
      SELECT * FROM datasets WHERE active = 1 ORDER BY created_at DESC
    `).all();
    return res.json(datasets.map(toDatasetDTO));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/datasets/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const dataset = db.prepare(
      `SELECT * FROM datasets WHERE dataset_id = ?`
    ).get(req.params.id);
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
    return res.json(toDatasetDTO(dataset));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/datasets/:id/download
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const dataset = db.prepare(
      `SELECT * FROM datasets WHERE dataset_id = ?`
    ).get(req.params.id) as any;
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    const blobkit = await getBlobKit();
    const manifest = (await blobkit.readBlobAsJSON(dataset.manifest_tx_hash)) as any;

    const chunks: Uint8Array[] = [];
    for (const chunk of manifest.chunks) {
      const result = await blobkit.readBlob(chunk.blobTxHash);
      chunks.push(result.data);
    }

    const fileBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    res.setHeader('Content-Type', dataset.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}"`);
    return res.send(fileBuffer);

  } catch (err: any) {
    logger.error('Download failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/datasets/:id/estimate
router.post('/:id/estimate', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const dataset = db.prepare(
      `SELECT * FROM datasets WHERE dataset_id = ?`
    ).get(req.params.id) as any;
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    const blobkit = await getBlobKit();
    const estimate = await blobkit.estimateCost(Math.min(dataset.file_size, CHUNK_SIZE));

    return res.json({
      datasetId: req.params.id,
      priceWei: dataset.price_wei,
      estimatedBlobCost: estimate,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;