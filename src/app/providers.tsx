'use client';
import * as React from 'react';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// 1. Setup Wagmi Config with Alchemy & Sepolia
const config = getDefaultConfig({
  appName: 'Aegis-Yield',
  projectId: 'd4c3eacdc3be3a82b3e5a506bac7e916', // Get one at cloud.walletconnect.com
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_WSS_URL?.replace('wss', 'https')),
  },
  ssr: true, // Crucial for Next.js
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}