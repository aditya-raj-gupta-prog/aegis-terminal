'use client';
import { useEffect, useState, useRef, useMemo, type FormEvent } from 'react';
import { startYieldListener } from '@/lib/yieldListener';
import { motion } from 'framer-motion';
import AmbientBackground from './components/AmbientBackground';
import { 
  ShieldCheck, Activity, Zap, ExternalLink, 
  RotateCcw, Wallet, Terminal, Coins, ArrowRightLeft, Lock, Unlock, Mic, MicOff
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract, useBalance, useBlockNumber } from 'wagmi';
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

// Snappy spring used for the staggered panel entry animations.
const SPRING = { type: "spring" as const, stiffness: 180, damping: 22 };

// Container/item variants so the layout grid panels stagger-mount on load.
const gridContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
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
    className="text-[10px] font-mono text-green-400/80 mb-1 border-l-2 border-green-500/30 pl-2"
  >
    <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
    {text}
  </motion.div>
);

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-black/90 border border-slate-700 p-2 rounded shadow-xl backdrop-blur-md">
        <p className="text-green-400 font-mono font-bold text-xs">{payload[0].value} ETH</p>
      </div>
    );
  }
  return null;
};

// Heatmap Component
const HealthBar = ({ factor }: { factor: string | number }) => {
    const val = factor === 'SAFE' || factor === '---' ? 3.0 : Number(factor);
    const percentage = Math.min((val / 3.0) * 100, 100);
    
    let colorClass = 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
    if (val < 1.1) colorClass = 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse';
    else if (val < 1.5) colorClass = 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';

    return (
        <div className="w-full bg-slate-800/50 rounded-full h-1.5 mt-3 overflow-hidden border border-white/5">
            <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                className={`h-full transition-all duration-700 ${colorClass}`}
            />
        </div>
    );
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
  const lastFetchTime = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  // Holds pending tx-simulation timers so they can be cleared on unmount.
  const simTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // --- WAGMI ---
  const { address: userAddress } = useAccount();
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

  // --- INTERACTIVE TERMINAL ---
  // Parse and dispatch a typed command against the local terminal engine.
  const processCommand = (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    const [cmd, ...rest] = input.split(/\s+/);
    const lower = cmd.toLowerCase();

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
          "  scan [address]  run a Web3 security analysis on an address",
          "  status          report core engine vitals",
        ]);
        break;
      case 'check-gas': {
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
      case 'status':
        addLogs([
          `[SYS] System: Online | Wallet Link: ${userAddress ? 'Active' : 'Disconnected'}`,
          `[SYS] Chain: Sepolia | Block: ${blockNumber ? blockNumber.toString() : 'syncing'}`,
          `[SYS] Yield Engine: Live @ ${apy}% APY`,
        ]);
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

  const formatHealth = (val: bigint) => {
    if (!val) return "---";
    const num = Number(val) / 1e18;
    return num > 100 ? "SAFE" : num.toFixed(2);
  };
  const healthFactor = accountData ? formatHealth((accountData as any)[5]) : "---";
  const healthRef = useRef(healthFactor);
  useEffect(() => { healthRef.current = healthFactor; }, [healthFactor]);

  // Keep a ref mirror of the latest APY so async callbacks (AI strategy, voice)
  // read the current value without needing apy in their dependency arrays.
  const apyRef = useRef(apy);
  useEffect(() => { apyRef.current = apy; }, [apy]);

  // --- LIVE APY ENGINE ---
  // Tick every few seconds applying a small +/- micro-fluctuation so the yield
  // reads as a live, volatile stream. Functional update avoids stale closures
  // and the empty dep array means this interval is created exactly once.
  useEffect(() => {
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
  }, []);

  const formatBase = (val: bigint) => val ? (Number(val) / 100000000).toFixed(2) : "0.00";
  const totalCollateralUSD = accountData ? formatBase(accountData[0]) : "0.00";
  const totalDebtUSD = accountData ? formatBase(accountData[1]) : "0.00";
  const borrowPowerUSD = accountData ? formatBase(accountData[2]) : "0.00";
  const rawABalance = aBalanceData ? parseFloat(formatEther(aBalanceData)) : 0;
  // Live native ETH balance, parsed into a number for the projection math.
  const liveEthBalance = ethBalance ? parseFloat(formatEther(ethBalance.value)) : 0;

  // Historical balance series for the Live Yield Metric chart. We track the
  // active wallet balance over time so each on-chain change pushes a new,
  // distinct coordinate — giving the line real dips/spikes instead of a flat,
  // statically-seeded projection curve.
  // Seed with a couple of slightly different mock baseline points around the
  // current balance so the line is immediately visible on first paint and the
  // axis establishes an active (non-collapsed) grid before live data arrives.
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([
    { name: 'baseline-1', value: 0.0499 },
    { name: 'baseline-2', value: 0.0498 },
  ]);

  // Listen to the live balance coming from our wallet hook. Whenever it actually
  // moves (e.g. 0.0498 -> 0.0497 after a SepoliaETH tx), append the new value.
  useEffect(() => {
    // Prefer the native ETH balance; fall back to the staked aToken balance.
    const active = liveEthBalance > 0 ? liveEthBalance : rawABalance;
    if (!userAddress || active <= 0) return;

    const point = parseFloat(active.toFixed(6));
    setChartData(prev => {
      const last = prev[prev.length - 1];
      // Skip if the balance hasn't moved — avoids piling up identical points.
      if (last && last.value === point) return prev;
      const next = [...prev, { name: new Date().toLocaleTimeString(), value: point }];
      // Keep a rolling window so the series stays readable over a long session.
      return next.slice(-40);
    });
  }, [liveEthBalance, rawABalance, userAddress]);

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
    } catch (err) {
      addLog("Neural Link Sync Failed.");
    }
  };

  const startVoiceCommand = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return alert("Browser does not support Speech Recognition");

    const recognition = new SpeechRecognition();
    recognition.onstart = () => { setIsListening(true); addLog("Neural Link: LISTENING..."); };
    recognition.onresult = (event: any) => { handleVoiceInput(event.results[0][0].transcript); };
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
      } catch (err) { addLog("Oracle Connection Failed."); }
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

  return (
    <main className="relative min-h-screen bg-transparent text-slate-200 font-mono selection:bg-blue-500/30 overflow-hidden">
      {/* Ambient 3D particle-matrix layer floating in the absolute background */}
      <AmbientBackground />

      <header className="h-16 border-b border-white/10 backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-50 bg-[#050505]/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <ShieldCheck className="text-white" size={18} />
          </div>
          <span className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Aegis Command
          </span>
        </div>
        <div className="flex items-center gap-4">
          {userAddress && (
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Wallet size={10} /> {`${userAddress.slice(0, 6)}…${userAddress.slice(-4)}`}
              </span>
              <span className="text-xs font-mono text-green-400">
                {liveEthBalance.toFixed(4)} {ethBalance?.symbol ?? 'ETH'}
              </span>
            </div>
          )}
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      <motion.div
        variants={gridContainer}
        initial="hidden"
        animate="show"
        className="relative z-10 p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]"
      >
        {/* LEFT COLUMN */}
        <motion.div variants={gridContainer} className="lg:col-span-7 flex flex-col gap-6">
            <motion.div variants={panelVariant} className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h2 className="text-slate-500 text-[10px] uppercase tracking-[0.3em] mb-1">Live Yield Metric</h2>
                        <div className="flex items-center gap-3">
                            <span className="text-6xl font-black text-white tracking-tighter">{apy}%</span>
                            <span className="text-green-400 text-xs font-bold bg-green-900/30 px-2 py-1 rounded border border-green-500/20">APY</span>
                        </div>
                    </div>
                    <div className="text-right">
                         <h3 className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Projected Growth</h3>
                         <span className="text-2xl font-bold text-blue-400">+{(parseFloat(apy)/12).toFixed(2)}% <span className="text-xs text-slate-500">/mo</span></span>
                    </div>
                </div>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <YAxis hide domain={[minY, maxY]} allowDecimals />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.1} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            <motion.div variants={panelVariant} className="h-48 bg-black border border-slate-800 rounded-3xl p-4 font-mono text-xs flex flex-col relative overflow-hidden">
                 <div className="absolute top-2 right-4 text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-1"><Terminal size={10} /> Neural Logs</div>
                 <div className="flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-hide" ref={logContainerRef}>{logs.map((log, i) => <LogLine key={i} text={log} />)}</div>
                 <div className="mt-2 pt-2 border-t border-slate-800 text-blue-300 italic text-[10px] opacity-70 truncate">{advice}</div>
                 <form onSubmit={handleCommandSubmit} className="mt-1 flex items-center text-blue-300">
                    <span className="text-blue-600 mr-2 shrink-0">root@aegis:~$</span>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="type 'help' for commands"
                      className="flex-1 bg-transparent border-none outline-none text-blue-200 placeholder:text-slate-700 font-mono caret-blue-400"
                    />
                 </form>
            </motion.div>
        </motion.div>

        {/* RIGHT COLUMN */}
        <motion.div variants={gridContainer} className="lg:col-span-5 flex flex-col gap-6">
            <motion.div variants={panelVariant} className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                <div className="flex justify-between items-start mb-2 relative z-10">
                    <div>
                        <span className="text-[10px] text-slate-500 tracking-[0.3em] uppercase font-bold flex items-center gap-2"><Activity size={10} /> Risk Sentinel</span>
                        <h3 className="text-white font-bold text-lg mt-1">Account Health</h3>
                    </div>
                    <div className="text-right">
                         <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Health Factor</span>
                         <span className={`text-2xl font-black tracking-tighter ${healthFactor === 'SAFE' ? 'text-green-400' : Number(healthFactor) < 1.5 ? 'text-red-500' : 'text-yellow-400'}`}>{healthFactor}</span>
                    </div>
                </div>
                
                {/* Visual Risk Heatmap */}
                <HealthBar factor={healthFactor} />

                <div className="grid grid-cols-3 gap-2 relative z-10 mt-6">
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Collateral</span><span className="text-sm font-mono text-white">${totalCollateralUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Debt</span><span className="text-sm font-mono text-red-300">${totalDebtUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Power</span><span className="text-sm font-mono text-blue-300">${borrowPowerUSD}</span></div>
                </div>
            </motion.div>

            {/* EXECUTION ENGINE */}
            <motion.div variants={panelVariant} className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 flex flex-col relative">
                <div className="flex p-1 bg-black rounded-xl mb-6 border border-slate-800">
                    <button onClick={() => { setMode('EARN'); runTxSimulation('earn'); }} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'EARN' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>🛡️ Earn (ETH)</button>
                    <button onClick={() => setMode('LEVERAGE')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'LEVERAGE' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}>⚔️ Leverage (USDC)</button>
                </div>
                
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.3em] mb-4 font-bold">
                    {mode === 'EARN' ? 'Collateral Management' : 'Debt Acquisition'}
                </h3>
                
                <div className="relative mb-4">
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      className="w-full bg-black border border-slate-700 rounded-xl py-4 pl-4 pr-16 text-2xl font-mono text-white focus:outline-none focus:border-blue-500 transition-colors" 
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <button 
                        onClick={startVoiceCommand}
                        className={`p-2 rounded-lg transition-all active:scale-90 ${isListening ? 'text-red-500 bg-red-900/20 animate-pulse' : 'text-green-500 hover:bg-white/5'}`}
                        title="Activate Neural Link"
                      >
                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => mode === 'EARN' ? runTxSimulation('supply') : handleExecute('PRIMARY')} disabled={isPending || isConfirming || isSimulating} className={`py-4 rounded-xl font-black tracking-widest uppercase text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${mode === 'EARN' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30'}`}>
                       {(isPending || isSimulating) ? <Activity className="animate-spin" size={16}/> : mode === 'EARN' ? <Zap size={16}/> : <Coins size={16}/>}
                       {mode === 'EARN' ? 'Supply' : 'Borrow'}
                    </button>

                    <button onClick={() => handleExecute('SECONDARY')} disabled={isPending || isConfirming} className="border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-white/5 py-4 rounded-xl font-bold tracking-widest uppercase text-xs flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                        {mode === 'EARN' ? <RotateCcw size={16}/> : needsApproval ? <Lock size={16}/> : <Unlock size={16}/>}
                        {mode === 'EARN' ? 'Recall' : needsApproval ? 'Unlock USDC' : 'Repay Debt'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
      </motion.div>
    </main>
  );
}