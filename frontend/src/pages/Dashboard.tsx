import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useWalletStore } from '../store/useWalletStore'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface MyDataset {
  id: string
  name: string
  content_type: string
  file_size: number
  price_wei: string
  license_type: string
  manifest_tx_hash: string
  created_at: number
  active: number
}

interface MyLicense {
  id: string
  dataset_id: string
  receipt_tx_hash: string
  amount_wei: string
  purchased_at: number
  dataset_name?: string
}

interface WalletMetrics {
  totalBlobsWritten: number
  totalEthSpent: string
  totalEarned: string
  datasetsPublished: number
  licensesOwned: number
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
  return `${bytes} B`
}

function formatEth(wei: string) {
  return (Number(BigInt(wei)) / 1e18).toFixed(4)
}

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const MOCK_DATASETS: MyDataset[] = [
  {
    id: '1', name: 'ImageNet Subset 10k', content_type: 'application/zip',
    file_size: 524288000, price_wei: '5000000000000000', license_type: 'commercial',
    manifest_tx_hash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123',
    created_at: Date.now() / 1000 - 86400, active: 1,
  },
  {
    id: '2', name: 'Multilingual NLP Corpus', content_type: 'text/plain',
    file_size: 890000000, price_wei: '0', license_type: 'open',
    manifest_tx_hash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def456',
    created_at: Date.now() / 1000 - 259200, active: 1,
  },
]

const MOCK_LICENSES: MyLicense[] = [
  {
    id: '1', dataset_id: '3', receipt_tx_hash: '0xghi789abc123',
    amount_wei: '500000000000000000', purchased_at: Date.now() / 1000 - 3600,
    dataset_name: 'Medical Imaging Dataset',
  },
  {
    id: '2', dataset_id: '4', receipt_tx_hash: '0xjkl012def456',
    amount_wei: '2000000000000000000', purchased_at: Date.now() / 1000 - 172800,
    dataset_name: 'GPT Instruction Corpus v2',
  },
]

const MOCK_METRICS: WalletMetrics = {
  totalBlobsWritten: 14,
  totalEthSpent: '0.0112',
  totalEarned: '0.0049',
  datasetsPublished: 2,
  licensesOwned: 2,
}

type Tab = 'overview' | 'datasets' | 'licenses'

export default function Dashboard() {
  const { address, balance, isConnected, connect } = useWalletStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [datasets, setDatasets] = useState<MyDataset[]>([])
  const [licenses, setLicenses] = useState<MyLicense[]>([])
  const [metrics, setMetrics] = useState<WalletMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) { setLoading(false); return }

    Promise.all([
      axios.get(`${API}/api/datasets?creator=${address}`).catch(() => ({ data: { datasets: MOCK_DATASETS } })),
      axios.get(`${API}/api/licenses/my?address=${address}`).catch(() => ({ data: { licenses: MOCK_LICENSES } })),
      axios.get(`${API}/api/wallet/metrics?address=${address}`).catch(() => ({ data: MOCK_METRICS })),
    ]).then(([dRes, lRes, mRes]) => {
      setDatasets(dRes.data?.datasets || MOCK_DATASETS)
      setLicenses(lRes.data?.licenses || MOCK_LICENSES)
      setMetrics(mRes.data || MOCK_METRICS)
    }).finally(() => setLoading(false))
  }, [address])

  if (!isConnected) {
    return (
      <main className="pt-24 pb-16 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm fade-in">
          <div className="font-mono text-4xl text-border mb-4">⬡</div>
          <h2 className="font-sans font-bold text-2xl mb-3">Connect your wallet</h2>
          <p className="font-mono text-sm text-dim mb-6">
            Connect to view your published datasets, purchased licenses, and earnings.
          </p>
          <button
            onClick={connect}
            className="font-mono text-sm tracking-widest uppercase px-8 py-3 border border-cyan text-cyan hover:bg-cyan hover:text-bg transition-all duration-200 glow-cyan"
          >
            connect wallet
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="pt-24 pb-16 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-10 fade-in">
          <span className="font-mono text-xs text-dim tracking-widest uppercase">// dashboard</span>
          <div className="flex items-start justify-between mt-2">
            <div>
              <h1 className="font-sans font-extrabold text-4xl md:text-5xl">
                My <span className="text-cyan">BlobFS</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="font-mono text-xs text-dim">{address}</span>
                <span className="font-mono text-xs text-cyan">{balance} ETH</span>
              </div>
            </div>
            <Link
              to="/publish"
              className="hidden md:block font-mono text-xs tracking-widest uppercase px-4 py-2 bg-cyan text-bg font-bold hover:opacity-90 transition-opacity"
            >
              + publish dataset
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border mb-8 fade-in">
          {(['overview', 'datasets', 'licenses'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`font-mono text-xs tracking-widest uppercase px-6 py-3 border-b-2 transition-all duration-200 ${
                tab === t
                  ? 'border-cyan text-cyan'
                  : 'border-transparent text-dim hover:text-text'
              }`}
            >
              {t}
              {t === 'datasets' && datasets.length > 0 && (
                <span className="ml-2 font-mono text-xs bg-surface px-1.5 py-0.5 text-dim">{datasets.length}</span>
              )}
              {t === 'licenses' && licenses.length > 0 && (
                <span className="ml-2 font-mono text-xs bg-surface px-1.5 py-0.5 text-dim">{licenses.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-bg p-6 h-24" />
            ))}
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {tab === 'overview' && metrics && (
              <div className="space-y-8 fade-in">

                {/* Metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
                  {[
                    { label: 'Datasets Published', value: metrics.datasetsPublished.toString(), accent: false },
                    { label: 'Licenses Owned', value: metrics.licensesOwned.toString(), accent: false },
                    { label: 'ETH Earned', value: `${metrics.totalEarned} ETH`, accent: true },
                    { label: 'Blobs Written', value: metrics.totalBlobsWritten.toString(), accent: false },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="bg-bg p-6">
                      <div className={`font-mono text-2xl font-bold mb-1 ${accent ? 'text-cyan glow-cyan-text' : 'text-text'}`}>
                        {value}
                      </div>
                      <div className="font-mono text-xs text-dim tracking-widest uppercase">{label}</div>
                    </div>
                  ))}
                </div>

                {/* ETH activity */}
                <div className="border border-border bg-surface p-6">
                  <span className="font-mono text-xs text-dim tracking-widest uppercase block mb-4">// eth activity</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { label: 'Upload costs (blob gas)', value: `${metrics.totalEthSpent} ETH`, dim: true },
                      { label: 'Licensing revenue', value: `${metrics.totalEarned} ETH`, dim: false },
                      { label: 'Protocol fees paid', value: `${(parseFloat(metrics.totalEthSpent) * 0.025).toFixed(6)} ETH`, dim: true },
                    ].map(({ label, value, dim }) => (
                      <div key={label}>
                        <div className="font-mono text-xs text-dim mb-1">{label}</div>
                        <div className={`font-mono text-lg font-bold ${dim ? 'text-text' : 'text-cyan'}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick links */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
                  <div className="bg-bg p-6">
                    <span className="font-mono text-xs text-dim tracking-widest uppercase block mb-4">// recent datasets</span>
                    {datasets.slice(0, 3).map(d => (
                      <Link key={d.id} to={`/dataset/${d.id}`} className="flex items-center justify-between py-2 hover:text-cyan transition-colors group">
                        <span className="font-sans text-sm group-hover:text-cyan transition-colors truncate max-w-xs">{d.name}</span>
                        <span className="font-mono text-xs text-dim shrink-0 ml-2">{timeAgo(d.created_at)}</span>
                      </Link>
                    ))}
                    {datasets.length === 0 && (
                      <p className="font-mono text-xs text-dim">no datasets yet</p>
                    )}
                  </div>
                  <div className="bg-bg p-6">
                    <span className="font-mono text-xs text-dim tracking-widest uppercase block mb-4">// recent licenses</span>
                    {licenses.slice(0, 3).map(l => (
                      <Link key={l.id} to={`/verify/${l.receipt_tx_hash}`} className="flex items-center justify-between py-2 hover:text-cyan transition-colors group">
                        <span className="font-sans text-sm group-hover:text-cyan transition-colors truncate max-w-xs">{l.dataset_name || l.dataset_id}</span>
                        <span className="font-mono text-xs text-cyan shrink-0 ml-2">{formatEth(l.amount_wei)} ETH</span>
                      </Link>
                    ))}
                    {licenses.length === 0 && (
                      <p className="font-mono text-xs text-dim">no licenses yet</p>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* Datasets Tab */}
            {tab === 'datasets' && (
              <div className="fade-in">
                {datasets.length === 0 ? (
                  <div className="border border-border p-16 text-center">
                    <p className="font-mono text-dim text-sm mb-4">no datasets published yet</p>
                    <Link to="/publish" className="font-mono text-xs text-cyan hover:underline">publish your first dataset →</Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-px bg-border">
                    {datasets.map(d => (
                      <div key={d.id} className="bg-bg p-6 hover:bg-surface transition-colors group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`font-mono text-xs px-2 py-0.5 border ${
                                d.license_type === 'commercial' ? 'border-cyan/40 text-cyan'
                                : d.license_type === 'research' ? 'border-amber/40 text-amber'
                                : 'border-border text-dim'
                              }`}>{d.license_type}</span>
                              <span className={`font-mono text-xs ${d.active ? 'text-cyan' : 'text-dim'}`}>
                                {d.active ? '● active' : '○ inactive'}
                              </span>
                              <span className="font-mono text-xs text-dim">{timeAgo(d.created_at)}</span>
                            </div>
                            <h3 className="font-sans font-bold text-lg mb-1 group-hover:text-cyan transition-colors">{d.name}</h3>
                            <div className="flex gap-4">
                              <span className="font-mono text-xs text-dim">{formatSize(d.file_size)}</span>
                              <span className="font-mono text-xs text-dim">{d.content_type.split('/')[1]}</span>
                            </div>
                            <div className="font-mono text-xs text-dim mt-2 truncate">{d.manifest_tx_hash}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono text-lg font-bold text-cyan">
                              {d.license_type === 'open' ? 'FREE' : `${formatEth(d.price_wei)} ETH`}
                            </div>
                            <Link
                              to={`/dataset/${d.id}`}
                              className="font-mono text-xs text-dim hover:text-cyan transition-colors mt-1 block"
                            >
                              view →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Licenses Tab */}
            {tab === 'licenses' && (
              <div className="fade-in">
                {licenses.length === 0 ? (
                  <div className="border border-border p-16 text-center">
                    <p className="font-mono text-dim text-sm mb-4">no licenses purchased yet</p>
                    <Link to="/marketplace" className="font-mono text-xs text-cyan hover:underline">browse marketplace →</Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-px bg-border">
                    {licenses.map(l => (
                      <div key={l.id} className="bg-bg p-6 hover:bg-surface transition-colors group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-sans font-bold text-lg mb-2 group-hover:text-cyan transition-colors">
                              {l.dataset_name || l.dataset_id}
                            </h3>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="flex items-center gap-1 font-mono text-xs text-cyan">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
                                licensed
                              </span>
                              <span className="font-mono text-xs text-dim">{timeAgo(l.purchased_at)}</span>
                            </div>
                            <div className="font-mono text-xs text-dim truncate">receipt: {l.receipt_tx_hash}</div>
                          </div>
                          <div className="text-right shrink-0 space-y-2">
                            <div className="font-mono text-lg font-bold text-cyan">
                              {formatEth(l.amount_wei)} ETH
                            </div>
                            <div className="flex gap-2">
                              <Link
                                to={`/dataset/${l.dataset_id}`}
                                className="font-mono text-xs text-dim hover:text-cyan transition-colors"
                              >
                                dataset →
                              </Link>
                              <span className="text-border">|</span>
                              <Link
                                to={`/verify/${l.receipt_tx_hash}`}
                                className="font-mono text-xs text-dim hover:text-cyan transition-colors"
                              >
                                receipt →
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </main>
  )
}