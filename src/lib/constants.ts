// Aave V3 Address Provider (Sepolia): Acts as the central registry for protocol addresses
export const ADDRESS_PROVIDER_ADDRESS = "0x012bac54348c0e635dcac9d5fb99f06f24136c9a";

// Verified Sepolia Pool Proxy (Used as fallback if Provider lookup lags)
export const AAVE_POOL_ADDRESS = "0x6ae43d534944d6df31b761937f20c10b59af4933";

// ASSET CONFIGURATION
export const USDC_ASSET_ADDRESS = "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8";
// Aave Interest-Bearing WETH (aWETH): The yield-bearing token received upon deposit
export const A_WETH_ADDRESS = "0x5b071b590a59395fe4025a0ccc1fcc931aac1830";

// PROVIDER INTERFACE: Used to dynamically fetch the current Pool address
export const PROVIDER_ABI = [
  {
    "inputs": [],
    "name": "getPool",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// MAIN POOL INTERFACE: Handles Risk Analysis, Borrowing, and Repayment logic
export const POOL_ABI = [
  "event ReserveDataUpdated(address indexed reserve, uint256 liquidityRate, uint256 variableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex)",
  "function getReserveData(address asset) external view returns (uint256, uint128, uint128, uint128, uint128, uint128, uint128, uint128, uint128, uint40)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  // Execution: Leverage Creation
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  // Execution: Debt Settlement
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)"
] as const;

// GATEWAY: Special contract for handling native ETH wrapping/unwrapping
export const WRAPPED_TOKEN_GATEWAY_ADDRESS = "0x387d311e47e80b498169e6905052996d13939e35";

export const GATEWAY_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "pool", "type": "address" },
      { "internalType": "address", "name": "onBehalfOf", "type": "address" },
      { "internalType": "uint16", "name": "referralCode", "type": "uint16" }
    ],
    "name": "depositETH",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "pool", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "onBehalfOf", "type": "address" }
    ],
    "name": "withdrawETH",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// ERC-20 STANDARD: Extended with Allowance/Approve for credit delegation
export const ERC20_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Check spending limit (required before Repay)
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  // Authorize Protocol to pull tokens from wallet
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;