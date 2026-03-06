import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const LICENSE_TYPES = ['all', 'commercial', 'research', 'open']
const SORT_OPTIONS = ['newest', 'price_asc', 'price_desc', 'popular']

interface Dataset {
  id: string
  name: string
  description: string
  content_type: string
  file_size: number
  chunk_count: number
  price_wei: string
  license_type: string
  creator_address: string
  manifest_tx_hash: string
  created_at: number
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
  return `${bytes} B`
}

function formatEth(wei: string) {
  const eth = Number(BigInt(wei)) / 1e18
  return eth.toFixed(4)
}

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// Mock data for when backend isn't running
const MOCK: Dataset[] = [
  {
    id: '1', name: 'ImageNet Subset 10k', description: '10,000 labeled images for CV training tasks.',
    content_type: 'application/zip', file_size: 524288000, chunk_count: 5,
    price_wei: '5000000000000000', license_type: 'commercial',
    creator_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77',
    manifest_tx_hash: '0xabc123', created_at: Date.now() / 1000 - 3600,
  },
  {
    id: '2', name: 'GPT Instruction Corpus v2', description: 'High-quality instruction-following dataset for LLM fine-tuning.',
    content_type: 'application/json', file_size: 120000000, chunk_count: 2,
    price_wei: '2000000000000000000', license_type: 'commercial',
    creator_address: '0x9c2bF4a8e3B7D1C5E0F6A2D8B4C7E9F1A3D5B7C9',
    manifest_tx_hash: '0xdef456', created_at: Date.now() / 1000 - 86400,
  },
  {
    id: '3', name: 'Medical Imaging Dataset', description: 'Anonymized X-ray and MRI scans for medical AI research.',
    content_type: 'application/zip', file_size: 2147483648, chunk_count: 20,
    price_wei: '500000000000000000', license_type: 'research',
    creator_address: '0x1d8eF2a4B6C8D0E2F4A6B8C0D2E4F6A8B0C2D4E6',
    manifest_tx_hash: '0xghi789', created_at: Date.now() / 1000 - 172800,
  },
  {
    id: '4', name: 'Multilingual NLP Corpus', description: 'Text data across 40 languages for multilingual model training.',
    content_type: 'text/plain', file_size: 890000000, chunk_count: 8,
    price_wei: '0', license_type: 'open',
    creator_address: '0x3b9cA2D4E6F8A0B2C4D6E8F0A2B4C6D8E0F2A4B6',
    manifest_tx_hash: '0xjkl012', created_at: Date.now() / 1000 - 259200,
  },
]

export default function Marketplace() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [license, setLicense] = useState('all')
  const [sort, setSort] = useState('newest')

  useEffect(() => {
    axios.get(`${API}/api/datasets`)
      .then(res => setDatasets(res.data?.datasets || MOCK))
      .catch(() => setDatasets(MOCK))
      .finally(() => setLoading(false))
  }, [])

  const filtered = datasets
    .filter(d => license === 'all' || d.license_type === license)
    .filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === 'newest') return b.created_at - a.created_at
      if (sort === 'price_asc') return Number(BigInt(a.price_wei) - BigInt(b.price_wei))
      if (sort === 'price_desc') return Number(BigInt(b.price_wei) - BigInt(a.price_wei))
      return b.chunk_count - a.chunk_count
    })

  return (
    <main className="pt-24 pb-16 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-10 fade-in">
          <span className="font-mono text-xs text-dim tracking-widest uppercase">// marketplace</span>
          <h1 className="font-sans font-extrabold text-4xl md:text-5xl mt-2 mb-2">
            AI Datasets on <span className="text-cyan">Blobspace</span>
          </h1>
          <p className="font-mono text-sm text-dim">
            {datasets.length} datasets · licensed via Ethereum · verified on-chain
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 fade-in">

          {/* Search */}
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-dim">{'>'}</span>
            <input
              type="text"
              placeholder="search datasets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-surface border border-border font-mono text-sm text-text pl-7 pr-4 py-2.5 focus:outline-none focus:border-cyan transition-colors duration-200 placeholder:text-muted"
            />
          </div>

          {/* License filter */}
          <div className="flex gap-1">
            {LICENSE_TYPES.map(l => (
              <button
                key={l}
                onClick={() => setLicense(l)}
                className={`font-mono text-xs tracking-widest uppercase px-3 py-2.5 border transition-all duration-200 ${
                  license === l
                    ? 'border-cyan text-cyan bg-cyan/5'
                    : 'border-border text-dim hover:border-muted hover:text-text'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-surface border border-border font-mono text-xs text-dim px-3 py-2.5 focus:outline-none focus:border-cyan transition-colors duration-200"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>

        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-bg p-6 h-48 animate-pulse">
                <div className="h-3 bg-surface rounded w-2/3 mb-3" />
                <div className="h-2 bg-surface rounded w-full mb-2" />
                <div className="h-2 bg-surface rounded w-4/5" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border p-16 text-center">
            <p className="font-mono text-dim text-sm">no datasets found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
            {filtered.map(d => (
              <Link
                key={d.id}
                to={`/dataset/${d.id}`}
                className="bg-bg p-6 hover:bg-surface transition-colors duration-200 group block"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <span className={`font-mono text-xs px-2 py-0.5 border ${
                    d.license_type === 'commercial'
                      ? 'border-cyan/40 text-cyan'
                      : d.license_type === 'research'
                      ? 'border-amber/40 text-amber'
                      : 'border-border text-dim'
                  }`}>
                    {d.license_type}
                  </span>
                  <span className="font-mono text-xs text-dim">{timeAgo(d.created_at)}</span>
                </div>

                {/* Name */}
                <h3 className="font-sans font-bold text-lg mb-2 group-hover:text-cyan transition-colors duration-200 leading-tight">
                  {d.name}
                </h3>

                {/* Description */}
                <p className="font-mono text-xs text-dim leading-relaxed mb-4 line-clamp-2">
                  {d.description}
                </p>

                {/* Meta row */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <span className="font-mono text-xs text-dim">
                    <span className="text-text">{formatSize(d.file_size)}</span>
                  </span>
                  <span className="font-mono text-xs text-dim">
                    <span className="text-text">{d.chunk_count}</span> blobs
                  </span>
                  <span className="font-mono text-xs text-dim">
                    <span className="text-text">{d.content_type.split('/')[1]}</span>
                  </span>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <span className="font-mono text-xs text-dim">{short(d.creator_address)}</span>
                  <span className="font-mono text-sm font-bold text-cyan">
                    {d.license_type === 'open' ? 'FREE' : `${formatEth(d.price_wei)} ETH`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}