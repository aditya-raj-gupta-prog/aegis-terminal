'use client';

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { getChainMeta } from './chainMeta';

// Typical mock gas tiers per chain. L2s (Arbitrum / Optimism) sit in fractions
// of a Gwei; L1 / testnet values use standard historical-ish averages.
const GAS_PROFILES: Record<number, { fast: number; eco: number; base: number }> = {
  1: { fast: 30, eco: 18, base: 22 },          // Ethereum mainnet
  11155111: { fast: 28, eco: 19, base: 22 },   // Sepolia
  42161: { fast: 0.12, eco: 0.08, base: 0.1 }, // Arbitrum
  10: { fast: 0.06, eco: 0.03, base: 0.05 },   // Optimism
};

const fmt = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(1));

export default function GasTicker({ chainId }: { chainId: number }) {
  const profile = GAS_PROFILES[chainId] ?? GAS_PROFILES[11155111];
  const meta = getChainMeta(chainId);
  // Lazy init from the chain profile (pure). The parent keys this component on
  // chainId, so a network switch remounts it and resets to the new profile.
  const [tiers, setTiers] = useState(() => ({ ...profile }));

  useEffect(() => {
    const jitter = (v: number) => {
      const amp = v < 1 ? 0.04 : 4;
      const floor = v < 1 ? 0.01 : 1;
      return Math.max(floor, v + (Math.random() - 0.5) * amp);
    };
    const id = setInterval(() => {
      setTiers({ fast: jitter(profile.fast), eco: jitter(profile.eco), base: jitter(profile.base) });
    }, 2500);
    return () => clearInterval(id);
  }, [profile.fast, profile.eco, profile.base]);

  const Segment = () => (
    <span className="flex items-center gap-4 px-6">
      <span className="flex items-center gap-1.5">
        <Flame size={11} style={{ color: meta.color }} />
        <span style={{ color: meta.color }} className="uppercase tracking-widest">{meta.name} Gas</span>
      </span>
      <span className="text-emerald-400">FAST: {fmt(tiers.fast)} Gwei</span>
      <span className="text-slate-600">|</span>
      <span className="text-cyan-300">ECO: {fmt(tiers.eco)} Gwei</span>
      <span className="text-slate-600">|</span>
      <span className="text-amber-300">BASE: {fmt(tiers.base)} Gwei</span>
      <span className="text-slate-600">|</span>
    </span>
  );

  // Two identical groups translated -50% give a seamless infinite marquee.
  const Group = () => (
    <div className="flex shrink-0">
      <Segment />
      <Segment />
      <Segment />
    </div>
  );

  return (
    <div className="relative overflow-hidden border-b border-white/10 bg-slate-950/40 backdrop-blur-md h-7 flex items-center sticky top-16 z-40">
      <div className="flex whitespace-nowrap animate-marquee text-[10px] font-mono will-change-transform">
        <Group />
        <Group />
      </div>
    </div>
  );
}
