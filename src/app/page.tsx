'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { startYieldListener } from '@/lib/yieldListener';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, Activity, Zap, ExternalLink, 
  RotateCcw, Wallet, Terminal, Coins, ArrowRightLeft, Lock, Unlock
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract, useBalance } from 'wagmi';
import { parseEther, formatEther, parseUnits } from 'viem';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
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

// Fallback is required in case the Provider read fails or is slow to hydrate
const FALLBACK_POOL_ADDRESS = "0x6Ae43d534944d6df31b761937f20C10B59aF4933";

// --- UI COMPONENTS ---
const LogLine = ({ text }: { text: string }) => (
  <motion.div 
    initial={{ opacity: 0, x: -10 }} 
    animate={{ opacity: 1, x: 0 }} 
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

export default function Home() {
  // --- SYSTEM STATE ---
  const [apy, setApy] = useState("0.00");
  const [ethPrice, setEthPrice] = useState(0); 
  const [advice, setAdvice] = useState("System Initialized. Select Strategy.");
  const [amount, setAmount] = useState(""); 
  const [logs, setLogs] = useState<string[]>(["Initializing Neural Link...", "Strategy Engine: ONLINE"]);
  const [mode, setMode] = useState<'EARN' | 'LEVERAGE'>('EARN'); 
  const [mounted, setMounted] = useState(false);
  const lastFetchTime = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- BLOCKCHAIN SYNC (WAGMI) ---
  const { address: userAddress } = useAccount();
  const { data: ethBalance } = useBalance({ address: userAddress }); 
  const { data: hash, writeContract, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Query the AddressProvider to ensure we interact with the latest V3 Pool proxy
  const { data: poolAddress } = useReadContract({
    address: ADDRESS_PROVIDER_ADDRESS,
    abi: PROVIDER_ABI,
    functionName: 'getPool',
  });
  
  const activePool = poolAddress || FALLBACK_POOL_ADDRESS;

  // Sync aWETH Balance (Interest Bearing Token)
  const { data: aBalanceData, refetch: refetchABalance } = useReadContract({
    address: A_WETH_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 5000 }
  });

  // Fetch critical risk metrics (Health Factor, LTV) from the Pool
  const { data: accountData, refetch: refetchAccount } = useReadContract({
    address: activePool,
    abi: POOL_ABI,
    functionName: 'getUserAccountData',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 5000 }
  });

  // Check USDC Allowance for Repay functionality
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ASSET_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, activePool] : undefined,
    query: { enabled: !!userAddress, refetchInterval: 2000 }
  });

  // --- DATA NORMALIZATION ---
  const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 50)); 
  useEffect(() => { if (logContainerRef.current) logContainerRef.current.scrollTop = 0; }, [logs]);

  // Risk Tracking: Sync HF to a ref to prevent stale data in the AI listener
  const formatHealth = (val: bigint) => {
    if (!val) return "---";
    const num = Number(val) / 1e18;
    // Aave returns uint256 max for infinity; we clamp it for UI cleanliness
    return num > 100 ? "SAFE" : num.toFixed(2);
  };
  const healthFactor = accountData ? formatHealth(accountData[5]) : "---";
  const healthRef = useRef(healthFactor);
  useEffect(() => { healthRef.current = healthFactor; }, [healthFactor]);

  // Formatting helpers for raw blockchain data (Base 8 vs Base 18)
  const formatBase = (val: bigint) => val ? (Number(val) / 100000000).toFixed(2) : "0.00";
  const totalCollateralUSD = accountData ? formatBase(accountData[0]) : "0.00";
  const totalDebtUSD = accountData ? formatBase(accountData[1]) : "0.00";
  const borrowPowerUSD = accountData ? formatBase(accountData[2]) : "0.00";
  
  const rawABalance = aBalanceData ? parseFloat(formatEther(aBalanceData)) : 0;
  const formattedABalance = rawABalance.toFixed(4);
  const usdValue = (rawABalance * ethPrice).toFixed(2);

  // Generate simulation data for the yield graph
  const projectionData = useMemo(() => {
    const data = [];
    const monthlyRate = (parseFloat(apy) / 100) / 12;
    let current = rawABalance > 0 ? rawABalance : 1; 
    for (let i = 0; i <= 12; i++) {
      data.push({ name: `M${i}`, value: parseFloat(current.toFixed(4)) });
      current = current * (1 + monthlyRate);
    }
    return data;
  }, [apy, rawABalance]);

  // Approval Check: Verify if we have enough allowance to cover the repay amount
  const needsApproval = useMemo(() => {
     if (mode === 'EARN') return false; // ETH uses Gateway, no approval needed
     if (!amount || parseFloat(amount) === 0) return false;
     const amountBig = parseUnits(amount, 6); // USDC = 6 Decimals
     return !usdcAllowance || usdcAllowance < amountBig;
  }, [mode, amount, usdcAllowance]);

  // Oracle Sync: Fetch ETH price for UI conversion
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        setEthPrice(data.ethereum.usd);
        addLog(`Oracle Connected: ETH = $${data.ethereum.usd}`);
      } catch (err) { addLog("Oracle Connection Failed."); }
    };
    fetchPrice();
  }, []);

  // Neural Link: Listen for Yield events and trigger AI analysis
  useEffect(() => {
    setMounted(true);
    const stopListener = startYieldListener(async (newApy) => {
      setApy(newApy);
      if (Math.random() > 0.9) addLog("Scanning Yield Variance...");
      
      const now = Date.now();
      // Rate limit AI calls to prevent API throttle
      if (now - lastFetchTime.current > 60000) { 
        lastFetchTime.current = now;
        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ yieldData: newApy, healthFactor: healthRef.current })
            });
            const data = await res.json();
            if (data.advice) { setAdvice(data.advice); addLog("AI Strategy Re-calibrated."); }
        } catch (err) { console.error(err); }
      }
    });
    return () => stopListener();
  }, []);

  // Transaction Monitor
  useEffect(() => {
    if (isConfirming) addLog("Broadcast: Confirming Transaction...");
    if (isConfirmed) {
      addLog("Success: Ledger Updated.");
      setAdvice("Execution Verified. State Updated.");
      setAmount(""); 
      refetchABalance();
      refetchAccount();
      refetchAllowance();
    }
    if (writeError) {
      addLog(`ERROR: ${writeError.message.slice(0, 20)}...`);
      alert(writeError.message);
    }
  }, [isConfirming, isConfirmed, writeError, refetchABalance, refetchAccount, refetchAllowance]);

  // --- STRATEGY EXECUTION ENGINE ---
  const handleExecute = (action: 'PRIMARY' | 'SECONDARY') => {
    if (!userAddress) return alert("Connect Wallet");
    if (!amount || parseFloat(amount) <= 0) return alert("Invalid Amount");

    // EARN MODE: Interactions with WrappedTokenGateway (ETH)
    if (mode === 'EARN') {
        const val = parseEther(amount);
        if (action === 'PRIMARY') { 
            addLog(`Strategy: Supply ${amount} ETH`);
            writeContract({
                address: WRAPPED_TOKEN_GATEWAY_ADDRESS,
                abi: GATEWAY_ABI,
                functionName: 'depositETH',
                args: [activePool, userAddress, 0], 
                value: val,
            });
        } else {
            addLog(`Strategy: Recall ${amount} ETH`);
            writeContract({
                address: WRAPPED_TOKEN_GATEWAY_ADDRESS,
                abi: GATEWAY_ABI,
                functionName: 'withdrawETH',
                args: [activePool, val, userAddress], 
            });
        }
    } 
    // LEVERAGE MODE: Direct interactions with Pool Contract (USDC)
    else {
        const val = parseUnits(amount, 6); // Normalizing to 6 decimals
        if (action === 'PRIMARY') { // BORROW
            addLog(`Strategy: Borrow ${amount} USDC`);
            writeContract({
                address: activePool, 
                abi: POOL_ABI,
                functionName: 'borrow',
                args: [USDC_ASSET_ADDRESS, val, BigInt(2), 0, userAddress], 
            });
        } else { // REPAY
            // If allowance is insufficient, trigger Approve first
            if (needsApproval) {
                addLog(`Authorization: Approving ${amount} USDC...`);
                writeContract({
                    address: USDC_ASSET_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [activePool, val], 
                });
            } else {
                addLog(`Strategy: Repay ${amount} USDC`);
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
    <main className="min-h-screen bg-[#050505] text-slate-200 font-mono selection:bg-blue-500/30 overflow-hidden">
      <header className="h-16 border-b border-white/10 backdrop-blur-md flex justify-between items-center px-6 sticky top-0 z-50 bg-[#050505]/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <ShieldCheck className="text-white" size={18} />
          </div>
          <span className="text-xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            Aegis Command
          </span>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </header>

      <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-7 flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
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
                        <AreaChart data={projectionData}>
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.1} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} transition={{ delay: 0.1 }} animate={{ opacity: 1, y: 0 }} className="h-48 bg-black border border-slate-800 rounded-3xl p-4 font-mono text-xs flex flex-col relative overflow-hidden">
                 <div className="absolute top-2 right-4 text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-1"><Terminal size={10} /> Neural Logs</div>
                 <div className="flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-hide" ref={logContainerRef}>{logs.map((log, i) => <LogLine key={i} text={log} />)}</div>
                 <div className="mt-2 pt-2 border-t border-slate-800 text-blue-300"><span className="text-blue-600 mr-2">root@aegis:~$</span><span className="typing-effect">{advice}</span></div>
            </motion.div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* RISK SENTINEL */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full opacity-20 -mr-10 -mt-10 transition-colors duration-1000 ${healthFactor === 'SAFE' ? 'bg-green-500' : Number(healthFactor) < 1.5 ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                        <span className="text-[10px] text-slate-500 tracking-[0.3em] uppercase font-bold flex items-center gap-2"><Activity size={10} /> Risk Sentinel</span>
                        <h3 className="text-white font-bold text-lg mt-1">Account Health</h3>
                    </div>
                    <div className="text-right">
                         <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Health Factor</span>
                         <span className={`text-2xl font-black tracking-tighter ${healthFactor === 'SAFE' ? 'text-green-400' : Number(healthFactor) < 1.5 ? 'text-red-500' : 'text-yellow-400'}`}>{healthFactor}</span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2 relative z-10">
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Collateral</span><span className="text-sm font-mono text-white">${totalCollateralUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Debt</span><span className="text-sm font-mono text-red-300">${totalDebtUSD}</span></div>
                    <div className="bg-black/40 p-3 rounded-xl border border-white/5"><span className="text-[9px] text-slate-500 uppercase block mb-1">Power</span><span className="text-sm font-mono text-blue-300">${borrowPowerUSD}</span></div>
                </div>
            </motion.div>

            {/* EXECUTION ENGINE */}
            <motion.div initial={{ opacity: 0, x: 20 }} transition={{ delay: 0.2 }} animate={{ opacity: 1, x: 0 }} className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl p-6 flex flex-col relative">
                
                {/* STRATEGY TOGGLE */}
                <div className="flex p-1 bg-black rounded-xl mb-6 border border-slate-800">
                    <button onClick={() => setMode('EARN')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'EARN' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>🛡️ Earn (ETH)</button>
                    <button onClick={() => setMode('LEVERAGE')} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'LEVERAGE' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-white'}`}>⚔️ Leverage (USDC)</button>
                </div>
                
                <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.3em] mb-4 font-bold">
                    {mode === 'EARN' ? 'Collateral Management' : 'Debt Acquisition'}
                </h3>
                
                <div className="relative mb-4">
                    <input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-black border border-slate-700 rounded-xl py-4 pl-4 pr-20 text-2xl font-mono text-white focus:outline-none focus:border-blue-500 transition-colors" />
                    <div className="absolute right-2 top-2 bottom-2 flex items-center gap-2">
                        <span className="text-slate-500 font-bold text-xs pr-2">{mode === 'EARN' ? 'ETH' : 'USDC'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* BUTTON 1: SUPPLY / BORROW */}
                    <button onClick={() => handleExecute('PRIMARY')} disabled={isPending || isConfirming} className={`py-4 rounded-xl font-black tracking-widest uppercase text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${mode === 'EARN' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30'}`}>
                       {isPending ? <Activity className="animate-spin" size={16}/> : mode === 'EARN' ? <Zap size={16}/> : <Coins size={16}/>}
                       {mode === 'EARN' ? 'Supply' : 'Borrow'}
                    </button>

                    {/* BUTTON 2: RECALL / REPAY (Smart) */}
                    <button onClick={() => handleExecute('SECONDARY')} disabled={isPending || isConfirming} className="border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-white/5 py-4 rounded-xl font-bold tracking-widest uppercase text-xs flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                        {mode === 'EARN' ? <RotateCcw size={16}/> : needsApproval ? <Lock size={16}/> : <Unlock size={16}/>}
                        {mode === 'EARN' ? 'Recall' : needsApproval ? 'Unlock USDC' : 'Repay Debt'}
                    </button>
                </div>
            </motion.div>
        </div>
      </div>
    </main>
  );
}