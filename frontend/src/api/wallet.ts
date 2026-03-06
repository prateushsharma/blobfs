import api from './client';

export interface WalletInfo {
  address: string;
  balanceETH: string;
  balanceWei: string;
}

export interface WalletMetrics {
  totalBlobsWritten: number;
  totalETHSpent: string;
  totalDatasets: number;
  totalLicensesSold: number;
}

// GET /api/wallet/balance
export async function getWalletBalance(): Promise<WalletInfo> {
  const { data } = await api.get('/api/wallet/balance');
  return data;
}

// GET /api/wallet/metrics
export async function getWalletMetrics(): Promise<WalletMetrics> {
  const { data } = await api.get('/api/wallet/metrics');
  return data;
}