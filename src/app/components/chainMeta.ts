// Shared display metadata for the networks the HUD can switch between.
// Keeps the switcher dropdown, the gas ticker, and any indicator dots in sync.
export type ChainMeta = {
  id: number;
  name: string;
  short: string;
  color: string;
};

export const CHAIN_META: ChainMeta[] = [
  { id: 1, name: 'Ethereum', short: 'ETH', color: '#627eea' },
  { id: 11155111, name: 'Sepolia', short: 'SEP', color: '#22d3ee' },
  { id: 42161, name: 'Arbitrum', short: 'ARB', color: '#28a0f0' },
  { id: 10, name: 'Optimism', short: 'OP', color: '#ff0420' },
];

export function getChainMeta(id: number): ChainMeta {
  return CHAIN_META.find((c) => c.id === id) ?? { id, name: 'Unknown', short: '??', color: '#64748b' };
}
