import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

const stats = [
  { label: 'Datasets Published', value: '1,247', suffix: '' },
  { label: 'ETH in Licensing', value: '84.3', suffix: ' ETH' },
  { label: 'Blob Transactions', value: '9,832', suffix: '' },
  { label: 'Protocol Fee Collected', value: '2.1', suffix: ' ETH' },
]

const steps = [
  {
    step: '01',
    title: 'Publish Dataset',
    desc: 'Upload your AI training data. BlobFS chunks it and writes each piece to Ethereum blobspace via BlobKit.',
  },
  {
    step: '02',
    title: 'Set License & Price',
    desc: 'Define commercial or research license terms. Set your ETH price. Everything is registered on-chain.',
  },
  {
    step: '03',
    title: 'AI Companies License',
    desc: 'Buyers pay ETH directly to your wallet. 97.5% goes to you. 2.5% protocol fee. Receipt stored as a blob.',
  },
  {
    step: '04',
    title: 'Verify Anytime',
    desc: 'Cryptographic proof-of-purchase stored permanently on Ethereum. Auditable, tamper-proof, forever.',
  },
]

const ticker = [
  '0x4a3f...blob written — ImageNet Subset 10k — 0.005 ETH',
  '0x9c2b...license purchased — GPT Training Corpus v2 — 2.0 ETH',
  '0x1d8e...blob confirmed — Medical Imaging Dataset — 0.012 ETH',
  '0x7f4a...receipt issued — Code Instruction Dataset — 0.5 ETH',
  '0x3b9c...blob written — Multilingual NLP Corpus — 0.008 ETH',
]

export default function Landing() {
  const [tickerIndex, setTickerIndex] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [charIndex, setCharIndex] = useState(0)

  // Typewriter effect
  useEffect(() => {
    const current = ticker[tickerIndex]
    if (charIndex < current.length) {
      const t = setTimeout(() => {
        setDisplayText(prev => prev + current[charIndex])
        setCharIndex(i => i + 1)
      }, 28)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => {
        setDisplayText('')
        setCharIndex(0)
        setTickerIndex(i => (i + 1) % ticker.length)
      }, 2400)
      return () => clearTimeout(t)
    }
  }, [charIndex, tickerIndex])

  return (
    <main className="pt-16">

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">

        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(var(--cyan) 1px, transparent 1px),
              linear-gradient(90deg, var(--cyan) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--cyan) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-4xl mx-auto text-center fade-in">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 border border-border px-3 py-1 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-cyan" />
            <span className="font-mono text-xs text-dim tracking-widest uppercase">
              BlobKit Cohort 2 · Ethereum Mainnet
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-sans font-extrabold text-5xl md:text-7xl leading-none tracking-tight mb-6">
            AI Dataset Licensing
            <br />
            <span className="text-cyan glow-cyan-text">on Blobspace</span>
          </h1>

          <p className="font-mono text-sm md:text-base text-dim max-w-2xl mx-auto leading-relaxed mb-10">
            Publish datasets to Ethereum EIP-4844 blobs. AI companies pay ETH to license.
            <br />
            Cryptographic receipts. On-chain royalties. Zero middlemen.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              to="/publish"
              className="font-mono text-sm tracking-widest uppercase px-8 py-3 bg-cyan text-bg font-bold hover:opacity-90 transition-opacity glow-cyan"
            >
              publish dataset →
            </Link>
            <Link
              to="/marketplace"
              className="font-mono text-sm tracking-widest uppercase px-8 py-3 border border-border text-text hover:border-cyan hover:text-cyan transition-all duration-200"
            >
              browse datasets
            </Link>
          </div>

          {/* Live ticker */}
          <div className="border border-border bg-surface px-4 py-3 max-w-xl mx-auto text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-cyan" />
              <span className="font-mono text-xs text-dim">live activity</span>
            </div>
            <p className="font-mono text-xs text-cyan truncate">
              {displayText}<span className="blink">█</span>
            </p>
          </div>

        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
          {stats.map(({ label, value, suffix }) => (
            <div key={label} className="px-8 py-10">
              <div className="font-mono text-3xl font-bold text-cyan glow-cyan-text mb-1">
                {value}<span className="text-lg">{suffix}</span>
              </div>
              <div className="font-mono text-xs text-dim tracking-widest uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <span className="font-mono text-xs text-dim tracking-widest uppercase">// how it works</span>
            <h2 className="font-sans font-bold text-3xl md:text-4xl mt-2">
              From upload to royalty,<br />
              <span className="text-cyan">fully on-chain.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {steps.map(({ step, title, desc }) => (
              <div key={step} className="bg-bg p-8 hover:bg-surface transition-colors duration-200 group">
                <div className="font-mono text-4xl font-bold text-border group-hover:text-cyan transition-colors duration-200 mb-4">
                  {step}
                </div>
                <h3 className="font-sans font-bold text-lg mb-3">{title}</h3>
                <p className="font-mono text-xs text-dim leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack callout */}
      <section className="border-t border-border py-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <span className="font-mono text-xs text-dim tracking-widest uppercase">// powered by</span>
            <div className="flex flex-wrap gap-3 mt-3">
              {['EIP-4844 Blobs', 'BlobKit SDK', 'KZG Commitments', 'Solidity Contracts', 'Sepolia Testnet'].map(tag => (
                <span key={tag} className="font-mono text-xs border border-border px-3 py-1 text-dim hover:border-cyan hover:text-cyan transition-all duration-200">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <Link
            to="/marketplace"
            className="font-mono text-sm tracking-widest uppercase px-8 py-3 border border-cyan text-cyan hover:bg-cyan hover:text-bg transition-all duration-200 whitespace-nowrap"
          >
            explore datasets →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-mono text-xs text-dim">
            © 2025 BlobFS · Built by{' '}
            <a href="https://github.com/prateushsharma" className="text-cyan hover:underline" target="_blank" rel="noreferrer">
              prateushsharma
            </a>
          </span>
          <span className="font-mono text-xs text-dim">
            BlobKit Cohort 2 · 4 ETH Grant
          </span>
        </div>
      </footer>

    </main>
  )
}