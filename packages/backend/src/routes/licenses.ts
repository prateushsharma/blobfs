import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { getBlobKit } from '../blobkit';
import { getDb } from '../db';
import { logger } from '../logger';
import { config } from '../config';
import { isValidAddress } from '@blobkit/sdk';

const router = Router();

// Minimal ABI for LicenseMarket contract
const LICENSE_MARKET_ABI = [
  'function verifyLicense(string datasetId, address buyer) view returns (bool)',
  'function purchaseDataset(string datasetId, string receiptBlobTxHash) payable',
  'event LicensePurchased(string datasetId, address buyer, string receiptTxHash, uint256 amountPaid)',
];

function getLicenseMarketContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(config.licenseMarketAddress, LICENSE_MARKET_ABI, signerOrProvider);
}

// POST /api/licenses/purchase
router.post('/purchase', async (req: Request, res: Response) => {
  try {
    const { datasetId, buyerAddress, paymentTxHash } = req.body;

    if (!datasetId || !buyerAddress || !paymentTxHash) {
      return res.status(400).json({ error: 'Missing datasetId, buyerAddress, or paymentTxHash' });
    }

    if (!isValidAddress(buyerAddress)) {
      return res.status(400).json({ error: 'Invalid buyer address' });
    }

    const db = getDb();
    const dataset = db.prepare(`SELECT * FROM datasets WHERE dataset_id = ?`).get(datasetId) as any;
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    // Check for existing purchase
    const existing = db.prepare(`
      SELECT * FROM purchases WHERE dataset_id = ? AND buyer_address = ?
    `).get(datasetId, buyerAddress);
    if (existing) return res.status(409).json({ error: 'Already licensed' });

    // Verify payment on-chain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const tx = await provider.getTransaction(paymentTxHash);
    if (!tx) return res.status(400).json({ error: 'Payment transaction not found' });

    const receipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Payment transaction failed or pending' });
    }

    // Build and store receipt blob
    const blobkit = await getBlobKit();
    const receiptData = {
      type: 'blobfs-receipt',
      version: '0.1.0',
      datasetId,
      manifestTxHash: dataset.manifest_tx_hash,
      fileHash: dataset.file_hash,
      payloadHash: dataset.payload_hash,
      buyer: buyerAddress,
      seller: dataset.creator_address,
      amountPaid: dataset.price_wei,
      licenseType: dataset.license_type,
      purchasedAt: Math.floor(Date.now() / 1000),
      ethTxHash: paymentTxHash,
    };

    const blobReceipt = await blobkit.writeBlob(
      receiptData,
      { appId: 'blobfs-receipt', codec: 'application/json' }
    );

    // Poll until confirmed
    let confirmed = false;
    let attempts = 0;
    while (!confirmed && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await blobkit.getJobStatus(blobReceipt.jobId);
      confirmed = status.completed;
      attempts++;
    }

    // Store in DB
    db.prepare(`
      INSERT INTO purchases (dataset_id, buyer_address, receipt_tx_hash, amount_wei, tx_hash, purchased_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      datasetId,
      buyerAddress,
      blobReceipt.blobTxHash || null,
      dataset.price_wei,
      paymentTxHash,
      Date.now()
    );

    logger.info('License purchased', {
      datasetId,
      buyerAddress,
      receiptTxHash: blobReceipt.blobTxHash,
    });

    return res.json({
      success: true,
      datasetId,
      buyerAddress,
      receiptTxHash: blobReceipt.blobTxHash,
      licenseType: dataset.license_type,
    });

  } catch (err: any) {
    logger.error('Purchase failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/licenses/verify?datasetId=X&address=Y
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { datasetId, address } = req.query as { datasetId: string; address: string };
    if (!datasetId || !address) {
      return res.status(400).json({ error: 'Missing datasetId or address' });
    }

    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const db = getDb();
    const purchase = db.prepare(`
      SELECT * FROM purchases WHERE dataset_id = ? AND buyer_address = ?
    `).get(datasetId, address.toLowerCase()) as any;

    if (!purchase) return res.json({ licensed: false, receipt: null });

    // Fetch receipt blob
    const blobkit = await getBlobKit();
    let receiptData = null;
    if (purchase.receipt_tx_hash) {
      try {
        receiptData = await blobkit.readBlobAsJSON(purchase.receipt_tx_hash);
      } catch (e) {
        logger.warn('Could not fetch receipt blob', { txHash: purchase.receipt_tx_hash });
      }
    }

    // Optionally verify on-chain if contract configured
    let onChainVerified = false;
    if (config.licenseMarketAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const contract = getLicenseMarketContract(provider);
        onChainVerified = await contract.verifyLicense(datasetId, address);
      } catch (e) {
        logger.warn('On-chain verification failed', { error: (e as Error).message });
      }
    }

    return res.json({
      licensed: true,
      onChainVerified,
      receiptTxHash: purchase.receipt_tx_hash,
      receipt: receiptData,
    });

  } catch (err: any) {
    logger.error('Verify failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/licenses/my?address=X
router.get('/my', async (req: Request, res: Response) => {
  try {
    const { address } = req.query as { address: string };
    if (!address || !isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid or missing address' });
    }

    const db = getDb();
    const purchases = db.prepare(`
      SELECT p.*, d.name, d.description, d.content_type, d.file_size, d.license_type
      FROM purchases p
      JOIN datasets d ON p.dataset_id = d.dataset_id
      WHERE p.buyer_address = ?
      ORDER BY p.purchased_at DESC
    `).all(address.toLowerCase());

    return res.json({ purchases });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;