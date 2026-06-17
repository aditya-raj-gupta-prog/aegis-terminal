'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Terminal, CornerDownLeft } from 'lucide-react';

const HINTS = [
  { cmd: '/supply 10', desc: 'Stage a supply transaction' },
  { cmd: '/scan 0x...', desc: 'Run a contract security scan' },
  { cmd: '/gas-priority', desc: 'Fetch live gas + priority fee' },
  { cmd: '/status', desc: 'Report core engine vitals' },
  { cmd: '/clear', desc: 'Wipe the terminal buffer' },
];

// Centered, glassmorphic command overlay. `onRun` receives the raw typed string
// (slash-prefixed or not); the parent's command processor handles dispatch.
export default function CommandPalette({
  onRun,
  onClose,
}: {
  onRun: (raw: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    onRun(v);
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(value);
  };

  // Filter hints by the typed verb (ignore any trailing arguments).
  const verb = value.replace(/\s.*$/, '');
  const filtered = value === '' ? HINTS : HINTS.filter((h) => h.cmd.includes(verb));

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh] bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="w-full max-w-xl mx-4 rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-[0_0_60px_rgba(34,211,238,0.15)] overflow-hidden"
        initial={{ opacity: 0, y: -20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Terminal size={16} className="text-cyan-400" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Run a command…  e.g. /supply 10"
            className="flex-1 bg-transparent outline-none text-cyan-100 placeholder:text-slate-600 text-sm"
          />
          <kbd className="text-[9px] text-slate-500 border border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
        </form>

        <div className="max-h-64 overflow-y-auto scrollbar-hide py-2">
          {filtered.map((h) => (
            <button
              key={h.cmd}
              onMouseDown={(e) => {
                e.preventDefault();
                run(h.cmd);
              }}
              className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-white/5 group transition-colors"
            >
              <span className="text-cyan-300 text-sm">{h.cmd}</span>
              <span className="text-slate-500 text-xs flex items-center gap-2">
                {h.desc}
                <CornerDownLeft size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-slate-600 text-xs">
              Press Enter to run “{value}”.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
