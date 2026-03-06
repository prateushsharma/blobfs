import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { listDatasets, DatasetMeta } from '../api/datasets';
import { myLicenses, LicenseReceipt } from '../api/licenses';
import { getWalletBalance, getWalletMetrics, WalletInfo, WalletMetrics } from '../api/wallet';

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatETH(wei: string): string {
  return `${(Number(BigInt(wei)) / 1e18).toFixed(4)} ETH`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [metrics, setMetrics] = useState<WalletMetrics | null>(null);
  const [myDatasets, setMyDatasets] = useState<DatasetMeta[]>([]);
  const [purchases, setPurchases] = useState<LicenseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'published' | 'purchased'>('published');

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }
    loadAll(address);
  }, [address, isConnected]);

  async function loadAll(addr: string) {
    setLoading(true);
    try {
      const [wallet, met, allDatasets, licenses] = await Promise.allSettled([
        getWalletBalance(),
        getWalletMetrics(),
        listDatasets(),
        myLicenses(),
      ]);

      if (wallet.status === 'fulfilled') setWalletInfo(wallet.value);
      if (met.status === 'fulfilled') setMetrics(met.value);
      if (allDatasets.status === 'fulfilled') {
        setMyDatasets(
          allDatasets.value.filter(
            (d) => d.creatorAddress.toLowerCase() === addr.toLowerCase()
          )
        );
      }
      if (licenses.status === 'fulfilled') setPurchases(licenses.value);
    } finally {
      setLoading(false);
    }
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="font-['Syne'] text-2xl font-bold mb-3">Connect Your Wallet</p>
          <p className="text-zinc-500 font-['Space_Mono'] text-sm">
            Connect MetaMask to view your dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-zinc-400 font-['Space_Mono'] text-sm flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
          Loading dashboard...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-12">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-['Syne'] text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-zinc-500 font-['Space_Mono'] text-xs truncate">
            {address}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard
            label="Wallet Balance"
            value={walletInfo ? `${parseFloat(walletInfo.balanceETH).toFixed(4)} ETH` : '—'}
            accent
          />
          <StatCard
            label="Datasets Published"
            value={String(metrics?.totalDatasets ?? myDatasets.length)}
          />
          <StatCard
            label="Licenses Sold"
            value={String(metrics?.totalLicensesSold ?? '—')}
          />
          <StatCard
            label="Blob Gas Spent"
            value={metrics ? `${parseFloat(metrics.totalETHSpent).toFixed(4)} ETH` : '—'}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-0">
          {(['published', 'purchased'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`font-['Space_Mono'] text-sm px-5 py-3 border-b-2 transition-colors capitalize -mb-px ${
                activeTab === tab
                  ? 'border-[#00ffcc] text-[#00ffcc]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'published'
                ? `Published (${myDatasets.length})`
                : `Purchased (${purchases.length})`}
            </button>
          ))}
        </div>

        {/* Published Datasets */}
        {activeTab === 'published' && (
          <div>
            {myDatasets.length === 0 ? (
              <EmptyState
                message="You haven't published any datasets yet."
                cta="Publish Dataset"
                href="/publish"
              />
            ) : (
              <div className="space-y-3">
                {myDatasets.map((d) => (
                  <div
                    key={d.id}
                    className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <Link
                          to={`/dataset/${d.id}`}
                          className="font-['Syne'] font-semibold hover:text-[#00ffcc] transition-colors truncate"
                        >
                          {d.name}
                        </Link>
                        <span className="text-xs border border-zinc-700 text-zinc-400 rounded px-2 py-0.5 font-['Space_Mono'] uppercase shrink-0">
                          {d.licenseType}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-['Space_Mono'] text-xs text-zinc-500">
                        <span>{formatSize(d.fileSize)}</span>
                        <span>{d.chunkCount} blobs</span>
                        <span>{formatDate(d.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="font-['Space_Mono'] text-sm text-[#00ffcc] font-semibold">
                          {formatETH(d.priceWei)}
                        </p>
                        <p className="font-['Space_Mono'] text-xs text-zinc-600">per license</p>
                      </div>
                      <Link
                        to={`/dataset/${d.id}`}
                        className="border border-zinc-700 text-zinc-300 font-['Space_Mono'] text-xs px-3 py-2 rounded hover:border-[#00ffcc] hover:text-[#00ffcc] transition-colors"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Purchased Licenses */}
        {activeTab === 'purchased' && (
          <div>
            {purchases.length === 0 ? (
              <EmptyState
                message="You haven't purchased any licenses yet."
                cta="Browse Marketplace"
                href="/marketplace"
              />
            ) : (
              <div className="space-y-3">
                {purchases.map((r) => (
                  <div
                    key={r.receiptTxHash}
                    className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <Link
                          to={`/dataset/${r.datasetId}`}
                          className="font-['Syne'] font-semibold hover:text-[#00ffcc] transition-colors"
                        >
                          Dataset #{r.datasetId}
                        </Link>
                        <span className="text-xs border border-[#00ffcc]/40 text-[#00ffcc] rounded px-2 py-0.5 font-['Space_Mono'] uppercase shrink-0">
                          {r.licenseType}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-['Space_Mono'] text-xs text-zinc-500">
                        <span>Paid {formatETH(r.amountPaid)}</span>
                        <span>{formatDate(r.purchasedAt)}</span>
                      </div>
                      <p className="font-['Space_Mono'] text-xs text-zinc-600 mt-1 truncate">
                        Receipt: {r.receiptTxHash.slice(0, 18)}...{r.receiptTxHash.slice(-8)}
                      </p>
                    </div>

                   <div className="flex items-center gap-2 shrink-0">
  <Link
    to={`/verify/${r.receiptTxHash}`}
    className="border border-zinc-700 text-zinc-300 font-['Space_Mono'] text-xs px-3 py-2 rounded hover:border-[#00ffcc] hover:text-[#00ffcc] transition-colors"
  >
    Verify
  </Link>

  <a
    href={`/api/datasets/${r.datasetId}/download`}
    download
    className="bg-[#00ffcc] text-black font-['Space_Mono'] text-xs font-bold px-3 py-2 rounded hover:bg-[#00ffcc]/90 transition-colors"
  >
    Download
  </a>
</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/40">
      <p className="font-['Space_Mono'] text-xs text-zinc-500 mb-2 uppercase tracking-wider">
        {label}
      </p>
      <p className={`font-['Syne'] text-2xl font-bold ${accent ? 'text-[#00ffcc]' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  message,
  cta,
  href,
}: {
  message: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="border border-zinc-800 border-dashed rounded-lg p-12 text-center">
      <p className="text-zinc-500 font-['Space_Mono'] text-sm mb-4">{message}</p>
      <Link
        to={href}
        className="inline-block bg-[#00ffcc] text-black font-['Space_Mono'] text-sm font-bold px-6 py-3 rounded hover:bg-[#00ffcc]/90 transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}