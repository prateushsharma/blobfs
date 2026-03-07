import { BlobKit, initializeKzg } from '@blobkit/sdk';
import { ethers } from 'ethers';
import { config } from './config';
import { logger, trackMetric } from './logger';

let blobkitInstance: BlobKit | null = null;

export async function getBlobKit(): Promise<BlobKit> {
  if (!blobkitInstance) {
    throw new Error('BlobKit not initialized. Call initBlobKit() first.');
  }
  return blobkitInstance;
}

export async function initBlobKit(): Promise<void> {
  logger.info('Initializing KZG...');
  await initializeKzg();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  logger.info('Creating BlobKit instance...');
  blobkitInstance = new BlobKit(
    {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      archiveUrl: config.archiveUrl,
      eip7594: false,  // force EIP-4844, ethers Wallet doesn't support signRawTransaction
      logLevel: 'info',
      escrowContract: '0x742d35cc6634C0532925A3B844bc9E7595f2BD77',
      metricsHooks: {
        onBlobWrite: (size, duration, success) =>
          trackMetric('write', size, duration, success),
        onBlobRead: (size, duration, success, source) =>
          trackMetric('read', size, duration, success, source),
        onProxyRequest: (url, duration, success) =>
          trackMetric('proxy', 0, duration, success),
        onError: (error, context) =>
          logger.error('BlobKit error', { context, error: error.message }),
      },
    },
    wallet
  );

  await blobkitInstance.initialize();

  const address = await blobkitInstance.getAddress();
  const balance = await blobkitInstance.getBalance();
  logger.info('BlobKit initialized', {
    address,
    balance: ethers.formatEther(balance) + ' ETH',
    chainId: config.chainId,
  });
}