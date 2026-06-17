'use client';

import { motion } from 'framer-motion';

export type Risk = {
  color: string;
  glow: string;
  label: string;
  critical: boolean;
};

// Shared risk hierarchy used by the gauge and the surrounding card chrome.
//   >= 1.5  -> Safe / low-glow cyan
//   1.1-1.5 -> Volatile / amber
//   < 1.1   -> High alert / pulse-strobe crimson
export function getRisk(val: number): Risk {
  if (val < 1.1) return { color: '#ef4444', glow: 'rgba(239,68,68,0.85)', label: 'High Alert', critical: true };
  if (val < 1.5) return { color: '#f59e0b', glow: 'rgba(245,158,11,0.6)', label: 'Volatile', critical: false };
  return { color: '#22d3ee', glow: 'rgba(34,211,238,0.55)', label: 'Stable', critical: false };
}

export function healthToValue(factor: string | number): number {
  if (factor === 'SAFE' || factor === '---') return 3.0;
  const n = Number(factor);
  return Number.isFinite(n) ? n : 3.0;
}

export default function HealthRadial({ factor }: { factor: string | number }) {
  const val = healthToValue(factor);
  // Map the health factor into a 0-100% arc, treating 3.0+ as a full ring.
  const pct = Math.min(Math.max((val / 3.0) * 100, 0), 100);
  const risk = getRisk(val);

  const size = 184;
  const stroke = 12;
  const radius = (size - stroke) / 2 - 6;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="hr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={risk.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={risk.color} stopOpacity="1" />
          </linearGradient>
          <filter id="hr-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {/* Inner dashed decoration ring (multi-layered depth) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - 16}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
          strokeDasharray="2 7"
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#hr-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          filter="url(#hr-glow)"
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </svg>

      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        animate={risk.critical ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
        transition={risk.critical ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <span
          className="text-3xl font-black tracking-tighter tabular-nums"
          style={{ color: risk.color, textShadow: `0 0 16px ${risk.glow}` }}
        >
          {factor}
        </span>
        <span className="text-[9px] uppercase tracking-[0.3em] mt-1" style={{ color: risk.color }}>
          {risk.label}
        </span>
      </motion.div>
    </div>
  );
}
