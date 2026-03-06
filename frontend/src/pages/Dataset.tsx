import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { BrowserProvider, ethers } from 'ethers'
import { useWalletStore } from '../store/useWalletStore'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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
  file_hash: string
  payload_hash: string
  created_at: number
  active: number
}

interface License {
  licensed: boolean
  receipt: {
    type: string
    buyer: string
    seller: string
    amountPaid: string
    purchasedAt: number
    receiptTxHash: string
    licenseType: string
  } | null
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

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const MOCK_DATASET: Dataset = {
  id: '1',
  name: 'ImageNet Subset 10k',
  description: '10,000 labeled images across 100 categories for computer vision training. Each image is 224x224px, pre-normalized. Includes train/val/test splits and label metadata in JSON format.',
  content_type: 'application/zip',
  file_size: 524288000,
  chunk_count: 5,
  price_wei: '5000000000000000',
  license_type: 'commercial',
  creator_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77',
  manifest_tx_hash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123',
  file_hash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  payload_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  created_at: Date.now() / 1000 - 3600,
  active: 1,
}

export default function Dataset() {
  const { id } = useParams()
  const { address, isConnected, connect } = useWalletStore()

  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [license, setLicense] = useState<License | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'sending' | 'confirming' | 'done' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/datasets/${id}`).catch(() => ({ data: { dataset: MOCK_DATASET } })),
      address
        ? axios.get(`${API}/api/licenses/verify?datasetId=${id}&address=${address}`).catch(() => ({ data: { licensed: false, receipt: null } }))
        : Promise.resolve({ data: { licensed: false, receipt: null } }),
    ]).then(([dRes, lRes]) => {
      setDataset(dRes.data?.dataset || MOCK_DATASET)
      setLicense(lRes.data)
    }).finally(() => setLoading(false))
  }, [id, address])

  const handlePurchase = async () => {
    if (!isConnected || !address) { connect(); return }
    if (!dataset) return

    setPurchasing(true)
    setTxStatus('signing')
    setErrorMsg('')

    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      setTxStatus('sending')
      const tx = await signer.sendTransaction({
        to: dataset.creator_address,
        value: BigInt(dataset.price_wei),
      })

      setTxStatus('confirming')
      setTxHash(tx.hash)
      await tx.wait()

      await axios.post(`${API}/api/licenses/purchase`, {
        datasetId: dataset.id,
        buyerAddress: address,
        paymentTxHash: tx.hash,
      }).catch(() => {})

      setTxStatus('done')
      setLicense({ licensed: true, receipt: null })
    } catch (err: any) {
      setTxStatus('error')
      setErrorMsg(err?.reason || err?.message || 'Transaction failed')
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) {
    return (
      <main className="pt-24 pb-16 px-6 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-surface rounded w-32" />
            <div className="h-10 bg-surface rounded w-2/3" />
            <div className="h-4 bg-surface rounded w-full" />
          </div>
        </div>
      </main>
    )
  }

  if (!dataset) {
    return (
      <main className="pt-24 pb-16 px-6 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-dim">dataset not found</p>
          <Link to="/marketplace" className="font-mono text-xs text-cyan mt-4 block">
            back to marketplace
          </Link>
        </div>
      </main>
    )
  }

  const isOwner = address?.toLowerCase() === dataset.creator_address.toLowerCase()
  const isFree = dataset.license_type === 'open' || dataset.price_wei === '0'

  const etherscanUrl = 'https://sepolia.etherscan.io/tx/' + txHash

  return (
    <main className="pt-24 pb-16 px-6 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8 fade-in">
          <Link to="/marketplace" className="font-mono text-xs text-dim hover:text-cyan transition-colors">
            marketplace
          </Link>
          <span className="font-mono text-xs text-border">/</span>
          <span className="font-mono text-xs text-text truncate max-w-xs">{dataset.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border fade-in">

          {/* Left: Details */}
          <div className="lg:col-span-2 bg-bg p-8 space-y-8">

            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className={`font-mono text-xs px-2 py-0.5 border ${
                  dataset.license_type === 'commercial'
                    ? 'border-cyan/40 text-cyan'
                    : dataset.license_type === 'research'
                    ? 'border-amber/40 text-amber'
                    : 'border-border text-dim'
                }`}>
                  {dataset.license_type}
                </span>
                <span className="font-mono text-xs text-dim">{timeAgo(dataset.created_at)}</span>
                {dataset.active === 1 && (
                  <span className="flex items-center gap-1 font-mono text-xs text-cyan">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-cyan" />
                    active
                  </span>
                )}
              </div>
              <h1 className="font-sans font-extrabold text-3xl md:text-4xl mb-4">{dataset.name}</h1>
              <p className="font-mono text-sm text-dim leading-relaxed">{dataset.description}</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
              {[
                { label: 'File Size', value: formatSize(dataset.file_size) },
                { label: 'Blob Chunks', value: `${dataset.chunk_count} blobs` },
                { label: 'Format', value: dataset.content_type.split('/')[1] },
                { label: 'Creator', value: short(dataset.creator_address) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface p-4">
                  <div className="font-mono text-xs text-dim mb-1">{label}</div>
                  <div className="font-mono text-sm text-text">{value}</div>
                </div>
              ))}
            </div>

            {/* Hashes */}
            <div className="space-y-3">
              <span className="font-mono text-xs text-dim tracking-widest uppercase">// blob references</span>
              {[
                { label: 'manifest tx', value: dataset.manifest_tx_hash },
                { label: 'file hash', value: dataset.file_hash },
                { label: 'payload hash', value: dataset.payload_hash },
              ].map(({ label, value }) => (
                <div key={label} className="border border-border p-3">
                  <div className="font-mono text-xs text-dim mb-1">{label}</div>
                  <div className="font-mono text-xs text-text break-all">{value}</div>
                </div>
              ))}
            </div>

          </div>

          {/* Right: Purchase panel */}
          <div className="bg-bg p-8 flex flex-col gap-6">

            {/* Price */}
            <div className="border border-border p-6 text-center">
              <div className="font-mono text-xs text-dim mb-2 tracking-widest uppercase">license price</div>
              <div className="font-sans font-extrabold text-4xl text-cyan glow-cyan-text">
                {isFree ? 'FREE' : formatEth(dataset.price_wei)}
              </div>
              {!isFree && <div className="font-mono text-xs text-dim mt-1">ETH</div>}
              <div className="font-mono text-xs text-dim mt-3">
                2.5% protocol fee · receipt stored on blob
              </div>
            </div>

            {/* License status */}
            {license?.licensed ? (
              <div className="border border-cyan/40 bg-cyan/5 p-4 text-center glow-cyan">
                <div className="font-mono text-xs text-cyan mb-1">✓ licensed</div>
                <p className="font-mono text-xs text-dim">You hold a valid license for this dataset.</p>
                {license.receipt && (
                  <Link
                    to={'/verify/' + license.receipt.receiptTxHash}
                    className="font-mono text-xs text-cyan hover:underline mt-2 block"
                  >
                    view receipt →
                  </Link>
                )}
              </div>
            ) : isOwner ? (
              <div className="border border-border p-4 text-center">
                <p className="font-mono text-xs text-dim">you own this dataset</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  className="w-full font-mono text-sm tracking-widest uppercase py-3 bg-cyan text-bg font-bold hover:opacity-90 transition-opacity glow-cyan disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {!isConnected
                    ? 'connect wallet'
                    : purchasing
                    ? txStatus === 'signing'
                      ? 'sign in wallet...'
                      : txStatus === 'sending'
                      ? 'sending tx...'
                      : 'confirming...'
                    : isFree
                    ? 'get free license'
                    : 'purchase license'}
                </button>

                {txStatus === 'done' && (
  <div className="border border-cyan/40 bg-cyan/5 p-3 fade-in">
    <p className="font-mono text-xs text-cyan mb-1">✓ license purchased</p>
    {txHash && (
      <a
        href={etherscanUrl}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-dim hover:text-cyan transition-colors break-all block"
      >
        {txHash.slice(0, 20)}... ↗
      </a>
    )}
  </div>
)}

                {txStatus === 'error' && (
                  <div className="border border-red-900/40 bg-red-900/5 p-3 fade-in">
                    <p className="font-mono text-xs text-red-400">✗ {errorMsg}</p>
                  </div>
                )}
              </>
            )}

            {/* What you get */}
            <div className="space-y-2">
              <span className="font-mono text-xs text-dim tracking-widest uppercase">// what you get</span>
              {[
                'Cryptographic receipt stored as Ethereum blob',
                'On-chain proof of purchase via smart contract',
                'Direct dataset download access',
                'KZG-verified data integrity proof',
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-cyan font-mono text-xs mt-0.5">→</span>
                  <span className="font-mono text-xs text-dim">{item}</span>
                </div>
              ))}
            </div>

            <Link
              to={'/verify/' + dataset.manifest_tx_hash}
              className="font-mono text-xs text-dim hover:text-cyan transition-colors text-center block"
            >
              verify dataset integrity ↗
            </Link>

          </div>
        </div>
      </div>
    </main>
  )
}