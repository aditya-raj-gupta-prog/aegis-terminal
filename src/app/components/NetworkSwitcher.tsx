'use client';

import { useState } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { CHAIN_META, getChainMeta } from './chainMeta';

// Glassmorphic network selector for the header. Reads the active chain via
// useChainId and triggers swaps through useSwitchChain's mutate fn.
export default function NetworkSwitcher() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const active = getChainMeta(chainId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="flex items-center gap-2 text-[10px] uppercase tracking-widest border border-white/10 hover:border-white/20 bg-slate-950/40 backdrop-blur-md rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
        title="Switch network"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: active.color, boxShadow: `0 0 8px ${active.color}` }}
        />
        <span className="text-slate-200">{active.name}</span>
        <ChevronDown size={12} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="absolute right-0 mt-2 w-44 z-50 rounded-xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-[0_0_40px_rgba(34,211,238,0.12)] overflow-hidden p-1"
            >
              {CHAIN_META.map((c) => {
                const isActive = c.id === chainId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (!isActive) switchChain({ chainId: c.id });
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors ${
                      isActive ? 'bg-white/5 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                    />
                    <span className="flex-1">{c.name}</span>
                    {isActive && <span className="text-[8px] text-cyan-400 uppercase tracking-widest">Live</span>}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
