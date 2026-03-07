import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { getBlobKit } from '../blobkit';
import { getDb } from '../db';
import { logger } from '../logger';
import { config } from '../config';
import { isValidAddress } from '@blobkit/sdk';

const router = Router();

// ✅ FIX: Full correct ABI from deployed contract artifact
// Key differences from old ABI:
//   - datasetId is uint256, NOT string
//   - receiptTxHash is bytes32, NOT string
//   - LicensePurchased event has creator, creatorShare, protocolFee fields
const LICENSE_MARKET_ABI = [
  'function purchaseDataset(uint256 datasetId, bytes32 receiptTxHash) payable',
  'function verifyLicense(uint256 datasetId, address buyer) view returns (bool)',
  'function getLicenseInfo(uint256 datasetId, address buyer) view returns (bool licensed, bytes32 receiptTxHash, uint256 purchasedAt)',
  'function getLicenseReceipt(uint256 datasetId, address buyer) view returns (bytes32)',
  'function getDatasetStats(uint256 datasetId) view returns (uint256 licenses, uint256 earnings)',
  'function calculateFeeSplit(uint256 amountWei) view returns (uint256 creatorShare, uint256 protocolFee)',
  'function totalProtocolFees() view returns (uint256)',
  'function treasury() view returns (address)',
  'event LicensePurchased(uint256 indexed datasetId, address indexed buyer, address indexed creator, bytes32 receiptTxHash, uint256 amountPaid, uint256 creatorShare, uint256 protocolFee)',
];

function getLicenseMarketContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(config.licenseMarketAddress, LICENSE_MARKET_ABI, signerOrProvider);
}

// ✅ Helper: Convert a 0x-prefixed tx hash string to bytes32
// blobTxHash from BlobKit is already a 32-byte hex (66 chars with 0x)
// This ensures it's properly zero-padded if somehow shorter
function toBytes32(hexHash: string): string {
  const clean = hexHash.startsWith('0x') ? hexHash.slice(2) : hexHash;
  return '0x' + clean.padStart(64, '0');
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

    // ✅ Normalize address to lowercase for all DB operations
    const normalizedBuyer = buyerAddress.toLowerCase();

    const db = getDb();
    const dataset = db.prepare(`SELECT * FROM datasets WHERE dataset_id = ?`).get(datasetId) as any;
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    // ✅ Use normalized address in duplicate check
    const existing = db.prepare(`
      SELECT * FROM purchases WHERE dataset_id = ? AND buyer_address = ?
    `).get(datasetId, normalizedBuyer);
    if (existing) return res.status(409).json({ error: 'Already licensed' });

    // Verify payment on-chain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const tx = await provider.getTransaction(paymentTxHash);
    if (!tx) return res.status(400).json({ error: 'Payment transaction not found' });

    // ✅ Verify tx was sent to LicenseMarket contract
    if (tx.to?.toLowerCase() !== config.licenseMarketAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Transaction was not sent to LicenseMarket contract' });
    }

    const txReceipt = await provider.getTransactionReceipt(paymentTxHash);
    if (!txReceipt || txReceipt.status !== 1) {
      return res.status(400).json({ error: 'Payment transaction failed or pending' });
    }

    // ✅ Verify amount paid >= dataset price
    if (tx.value < BigInt(dataset.price_wei)) {
      return res.status(400).json({
        error: `Insufficient payment. Required: ${dataset.price_wei} wei, got: ${tx.value.toString()} wei`,
      });
    }

    // Build receipt blob
    const blobkit = await getBlobKit();
    const receiptData = {
      type: 'blobfs-receipt',
      version: '0.1.0',
      datasetId,
      manifestTxHash: dataset.manifest_tx_hash,
      fileHash: dataset.file_hash,
      payloadHash: dataset.payload_hash,
      buyer: normalizedBuyer,
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
    let confirmed = !!blobReceipt.blobTxHash;
    let attempts = 0;
    while (!confirmed && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await blobkit.getJobStatus(blobReceipt.jobId);
      confirmed = status.completed;
      attempts++;
    }

    if (!confirmed) {
      logger.warn('Receipt blob job timed out', { jobId: blobReceipt.jobId });
    }

    // ✅ Store normalized address
    db.prepare(`
      INSERT INTO purchases (dataset_id, buyer_address, receipt_tx_hash, amount_wei, tx_hash, purchased_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      datasetId,
      normalizedBuyer,
      blobReceipt.blobTxHash || null,
      dataset.price_wei,
      paymentTxHash,
      Date.now()
    );

    logger.info('License purchased', {
      datasetId,
      buyerAddress: normalizedBuyer,
      receiptTxHash: blobReceipt.blobTxHash,
    });

    return res.json({
      success: true,
      datasetId,
      buyerAddress: normalizedBuyer,
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
    // ✅ Normalize address before querying
    const purchase = db.prepare(`
      SELECT * FROM purchases WHERE dataset_id = ? AND buyer_address = ?
    `).get(datasetId, address.toLowerCase()) as any;

    if (!purchase) return res.json({ licensed: false, receipt: null });

    // Fetch receipt blob from blobspace
    const blobkit = await getBlobKit();
    let receiptData = null;
    if (purchase.receipt_tx_hash) {
      try {
        receiptData = await blobkit.readBlobAsJSON(purchase.receipt_tx_hash);
      } catch (e) {
        logger.warn('Could not fetch receipt blob', { txHash: purchase.receipt_tx_hash });
      }
    }

    // ✅ On-chain verification using correct types (uint256 datasetId)
    let onChainVerified = false;
    let onChainReceiptHash: string | null = null;
    let onChainPurchasedAt: number | null = null;

    if (config.licenseMarketAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const contract = getLicenseMarketContract(provider);

        // ✅ datasetId must be passed as bigint for uint256
        const [licensed, receiptTxHash, purchasedAt] = await contract.getLicenseInfo(
          BigInt(datasetId),
          address
        );
        onChainVerified = licensed;
        // ✅ receiptTxHash comes back as bytes32 hex — this IS the blob tx hash
        onChainReceiptHash = receiptTxHash !== ethers.ZeroHash ? receiptTxHash : null;
        onChainPurchasedAt = purchasedAt ? Number(purchasedAt) : null;
      } catch (e) {
        logger.warn('On-chain verification failed', { error: (e as Error).message });
      }
    }

    return res.json({
      licensed: true,
      onChainVerified,
      onChainReceiptHash,
      onChainPurchasedAt,
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
    // ✅ Normalize address before querying
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

// GET /api/licenses/stats/:datasetId — on-chain license count + earnings
router.get('/stats/:datasetId', async (req: Request, res: Response) => {
  try {
    const { datasetId } = req.params;

    if (!config.licenseMarketAddress) {
      return res.status(503).json({ error: 'LicenseMarket contract not configured' });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = getLicenseMarketContract(provider);

    // ✅ uint256 datasetId
    const [licenses, earnings] = await contract.getDatasetStats(BigInt(datasetId));

    return res.json({
      datasetId,
      licenseCount: Number(licenses),
      totalEarningsWei: earnings.toString(),
      totalEarningsETH: ethers.formatEther(earnings),
    });

  } catch (err: any) {
    logger.error('Stats fetch failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

export default router;