import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, useWalletClient } from 'wagmi';
import { formatEther } from 'viem';
import { getDataset, DatasetMeta } from '../api/datasets';
import { verifyLicense, purchaseLicense, LicenseReceipt } from '../api/licenses';

const LICENSE_MARKET_ADDRESS = import.meta.env.VITE_LICENSE_MARKET_ADDRESS as `0x${string}`;

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatPrice(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return eth === 0 ? 'Free' : `${eth.toFixed(4)} ETH`;
}

type PurchaseStep =
  | 'idle'
  | 'sending-payment'
  | 'waiting-confirmation'
  | 'issuing-receipt'
  | 'done'
  | 'error';

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [dataset, setDataset] = useState<DatasetMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [license, setLicense] = useState<LicenseReceipt | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);

  const [step, setStep] = useState<PurchaseStep>('idle');
  const [stepMsg, setStepMsg] = useState('');
  const [receiptTxHash, setReceiptTxHash] = useState('');
  const [purchaseError, setPurchaseError] = useState('');

  useEffect(() => {
    if (!id) return;
    getDataset(id)
      .then(setDataset)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !address || !dataset) return;
    setLicenseLoading(true);
    verifyLicense(id, address)
      .then(({ licensed, receipt }) => {
        if (licensed && receipt) setLicense(receipt);
      })
      .catch(() => {})
      .finally(() => setLicenseLoading(false));
  }, [id, address, dataset]);

  async function handlePurchase() {
    if (!dataset || !address || !walletClient) return;
    setPurchaseError('');
    setStep('sending-payment');
    setStepMsg('Sending ETH payment to LicenseMarket contract...');

    try {
      const paymentTxHash = await walletClient.sendTransaction({
        to: LICENSE_MARKET_ADDRESS,
        value: BigInt(dataset.priceWei),
        data: ('0x' + encodePurchaseCall(dataset.id)) as `0x${string}`,
      });

      setStep('waiting-confirmation');
      setStepMsg('Payment sent. Waiting for Ethereum confirmation...');

      await waitForTx(paymentTxHash);

      setStep('issuing-receipt');
      setStepMsg('Payment confirmed. Writing license receipt to blobspace...');

      const { receiptTxHash: rth } = await purchaseLicense({
        datasetId: dataset.id,
        buyerAddress: address,
        paymentTxHash,
      });

      setReceiptTxHash(rth);
      setStep('done');
      setStepMsg('');

      const { licensed, receipt } = await verifyLicense(dataset.id, address);
      if (licensed && receipt) setLicense(receipt);
    } catch (e: any) {
      setPurchaseError(e.message || 'Purchase failed');
      setStep('error');
      setStepMsg('');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-zinc-400 font-['Space_Mono'] text-sm flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
          Loading dataset...
        </span>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="border border-red-800 bg-red-900/20 rounded p-6 text-red-400 font-['Space_Mono'] text-sm">
          ⚠ {error || 'Dataset not found'}
        </div>
      </div>
    );
  }

  const isOwner = address?.toLowerCase() === dataset.creatorAddress.toLowerCase();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs border border-[#00ffcc] text-[#00ffcc] rounded px-2 py-0.5 font-['Space_Mono'] uppercase">
              {dataset.licenseType}
            </span>
            <span className="text-xs text-zinc-500 font-['Space_Mono']">
              {dataset.chunkCount} blob{dataset.chunkCount !== 1 ? 's' : ''} on Ethereum
            </span>
          </div>
          <h1 className="font-['Syne'] text-4xl font-bold mb-3">{dataset.name}</h1>
          <p className="text-zinc-400 leading-relaxed">{dataset.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40">
              <h2 className="font-['Syne'] text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                On-Chain Data
              </h2>
              <div className="space-y-3 font-['Space_Mono'] text-xs">
                <Row label="Manifest TX" value={dataset.manifestTxHash} hash />
                <Row label="Creator" value={dataset.creatorAddress} hash />
                <Row label="File Hash" value={dataset.fileHash} hash />
                <Row label="Content Type" value={dataset.contentType} />
                <Row label="File Size" value={formatSize(dataset.fileSize)} />
                <Row label="Chunks" value={`${dataset.chunkCount} blobs`} />
                <Row
                  label="Published"
                  value={new Date(dataset.createdAt * 1000).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                />
              </div>
            </div>

            {license && (
              <div className="border border-[#00ffcc]/30 rounded-lg p-5 bg-[#00ffcc]/5">
                <h2 className="font-['Syne'] text-sm font-semibold text-[#00ffcc] uppercase tracking-wider mb-4">
                  ✓ License Receipt
                </h2>
                <div className="space-y-3 font-['Space_Mono'] text-xs">
                  <Row label="Receipt Blob TX" value={license.receiptTxHash} hash />
                  <Row label="Amount Paid" value={`${formatEther(BigInt(license.amountPaid))} ETH`} />
                  <Row
                    label="Purchased"
                    value={new Date(license.purchasedAt * 1000).toLocaleDateString()}
                  />
                  <Row label="License Type" value={license.licenseType} />
                </div>
                <Link
                  to={`/verify/${license.receiptTxHash}`}
                  className="mt-4 inline-block text-xs text-[#00ffcc] font-['Space_Mono'] hover:underline"
                >
                  → Verify receipt on-chain
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/60 sticky top-6">
              <div className="mb-5">
                <p className="text-zinc-500 font-['Space_Mono'] text-xs mb-1">License Price</p>
                <p className="font-['Syne'] text-3xl font-bold text-[#00ffcc]">
                  {formatPrice(dataset.priceWei)}
                </p>
              </div>

              {licenseLoading && (
                <p className="text-zinc-500 font-['Space_Mono'] text-xs mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
                  Checking license...
                </p>
              )}

              {license && !licenseLoading && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-[#00ffcc] font-['Space_Mono'] text-xs mb-3">
                    <span className="w-2 h-2 rounded-full bg-[#00ffcc]" />
                    Licensed
                  </div>
                  <a
                    href={`/api/datasets/${dataset.id}/download`}
                    download
                    className="block w-full text-center bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold py-3 rounded hover:bg-[#00ffcc]/90 transition-colors"
                  >
                    Download Dataset
                  </a>
                </div>
              )}

              {isOwner && !license && (
                <div className="text-amber-400 font-['Space_Mono'] text-xs mb-4 border border-amber-800 rounded p-3">
                  You published this dataset.
                </div>
              )}

              {!license && !isOwner && (
                <>
                  {!isConnected && (
                    <p className="text-zinc-500 font-['Space_Mono'] text-xs mb-4">
                      Connect wallet to purchase license.
                    </p>
                  )}

                  {isConnected && step === 'idle' && (
                    <button
                      onClick={handlePurchase}
                      className="w-full bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold py-3 rounded hover:bg-[#00ffcc]/90 transition-colors"
                    >
                      Purchase License
                    </button>
                  )}

                  {['sending-payment', 'waiting-confirmation', 'issuing-receipt'].includes(step) && (
                    <div className="space-y-3">
                      <StepIndicator
                        label="Send ETH Payment"
                        status={step === 'sending-payment' ? 'active' : 'done'}
                      />
                      <StepIndicator
                        label="Ethereum Confirmation"
                        status={
                          step === 'waiting-confirmation'
                            ? 'active'
                            : step === 'issuing-receipt'
                            ? 'done'
                            : 'pending'
                        }
                      />
                      <StepIndicator
                        label="Write Receipt to Blob"
                        status={step === 'issuing-receipt' ? 'active' : 'pending'}
                      />
                      <p className="text-zinc-400 font-['Space_Mono'] text-xs mt-2">{stepMsg}</p>
                    </div>
                  )}

                  {step === 'done' && (
                    <div className="space-y-3">
                      <p className="text-[#00ffcc] font-['Space_Mono'] text-xs">
                        ✓ License issued on blobspace
                      </p>
                      <p className="text-zinc-500 font-['Space_Mono'] text-xs break-all">
                        Receipt: {receiptTxHash.slice(0, 18)}...
                      </p>
                    </div>
                  )}

                  {step === 'error' && (
                    <div className="space-y-3">
                      <p className="text-red-400 font-['Space_Mono'] text-xs">⚠ {purchaseError}</p>
                      <button
                        onClick={() => {
                          setStep('idle');
                          setPurchaseError('');
                        }}
                        className="w-full border border-zinc-600 text-zinc-300 font-['Space_Mono'] text-xs py-2 rounded hover:border-zinc-400 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </>
              )}

              <p className="text-zinc-600 font-['Space_Mono'] text-xs mt-4 pt-4 border-t border-zinc-800">
                2.5% protocol fee applies. Remainder goes directly to creator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hash = false,
}: {
  label: string;
  value: string;
  hash?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500 shrink-0">{label}</span>
      {hash ? (
        <a
          href={`https://sepolia.etherscan.io/tx/${value}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-300 hover:text-[#00ffcc] truncate text-right transition-colors"
          title={value}
        >
          {value.slice(0, 10)}...{value.slice(-8)}
        </a>
      ) : (
        <span className="text-zinc-300 text-right">{value}</span>
      )}
    </div>
  );
}

function StepIndicator({
  label,
  status,
}: {
  label: string;
  status: 'pending' | 'active' | 'done';
}) {
  const dot =
    status === 'done'
      ? 'bg-[#00ffcc]'
      : status === 'active'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-zinc-700';

  const text =
    status === 'done'
      ? 'text-[#00ffcc]'
      : status === 'active'
      ? 'text-amber-400'
      : 'text-zinc-600';

  return (
    <div className={`flex items-center gap-2 font-['Space_Mono'] text-xs ${text}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {label}
    </div>
  );
}

function encodePurchaseCall(datasetId: string): string {
  const selector = 'a8174404';
  const id = BigInt(datasetId).toString(16).padStart(64, '0');
  return selector + id;
}

async function waitForTx(txHash: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const receipt = await (window as any).ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });
      if (receipt && receipt.blockNumber) return;
    } catch {}
  }
  throw new Error('Transaction confirmation timeout');
}