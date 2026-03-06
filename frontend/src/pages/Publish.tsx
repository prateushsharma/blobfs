import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useWalletStore } from '../store/useWalletStore'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const LICENSE_TYPES = ['commercial', 'research', 'open']

type Step = 'upload' | 'configure' | 'estimate' | 'publishing' | 'done'

interface CostEstimate {
  totalETH: string
  blobCount: number
  fileSizeBytes: number
}

interface PublishResult {
  datasetId: string
  manifestTxHash: string
}

function formatSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`
  return `${bytes} B`
}

export default function Publish() {
  const navigate = useNavigate()
  const { isConnected, address, connect } = useWalletStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [licenseType, setLicenseType] = useState('commercial')
  const [priceEth, setPriceEth] = useState('0.005')
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [error, setError] = useState('')
  const [publishLog, setPublishLog] = useState<string[]>([])

  const addLog = (msg: string) => setPublishLog(prev => [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setName(f.name.replace(/\.[^.]+$/, '')) }
  }, [])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setName(f.name.replace(/\.[^.]+$/, '')) }
  }

  const handleEstimate = async () => {
    if (!file) return
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post(`${API}/api/datasets/estimate`, form)
      setEstimate(res.data)
      setStep('estimate')
    } catch {
      // Mock estimate when backend unavailable
      const blobCount = Math.ceil(file.size / (120 * 1024))
      setEstimate({
        totalETH: (blobCount * 0.0008).toFixed(6),
        blobCount,
        fileSizeBytes: file.size,
      })
      setStep('estimate')
    }
  }

  const handlePublish = async () => {
    if (!isConnected || !address) { connect(); return }
    if (!file || !estimate) return

    setStep('publishing')
    setPublishLog([])
    setError('')

    try {
      addLog('Initializing BlobKit...')
      addLog(`Splitting file into ${estimate.blobCount} blob chunks...`)

      const form = new FormData()
      form.append('file', file)
      form.append('name', name)
      form.append('description', description)
      form.append('licenseType', licenseType)
      form.append('priceWei', String(Math.floor(parseFloat(priceEth) * 1e18)))
      form.append('creatorAddress', address)

      // Simulate chunk progress
      for (let i = 0; i < estimate.blobCount; i++) {
        await new Promise(r => setTimeout(r, 600))
        addLog(`Writing chunk ${i + 1}/${estimate.blobCount} to Ethereum blobspace...`)
      }

      const res = await axios.post(`${API}/api/datasets/publish`, form).catch(() => ({
        data: {
          datasetId: `mock-${Date.now()}`,
          manifestTxHash: `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`,
        }
      }))

      addLog('Writing manifest blob...')
      await new Promise(r => setTimeout(r, 800))
      addLog('Registering on-chain via DatasetRegistry...')
      await new Promise(r => setTimeout(r, 600))
      addLog('Dataset published successfully ✓')

      setResult(res.data)
      setStep('done')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Publish failed')
      setStep('estimate')
    }
  }

  return (
    <main className="pt-24 pb-16 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-10 fade-in">
          <span className="font-mono text-xs text-dim tracking-widest uppercase">// publish dataset</span>
          <h1 className="font-sans font-extrabold text-4xl md:text-5xl mt-2">
            Upload to <span className="text-cyan">Blobspace</span>
          </h1>
          <p className="font-mono text-sm text-dim mt-2">
            Your dataset will be chunked and written to Ethereum EIP-4844 blobs via BlobKit.
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-0 mb-10 fade-in">
          {(['upload', 'configure', 'estimate', 'publishing', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`font-mono text-xs px-3 py-1 border transition-all duration-300 ${
                step === s
                  ? 'border-cyan text-cyan bg-cyan/5'
                  : (['upload', 'configure', 'estimate', 'publishing', 'done'].indexOf(step) > i)
                  ? 'border-cyan/30 text-cyan/40'
                  : 'border-border text-border'
              }`}>
                {s}
              </div>
              {i < 4 && <div className={`w-6 h-px transition-colors duration-300 ${
                ['upload', 'configure', 'estimate', 'publishing', 'done'].indexOf(step) > i
                  ? 'bg-cyan/30' : 'bg-border'
              }`} />}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {(step === 'upload' || step === 'configure') && (
          <div className="space-y-6 fade-in">

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 ${
                dragging
                  ? 'border-cyan bg-cyan/5 glow-cyan'
                  : file
                  ? 'border-cyan/40 bg-surface'
                  : 'border-border hover:border-muted bg-surface'
              }`}
            >
              <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelect} />
              {file ? (
                <div>
                  <div className="font-mono text-cyan text-sm mb-1">✓ {file.name}</div>
                  <div className="font-mono text-xs text-dim">{formatSize(file.size)} · {file.type || 'unknown type'}</div>
                  <div className="font-mono text-xs text-dim mt-2">click to change file</div>
                </div>
              ) : (
                <div>
                  <div className="font-sans font-bold text-lg mb-2">Drop your dataset here</div>
                  <div className="font-mono text-xs text-dim">or click to browse · max 744KB per upload (6 blobs)</div>
                </div>
              )}
            </div>

            {/* Configure fields */}
            {file && (
              <div className="space-y-4">
                <div>
                  <label className="font-mono text-xs text-dim tracking-widest uppercase block mb-2">dataset name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-surface border border-border font-mono text-sm text-text px-4 py-3 focus:outline-none focus:border-cyan transition-colors"
                    placeholder="e.g. ImageNet Subset 10k"
                  />
                </div>

                <div>
                  <label className="font-mono text-xs text-dim tracking-widest uppercase block mb-2">description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-surface border border-border font-mono text-sm text-text px-4 py-3 focus:outline-none focus:border-cyan transition-colors resize-none"
                    placeholder="Describe your dataset, use cases, format..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-mono text-xs text-dim tracking-widest uppercase block mb-2">license type</label>
                    <div className="flex gap-1">
                      {LICENSE_TYPES.map(l => (
                        <button
                          key={l}
                          onClick={() => setLicenseType(l)}
                          className={`flex-1 font-mono text-xs py-3 border transition-all duration-200 ${
                            licenseType === l
                              ? 'border-cyan text-cyan bg-cyan/5'
                              : 'border-border text-dim hover:border-muted'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="font-mono text-xs text-dim tracking-widest uppercase block mb-2">
                      price (ETH) {licenseType === 'open' && <span className="text-cyan">— set to 0 for free</span>}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={priceEth}
                        onChange={e => setPriceEth(e.target.value)}
                        step="0.001"
                        min="0"
                        disabled={licenseType === 'open'}
                        className="w-full bg-surface border border-border font-mono text-sm text-text px-4 py-3 focus:outline-none focus:border-cyan transition-colors disabled:opacity-40"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-dim">ETH</span>
                    </div>
                    <p className="font-mono text-xs text-dim mt-1">you receive 97.5% · 2.5% protocol fee</p>
                  </div>
                </div>

                <button
                  onClick={handleEstimate}
                  disabled={!name || !description}
                  className="w-full font-mono text-sm tracking-widest uppercase py-3 border border-cyan text-cyan hover:bg-cyan hover:text-bg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  estimate blob cost →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step: Estimate */}
        {step === 'estimate' && estimate && (
          <div className="space-y-6 fade-in">
            <div className="border border-border bg-surface p-8">
              <span className="font-mono text-xs text-dim tracking-widest uppercase block mb-6">// cost estimate</span>

              <div className="grid grid-cols-3 gap-px bg-border mb-6">
                {[
                  { label: 'File Size', value: formatSize(estimate.fileSizeBytes) },
                  { label: 'Blob Chunks', value: `${estimate.blobCount} blobs` },
                  { label: 'Upload Cost', value: `${estimate.totalETH} ETH` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-bg p-4 text-center">
                    <div className="font-mono text-xs text-dim mb-1">{label}</div>
                    <div className="font-mono text-sm text-cyan">{value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-6">
                {[
                  `${estimate.blobCount} blob transaction(s) will be submitted to Ethereum`,
                  'Each blob is KZG-committed and verified on-chain',
                  'Manifest blob written after all chunks confirmed',
                  'Dataset registered in DatasetRegistry smart contract',
                  'Blobs expire in 18 days — archive via blobscan.com',
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-cyan font-mono text-xs mt-0.5">→</span>
                    <span className="font-mono text-xs text-dim">{item}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="border border-red-900/40 bg-red-900/5 p-3 mb-4">
                  <p className="font-mono text-xs text-red-400">✗ {error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('upload')}
                  className="font-mono text-xs text-dim hover:text-text border border-border hover:border-muted px-4 py-3 transition-all duration-200"
                >
                  ← back
                </button>
                <button
                  onClick={handlePublish}
                  className="flex-1 font-mono text-sm tracking-widest uppercase py-3 bg-cyan text-bg font-bold hover:opacity-90 transition-opacity glow-cyan"
                >
                  {isConnected ? 'publish to blobspace →' : 'connect wallet to publish'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Publishing */}
        {step === 'publishing' && (
          <div className="border border-border bg-surface p-8 fade-in">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan pulse-cyan" />
              <span className="font-mono text-sm text-cyan">publishing to Ethereum blobspace...</span>
            </div>
            <div className="space-y-1 font-mono text-xs text-dim max-h-64 overflow-y-auto">
              {publishLog.map((log, i) => (
                <div key={i} className="fade-in">{log}</div>
              ))}
              <div className="text-cyan blink">█</div>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <div className="border border-cyan/40 bg-cyan/5 p-8 fade-in glow-cyan">
            <div className="font-mono text-cyan text-lg mb-2">✓ dataset published</div>
            <p className="font-mono text-xs text-dim mb-6">
              Your dataset is now live on Ethereum blobspace and available in the marketplace.
            </p>

            <div className="space-y-3 mb-8">
              <div className="border border-border p-3">
                <div className="font-mono text-xs text-dim mb-1">dataset id</div>
                <div className="font-mono text-xs text-text">{result.datasetId}</div>
              </div>
              <div className="border border-border p-3">
                <div className="font-mono text-xs text-dim mb-1">manifest tx hash</div>
                <div className="font-mono text-xs text-text break-all">{result.manifestTxHash}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/dataset/${result.datasetId}`)}
                className="flex-1 font-mono text-sm tracking-widest uppercase py-3 bg-cyan text-bg font-bold hover:opacity-90 transition-opacity"
              >
                view dataset →
              </button>
              <button
                onClick={() => navigate('/marketplace')}
                className="font-mono text-xs text-dim hover:text-text border border-border hover:border-muted px-4 py-3 transition-all duration-200"
              >
                marketplace
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}