import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { readBlob } from '../api/blobs';
import { verifyLicense, LicenseReceipt } from '../api/licenses';

type VerifyState = 'idle' | 'loading' | 'found' | 'invalid' | 'error';

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatETH(wei: string): string {
  return `${(Number(BigInt(wei)) / 1e18).toFixed(6)} ETH`;
}

export default function Verify() {
  const { hash } = useParams<{ hash?: string }>();
  const navigate = useNavigate();

  const [input, setInput] = useState(hash || '');
  const [state, setState] = useState<VerifyState>(hash ? 'loading' : 'idle');
  const [receipt, setReceipt] = useState<LicenseReceipt | null>(null);
  const [rawBlob, setRawBlob] = useState<string>('');
  const [blobSource, setBlobSource] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (hash) verify(hash);
  }, [hash]);

  async function verify(txHash: string) {
    const cleaned = txHash.trim();
    if (!cleaned.startsWith('0x') || cleaned.length < 10) {
      setState('invalid');
      setErrorMsg('Invalid transaction hash format.');
      return;
    }

    setState('loading');
    setReceipt(null);
    setRawBlob('');
    setErrorMsg('');

    try {
      const blob = await readBlob(cleaned);
      setRawBlob(blob.data);
      setBlobSource(blob.source);

      let parsed: any;
      try {
        parsed = JSON.parse(blob.data);
      } catch {
        setState('found');
        return;
      }

      if (
        parsed.type === 'blobfs-receipt' &&
        parsed.datasetId &&
        parsed.buyer &&
        parsed.seller
      ) {
        try {
          const { licensed, receipt: r } = await verifyLicense(
            parsed.datasetId,
            parsed.buyer
          );
          if (licensed && r) {
            setReceipt(r);
            setState('found');
            return;
          }
        } catch {}

        setReceipt(parsed as LicenseReceipt);
        setState('found');
      } else {
        setState('found');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not read blob');
      setState('error');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    navigate(`/verify/${input.trim()}`);
    verify(input.trim());
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-['Syne'] text-4xl font-bold mb-2">
            Verify <span className="text-[#00ffcc]">Receipt</span>
          </h1>
          <p className="text-zinc-400 font-['Space_Mono'] text-sm">
            Enter a receipt blob TX hash to verify license ownership on Ethereum.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="flex gap-3 mb-10">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x... receipt transaction hash"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#00ffcc] font-['Space_Mono']"
          />
          <button
            type="submit"
            disabled={state === 'loading' || !input.trim()}
            className="bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold px-6 py-3 rounded hover:bg-[#00ffcc]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'loading' ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        {/* Loading */}
        {state === 'loading' && (
          <div className="border border-zinc-800 rounded-lg p-8 bg-zinc-900/40 text-center">
            <div className="flex items-center justify-center gap-3 text-zinc-400 font-['Space_Mono'] text-sm">
              <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
              Reading blob from Ethereum...
            </div>
          </div>
        )}

        {/* Error */}
        {(state === 'error' || state === 'invalid') && (
          <div className="border border-red-800 bg-red-900/20 rounded-lg p-6">
            <p className="text-red-400 font-['Space_Mono'] text-sm mb-2">
              ⚠ Verification Failed
            </p>
            <p className="text-zinc-400 font-['Space_Mono'] text-xs">{errorMsg}</p>
          </div>
        )}

        {/* Found: BlobFS Receipt */}
        {state === 'found' && receipt && (
          <div className="space-y-4">
            {/* Valid badge */}
            <div className="flex items-center gap-3 border border-[#00ffcc]/40 bg-[#00ffcc]/5 rounded-lg px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-[#00ffcc]/20 border border-[#00ffcc] flex items-center justify-center shrink-0">
                <span className="text-[#00ffcc] text-sm">✓</span>
              </div>
              <div>
                <p className="font-['Syne'] font-bold text-[#00ffcc]">
                  Valid License Receipt
                </p>
                <p className="font-['Space_Mono'] text-xs text-zinc-400 mt-0.5">
                  Stored on Ethereum blobspace · Source: {blobSource}
                </p>
              </div>
            </div>

            {/* License details */}
            <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/40">
              <h2 className="font-['Syne'] text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-5">
                License Details
              </h2>
              <div className="space-y-4 font-['Space_Mono'] text-xs">
                <VerifyRow label="Dataset ID" value={receipt.datasetId} />
                <VerifyRow label="License Type" value={receipt.licenseType} badge />
                <VerifyRow label="Amount Paid" value={formatETH(receipt.amountPaid)} highlight />
                <VerifyRow label="Purchased" value={formatDate(receipt.purchasedAt)} />
              </div>
            </div>

            {/* Addresses */}
            <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/40">
              <h2 className="font-['Syne'] text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-5">
                On-Chain Addresses
              </h2>
              <div className="space-y-4 font-['Space_Mono'] text-xs">
                <VerifyRow label="Buyer" value={receipt.buyer} address />
                <VerifyRow label="Seller" value={receipt.seller} address />
                <VerifyRow label="Manifest TX" value={receipt.manifestTxHash} tx />
                <VerifyRow label="Payment TX" value={receipt.ethTxHash} tx />
                <VerifyRow label="Receipt Blob TX" value={receipt.receiptTxHash} tx />
              </div>
            </div>

            {/* Hashes */}
            <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/40">
              <h2 className="font-['Syne'] text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-5">
                Data Integrity
              </h2>
              <div className="space-y-4 font-['Space_Mono'] text-xs">
                <VerifyRow label="File Hash" value={receipt.fileHash} />
                <VerifyRow label="Payload Hash" value={receipt.payloadHash} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <a
                href={`https://sepolia.etherscan.io/tx/${receipt.receiptTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center border border-zinc-700 text-zinc-300 font-['Space_Mono'] text-xs py-3 rounded hover:border-[#00ffcc] hover:text-[#00ffcc] transition-colors"
              >
                View on Etherscan ↗
              </a>
              <Link
                to={`/dataset/${receipt.datasetId}`}
                className="flex-1 text-center bg-[#00ffcc] text-black font-['Space_Mono'] text-xs font-bold py-3 rounded hover:bg-[#00ffcc]/90 transition-colors"
              >
                View Dataset
              </Link>
            </div>
          </div>
        )}

        {/* Found: Raw blob (not a receipt) */}
        {state === 'found' && !receipt && rawBlob && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border border-zinc-700 bg-zinc-900/40 rounded-lg px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center shrink-0">
                <span className="text-zinc-400 text-sm">~</span>
              </div>
              <div>
                <p className="font-['Syne'] font-bold text-zinc-300">
                  Blob Found (Not a BlobFS Receipt)
                </p>
                <p className="font-['Space_Mono'] text-xs text-zinc-500 mt-0.5">
                  Source: {blobSource}
                </p>
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40">
              <p className="font-['Space_Mono'] text-xs text-zinc-400 mb-3 uppercase tracking-wider">
                Raw Blob Data
              </p>
              <pre className="text-xs text-zinc-300 font-['Space_Mono'] overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {rawBlob.length > 2000 ? rawBlob.slice(0, 2000) + '\n...(truncated)' : rawBlob}
              </pre>
            </div>
          </div>
        )}

        {/* Idle: how it works */}
        {state === 'idle' && (
          <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/20">
            <h2 className="font-['Syne'] text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              How Verification Works
            </h2>
            <div className="space-y-3 font-['Space_Mono'] text-xs text-zinc-500">
              <Step n={1} text="Paste the receipt TX hash you received after purchasing a dataset license." />
              <Step n={2} text="BlobFS reads the blob directly from Ethereum blobspace (or archive if >18 days old)." />
              <Step n={3} text="The receipt is decoded and cross-checked against the on-chain license registry." />
              <Step n={4} text="Buyer address, seller address, dataset hash, and payment amount are displayed." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function VerifyRow({
  label,
  value,
  tx = false,
  address = false,
  highlight = false,
  badge = false,
}: {
  label: string;
  value: string;
  tx?: boolean;
  address?: boolean;
  highlight?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-2 border-b border-zinc-800/60 last:border-0">
      <span className="text-zinc-500 shrink-0 pt-0.5">{label}</span>
      {tx ? (
        <a
          href={`https://sepolia.etherscan.io/tx/${value}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-300 hover:text-[#00ffcc] transition-colors text-right truncate max-w-[240px]"
          title={value}
        >
          {value.slice(0, 10)}...{value.slice(-8)}
        </a>
      ) : address ? (
        <a
          href={`https://sepolia.etherscan.io/address/${value}`}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-300 hover:text-[#00ffcc] transition-colors text-right truncate max-w-[240px]"
          title={value}
        >
          {value.slice(0, 10)}...{value.slice(-8)}
        </a>
      ) : badge ? (
        <span className="border border-[#00ffcc]/50 text-[#00ffcc] rounded px-2 py-0.5 uppercase text-xs">
          {value}
        </span>
      ) : highlight ? (
        <span className="text-[#00ffcc] font-semibold">{value}</span>
      ) : (
        <span className="text-zinc-300 text-right break-all">{value}</span>
      )}
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0 text-xs">
        {n}
      </span>
      <span>{text}</span>
    </div>
  );
}