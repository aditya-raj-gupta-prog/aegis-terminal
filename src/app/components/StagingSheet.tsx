'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, X, Zap, GitBranch, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

export type MevStatus = 'pass' | 'warn' | 'crit';
export type MevCheck = { label: string; status: MevStatus; detail: string };

// Visual treatment per security status: green / amber / crimson glow.
const STYLE: Record<MevStatus, { tag: string; color: string; glow: string; Icon: typeof ShieldCheck }> = {
  pass: { tag: 'PASS', color: '#34d399', glow: 'rgba(52,211,153,0.55)', Icon: ShieldCheck },
  warn: { tag: 'WARN', color: '#f59e0b', glow: 'rgba(245,158,11,0.6)', Icon: ShieldAlert },
  crit: { tag: 'CRIT', color: '#ef4444', glow: 'rgba(239,68,68,0.7)', Icon: ShieldX },
};

// Pre-Execution MEV Shield: slides in before broadcast and reveals a high-density
// security scorecard (slippage, gas-priority, mempool/sandwich scan) one row at a
// time. Confirm is gated until the full sweep resolves.
export default function StagingSheet({
  kind,
  amount,
  gas,
  slippage,
  checks,
  onConfirm,
  onCancel,
}: {
  kind: 'supply' | 'earn';
  amount: string;
  gas: string;
  slippage: string;
  checks: MevCheck[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [done, setDone] = useState(0);
  const allDone = done >= checks.length;
  const amt = amount && parseFloat(amount) > 0 ? amount : '0.05';
  const hasCrit = checks.some((c) => c.status === 'crit');

  // Reveal the scorecard rows sequentially. setState runs inside the timeout
  // callbacks (not synchronously in the effect body), so no cascading renders.
  useEffect(() => {
    const timers = checks.map((_, i) =>
      setTimeout(() => setDone((d) => Math.max(d, i + 1)), 450 + i * 520)
    );
    return () => timers.forEach(clearTimeout);
  }, [checks]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <motion.div
        className="relative h-full w-[90%] max-w-sm bg-slate-950/80 backdrop-blur-xl border-l border-white/10 p-5 flex flex-col rounded-r-3xl"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">Pre-Flight MEV Check</h3>
            <p className="text-white font-bold text-sm mt-0.5">Shadow Simulation</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1 text-xs">
          <Row label="Action" value={kind === 'supply' ? 'Supply ETH' : 'Earn / Allocate'} />
          <Row label="Amount" value={`${amt} ETH`} />
          <Row label="Expected Gas" value={`${gas} Gwei`} />
          <Row label="Est. Slippage" value={`${slippage}%`} />
        </div>

        <div className="mt-4">
          <span className="text-[9px] uppercase tracking-widest text-slate-500 flex items-center gap-1">
            <GitBranch size={10} /> Call Route Mapping
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-cyan-200/80">
            {['Wallet', 'Gateway', 'AegisPool', 'aWETH'].map((hop, i, arr) => (
              <span key={hop} className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">{hop}</span>
                {i < arr.length - 1 && <span className="text-slate-600">→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Security scorecard */}
        <div className="mt-4 flex-1 overflow-y-auto scrollbar-hide">
          <span className="text-[9px] uppercase tracking-widest text-slate-500">MEV Shield Scorecard</span>
          <div className="mt-2 space-y-2">
            {checks.map((c, i) => {
              const revealed = i < done;
              const s = STYLE[c.status];
              if (!revealed) {
                return (
                  <div key={c.label} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    Scanning {c.label}…
                  </div>
                );
              }
              return (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 rounded-lg border px-2.5 py-2"
                  style={{ borderColor: `${s.color}40`, boxShadow: `0 0 12px ${s.glow}, inset 0 0 8px ${s.color}14` }}
                >
                  <s.Icon size={14} style={{ color: s.color }} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-black tracking-widest" style={{ color: s.color }}>[{s.tag}]</span>
                      <span className="text-slate-200">{c.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">{c.detail}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {allDone && hasCrit && (
            <p className="mt-3 text-[10px] text-red-400/90 leading-relaxed">
              ⚠ Critical MEV exposure detected. Authorize broadcast only if you accept the sandwich/frontrun risk.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={onCancel}
            className="py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Abort
          </button>
          <button
            onClick={onConfirm}
            disabled={!allDone}
            className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              hasCrit ? 'bg-red-500 hover:bg-red-400 text-slate-950' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
            }`}
          >
            {allDone ? <Zap size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {allDone ? (hasCrit ? 'Override & Broadcast' : 'Authorize') : 'Scanning'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-white font-mono tabular-nums">{value}</span>
    </div>
  );
}
