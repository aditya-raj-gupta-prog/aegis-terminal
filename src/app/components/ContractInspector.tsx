'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { motion } from 'framer-motion';
import { X, BookOpen, Pencil, Loader2, Play, AlertTriangle, FileSearch } from 'lucide-react';
import { parseEther, type Abi, type AbiFunction } from 'viem';
import { getChainMeta } from './chainMeta';

type Props = { address: string; onClose: () => void };

// Coerce a raw string input into the JS type viem expects for the ABI param.
function coerce(type: string, raw: string): unknown {
  const v = raw.trim();
  if (type.endsWith('[]')) return v ? JSON.parse(v) : [];
  if (type === 'bool') return v === 'true' || v === '1';
  if (type.startsWith('uint') || type.startsWith('int')) return v === '' ? BigInt(0) : BigInt(v);
  return v; // address / string / bytes
}

function stringify(out: unknown): string {
  if (typeof out === 'bigint') return out.toString();
  try {
    return JSON.stringify(out, (_, val) => (typeof val === 'bigint' ? val.toString() : val));
  } catch {
    return String(out);
  }
}

// Live verified-contract explorer: pulls a verified ABI from Sourcify for the
// active chain, decompiles it into Read/Write nodes, and lets the user call them
// natively — reads via the public client, writes via wagmi's useWriteContract.
export default function ContractInspector({ address, onClose }: Props) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContract, data: hash, isPending } = useWriteContract();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [abi, setAbi] = useState<Abi>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setAbi([]);
    setName('');
    (async () => {
      try {
        let meta: { output?: { abi?: Abi }; settings?: { compilationTarget?: Record<string, string> } } | null = null;
        for (const match of ['full_match', 'partial_match']) {
          const res = await fetch(`https://repo.sourcify.dev/contracts/${match}/${chainId}/${address}/metadata.json`);
          if (res.ok) {
            meta = await res.json();
            break;
          }
        }
        if (!meta) throw new Error('not verified');
        if (cancelled) return;
        setAbi((meta.output?.abi ?? []) as Abi);
        const target = meta.settings?.compilationTarget;
        setName(target ? Object.values(target)[0] ?? '' : '');
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  const { reads, writes } = useMemo(() => {
    const fns = abi.filter((x): x is AbiFunction => x.type === 'function');
    return {
      reads: fns.filter((f) => f.stateMutability === 'view' || f.stateMutability === 'pure'),
      writes: fns.filter((f) => f.stateMutability !== 'view' && f.stateMutability !== 'pure'),
    };
  }, [abi]);

  const meta = getChainMeta(chainId);
  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;

  return (
    <motion.div
      className="fixed inset-0 z-[95] flex items-start justify-center pt-[8vh] bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950/85 backdrop-blur-xl shadow-[0_0_60px_rgba(34,211,238,0.15)] overflow-hidden"
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FileSearch size={16} className="text-cyan-400" />
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">Contract Inspector</h3>
              <p className="text-white text-sm font-mono">
                {name || short} <span className="text-slate-600 text-[10px]">· {meta.name}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-5 text-xs">
          {status === 'loading' && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Fetching verified ABI from Sourcify…
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-2 text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                No verified source found for <span className="font-mono">{short}</span> on {meta.name}. The contract may
                be unverified, or Sourcify has no record for this network.
              </span>
            </div>
          )}

          {status === 'ready' && (
            <>
              <Section icon={<BookOpen size={12} />} label={`Read · ${reads.length}`} color="#22d3ee">
                {reads.length === 0 && <Empty />}
                {reads.map((fn, i) => (
                  <FunctionNode
                    key={`${fn.name}-${i}`}
                    fn={fn}
                    kind="read"
                    address={address}
                    abi={abi}
                    publicClient={publicClient}
                    writeContract={writeContract}
                    isPending={isPending}
                  />
                ))}
              </Section>

              <Section icon={<Pencil size={12} />} label={`Write · ${writes.length}`} color="#f59e0b">
                {writes.length === 0 && <Empty />}
                {writes.map((fn, i) => (
                  <FunctionNode
                    key={`${fn.name}-${i}`}
                    fn={fn}
                    kind="write"
                    address={address}
                    abi={abi}
                    publicClient={publicClient}
                    writeContract={writeContract}
                    isPending={isPending}
                  />
                ))}
              </Section>

              {hash && (
                <div className="text-[10px] text-emerald-400 font-mono break-all">
                  Last tx broadcast: {hash}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ icon, label, color, children }: { icon: React.ReactNode; label: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 uppercase tracking-widest text-[9px]" style={{ color }}>
        {icon} {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const Empty = () => <div className="text-slate-600 text-[10px]">No functions in this category.</div>;

type NodeProps = {
  fn: AbiFunction;
  kind: 'read' | 'write';
  address: string;
  abi: Abi;
  publicClient: ReturnType<typeof usePublicClient>;
  writeContract: ReturnType<typeof useWriteContract>['writeContract'];
  isPending: boolean;
};

function FunctionNode({ fn, kind, address, abi, publicClient, writeContract, isPending }: NodeProps) {
  const [args, setArgs] = useState<string[]>(fn.inputs.map(() => ''));
  const [value, setValue] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setArg = (i: number, v: string) => setArgs((prev) => prev.map((a, idx) => (idx === i ? v : a)));

  const run = async () => {
    setErr(null);
    setResult(null);
    let parsed: unknown[];
    try {
      parsed = fn.inputs.map((inp, i) => coerce(inp.type, args[i]));
    } catch {
      setErr('Could not parse arguments.');
      return;
    }

    if (kind === 'read') {
      if (!publicClient) return;
      setBusy(true);
      try {
        const out = await publicClient.readContract({
          address: address as `0x${string}`,
          abi,
          functionName: fn.name,
          args: parsed,
        } as Parameters<typeof publicClient.readContract>[0]);
        setResult(stringify(out));
      } catch (e) {
        setErr((e as { shortMessage?: string })?.shortMessage ?? 'Call reverted.');
      } finally {
        setBusy(false);
      }
    } else {
      try {
        writeContract({
          address: address as `0x${string}`,
          abi,
          functionName: fn.name,
          args: parsed,
          ...(fn.stateMutability === 'payable' && value ? { value: parseEther(value) } : {}),
        } as Parameters<typeof writeContract>[0]);
      } catch (e) {
        setErr((e as { shortMessage?: string })?.shortMessage ?? 'Transaction failed.');
      }
    }
  };

  return (
    <div className="rounded-lg border border-white/5 bg-black/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-slate-200 text-[11px]">
          {fn.name}
          <span className="text-slate-600">({fn.inputs.map((i) => i.type).join(', ')})</span>
        </span>
        <button
          onClick={run}
          disabled={busy || (kind === 'write' && isPending)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 ${
            kind === 'read'
              ? 'bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25'
              : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
          }`}
        >
          {busy || (kind === 'write' && isPending) ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {kind === 'read' ? 'Call' : 'Write'}
        </button>
      </div>

      {(fn.inputs.length > 0 || fn.stateMutability === 'payable') && (
        <div className="mt-2 space-y-1.5">
          {fn.inputs.map((inp, i) => (
            <input
              key={i}
              value={args[i]}
              onChange={(e) => setArg(i, e.target.value)}
              placeholder={`${inp.name || `arg${i}`}: ${inp.type}`}
              spellCheck={false}
              className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-cyan-100 placeholder:text-slate-600 outline-none focus:border-cyan-500"
            />
          ))}
          {fn.stateMutability === 'payable' && (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="payable value (ETH)"
              spellCheck={false}
              className="w-full bg-black/60 border border-amber-500/20 rounded px-2 py-1 text-[10px] font-mono text-amber-200 placeholder:text-slate-600 outline-none focus:border-amber-500"
            />
          )}
        </div>
      )}

      {result !== null && (
        <div className="mt-2 text-[10px] font-mono text-emerald-300 break-all">→ {result}</div>
      )}
      {err && <div className="mt-2 text-[10px] font-mono text-red-400 break-all">⚠ {err}</div>}
    </div>
  );
}
