import { create } from 'zustand';
import { BrowserProvider, ethers } from 'ethers';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SEPOLIA_CHAIN_ID = 11155111;

interface WalletState {
  address: string | null;
  balance: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  balance: null,
  chainId: null,
  isConnecting: false,
  isConnected: false,

  connect: async () => {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install it.');
      return;
    }

    set({ isConnecting: true });

    try {
      const provider = new BrowserProvider(window.ethereum);

      // Request accounts — this is the only MetaMask RPC call we need
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Get chain ID from MetaMask (cheap, no rate limit risk)
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Warn if not on Sepolia
      if (chainId !== SEPOLIA_CHAIN_ID) {
        try {
          await provider.send('wallet_switchEthereumChain', [
            { chainId: '0x' + SEPOLIA_CHAIN_ID.toString(16) },
          ]);
        } catch {
          alert('Please switch MetaMask to Sepolia testnet.');
          set({ isConnecting: false });
          return;
        }
      }

      // Store wallet address in localStorage so API client can attach it
      localStorage.setItem('walletAddress', address);

      set({
        address,
        chainId: SEPOLIA_CHAIN_ID,
        isConnected: true,
        isConnecting: false,
        balance: null, // load separately, don't block connect
      });

      // Fetch balance from backend (uses Alchemy RPC — no rate limit)
      get().refreshBalance();

    } catch (err) {
      console.error('Wallet connect failed:', err);
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    localStorage.removeItem('walletAddress');
    set({
      address: null,
      balance: null,
      chainId: null,
      isConnected: false,
    });
  },

  refreshBalance: async () => {
    const { address } = get();
    if (!address) return;

    try {
      // Use backend which calls Alchemy — avoids MetaMask RPC rate limit
      const { data } = await axios.get(`${API_URL}/api/wallet/balance`);
      set({ balance: parseFloat(data.balanceETH).toFixed(4) });
    } catch {
      // Silently fail — balance is non-critical
    }
  },
}));