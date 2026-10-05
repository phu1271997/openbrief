import { studionet } from 'genlayer-js/chains';

/**
 * The deployed OpenBrief contract on GenLayer Studionet.
 *
 * The public address is not a secret. Hard-coding it as the default means a
 * fresh checkout builds against the right contract even before a VITE_
 * override is set. A `VITE_CONTRACT_ADDRESS` (local .env.local or Vercel env)
 * still wins when present, so the app can be pointed at a redeploy without a
 * code change.
 */
const DEFAULT_CONTRACT = '0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const override =
  import.meta.env.VITE_CONTRACT_ADDRESS &&
  String(import.meta.env.VITE_CONTRACT_ADDRESS).trim();
const resolved = override && ADDRESS_RE.test(override) ? override : DEFAULT_CONTRACT;

export const contractAddress = resolved as `0x${string}`;

export const chain = studionet;
export const chainIdHex = `0x${studionet.id.toString(16)}` as const;

/**
 * studionet.blockExplorers can point at a host that is flaky; pin the working
 * Studionet explorer so "view on the explorer" links always resolve.
 */
const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';

export function explorerTx(hash?: string): string | null {
  return hash ? `${EXPLORER_BASE}/tx/${hash}` : null;
}
export function explorerAddress(address?: string): string | null {
  return address ? `${EXPLORER_BASE}/address/${address}` : null;
}
