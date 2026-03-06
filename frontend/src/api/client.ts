import axios, { AxiosInstance, AxiosError } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach wallet address to every request if available
api.interceptors.request.use((config) => {
  const address = localStorage.getItem('walletAddress');
  if (address) config.headers['x-wallet-address'] = address;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const msg =
      (err.response?.data as any)?.error ||
      err.message ||
      'Unknown error';
    return Promise.reject(new Error(msg));
  }
);

export default api;