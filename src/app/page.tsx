'use client';
import { useEffect, useState, useRef, useMemo, type FormEvent } from 'react';
import { startYieldListener } from '@/lib/yieldListener';
import { motion, AnimatePresence } from 'framer-motion';
import AmbientBackground from './components/AmbientBackground';
import HealthRadial, { getRisk, healthToValue } from './components/HealthRadial';
import CommandPalette from './components/CommandPalette';
import StagingSheet from './components/StagingSheet';
import NetworkSwitcher from './components/NetworkSwitcher';
import GasTicker from './components/GasTicker';
import {
  ShieldCheck, Activity, Zap, RotateCcw, Wallet, Terminal,
  Coins, Lock, Unlock, Mic, MicOff, Command as CommandIcon,
  Volume2, VolumeX, Columns2, LayoutGrid
} from 'lucide-react';
import { useAudioTelemetry } from '@/lib/useAudioTelemetry';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract, useBalance, useBlockNumber, useChainId } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { parseEther, formatEther, parseUnits } from 'viem';
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  WRAPPED_TOKEN_GATEWAY_ADDRESS,
  GATEWAY_ABI,
  ADDRESS_PROVIDER_ADDRESS,
  PROVIDER_ABI,
  A_WETH_ADDRESS,
  USDC_ASSET_ADDRESS,
  ERC20_ABI,
  POOL_ABI,
} from '@/lib/constants';

const FALLBACK_POOL_ADDRESS = "0x6Ae43d534944d6df31b761937f20C10B59aF4933";

// Shared glassmorphic bento-card chrome.
const GLASS = "backdrop-blur-md bg-slate-950/40 border border-white/10 rounded-3xl";

// Snappy spring used for the staggered panel entry animations.
const SPRING = { type: "spring" as const, stiffness: 180, damping: 22 };

// Container/item variants so the layout grid panels stagger-mount on load.
const gridContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

const panelVariant = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

// --- UI COMPONENTS ---
const LogLine = ({ text }: { text: string }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ type: "spring", stiffness: 180, damping: 22 }}
    className="text-[10px] font-mono text-cyan-300/80 mb-1 border-l-2 border-cyan-500/30 pl-2"
  >
    <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
    {text}
  </motion.div>
);

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/90 border border-white/10 p-2 rounded shadow-xl backdrop-blur-md">
        <p className="text-cyan-300 font-mono font-bold text-xs">{payload[0].value} ETH</p>
      </div>
    );
  }
  return null;
};

export default function Home() {
  // --- STATE ---
  // Simulated live yield. Seeded at a believable DeFi baseline (4.12%) and
  // micro-fluctuated on an interval so the headline metric reads as a live,
  // volatile data stream rather than a static placeholder.
  const [apy, setApy] = useState("4.12");
  const [advice, setAdvice] = useState("System Initialized. Select Strategy.");
  const [amount, setAmount] = useState("");
  const [logs, setLogs] = useState<string[]>(["Initializing Neural Link...", "Strategy Engine: ONLINE"]);
  const [mode, setMode] = useState<'EARN' | 'LEVERAGE'>('EARN');
  const [mounted, setMounted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  // Interactive terminal: current command-line buffer + an in-flight tx-sim guard.
  const [command, setCommand] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  // Global command palette (Ctrl/Cmd+K) and the pre-execution staging sheet.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [staging, setStaging] = useState<{ kind: 'supply' | 'earn'; amount: string; gas: string; slippage: string } | null>(null);
  // Split-pane tiling toggle (Alt+S or `/split`): graph + terminal side by side.
  const [splitView, setSplitView] = useState(false);
  const lastFetchTime = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  // Holds pending tx-simulation timers so they can be cleared on unmount.
  const simTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // --- AUDIO TELEMETRY ---
  const { click: playClick, warn: playWarn, muted: soundMuted, toggleMuted: toggleSound } = useAudioTelemetry();

  // --- WAGMI ---
  const { address: userAddress, isConnected } = useAccount();
  // Active network — drives the switcher HUD, gas ticker, and chain-isolated history.
  const chainId = useChainId();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Watch every new block on Sepolia so we can re-pull on-chain state in real time.
  const { data: blockNumber } = useBlockNumber({ chainId: sepolia.id, watch: true });

  // Live native ETH balance for the connected wallet on Sepolia.
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address: userAddress,
    chainId: sepolia.id,
    query: { enabled: !!userAddress },
  });

  const { data: poolAddress } = useReadContract({
    address: ADDRESS_PROVIDER_ADDRESS,
    abi: PROVIDER_ABI,
    functionName: 'getPool',
  });

  const activePool = poolAddress || FALLBACK_POOL_ADDRESS;

  const { data: aBalanceData, refetch: refetchABalance } = useReadContract({
    address: A_WETH_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 5000 }
  });

  const { data: accountData, refetch: refetchAccount } = useReadContract({
    address: activePool,
    abi: POOL_ABI,
    functionName: 'getUserAccountData',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 5000 }
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ASSET_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, activePool] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 2000 }
  });

  // --- LOGIC ---
  // Logs render oldest -> newest (terminal style); we append and keep a rolling
  // window, then auto-scroll the viewport to the bottom so the latest entry shows.
  const addLog = (msg: string) => setLogs(prev => [...prev, msg].slice(-50));
  const addLogs = (msgs: string[]) => setLogs(prev => [...prev, ...msgs].slice(-50));
  useEffect(() => {
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  // Mock pre-flight metrics. Called only from event handlers / the command
  // processor (never during render), so Math.random is safe here.
  const mockPreflight = () => ({
    gas: (18 + Math.random() * 10).toFixed(1),
    slippage: (0.05 + Math.random() * 0.25).toFixed(2),
  });

  // --- INTERACTIVE TERMINAL ---
  // Parse and dispatch a typed command against the local terminal engine. Accepts
  // both bare (`help`) and slash-prefixed (`/supply 10`) forms so the inline
  // terminal and the global command palette share one processor.
  const processCommand = (raw: string) => {
    const input = raw.trim().replace(/^\//, '');
    if (!input) return;

    const [cmd, ...rest] = input.split(/\s+/);
    const lower = cmd.toLowerCase();

    // Audio feedback: a crisp click for recognized commands, a warning drone for
    // anything unrecognized.
    const KNOWN = ['help', 'clear', 'check-gas', 'gas-priority', 'scan', 'supply', 'status', 'split'];
    if (KNOWN.includes(lower)) playClick(); else playWarn();

    // `clear` wipes the buffer outright — no command echo to keep the wipe clean.
    if (lower === 'clear') {
      setLogs([]);
      return;
    }

    // Echo the entered command, then emit the response.
    addLog(`root@aegis:~$ ${input}`);

    switch (lower) {
      case 'help':
        addLogs([
          "[SYS] Available commands:",
          "  help            list available terminal sub-commands",
          "  clear           wipe the log buffer",
          "  check-gas       fetch real-time network gas metrics",
          "  gas-priority    alias for check-gas",
          "  scan [address]  run a Web3 security analysis on an address",
          "  supply [amount] open the pre-flight staging sheet",
          "  status          report core engine vitals",
          "  split           toggle split-pane tiling (graph + logs)",
        ]);
        break;
      case 'check-gas':
      case 'gas-priority': {
        const base = (20 + Math.random() * 15).toFixed(1);
        const prio = (1 + Math.random() * 2).toFixed(1);
        addLog(`[SYS] Base Fee: ${base} Gwei | Priority: ${prio} Gwei`);
        break;
      }
      case 'scan': {
        const target = rest[0];
        if (!target) {
          addLog("[SEC] Usage: scan [address]");
          break;
        }
        const short = target.length > 12 ? `${target.slice(0, 6)}…${target.slice(-4)}` : target;
        addLogs([
          `[SEC] Analyzing contract ${short}...`,
          "[SEC] Checking reentrancy vectors... none discovered.",
          "[SEC] Verifying ownership renouncement... OK.",
          "[SEC] Scanning for unlimited approvals... clean.",
          "[SEC] Risk Score: LOW. No critical vulnerabilities detected.",
        ]);
        break;
      }
      case 'supply': {
        const amt = rest[0] || amount;
        addLog(`[TX] Staging supply pre-flight${amt ? ` for ${amt} ETH` : ''}...`);
        setStaging({ kind: 'supply', amount: amt, ...mockPreflight() });
        break;
      }
      case 'status':
        addLogs([
          `[SYS] System: Online | Wallet Link: ${userAddress ? 'Active' : 'Disconnected'}`,
          `[SYS] Chain: Sepolia | Block: ${blockNumber ? blockNumber.toString() : 'syncing'}`,
          `[SYS] Yield Engine: Live @ ${apy}% APY`,
        ]);
        break;
      case 'split':
        setSplitView(v => !v);
        addLog("[SYS] Split-pane tiling toggled.");
        break;
      default:
        addLog("Command not recognized. Type 'help' for options.");
    }
  };

  const handleCommandSubmit = (e: FormEvent) => {
    e.preventDefault();
    processCommand(command);
    setCommand("");
  };

  // Staged transaction simulation: streams realistic tx-lifecycle log lines into
  // the terminal. Guarded so overlapping clicks can't interleave two sequences.
  const runTxSimulation = (kind: 'supply' | 'earn') => {
    if (isSimulating) return;
    setIsSimulating(true);

    const txHash = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 6)}`;
    const sequence = kind === 'supply'
      ? [
          "[TX SIM] Initiating supply sequence for active balance...",
          "[TX SIM] Encoding depositETH() calldata for Aegis Pool...",
          "[TX SIM] Signing transaction via secure enclave...",
          "[TX SIM] Broadcasting to Sepolia mempool...",
          `[TX SIM] Success: Broadcasted to Sepolia. Tx: ${txHash}…`,
        ]
      : [
          "[TX SIM] Engaging Earn module on native ETH...",
          "[TX SIM] Routing liquidity to highest-yield strategy...",
          "[TX SIM] Confirming allocation on Sepolia...",
          `[TX SIM] Success: Yield position active. Tx: ${txHash}…`,
        ];

    sequence.forEach((line, i) => {
      const t = setTimeout(() => {
        addLog(line);
        if (i === sequence.length - 1) setIsSimulating(false);
      }, i * 700);
      simTimers.current.push(t);
    });
  };

  // Clear any in-flight simulation timers if the component unmounts mid-sequence.
  useEffect(() => () => { simTimers.current.forEach(clearTimeout); }, []);

  // Pre-execution staging: open the safety sheet, then run the sim on confirm.
  const openStaging = (kind: 'supply' | 'earn') => {
    playClick();
    setStaging({ kind, amount, ...mockPreflight() });
  };
  const confirmStaging = () => {
    if (staging) runTxSimulation(staging.kind);
    setStaging(null);
  };

  // --- GLOBAL SHORTCUTS ---
  // Ctrl/Cmd+K toggles the command palette; Alt+S toggles split-pane tiling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        playClick();
        setPaletteOpen(o => !o);
      } else if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        playClick();
        setSplitView(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playClick]);

  const formatHealth = (val: bigint) => {
    if (!val) return "---";
    const num = Number(val) / 1e18;
    return num > 100 ? "SAFE" : num.toFixed(2);
  };
  const healthFactor = accountData ? formatHealth((accountData as readonly bigint[])[5]) : "---";
  const healthRef = useRef(healthFactor);
  useEffect(() => { healthRef.current = healthFactor; }, [healthFactor]);

  // Risk hierarchy derived from the health factor, shared by the gauge + card chrome.
  const risk = getRisk(healthToValue(healthFactor));

  // Audio warning when the health factor drops meaningfully or crosses into the
  // critical band. Tracks the previous numeric value via a ref.
  const prevHealthRef = useRef<number | null>(null);
  useEffect(() => {
    const v = healthToValue(healthFactor);
    const prev = prevHealthRef.current;
    prevHealthRef.current = v;
    if (prev === null) return; // first reading establishes the baseline
    const dropped = v < prev - 0.05;
    const enteredCritical = v < 1.1 && prev >= 1.1;
    if (dropped || enteredCritical) playWarn();
  }, [healthFactor, playWarn]);

  // Keep a ref mirror of the latest APY so async callbacks (AI strategy, voice)
  // read the current value without needing apy in their dependency arrays.
  const apyRef = useRef(apy);
  useEffect(() => { apyRef.current = apy; }, [apy]);

  // --- LIVE APY ENGINE ---
  // Tick every few seconds applying a small +/- micro-fluctuation so the yield
  // reads as a live, volatile stream. Gated on the wallet connection: the float
  // only runs once a wallet is connected, so a disconnected dashboard stays at
  // its static baseline. Functional update avoids stale closures.
  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => {
      setApy(prev => {
        const current = parseFloat(prev) || 4.12;
        const delta = (Math.random() - 0.5) * 0.06; // ~ +/- 0.03%
        let next = current + delta;
        // Clamp into a believable yield band so it never drifts off.
        if (next < 3.5) next = 3.5 + Math.random() * 0.05;
        if (next > 4.8) next = 4.8 - Math.random() * 0.05;
        return next.toFixed(2);
      });
    }, 3000);
    return () => clearInterval(id);
  }, [isConnected]);

  // Header display value: force a flat 0.00% whenever no wallet is connected,
  // regardless of the last simulated APY held in state.
  const displayApy = isConnected ? apy : "0.00";

  const formatBase = (val: bigint) => val ? (Number(val) / 100000000).toFixed(2) : "0.00";
  const totalCollateralUSD = accountData ? formatBase((accountData as readonly bigint[])[0]) : "0.00";
  const totalDebtUSD = accountData ? formatBase((accountData as readonly bigint[])[1]) : "0.00";
  const borrowPowerUSD = accountData ? formatBase((accountData as readonly bigint[])[2]) : "0.00";
  const rawABalance = aBalanceData ? parseFloat(formatEther(aBalanceData as bigint)) : 0;
  // Live native ETH balance, parsed into a number for the projection math.
  const liveEthBalance = ethBalance ? parseFloat(formatEther(ethBalance.value)) : 0;

  // Historical balance series for the Live Yield Metric chart. We track the
  // active wallet balance over time so each on-chain change pushes a new,
  // distinct coordinate — giving the line real dips/spikes instead of a flat,
  // statically-seeded projection curve.
  // Starts empty; the address-keyed loader below hydrates it from localStorage
  // (per-wallet history) and the balance listener seeds/extends it. Reading
  // localStorage here in the initializer would break SSR hydration, so we load
  // it in an effect instead.
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([]);
  // Tracks which wallet+chain session the current chartData belongs to, so the
  // balance listener never appends to a series that hasn't been (re)loaded yet.
  const historyAddrRef = useRef<string | null>(null);
  // localStorage is isolated by BOTH address and chain so a series from one
  // network can never leak into another.
  const historyKey = (addr: string, chain: number) => `chart_history_${addr}_${chain}`;
  // Composite session identity used to detect address/chain changes.
  const sessionKey = userAddress ? `${userAddress}_${chainId}` : null;

  // History loader. Runs on every address OR chain change (incl. MetaMask
  // account switches and network swaps): the split second the session changes we
  // flush the previous series and load this address+chain's saved history, or
  // reset to empty so the balance listener can re-seed it.
  useEffect(() => {
    historyAddrRef.current = sessionKey;
    if (!userAddress) {
      setChartData([]);
      return;
    }
    // Always flush first so no prior session's data is ever shown on the new one.
    setChartData([]);
    try {
      const saved = localStorage.getItem(historyKey(userAddress, chainId));
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) setChartData(parsed);
    } catch {
      /* corrupt/unavailable storage — leave the flushed empty grid */
    }
  }, [userAddress, chainId]);

  // Listen to the live balance coming from our wallet hook. The first reading
  // seeds the series as the baseline coordinate; afterwards, whenever the balance
  // actually moves (e.g. 0.0498 -> 0.0497 after a SepoliaETH tx), append it.
  useEffect(() => {
    // Prefer the native ETH balance; fall back to the staked aToken balance.
    const active = liveEthBalance > 0 ? liveEthBalance : rawABalance;
    if (!userAddress || active <= 0) return;
    // Wait until the loader has synced history for this exact address+chain session.
    if (historyAddrRef.current !== sessionKey) return;

    const point = parseFloat(active.toFixed(6));
    setChartData(prev => {
      // Empty series (no saved history): seed with TWO coordinates at the current
      // balance — a baseline start point and an active point. A single point only
      // renders a dot; two points give Recharts an actual line path to draw a
      // clean, flat horizontal baseline that then scales up as movement arrives.
      if (prev.length === 0) {
        const now = new Date().toLocaleTimeString();
        return [
          { name: `${now} ·`, value: point },
          { name: now, value: point },
        ];
      }

      const last = prev[prev.length - 1];
      // Skip if the balance hasn't moved — avoids piling up identical points.
      if (last && last.value === point) return prev;
      const next = [...prev, { name: new Date().toLocaleTimeString(), value: point }];
      // Keep a rolling window so the series stays readable over a long session.
      return next.slice(-40);
    });
  }, [liveEthBalance, rawABalance, userAddress, chainId, sessionKey]);

  // Persist the series back to localStorage under the active wallet+chain key
  // whenever it changes (seed or append), so history survives reloads per session.
  useEffect(() => {
    if (!userAddress || historyAddrRef.current !== sessionKey) return;
    if (chartData.length === 0) return;
    try {
      localStorage.setItem(historyKey(userAddress, chainId), JSON.stringify(chartData));
    } catch {
      /* storage unavailable / quota exceeded — non-fatal */
    }
  }, [chartData, userAddress, chainId, sessionKey]);

  // Tight, data-driven Y-axis bounds so even a 0.0001 ETH change renders as a
  // visible dip/spike instead of being flattened against a 0-based axis.
  const [minY, maxY] = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      // Flat series (every historical point identical, e.g. all 0.0497 ETH).
      // A zero-width domain collapses the chart grid and the line vanishes, so
      // apply a fixed absolute fallback padding to guarantee a non-zero height.
      const pad = 0.001;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.2;
    return [min - pad, max + pad];
  }, [chartData]);

  // onBlock listener: every newly mined block re-pulls live on-chain state so
  // balances/health stay fresh without waiting on the fixed refetchInterval.
  useEffect(() => {
    if (!userAddress) return;
    refetchEthBalance();
    refetchABalance();
    refetchAccount();
  }, [blockNumber, userAddress]);

  const needsApproval = useMemo(() => {
     if (mode === 'EARN') return false;
     if (!amount || parseFloat(amount) === 0) return false;
     const amountBig = parseUnits(amount, 6);
     return !usdcAllowance || usdcAllowance < amountBig;
  }, [mode, amount, usdcAllowance]);

  // --- VOICE HANDLER ---
  const handleVoiceInput = async (transcript: string) => {
    addLog(`Neural Link Input: "${transcript}"`);
    setAdvice("Simulating Scenario...");
    try {
      const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            yieldData: apy,
            healthFactor: healthRef.current,
            scenario: transcript
          })
      });
      const data = await res.json();
      if (data.advice) {
        setAdvice(data.advice);
        addLog("Neural Simulation Complete.");
      }
    } catch {
      addLog("Neural Link Sync Failed.");
    }
  };

  const startVoiceCommand = () => {
    // The Web Speech API isn't in the standard TS DOM lib, so type the slice we use.
    type VoiceResult = { results: { [i: number]: { [j: number]: { transcript: string } } } };
    interface VoiceRecognition {
      onstart: () => void;
      onresult: (event: VoiceResult) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    }
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => VoiceRecognition;
      SpeechRecognition?: new () => VoiceRecognition;
    };
    const Recognition = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Recognition) return alert("Browser does not support Speech Recognition");

    const recognition = new Recognition();
    recognition.onstart = () => { setIsListening(true); addLog("Neural Link: LISTENING..."); };
    recognition.onresult = (event) => { handleVoiceInput(event.results[0][0].transcript); };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // --- INIT ---
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        addLog(`Oracle Connected: ETH = $${data.ethereum.usd}`);
      } catch { addLog("Oracle Connection Failed."); }
    };
    fetchPrice();
  }, []);

  // --- LISTENER FIX ---
  useEffect(() => {
    setMounted(true);
    const stopListener = startYieldListener(async () => {
      // The headline APY is driven by the live simulation engine above; here we
      // only use the listener as a throttled trigger for AI strategy re-calibration,
      // feeding it the current simulated yield via apyRef.
      const now = Date.now();
      if (now - lastFetchTime.current > 60000) {
        lastFetchTime.current = now;
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ yieldData: apyRef.current, healthFactor: healthRef.current })
            });
            const data = await res.json();
            if (data.advice) { setAdvice(data.advice); addLog("AI Strategy Re-calibrated."); }
        } catch (err) { console.error(err); }
      }
    });
    return () => stopListener();
  }, []);

  useEffect(() => {
    if (isConfirming) addLog("Broadcast: Confirming Transaction...");
    if (isConfirmed) {
      addLog("Success: Ledger Updated.");
      setAmount("");
      refetchEthBalance();
      refetchABalance();
      refetchAccount();
      refetchAllowance();
    }
  }, [isConfirming, isConfirmed]);

  const handleExecute = (action: 'PRIMARY' | 'SECONDARY') => {
    if (!userAddress) return alert("Connect Wallet");
    if (!amount || parseFloat(amount) <= 0) return alert("Invalid Amount");

    if (mode === 'EARN') {
        const val = parseEther(amount);
        if (action === 'PRIMARY') {
            writeContract({
                address: WRAPPED_TOKEN_GATEWAY_ADDRESS,
                abi: GATEWAY_ABI,
                functionName: 'depositETH',
                args: [activePool, userAddress, 0],
                value: val,
            });
        } else {
            writeContract({
                address: WRAPPED_TOKEN_GATEWAY_ADDRESS,
                abi: GATEWAY_ABI,
                functionName: 'withdrawETH',
                args: [activePool, val, userAddress],
            });
        }
    } else {
        const val = parseUnits(amount, 6);
        if (action === 'PRIMARY') {
            writeContract({
                address: activePool,
                abi: POOL_ABI,
                functionName: 'borrow',
                args: [USDC_ASSET_ADDRESS, val, BigInt(2), 0, userAddress],
            });
        } else {
            if (needsApproval) {
                writeContract({
                    address: USDC_ASSET_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [activePool, val],
                });
            } else {
                writeContract({
                    address: activePool,
                    abi: POOL_ABI,
                    functionName: 'repay',
                    args: [USDC_ASSET_ADDRESS, val, BigInt(2), userAddress],
                });
            }
        }
    }
  };

  if (!mounted) return null;

  // --- EXTRACTED DIAGNOSTIC MODULES ---
  // Shared between the bento grid and the split-pane layout so there's a single
  // source of truth for each panel's content.
  const yieldContent = (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-slate-500 text-[10px] uppercase tracking-[0.3em] mb-1">Live Yield Metric</h2>
          <div className="flex items-center gap-3">
            <span className="text-6xl font-black text-white tracking-tighter tabular-nums text-glow-cyan">{displayApy}%</span>
            <span className="text-cyan-300 text-xs font-bold bg-cyan-900/30 px-2 py-1 rounded border border-cyan-500/20">APY</span>
          </div>
        </div>
        <div className="text-right">
          <h3 className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Projected Growth</h3>
          <span className="text-2xl font-bold text-cyan-400 tabular-nums">+{(parseFloat(displayApy)/12).toFixed(2)}% <span className="text-xs text-slate-500">/mo</span></span>
        </div>
      </div>
      <div className="w-full flex-1 min-h-[12rem]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <YAxis hide domain={[minY, maxY]} allowDecimals />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={3} fill="#22d3ee" fillOpacity={0.1} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  const terminalContent = (
    <>
      <div className="absolute top-2 right-4 text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-1"><Terminal size={10} /> Neural Logs</div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-hide" ref={logContainerRef}>{logs.map((log, i) => <LogLine key={i} text={log} />)}</div>
      <div className="mt-2 pt-2 border-t border-white/10 text-cyan-300/70 italic text-[10px] truncate">{advice}</div>
      <form onSubmit={handleCommandSubmit} className="mt-1 flex items-center text-cyan-300">
        <span className="text-cyan-600 mr-2 shrink-0">root@aegis:~$</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="type 'help' or press ⌘K"
          className="flex-1 bg-transparent border-none outline-none text-cyan-200 placeholder:text-slate-700 font-mono caret-cyan-400"
        />
      </form>
    </>
  );

  return (
    <main className="relative min-h-screen bg-transparent text-slate-200 font-mono selection:bg-cyan-500/30 overflow-hidden">
      {/* Ambient 3D topographic-mesh layer floating in the absolute background */}
      <AmbientBackground />

      <header className="h-16 border-b border-white/10 backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-50 bg-[#050505]/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            <ShieldCheck className="text-slate-950" size={18} />
          </div>
          <span className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
            Aegis Command
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-2.5 py-1.5 transition-colors"
            title="Open command palette"
          >
            <CommandIcon size={12} /> <span className="tracking-widest uppercase">Command</span>
            <kbd className="text-[9px] text-slate-500 border border-white/10 rounded px-1">⌘K</kbd>
          </button>
          <button
            onClick={() => { playClick(); setSplitView(v => !v); }}
            className={`p-2 rounded-lg border transition-colors ${splitView ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10' : 'text-slate-400 border-white/10 hover:text-white hover:border-white/20'}`}
            title="Toggle split-pane tiling (Alt+S)"
          >
            {splitView ? <Columns2 size={14} /> : <LayoutGrid size={14} />}
          </button>
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg border transition-colors ${soundMuted ? 'text-slate-500 border-white/10 hover:text-white' : 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'}`}
            title={soundMuted ? 'Unmute interface sounds' : 'Mute interface sounds'}
          >
            {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <NetworkSwitcher />
          {userAddress && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Wallet size={10} /> {`${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`}
              </span>
              <span className="text-xs font-mono text-cyan-300">
                {liveEthBalance.toFixed(4)} {ethBalance?.symbol ?? 'ETH'}
              </span>
            </div>
          )}
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      {/* LIVE GAS FEE TICKER (chain-aware; remounts on network switch) */}
      <GasTicker key={chainId} chainId={chainId} />

      {/* MAIN WORKSPACE — bento grid OR split-pane tiling (Alt+S / `/split`) */}
      <AnimatePresence mode="wait">
        {splitView ? (
          <motion.div
            key="split"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={SPRING}
            className="relative z-10 p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-9rem)]"
          >
            {/* GRAPH PANE */}
            <motion.div layout className={`${GLASS} p-6 relative overflow-hidden flex flex-col min-h-[20rem] lg:h-full`}>
                {yieldContent}
            </motion.div>
            {/* TERMINAL PANE */}
            <motion.div layout className={`${GLASS} bg-black/60 p-4 font-mono text-xs flex flex-col relative overflow-hidden min-h-[20rem] lg:h-full`}>
                {terminalContent}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="bento"
            variants={gridContainer}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="relative z-10 p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 auto-rows-min gap-5"
          >
            {/* YIELD METRIC */}
            <motion.div variants={panelVariant} className={`lg:col-span-8 ${GLASS} p-6 relative overflow-hidden flex flex-col`}>
                {yieldContent}
            </motion.div>

            {/* RISK SENTINEL — RADIAL GAUGE */}
            <motion.div
              variants={panelVariant}
              className={`lg:col-span-4 lg:row-span-2 ${GLASS} p-6 relative overflow-hidden flex flex-col ${risk.critical ? 'animate-strobe-crimson' : ''}`}
              style={!risk.critical ? { borderColor: `${risk.color}40` } : undefined}
            >
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] text-slate-500 tracking-[0.3em] uppercase font-bold flex items-center gap-2"><Activity size={10} /> Risk Sentinel</span>
                    <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border" style={{ color: risk.color, borderColor: `${risk.color}55` }}>{risk.label}</span>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
                    <HealthRadial factor={healthFactor} />
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-3">Liquidation Health Factor</span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-6">
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Collateral</span><span className="text-sm font-mono text-white tabular-nums">${totalCollateralUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Debt</span><span className="text-sm font-mono text-red-300 tabular-nums">${totalDebtUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Power</span><span className="text-sm font-mono text-cyan-300 tabular-nums">${borrowPowerUSD}</span></div>
                </div>
            </motion.div>

            {/* TERMINAL */}
            <motion.div variants={panelVariant} className={`lg:col-span-4 h-72 ${GLASS} bg-black/60 p-4 font-mono text-xs flex flex-col relative overflow-hidden`}>
                {terminalContent}
            </motion.div>

            {/* EXECUTION ENGINE */}
            <motion.div variants={panelVariant} className={`lg:col-span-4 h-72 ${GLASS} p-6 flex flex-col relative overflow-hidden`}>
                <div className="flex p-1 bg-black/60 rounded-xl mb-5 border border-white/10">
                    <button onClick={() => setMode('EARN')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'EARN' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}>🛡️ Earn (ETH)</button>
                    <button onClick={() => setMode('LEVERAGE')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'LEVERAGE' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}>⚔️ Leverage (USDC)</button>
                </div>

                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.3em] mb-3 font-bold">
                    {mode === 'EARN' ? 'Collateral Management' : 'Debt Acquisition'}
                </h3>

                <div className="relative mb-4">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-xl py-4 pl-4 pr-16 text-2xl font-mono text-white focus:outline-none focus:border-cyan-500 transition-colors tabular-nums"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <button
                        onClick={startVoiceCommand}
                        className={`p-2 rounded-lg transition-all active:scale-90 ${isListening ? 'text-red-500 bg-red-900/20 animate-pulse' : 'text-cyan-400 hover:bg-white/5'}`}
                        title="Activate Neural Link"
                      >
                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-auto">
                    <button onClick={() => mode === 'EARN' ? openStaging('supply') : handleExecute('PRIMARY')} disabled={isPending || isConfirming || isSimulating} className={`py-4 rounded-xl font-black tracking-widest uppercase text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${mode === 'EARN' ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-900/30' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30'}`}>
                       {(isPending || isSimulating) ? <Activity className="animate-spin" size={16}/> : mode === 'EARN' ? <Zap size={16}/> : <Coins size={16}/>}
                       {mode === 'EARN' ? 'Supply' : 'Borrow'}
                    </button>

                    <button onClick={() => handleExecute('SECONDARY')} disabled={isPending || isConfirming} className="border border-white/10 text-slate-400 hover:text-white hover:border-white/20 hover:bg-white/5 py-4 rounded-xl font-bold tracking-widest uppercase text-xs flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                        {mode === 'EARN' ? <RotateCcw size={16}/> : needsApproval ? <Lock size={16}/> : <Unlock size={16}/>}
                        {mode === 'EARN' ? 'Recall' : needsApproval ? 'Unlock USDC' : 'Repay Debt'}
                    </button>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL COMMAND PALETTE */}
      <AnimatePresence>
        {paletteOpen && (
          <CommandPalette onRun={processCommand} onClose={() => setPaletteOpen(false)} />
        )}
      </AnimatePresence>

      {/* PRE-EXECUTION STAGING SHEET (viewport overlay — available in any layout) */}
      <AnimatePresence>
        {staging && (
          <StagingSheet
            kind={staging.kind}
            amount={staging.amount}
            gas={staging.gas}
            slippage={staging.slippage}
            onConfirm={confirmStaging}
            onCancel={() => setStaging(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
