import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  rpcUrl: process.env.RPC_URL || '',
  privateKey: process.env.PRIVATE_KEY || '',
  chainId: parseInt(process.env.CHAIN_ID || '11155111'),
  proxyUrl: process.env.PROXY_URL || 'https://proxy-sepolia.blobkit.org',
  archiveUrl: process.env.ARCHIVE_URL || 'https://api.blobscan.com',
  datasetRegistryAddress: process.env.DATASET_REGISTRY_ADDRESS || '',
  licenseMarketAddress: process.env.LICENSE_MARKET_ADDRESS || '',
  treasuryAddress: process.env.TREASURY_ADDRESS || '',
  dbPath: process.env.DB_PATH || './data/blobfs.db',
  escrowContract: process.env.CHAIN_ID === '1'
    ? '0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838'
    : '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77',
};

export function validateConfig() {
  const required = ['rpcUrl', 'privateKey'] as const;
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required env var: ${key.toUpperCase()}`);
    }
  }
}