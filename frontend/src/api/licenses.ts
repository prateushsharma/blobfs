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

export interface PurchasePayload {
  datasetId: string;
  buyerAddress: string;
  paymentTxHash: string;
}

// POST /api/licenses/purchase
export async function purchaseLicense(payload: PurchasePayload): Promise<{ receiptTxHash: string }> {
  const { data } = await api.post('/api/licenses/purchase', payload);
  return data;
}

// GET /api/licenses/verify?datasetId=X&address=Y
export async function verifyLicense(
  datasetId: string,
  address: string
): Promise<{ licensed: boolean; receipt: LicenseReceipt | null }> {
  const { data } = await api.get('/api/licenses/verify', {
    params: { datasetId, address },
  });
  return data;
}

// GET /api/licenses/my
export async function myLicenses(): Promise<LicenseReceipt[]> {
  const { data } = await api.get('/api/licenses/my');
  return data;
}