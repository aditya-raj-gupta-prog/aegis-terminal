'use client';
import * as React from 'react';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { sepolia, mainnet, arbitrum, optimism } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// 1. Setup Wagmi Config — Sepolia stays the primary on-chain target; mainnet,
//    Arbitrum and Optimism are registered so the network-switcher HUD can swap
//    between them (public RPC transports for the read-only/HUD chains).
const config = getDefaultConfig({
  appName: 'Aegis-Yield',
  projectId: 'd4c3eacdc3be3a82b3e5a506bac7e916', // Get one at cloud.walletconnect.com
  chains: [sepolia, mainnet, arbitrum, optimism],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_ALCHEMY_WSS_URL?.replace('wss', 'https')),
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
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