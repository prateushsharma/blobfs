import api from './client';

export interface LicenseReceipt {
  datasetId: string;
  manifestTxHash: string;
  fileHash: string;
  payloadHash: string;
  buyer: string;
  seller: string;
  amountPaid: string;
  licenseType: string;
  purchasedAt: number;
  ethTxHash: string;
  receiptTxHash: string;
}

export async function prepareLicense(payload: {
  datasetId: string;
  buyerAddress: string;
}): Promise<{ receiptTxHash: string; priceWei: string; datasetId: string }> {
  const { data } = await api.post('/api/licenses/prepare', payload);
  return data;
}

export async function confirmLicense(payload: {
  datasetId: string;
  buyerAddress: string;
  paymentTxHash: string;
  receiptTxHash: string;
}): Promise<{ success: boolean; receiptTxHash: string; licenseType: string }> {
  const { data } = await api.post('/api/licenses/confirm', payload);
  return data;
}

export async function verifyLicense(
  datasetId: string,
  address: string
): Promise<{ licensed: boolean; receipt: LicenseReceipt | null }> {
  const { data } = await api.get('/api/licenses/verify', { params: { datasetId, address } });
  return data;
}

export async function myLicenses(): Promise<LicenseReceipt[]> {
  const { data } = await api.get('/api/licenses/my');
  return data;
}

export async function getLicenseStats(
  datasetId: string
): Promise<{ licenseCount: number; totalEarningsWei: string; totalEarningsETH: string }> {
  const { data } = await api.get(`/api/licenses/stats/${datasetId}`);
  return data;
}