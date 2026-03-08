import api from './client';

export interface BlobStatus {
  jobId?: string;
  completed: boolean;
  blobTxHash?: string;
  exists?: boolean;
}

export interface GasEstimate {
  blobGasPrice: string;
  baseFee: string;
  estimatedETHPerBlob: string;
}

// GET /api/blobs/:txHash
export async function readBlob(txHash: string): Promise<{ data: any; source: string }> {
  const { data } = await api.get(`/api/blobs/${txHash}`);
  // backend returns decoded data directly — no base64
  return { data: data.data, source: data.source };
}
// GET /api/blobs/:txHash/status
export async function getBlobStatus(txHash: string): Promise<BlobStatus> {
  const { data } = await api.get(`/api/blobs/${txHash}/status`);
  return data;
}

// GET /api/blobs/gas
export async function getGasEstimate(): Promise<GasEstimate> {
  const { data } = await api.get('/api/blobs/gas');
  return data;
}

// POST /api/blobs/refund
export async function refundBlob(jobId: string): Promise<{ txHash: string }> {
  const { data } = await api.post('/api/blobs/refund', { jobId });
  return data;
}