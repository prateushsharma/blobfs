import { create } from 'zustand'
import { BrowserProvider, ethers } from 'ethers'

interface WalletState {
  address: string | null
  balance: string | null
  chainId: number | null
  isConnecting: boolean
  isConnected: boolean
  connect: () => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  balance: null,
  chainId: null,
  isConnecting: false,
  isConnected: false,

  connect: async () => {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install it.')
      return
    }
    set({ isConnecting: true })
    try {
      const provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      const network = await provider.getNetwork()
      const balanceWei = await provider.getBalance(address)
      const balance = parseFloat(ethers.formatEther(balanceWei)).toFixed(4)

      set({
        address,
        balance,
        chainId: Number(network.chainId),
        isConnected: true,
        isConnecting: false,
      })
    } catch (err) {
      console.error('Wallet connect failed:', err)
      set({ isConnecting: false })
    }
  },

  disconnect: () => {
    set({
      address: null,
      balance: null,
      chainId: null,
      isConnected: false,
    })
  },

  refreshBalance: async () => {
    const { address } = get()
    if (!address || !window.ethereum) return
    try {
      const provider = new BrowserProvider(window.ethereum)
      const balanceWei = await provider.getBalance(address)
      const balance = parseFloat(ethers.formatEther(balanceWei)).toFixed(4)
      set({ balance })
    } catch (err) {
      console.error('Balance refresh failed:', err)
    }
  },
}))