import api from './client';

export interface DatasetMeta {
  id: string;
  name: string;
  description: string;
  contentType: string;
  fileSize: number;
  chunkCount: number;
  priceWei: string;
  licenseType: 'commercial' | 'research' | 'open';
  creatorAddress: string;
  manifestTxHash: string;
  fileHash: string;
  createdAt: number;
  active: boolean;
}

export interface UploadEstimate {
  chunkCount: number;
  totalBytes: number;
  estimatedETH: string;
  priceUsd?: string;
}

export interface PublishPayload {
  manifestTxHash: string;
  priceWei: string;
  licenseType: string;
  name: string;
  description: string;
}

// GET /api/datasets
export async function listDatasets(): Promise<DatasetMeta[]> {
  const { data } = await api.get('/api/datasets');
  return data;
}

// GET /api/datasets/:id
export async function getDataset(id: string): Promise<DatasetMeta> {
  const { data } = await api.get(`/api/datasets/${id}`);
  return data;
}

// POST /api/datasets/:id/estimate
export async function estimateDownload(id: string): Promise<UploadEstimate> {
  const { data } = await api.post(`/api/datasets/${id}/estimate`);
  return data;
}

// POST /api/datasets/upload  (multipart)
export async function uploadDataset(
  file: File,
  meta: { name: string; description: string; priceWei: string; licenseType: string },
  onProgress?: (pct: number) => void
): Promise<{ manifestTxHash: string; chunkTxHashes: string[]; fileHash: string; estimatedETH: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', meta.name);
  form.append('description', meta.description);
  form.append('priceWei', meta.priceWei);
  form.append('licenseType', meta.licenseType);

  const { data } = await api.post('/api/datasets/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}

// POST /api/datasets/publish
export async function publishDataset(payload: PublishPayload): Promise<{ datasetId: string; txHash: string }> {
  const { data } = await api.post('/api/datasets/publish', payload);
  return data;
}

// GET /api/datasets/:id/download
export async function downloadDataset(id: string): Promise<Blob> {
  const { data } = await api.get(`/api/datasets/${id}/download`, {
    responseType: 'blob',
  });
  return data;
}