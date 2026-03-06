import { Link, useLocation } from 'react-router-dom'
import { useWalletStore } from '../store/useWalletStore'

const links = [
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/publish', label: 'Publish' },
  { to: '/verify', label: 'Verify' },
  { to: '/dashboard', label: 'Dashboard' },
]

export default function Navbar() {
  const location = useLocation()
  const { address, balance, isConnecting, isConnected, connect, disconnect } = useWalletStore()

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-cyan font-mono text-lg font-bold glow-cyan-text">
            blob
          </span>
          <span className="font-sans font-800 text-lg text-text">
            FS
          </span>
          <span className="text-dim font-mono text-xs ml-1 pulse-cyan">/</span>
        </Link>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`font-mono text-xs tracking-widest uppercase transition-colors duration-200 ${
                location.pathname.startsWith(to)
                  ? 'text-cyan glow-cyan-text'
                  : 'text-dim hover:text-text'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {isConnected && address ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="font-mono text-xs text-cyan">{balance} ETH</span>
                <span className="font-mono text-xs text-dim">{short(address)}</span>
              </div>
              <button
                onClick={disconnect}
                className="font-mono text-xs text-dim hover:text-text border border-border hover:border-muted px-3 py-1.5 transition-all duration-200"
              >
                disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="font-mono text-xs tracking-widest uppercase px-4 py-2 border border-cyan text-cyan hover:bg-cyan hover:text-bg transition-all duration-200 glow-cyan disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isConnecting ? 'connecting...' : 'connect wallet'}
            </button>
          )}
        </div>

      </div>
    </nav>
  )
}