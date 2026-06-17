// Institutional / high-profile wallets monitored by the Whale Telemetry Sentinel.
// Addresses are matched case-insensitively against tx senders/recipients.
export type Whale = { address: string; alias: string };

export const WHALES: Whale[] = [
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', alias: 'Vitalik.eth' },
  { address: '0x3DdfA8eC3052539b6C9549F12cEA2C295cff5296', alias: 'Justin Sun' },
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', alias: 'Binance Hot Wallet 14' },
  { address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', alias: 'Binance Hot Wallet 15' },
  { address: '0xDFd5293D8e347dfe59E90eFd55b2956a1343963d', alias: 'Binance Hot Wallet 16' },
  { address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', alias: 'Binance 8 (Cold)' },
  { address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', alias: 'Binance: Cold Wallet' },
  { address: '0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489', alias: 'Robinhood' },
  { address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', alias: 'Binance 7' },
  { address: '0x220866B1A2219f40e72f5c628B65D54268cA3A9D', alias: 'Vb (deployer)' },
];

// Fast lower-cased lookup map for hot-path matching during block scans.
const WHALE_MAP = new Map(WHALES.map((w) => [w.address.toLowerCase(), w.alias]));

export function getWhaleAlias(addr?: string | null): string | undefined {
  return addr ? WHALE_MAP.get(addr.toLowerCase()) : undefined;
}

// Native-transfer volume that trips the sentinel on its own (~$1M+ equivalent).
export const WHALE_THRESHOLD_ETH = 500;
