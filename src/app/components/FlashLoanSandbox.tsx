'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Copy, Check, ArrowDown, FlaskConical, Zap } from 'lucide-react';

type StepKind = 'flashloan' | 'swap' | 'repay' | 'custom';

type Step = {
  id: number;
  kind: StepKind;
  target: string;
  method: string;
  payload: string;
  inAsset: string;
  outAsset: string;
  amount: string;   // flashloan principal
  rate: string;     // swap: out units per 1 in
  slippage: string; // %
  gas: string;      // gas units
};

const AAVE_PREMIUM = 0.0009; // 0.09% Aave V3 flash-loan fee
const DEX_FEE = 0.003;       // 0.30% pool fee per swap

let _id = 0;
const nextId = () => ++_id;

const DEFAULT_STEPS: Step[] = [
  { id: nextId(), kind: 'flashloan', target: 'Aave V3 Pool', method: 'flashLoanSimple', payload: '[WETH, 100e18, 0x]', inAsset: 'ETH', outAsset: 'ETH', amount: '100', rate: '', slippage: '', gas: '250000' },
  { id: nextId(), kind: 'swap', target: 'Uniswap V3 Router', method: 'exactInputSingle', payload: '[WETH, USDC, 3000, amountIn]', inAsset: 'ETH', outAsset: 'USDC', amount: '', rate: '3000', slippage: '0.30', gas: '150000' },
  { id: nextId(), kind: 'swap', target: 'Sushiswap Router', method: 'swapExactTokensForETH', payload: '[USDC, WETH, amountIn]', inAsset: 'USDC', outAsset: 'ETH', amount: '', rate: '0.000338', slippage: '0.30', gas: '150000' },
  { id: nextId(), kind: 'repay', target: 'Aave V3 Pool', method: 'repay (principal + premium)', payload: '[WETH, 100.09e18]', inAsset: 'ETH', outAsset: 'ETH', amount: '', rate: '', slippage: '', gas: '0' },
];

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export default function FlashLoanSandbox({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);
  const [gasPrice, setGasPrice] = useState('24'); // Gwei
  const [ethUsd, setEthUsd] = useState(3000);
  const [copied, setCopied] = useState<'sol' | 'json' | null>(null);

  // Pull a live ETH price tick for the USD column (falls back to 3000).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        if (!cancelled && data?.ethereum?.usd) setEthUsd(Number(data.ethereum.usd));
      } catch {
        /* keep fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (id: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: number) => setSteps((prev) => prev.filter((s) => s.id !== id));
  const add = () =>
    setSteps((prev) => [
      ...prev,
      { id: nextId(), kind: 'swap', target: 'DEX Router', method: 'swap', payload: '[]', inAsset: 'ETH', outAsset: 'ETH', amount: '', rate: '1', slippage: '0.30', gas: '150000' },
    ]);

  // --- NET YIELD + GAS ENGINE ---
  const report = useMemo(() => {
    const loan = steps.find((s) => s.kind === 'flashloan');
    const principal = loan ? num(loan.amount) : 0;
    const loanAsset = loan?.inAsset ?? 'ETH';

    // Run the multi-hop pipeline from the flashloan principal.
    let running = principal;
    let asset = loanAsset;
    for (const s of steps) {
      if (s.kind !== 'swap') continue;
      const rate = num(s.rate);
      const slip = num(s.slippage) / 100;
      running = running * rate * (1 - slip) * (1 - DEX_FEE);
      asset = s.outAsset;
    }

    const premium = principal * AAVE_PREMIUM;
    const repayDue = principal + premium;
    const gasUnits = steps.reduce((a, s) => a + num(s.gas), 0);
    const gasETH = (gasUnits * num(gasPrice)) / 1e9;

    let status: 'PROFITABLE' | 'FAIL';
    let message: string;
    let netETH = 0;

    if (asset !== loanAsset) {
      status = 'FAIL';
      message = `Output asset (${asset}) ≠ loan asset (${loanAsset}); loan cannot be repaid.`;
    } else if (running < repayDue) {
      status = 'FAIL';
      message = 'Transaction Reverts due to Slippage — output insufficient to repay flash loan.';
    } else {
      netETH = running - repayDue - gasETH;
      if (netETH > 0) {
        status = 'PROFITABLE';
        message = `+${netETH.toFixed(4)} ETH after gas & ${(AAVE_PREMIUM * 100).toFixed(2)}% premium.`;
      } else {
        status = 'FAIL';
        message = `Unprofitable: ${netETH.toFixed(4)} ETH net after gas overhead.`;
      }
    }

    return {
      status,
      message,
      netETH,
      finalAmount: running,
      finalAsset: asset,
      repayDue,
      premium,
      gasETH,
      gasUnits,
      netUsd: netETH * ethUsd,
    };
  }, [steps, gasPrice, ethUsd]);

  const profitable = report.status === 'PROFITABLE';
  const accent = profitable ? '#34d399' : '#ef4444';
  const glow = profitable ? 'rgba(52,211,153,0.55)' : 'rgba(239,68,68,0.6)';

  // --- EXPORTERS ---
  const solidity = useMemo(() => buildSolidity(steps), [steps]);
  const jsonBundle = useMemo(() => buildJson(steps), [steps]);

  const copy = async (which: 'sol' | 'json') => {
    try {
      await navigator.clipboard.writeText(which === 'sol' ? solidity : jsonBundle);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex items-start justify-center pt-[6vh] bg-black/65 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950/85 backdrop-blur-xl shadow-[0_0_60px_rgba(34,211,238,0.15)] overflow-hidden"
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-cyan-400" />
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">Flash Loan Sandbox</h3>
              <p className="text-white text-sm">Arbitrage Sequence Simulator</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-3 text-xs">
          {/* STEP BUILDER */}
          {steps.map((s, i) => (
            <div key={s.id}>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-300 flex items-center justify-center text-[10px] font-black">{i + 1}</span>
                    <select
                      value={s.kind}
                      onChange={(e) => update(s.id, { kind: e.target.value as StepKind })}
                      className="bg-black/60 border border-white/10 rounded px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-200 outline-none focus:border-cyan-500"
                    >
                      <option value="flashloan">Flashloan</option>
                      <option value="swap">Swap</option>
                      <option value="repay">Repay</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <button onClick={() => remove(s.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Target Contract" value={s.target} onChange={(v) => update(s.id, { target: v })} />
                  <Field label="Method" value={s.method} onChange={(v) => update(s.id, { method: v })} />
                  <Field label="Payload Args" value={s.payload} onChange={(v) => update(s.id, { payload: v })} className="col-span-2" mono />
                  {s.kind === 'flashloan' && (
                    <>
                      <Field label="Principal (ETH)" value={s.amount} onChange={(v) => update(s.id, { amount: v })} />
                      <Field label="Asset" value={s.inAsset} onChange={(v) => update(s.id, { inAsset: v, outAsset: v })} />
                    </>
                  )}
                  {s.kind === 'swap' && (
                    <>
                      <Field label="In → Out" value={`${s.inAsset}/${s.outAsset}`} onChange={(v) => { const [a, b] = v.split('/'); update(s.id, { inAsset: a ?? s.inAsset, outAsset: b ?? s.outAsset }); }} />
                      <Field label="Rate (out/in)" value={s.rate} onChange={(v) => update(s.id, { rate: v })} />
                      <Field label="Slippage %" value={s.slippage} onChange={(v) => update(s.id, { slippage: v })} />
                      <Field label="Gas Units" value={s.gas} onChange={(v) => update(s.id, { gas: v })} />
                    </>
                  )}
                  {(s.kind === 'flashloan' || s.kind === 'repay' || s.kind === 'custom') && (
                    <Field label="Gas Units" value={s.gas} onChange={(v) => update(s.id, { gas: v })} />
                  )}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1 text-slate-600"><ArrowDown size={14} /></div>
              )}
            </div>
          ))}

          <button onClick={add} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/15 text-slate-400 hover:text-white hover:border-white/30 text-[11px] uppercase tracking-widest transition-colors">
            <Plus size={12} /> Add Hop
          </button>

          {/* GAS + REPORT */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Network Gas</span>
            <input
              value={gasPrice}
              onChange={(e) => setGasPrice(e.target.value)}
              className="w-20 bg-black/60 border border-white/10 rounded px-2 py-1 text-[11px] font-mono text-cyan-100 outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-slate-500">Gwei · ETH ≈ ${ethUsd.toLocaleString()}</span>
          </div>

          {/* FINANCIAL REPORT */}
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: `${accent}55`, boxShadow: `0 0 24px ${glow}, inset 0 0 14px ${accent}14` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-black tracking-widest" style={{ color: accent, textShadow: `0 0 14px ${glow}` }}>
                [{report.status}]
              </span>
              {profitable && (
                <span className="text-2xl font-black tabular-nums" style={{ color: accent, textShadow: `0 0 14px ${glow}` }}>
                  +{report.netETH.toFixed(4)} ETH
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300">{report.message}</p>
            <div className="grid grid-cols-4 gap-2 mt-3 text-center">
              <Stat label="Output" value={`${report.finalAmount.toFixed(3)} ${report.finalAsset}`} />
              <Stat label="Repay Due" value={`${report.repayDue.toFixed(3)} ETH`} />
              <Stat label="Gas Cost" value={`${report.gasETH.toFixed(5)} ETH`} />
              <Stat label="Net (USD)" value={`$${report.netUsd.toFixed(2)}`} accent={accent} />
            </div>
          </div>

          {/* EXPORT */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => copy('sol')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-[10px] font-bold uppercase tracking-widest transition-colors">
              {copied === 'sol' ? <Check size={12} /> : <Copy size={12} />} Solidity
            </button>
            <button onClick={() => copy('json')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest transition-colors">
              {copied === 'json' ? <Check size={12} /> : <Copy size={12} />} JSON Bundle
            </button>
            <span className="text-[9px] text-slate-600 flex items-center gap-1"><Zap size={10} /> Ready for Hardhat / Foundry</span>
          </div>

          <pre className="mt-1 max-h-48 overflow-auto scrollbar-hide rounded-lg border border-white/10 bg-black/60 p-3 text-[10px] leading-relaxed text-cyan-200/80 font-mono whitespace-pre">{solidity}</pre>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, value, onChange, className = '', mono = false }: { label: string; value: string; onChange: (v: string) => void; className?: string; mono?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[8px] uppercase tracking-widest text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={`bg-black/60 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-500 ${mono ? 'font-mono text-cyan-100' : ''}`}
      />
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-black/40 rounded-lg border border-white/5 p-2">
      <div className="text-[8px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: accent ?? '#e2e8f0' }}>{value}</div>
    </div>
  );
}

// --- EXPORT BUILDERS ---
function buildSolidity(steps: Step[]): string {
  const calls = steps
    .map((s, i) => {
      const ok = `ok${i + 1}`;
      return `        // Step ${i + 1} — ${s.kind.toUpperCase()} via ${s.target}\n` +
        `        (bool ${ok}, ) = ${addrOf(s.target)}.call(\n` +
        `            abi.encodeWithSignature("${s.method}(${'/* types */'})"${s.payload && s.payload !== '[]' ? ` /*, ${s.payload} */` : ''})\n` +
        `        );\n` +
        `        require(${ok}, "Aegis: step ${i + 1} reverted");`;
    })
    .join('\n\n');

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title AegisArbBundle — generated by Aegis Terminal Sandbox
/// @notice Multi-hop flash-loan arbitrage sequence. Wire concrete addresses,
///         encode real calldata, and run via Hardhat / Foundry.
contract AegisArbBundle {
    function execute() external {
${calls}
    }
}
`;
}

function buildJson(steps: Step[]): string {
  return JSON.stringify(
    {
      version: 'aegis-arb-1',
      steps: steps.map((s, i) => ({
        index: i + 1,
        kind: s.kind,
        target: s.target,
        method: s.method,
        payload: parsePayload(s.payload),
        gas: Number(s.gas) || 0,
      })),
    },
    null,
    2,
  );
}

function parsePayload(p: string): unknown {
  try {
    return JSON.parse(p);
  } catch {
    return p;
  }
}

function addrOf(target: string): string {
  // If a real address was supplied, use it; otherwise emit a named placeholder.
  if (/^0x[a-fA-F0-9]{40}$/.test(target.trim())) return target.trim();
  const slug = target.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `ADDR_${slug}`;
}
