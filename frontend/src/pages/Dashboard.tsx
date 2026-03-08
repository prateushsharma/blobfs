import { useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { Link } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Dataset {
  dataset_id: string;
  name: string;
  description: string;
  content_type: string;
  file_size: number;
  chunk_count: number;
  price_wei: string;
  license_type: string;
  manifest_tx_hash: string;
  created_at: number;
  active: boolean;
}

interface Purchase {
  dataset_id: string;
  dataset_name?: string;
  receipt_tx_hash: string;
  amount_wei: string;
  tx_hash: string;
  purchased_at: number;
  seller_address?: string;
}

interface Stats {
  totalDatasets: number;
  totalEarningsWei: string;
  totalPurchases: number;
  totalSpentWei: string;
  totalBlobs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function formatETH(wei: string): string {
  if (!wei || wei === '0') return '0.000';
  const eth = Number(BigInt(wei)) / 1e18;
  return eth.toFixed(4);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function truncateHash(hash: string, chars = 6): string {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

function licenseColor(type?: string): string {
  const map: Record<string, string> = {
    commercial: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    research: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
    'open-source': 'text-violet-400 bg-violet-400/10 border-violet-400/30',
    personal: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  };
  return map[type ?? ''] ?? 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30';
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]">
      {/* Glow dot */}
      <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${accent ?? 'bg-cyan-400'} shadow-lg shadow-current opacity-60`} />
      <p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-3">{label}</p>
      <p className={`text-2xl font-bold font-mono ${accent ? 'text-white' : 'text-white'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500 font-mono">{sub}</p>}
    </div>
  );
}

function DatasetRow({ dataset }: { dataset: Dataset }) {
  const blobscanUrl = `https://sepolia.blobscan.com/tx/${dataset.manifest_tx_hash}`;

  return (
    <div className="group grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-4 rounded-xl border border-white/5 bg-white/[0.02] transition-all duration-200 hover:border-white/10 hover:bg-white/[0.035]">
      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{dataset.name}</p>
          {!dataset.active && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400">
              INACTIVE
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate font-mono">{dataset.dataset_id}</p>
      </div>

      {/* Size */}
      <div className="text-right">
        <p className="text-xs font-mono text-zinc-300">{formatFileSize(dataset.file_size)}</p>
        <p className="text-[10px] text-zinc-600 font-mono">{dataset.chunk_count} blobs</p>
      </div>

      {/* License */}
      <span className={`text-[10px] font-mono px-2 py-1 rounded border ${licenseColor(dataset.license_type ?? dataset.license ?? '')}`}>
        {(dataset.license_type ?? dataset.license ?? 'unknown').toUpperCase()}
      </span>

      {/* Price */}
      <div className="text-right">
        <p className="text-sm font-mono text-cyan-400">{formatETH(dataset.price_wei)} ETH</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <a
          href={blobscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-colors"
        >
          BLOB ↗
        </a>
        <Link
          to={`/dataset/${dataset.dataset_id}`}
          className="text-[10px] font-mono px-2 py-1 rounded border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10 transition-colors"
        >
          VIEW
        </Link>
      </div>
    </div>
  );
}

function PurchaseRow({ purchase }: { purchase: Purchase }) {
  const receiptUrl = `https://sepolia.blobscan.com/tx/${purchase.receipt_tx_hash}`;
  const txUrl = `https://sepolia.etherscan.io/tx/${purchase.tx_hash}`;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-4 rounded-xl border border-white/5 bg-white/[0.02] transition-all duration-200 hover:border-white/10 hover:bg-white/[0.035]">
      {/* Dataset info */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate mb-1">
          {purchase.dataset_name ?? purchase.dataset_id}
        </p>
        <p className="text-[10px] font-mono text-zinc-500">
          {formatDate(purchase.purchased_at)} · {truncateHash(purchase.dataset_id)}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="text-sm font-mono text-emerald-400">{formatETH(purchase.amount_wei)} ETH</p>
        <p className="text-[10px] text-zinc-600 font-mono">paid</p>
      </div>

      {/* Receipt blob link */}
      <a
        href={receiptUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono px-2 py-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-colors whitespace-nowrap"
      >
        RECEIPT ↗
      </a>

      {/* Etherscan tx */}
      <a
        href={txUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono px-2 py-1 rounded border border-cyan-400/20 text-cyan-400 hover:bg-cyan-400/10 transition-colors whitespace-nowrap"
      >
        TX ↗
      </a>
    </div>
  );
}

function EmptyState({ icon, title, sub, action }: {
  icon: string; title: string; sub: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-4xl mb-4 opacity-30">{icon}</div>
      <p className="text-sm font-medium text-zinc-400 mb-1">{title}</p>
      <p className="text-xs text-zinc-600 font-mono mb-4">{sub}</p>
      {action}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type Tab = 'datasets' | 'purchases';

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const [tab, setTab] = useState<Tab>('datasets');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      const [datasetsRes, purchasesRes] = await Promise.allSettled([
        fetch(`${API}/api/datasets?creator=${address}`),
        fetch(`${API}/api/licenses/my?address=${address}`),
      ]);

      let myDatasets: Dataset[] = [];
      let myPurchases: Purchase[] = [];

      if (datasetsRes.status === 'fulfilled' && datasetsRes.value.ok) {
        const json = await datasetsRes.value.json();
        const rawD = json.datasets ?? json.data ?? json;
        const arr: any[] = Array.isArray(rawD) ? rawD : [];
        myDatasets = arr.map((d: any) => ({
          ...d,
          license_type: d.license_type ?? d.license ?? 'unknown',
          price_wei: d.price_wei ?? d.priceWei ?? '0',
          file_size: d.file_size ?? d.fileSize ?? 0,
          chunk_count: d.chunk_count ?? d.chunkCount ?? 0,
          manifest_tx_hash: d.manifest_tx_hash ?? d.manifestTxHash ?? '',
          created_at: d.created_at ?? d.createdAt ?? 0,
        }));
      }

      if (purchasesRes.status === 'fulfilled' && purchasesRes.value.ok) {
        const json = await purchasesRes.value.json();
        const rawP = json.licenses ?? json.purchases ?? json.data ?? json;
        const arrP: any[] = Array.isArray(rawP) ? rawP : [];
        myPurchases = arrP.map((p: any) => ({
          ...p,
          dataset_id: p.dataset_id ?? p.datasetId ?? '',
          receipt_tx_hash: p.receipt_tx_hash ?? p.receiptTxHash ?? '',
          amount_wei: p.amount_wei ?? p.amountWei ?? p.amount ?? '0',
          tx_hash: p.tx_hash ?? p.txHash ?? '',
          purchased_at: p.purchased_at ?? p.purchasedAt ?? 0,
          dataset_name: p.dataset_name ?? p.datasetName ?? p.name,
        }));
      }

      setDatasets(myDatasets);
      setPurchases(myPurchases);

      // Compute stats client-side
      const totalEarnings = myDatasets.reduce((acc, d) => {
        // We'd ideally fetch per-dataset sales; for now show 0 until backend provides it
        return acc;
      }, 0n);

      const totalSpent = myPurchases.reduce(
        (acc, p) => acc + BigInt(p.amount_wei ?? '0'),
        0n
      );

      const totalBlobs = myDatasets.reduce((acc, d) => acc + (d.chunk_count ?? 0), 0);

      setStats({
        totalDatasets: myDatasets.length,
        totalEarningsWei: totalEarnings.toString(),
        totalPurchases: myPurchases.length,
        totalSpentWei: totalSpent.toString(),
        totalBlobs,
      });
    } catch (err: any) {
      setError(err.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ── Not connected ───────────────────────────────────────────────────────────
  if (!isConnected || !address) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a5 5 0 00-10 0v2M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <p className="text-white font-medium mb-2">Connect your wallet</p>
          <p className="text-sm text-zinc-500 font-mono">to view your dashboard</p>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-sm font-mono text-zinc-400">loading dashboard…</span>
        </div>
      </div>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-12">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">BlobFS</span>
              <span className="text-zinc-700">/</span>
              <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {truncateHash(address, 4)}
            </h1>
            <p className="mt-1 text-xs font-mono text-zinc-500">{address}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/publish"
              className="text-xs font-mono px-4 py-2 rounded-lg border border-cyan-400/30 bg-cyan-400/5 text-cyan-400 hover:bg-cyan-400/15 transition-colors"
            >
              + PUBLISH DATASET
            </Link>
            <button
              onClick={() => disconnect()}
              className="text-xs font-mono px-3 py-2 rounded-lg border border-white/10 text-zinc-500 hover:text-white hover:border-white/20 transition-colors"
            >
              DISCONNECT
            </button>
          </div>
        </div>

        {/* ── Error banner ───────────────────────────────────────────── */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-xs font-mono">
            ⚠ {error}
          </div>
        )}

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatCard key="datasets" label="Datasets Published" value={stats?.totalDatasets.toString() ?? '0'} sub={`${stats?.totalBlobs ?? 0} blobs on Ethereum`} accent="bg-cyan-400" />
          <StatCard key="earnings" label="Total Earnings" value={`${formatETH(stats?.totalEarningsWei ?? '0')} ETH`} sub="from dataset sales" accent="bg-emerald-400" />
          <StatCard key="purchases" label="Licenses Purchased" value={stats?.totalPurchases.toString() ?? '0'} sub="datasets licensed" accent="bg-violet-400" />
          <StatCard key="spent" label="Total Spent" value={`${formatETH(stats?.totalSpentWei ?? '0')} ETH`} sub="on licensing" accent="bg-amber-400" />
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-6 border-b border-white/5 pb-0">
          {(['datasets', 'purchases'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 pb-4 text-xs font-mono uppercase tracking-widest transition-colors ${
                tab === t ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {t === 'datasets' ? `My Datasets (${datasets.length})` : `My Purchases (${purchases.length})`}
              {tab === t && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-cyan-400" />
              )}
            </button>
          ))}

          {/* Refresh */}
          <button
            onClick={fetchDashboard}
            className="ml-auto mb-4 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            ↻ REFRESH
          </button>
        </div>

        {/* ── Datasets tab ───────────────────────────────────────────── */}
        {tab === 'datasets' && (
          <div className="space-y-2">
            {datasets.length === 0 ? (
              <EmptyState
                icon="📦"
                title="No datasets published yet"
                sub="upload a dataset to start earning"
                action={
                  <Link
                    to="/publish"
                    className="text-xs font-mono px-4 py-2 rounded-lg border border-cyan-400/30 bg-cyan-400/5 text-cyan-400 hover:bg-cyan-400/15 transition-colors"
                  >
                    PUBLISH YOUR FIRST DATASET →
                  </Link>
                }
              />
            ) : (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                  <span>Dataset</span>
                  <span className="text-right">Size</span>
                  <span>License</span>
                  <span className="text-right">Price</span>
                  <span>Actions</span>
                </div>
                {datasets.map((d) => (
                  <DatasetRow key={d.dataset_id} dataset={d} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Purchases tab ──────────────────────────────────────────── */}
        {tab === 'purchases' && (
          <div className="space-y-2">
            {purchases.length === 0 ? (
              <EmptyState
                icon="🔑"
                title="No licenses purchased yet"
                sub="browse the marketplace to find datasets"
                action={
                  <Link
                    to="/marketplace"
                    className="text-xs font-mono px-4 py-2 rounded-lg border border-cyan-400/30 bg-cyan-400/5 text-cyan-400 hover:bg-cyan-400/15 transition-colors"
                  >
                    BROWSE MARKETPLACE →
                  </Link>
                }
              />
            ) : (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                  <span>Dataset</span>
                  <span className="text-right">Amount</span>
                  <span>Receipt Blob</span>
                  <span>Payment Tx</span>
                </div>
                {purchases.map((p) => (
                  <PurchaseRow key={`${p.dataset_id}-${p.receipt_tx_hash}`} purchase={p} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="mt-16 pt-6 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] font-mono text-zinc-700">
            BlobFS · AI Dataset Licensing on Ethereum Blobspace
          </p>
          <a
            href={`https://sepolia.etherscan.io/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-zinc-700 hover:text-zinc-500 transition-colors"
          >
            VIEW ON ETHERSCAN ↗
          </a>
        </div>
      </div>
    </div>
  );
}