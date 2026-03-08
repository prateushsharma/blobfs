import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { decodeBlob as blobkitDecode, BlobReader } from '@blobkit/sdk';

const router = Router();

// ─── Beacon API Config ───────────────────────────────────────────────────────
const BEACON_API = process.env.BEACON_API_URL || 'https://ethereum-sepolia-beacon-api.publicnode.com';
const RPC_URL = process.env.RPC_URL!;

// ─── Provider (read-only, no signer needed) ──────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);

// ─── Types ───────────────────────────────────────────────────────────────────
interface BlobSidecar {
  index: string;
  blob: string;
  kzg_commitment: string;
  kzg_proof: string;
  signed_block_header: {
    message: { slot: string; proposer_index: string };
  };
  kzg_commitment_inclusion_proof: string[];
}

interface BeaconBlobsResponse {
  data: BlobSidecar[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Decode raw blob hex using BlobKit's own decodeBlob, then BlobReader helpers.
 * Falls back to manual field-element stripping if SDK import fails.
 */
function decodeBlob(blobHex: string): Buffer {
  const blobBytes = Buffer.from(blobHex.replace(/^0x/, ''), 'hex');

  // --- Strategy 1: use BlobKit SDK decodeBlob ---
  try {
    const decoded = blobkitDecode(new Uint8Array(blobBytes));
    return Buffer.from(decoded);
  } catch (e1) {
    console.warn('[decodeBlob] SDK decodeBlob failed, trying manual:', (e1 as any).message);
  }

  // --- Strategy 2: manual field-element strip (31 data bytes per 32-byte element) ---
  // BlobKit sets the high bit of each 32-byte field element to 0x00,
  // then packs 31 bytes of data. First 4 bytes after stripping = uint32 BE length.
  const FIELD_ELEMENTS = 4096;
  const chunks: Buffer[] = [];
  for (let i = 0; i < FIELD_ELEMENTS; i++) {
    const offset = i * 32;
    chunks.push(blobBytes.subarray(offset + 1, offset + 32));
  }
  const raw = Buffer.concat(chunks); // 4096 * 31 = 126976 bytes

  // Try length-prefixed (BlobKit JsonCodec prepends 4-byte BE uint32 length)
  const dataLen = raw.readUInt32BE(0);
  if (dataLen > 0 && dataLen <= raw.length - 4) {
    return raw.subarray(4, 4 + dataLen);
  }

  // Fallback: trim trailing zeros
  let end = raw.length;
  while (end > 0 && raw[end - 1] === 0) end--;
  return raw.subarray(0, end);
}

/**
 * Get versioned hashes from a transaction receipt.
 * Type-3 (EIP-4844) txs include blobVersionedHashes in the tx data.
 */
async function getVersionedHashesFromTx(txHash: string): Promise<string[]> {
  // ethers v6 getTransaction returns the full tx including blob fields
  const tx = await provider.getTransaction(txHash);
  if (!tx) throw new Error(`Transaction ${txHash} not found`);

  // Type 3 transaction carries blobVersionedHashes
  const raw = tx as any;
  const hashes: string[] = raw.blobVersionedHashes ?? [];

  if (hashes.length === 0) {
    throw new Error(`Transaction ${txHash} has no blob versioned hashes — not a blob tx`);
  }

  return hashes;
}

// Sepolia beacon genesis data (post-Merge)
// Genesis time: 1655733600, slot time: 12s
// We derive slot from execution block timestamp, which is more reliable than block number math
const SEPOLIA_GENESIS_TIME = 1655733600;
const SLOT_TIME = 12;

/**
 * Get the beacon slot for a tx by fetching the block timestamp and computing:
 * slot = (blockTimestamp - genesisTime) / slotTime
 *
 * This is more reliable than block number math because it's timestamp-based.
 * The beacon API accepts slot numbers as block_id.
 */
async function getBeaconSlotFromTxHash(txHash: string): Promise<string> {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error(`Receipt for ${txHash} not found`);

  const block = await provider.getBlock(receipt.blockNumber);
  if (!block) throw new Error(`Block ${receipt.blockNumber} not found`);

  const slot = Math.floor((block.timestamp - SEPOLIA_GENESIS_TIME) / SLOT_TIME);
  console.log(`[beacon] block=${receipt.blockNumber} timestamp=${block.timestamp} → slot=${slot}`);
  return slot.toString();
}

/**
 * Fetch blob sidecars from the Beacon API for a given slot.
 * Tries the exact slot first, then slot±1 to handle minor timing skew.
 */
async function fetchBlobFromBeacon(
  blockId: string,
  versionedHash: string
): Promise<BlobSidecar | null> {
  // Try slot, slot-1, slot+1 to handle any off-by-one from timestamp rounding
  const slot = parseInt(blockId, 10);
  const candidates = isNaN(slot) ? [blockId] : [slot, slot - 1, slot + 1].map(String);

  for (const candidate of candidates) {
    const url = `${BEACON_API}/eth/v1/beacon/blob_sidecars/${candidate}`;
    console.log(`[beacon] trying slot ${candidate}...`);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      console.warn(`[beacon] fetch failed for slot ${candidate}: ${e.message}`);
      continue;
    }

    if (res.status === 404) {
      console.warn(`[beacon] slot ${candidate} not found, trying next...`);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Beacon API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as BeaconBlobsResponse;
    const sidecars = json.data ?? [];

    // Match by KZG commitment -> versioned hash (SHA256, first byte replaced with 0x01)
    for (const sidecar of sidecars) {
      const commitmentBytes = Buffer.from(sidecar.kzg_commitment.replace(/^0x/, ''), 'hex');
      const sha256 = ethers.sha256(commitmentBytes);
      const derivedVersionedHash = '0x01' + sha256.slice(4);
      if (derivedVersionedHash.toLowerCase() === versionedHash.toLowerCase()) {
        console.log(`[beacon] found blob at slot ${candidate}`);
        return sidecar;
      }
    }

    // Got sidecars but hash not among them - no point trying adjacent slots
    if (sidecars.length > 0) break;
  }

  return null;
}

/**
 * Full pipeline: txHash → versioned hashes → beacon slot → blob data → decoded JSON/string
 */
async function readBlobByTxHash(txHash: string, blobIndex = 0): Promise<{
  data: Buffer;
  decoded: any;
  source: string;
  versionedHash: string;
  kzgCommitment: string;
}> {
  // Step 1: Get versioned hashes from the tx
  const versionedHashes = await getVersionedHashesFromTx(txHash);
  if (blobIndex >= versionedHashes.length) {
    throw new Error(`Blob index ${blobIndex} out of range (tx has ${versionedHashes.length} blobs)`);
  }
  const versionedHash = versionedHashes[blobIndex];

  // Step 2: Get block number → use as beacon block_id
  const blockId = await getBeaconSlotFromTxHash(txHash);

  // Step 3: Fetch blob from beacon
  const sidecar = await fetchBlobFromBeacon(blockId, versionedHash);
  if (!sidecar) {
    throw new Error(
      `Blob with versioned hash ${versionedHash} not found at block ${blockId}. ` +
      `Blob may have expired (>18 days) or beacon node hasn't indexed it yet.`
    );
  }

  // Step 4: Decode blob
  const rawData = decodeBlob(sidecar.blob);
  console.log(`[beacon] decoded ${rawData.length} bytes, first 80: ${rawData.subarray(0, 80).toString('hex')}`);

  // Step 5: Try JSON parse - strip leading null bytes first
  let trimmed = rawData;
  let startIdx = 0;
  while (startIdx < trimmed.length && trimmed[startIdx] === 0) startIdx++;
  if (startIdx > 0) trimmed = trimmed.subarray(startIdx);

  let decoded: any = null;
  try {
    decoded = JSON.parse(trimmed.toString('utf8'));
  } catch {
    const str = trimmed.toString('utf8');
    const isPrintable = /^[\x20-\x7E\r\n\t]*$/.test(str.slice(0, 200));
    decoded = isPrintable ? str : `[binary data, ${rawData.length} bytes]`;
    console.warn(`[beacon] not JSON: ${str.slice(0, 100)}`);
  }

  return {
    data: rawData,
    decoded,
    source: 'beacon',
    versionedHash,
    kzgCommitment: sidecar.kzg_commitment,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/blobs/:txHash
 * Read blob data. Tries BlobKit first (if available), falls back to Beacon API.
 */
router.get('/:txHash', async (req: Request, res: Response) => {
  const { txHash } = req.params;
  const blobIndex = parseInt(req.query.index as string ?? '0', 10);

  if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
    return res.status(400).json({ error: 'Invalid transaction hash' });
  }

  try {
    const result = await readBlobByTxHash(txHash, blobIndex);

    return res.json({
      success: true,
      txHash,
      blobIndex,
      versionedHash: result.versionedHash,
      kzgCommitment: result.kzgCommitment,
      source: result.source,
      data: result.decoded,
      rawHex: result.data.toString('hex'),
    });
  } catch (err: any) {
    console.error('[blobs] Read failed:', err.message);

    const expired = err.message?.toLowerCase().includes('expired');
    return res.status(expired ? 410 : 404).json({
      error: err.message,
      txHash,
      hint: expired
        ? 'Blob has expired (>18 days). Configure archiveUrl to access old blobs.'
        : 'Blob not found. It may still be indexing (wait 1-2 min) or the tx is not a blob tx.',
    });
  }
});

/**
 * GET /api/blobs/:txHash/status
 * Check if a blob tx is confirmed and retrievable.
 */
router.get('/:txHash/status', async (req: Request, res: Response) => {
  const { txHash } = req.params;

  try {
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.json({ status: 'pending', confirmed: false, txHash });
    }

    const tx = await provider.getTransaction(txHash);
    const raw = tx as any;
    const blobHashes: string[] = raw?.blobVersionedHashes ?? [];

    return res.json({
      status: 'confirmed',
      confirmed: true,
      txHash,
      blockNumber: receipt.blockNumber,
      blobCount: blobHashes.length,
      versionedHashes: blobHashes,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/blobs/gas
 * Current blob gas price estimate from latest block.
 */
router.get('/gas/estimate', async (_req: Request, res: Response) => {
  try {
    const block = await provider.getBlock('latest');
    if (!block) throw new Error('Could not fetch latest block');

    const raw = block as any;
    const blobGasPrice: bigint = raw.blobGasPrice ?? 0n;
    const baseFee: bigint = block.baseFeePerGas ?? 0n;

    // Estimate cost for 1 blob (~124KB)
    const blobGasPerBlob = 131072n; // 2^17
    const estimatedBlobCost = blobGasPrice * blobGasPerBlob;

    return res.json({
      blobGasPrice: blobGasPrice.toString(),
      blobGasPriceGwei: ethers.formatUnits(blobGasPrice, 'gwei'),
      baseFee: baseFee.toString(),
      baseFeeGwei: ethers.formatUnits(baseFee, 'gwei'),
      estimatedCostPerBlobWei: estimatedBlobCost.toString(),
      estimatedCostPerBlobEth: ethers.formatEther(estimatedBlobCost),
      blockNumber: block.number,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/blobs/refund
 * Trigger a refund for an expired BlobKit job.
 * Body: { jobId: string }
 */
router.post('/refund', async (req: Request, res: Response) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  try {
    // blobkit instance should be injected via app.locals or imported from a shared module
    const blobkit = req.app.locals.blobkit;
    if (!blobkit) throw new Error('BlobKit not initialized');

    const tx = await blobkit.refundIfExpired(jobId);
    await tx.wait();

    return res.json({ success: true, jobId, txHash: tx.hash });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, jobId });
  }
});

/**
 * GET /api/blobs/job/:jobId
 * Get BlobKit job status.
 */
router.get('/job/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const blobkit = req.app.locals.blobkit;
    if (!blobkit) throw new Error('BlobKit not initialized');

    const status = await blobkit.getJobStatus(jobId);

    return res.json({
      jobId,
      completed: status.completed,
      exists: status.exists,
      blobTxHash: status.blobTxHash,
      amount: status.amount?.toString(),
      timestamp: status.timestamp,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { readBlobByTxHash }; // export for use in other routes (e.g. licenses/verify)
export default router;