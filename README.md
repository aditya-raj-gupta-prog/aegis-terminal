# Aegis Terminal ⚡

> An advanced, real-time **Web3 tactical developer dashboard** and **execution HUD**, optimized for smart-contract auditing and financial telemetry on the **Sepolia Testnet**.

Aegis Terminal renders live on-chain state through an ambient **glassmorphic Bento Grid** layout, layered over an interactive **3D topographic wireframe background** whose lattice ripples in real time to evoke market volatility and liquidity-pool depth. It fuses yield telemetry, a circular risk-sentinel gauge, an interactive in-browser CLI, and pre-flight transaction staging into a single high-density command surface.

---

## 🧩 Core Technical Stack

The application runs as a decoupled, client-driven HUD with a thin Next.js API surface.

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 14+ (App Router) | `'use client'` node architecture; current repo runs Next 16.1.6 |
| **3D Engine Layer** | Three.js · `@react-three/fiber` · `@react-three/drei` | Non-blocking background mesh rendered in an absolutely-positioned canvas |
| **Motion & Physics** | Framer Motion | Spring-loaded stagger orchestrations for every grid card |
| **On-Chain Connectivity** | `wagmi` + `viem` | Live RPC block tracking and active `useBalance` / `useReadContract` sync loops |
| **Charting Mechanics** | Recharts + custom SVG engine | Dynamic axis auto-delta calculations and radial gauges |
| **Wallet UX** | RainbowKit | Connect button, chain status, account session |

---

## 🛰️ Subsystems & Component Breakdown

### Live Yield Metric Graph
Tracks historical wallet-balance fluctuations over time as a Recharts area series. A **dynamic Y-axis domain buffer fallback** (`dataMin - 0.001` / `dataMax + 0.001`) is applied whenever the dataset's min and max collapse to an identical value — preventing the render grid from flattening to zero height when transaction sizes are tiny (e.g. `0.0001` SepoliaETH). The series is seeded with baseline points so the line is visible on first paint.

### Risk Sentinel / Account Health
A **multi-layered SVG circular radial gauge** monitoring the account health factor against liquidation thresholds. The arc and chrome transition across a color-coded risk hierarchy:

| State | Threshold | Visual |
| :--- | :--- | :--- |
| **Stable** | `≥ 1.5` | Low-glow Cyan |
| **Volatile** | `1.1 – 1.5` | Amber |
| **High Alert** | `< 1.1` | Pulse-strobe Crimson |

### Neural Logs Engine (Interactive CLI)
A functional in-browser terminal form processing a **persistent FIFO log state array** (rolling 50-entry window, oldest → newest, auto-scrolled to the latest line). Commands are echoed and dispatched through a shared processor used by both the inline prompt and the global command palette.

### Global Command Palette
A centered, glassmorphic overlay bound to **`Ctrl` / `Cmd` + K**. Accepts slash-prefixed commands (e.g. `/supply 10`, `/scan 0x...`, `/gas-priority`, `/clear`) routed into the same engine as the inline CLI.

### Collateral Management
The interactive **SUPPLY** and **EARN (ETH)** actions are mapped to a pre-execution **Shadow Simulation Staging Sheet** that slides in from the right of the execution panel. It surfaces an advanced pre-flight breakdown — expected gas, estimated slippage, router call-route mapping, and sequentially-resolving safety checks for **MEV frontrunning** and **sandwich-attack** vectors — gating confirmation until every check passes.

---

## 🖥️ Local Interactive CLI Matrix

Operational command states available in the Neural Logs terminal (and via the `Ctrl`/`Cmd` + K palette with a leading `/`):

| Command | Operation |
| :--- | :--- |
| `help` | Outputs a complete, structured subcommand usage menu. |
| `clear` | Purges the active log array state entirely. |
| `check-gas` | Appends active mock RPC network gas-tracking lines (e.g. `Base Fee: 24 Gwei \| Priority: 1.5 Gwei`). |
| `gas-priority` | Alias for `check-gas`. |
| `scan [address]` | Evaluates a hex-string parameter for contract reentrancy vectors and common Web3 vulnerabilities. |
| `supply [amount]` | Opens the pre-flight staging sheet for a supply transaction. |
| `status` | Verifies runtime engine vitals and the local wallet connection link. |

---

## 🚀 Quick-Start Development Environment

The Next.js application lives in the `aegis-terminal/` directory.

**1. Enter the app workspace and install dependencies**
```bash
cd aegis-terminal
npm install
```

**2. Launch the development server**
```bash
npm run dev
```

**3. Open the terminal in your browser**
```
http://localhost:3000
```

**4. Run on-demand system changes via the package runner**
```bash
npx @anthropic-ai/claude-code
```

---

## 🏗️ Build & Production

```bash
cd aegis-terminal
npm run build   # optimized production build
npm run start   # serve the production build
npm run lint    # static analysis
```

---

## 🔒 Network

Aegis Terminal targets the **Sepolia Testnet**. Connect a wallet funded with SepoliaETH to enable live balance sync, health-factor telemetry, and on-chain execution flows. All transaction-staging safety checks and gas readouts in the demo paths are simulated for auditing and UX purposes.
