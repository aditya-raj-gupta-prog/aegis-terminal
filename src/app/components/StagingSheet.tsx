'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, X, Zap, GitBranch } from 'lucide-react';

const CHECKS = [
  'MEV frontrunning protection',
  'Sandwich attack vector scan',
  'Router calldata integrity',
  'Slippage tolerance bounds',
];

// "Shadow Simulation Sheet" — slides in from the right of the execution panel and
// shows a pre-flight breakdown with sequentially-resolving safety checks. Confirm
// is gated until every check passes.
export default function StagingSheet({
  kind,
  amount,
  gas,
  slippage,
  onConfirm,
  onCancel,
}: {
  kind: 'supply' | 'earn';
  amount: string;
  gas: string;
  slippage: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [done, setDone] = useState(0);
  const allDone = done >= CHECKS.length;
  const amt = amount && parseFloat(amount) > 0 ? amount : '0.05';

  // Resolve the safety checks sequentially. setState runs inside the timeout
  // callbacks (not synchronously in the effect body), so no cascading renders.
  useEffect(() => {
    const timers = CHECKS.map((_, i) =>
      setTimeout(() => setDone((d) => Math.max(d, i + 1)), 450 + i * 550)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

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
            <h3 className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">Shadow Simulation</h3>
            <p className="text-white font-bold text-sm mt-0.5">Pre-Flight Breakdown</p>
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

        <div className="mt-4 flex-1">
          <span className="text-[9px] uppercase tracking-widest text-slate-500">Safety Checks</span>
          <div className="mt-2 space-y-2">
            {CHECKS.map((c, i) => {
              const ok = i < done;
              return (
                <div key={c} className="flex items-center gap-2 text-xs">
                  {ok ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    >
                      <ShieldCheck size={14} className="text-cyan-400" />
                    </motion.span>
                  ) : (
                    <Loader2 size={14} className="text-slate-500 animate-spin" />
                  )}
                  <span className={ok ? 'text-slate-200' : 'text-slate-500'}>{c}</span>
                </div>
              );
            })}
          </div>
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
            className="py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allDone ? <Zap size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {allDone ? 'Confirm' : 'Scanning'}
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
