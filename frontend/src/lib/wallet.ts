import { chain, chainIdHex } from './config';

/**
 * Wallet handling. Three rules, each matching a way live demos break:
 *  1. The user's own wallet signs — no burner is generated in the browser (a
 *     fresh key on hosted Studionet is unfunded and the first write fails).
 *  2. No private key is ever read from the environment.
 *  3. The network is switched (or added) on connect — a wallet on the wrong
 *     chain reports a bare `'from'` RPC error that reads like nonsense.
 */
export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export class WalletError extends Error {}

export function getProvider(): EthereumProvider {
  const injected = window.ethereum;
  if (!injected) {
    throw new WalletError('No browser wallet found. Install MetaMask, then reload this page.');
  }
  if (injected.providers?.length) {
    return injected.providers.find((p) => p.isMetaMask) ?? injected.providers[0];
  }
  return injected;
}

export async function ensureNetwork(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
            blockExplorerUrls: chain.blockExplorers?.default?.url
              ? [chain.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
      return;
    }
    throw error;
  }
}

export async function connectWallet(): Promise<`0x${string}`> {
  const provider = getProvider();
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new WalletError('Wallet returned no accounts.');
  await ensureNetwork(provider);
  return accounts[0].toLowerCase() as `0x${string}`;
}

export async function getConnectedAccount(): Promise<`0x${string}` | null> {
  if (!window.ethereum) return null;
  const provider = getProvider();
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
  return accounts?.length ? (accounts[0].toLowerCase() as `0x${string}`) : null;
}

export async function getBalance(address: string): Promise<bigint> {
  const provider = getProvider();
  const raw = (await provider.request({
    method: 'eth_getBalance',
    params: [address, 'latest'],
  })) as string;
  return BigInt(raw);
}

export function watchAccount(handler: (account: `0x${string}` | null) => void): () => void {
  const provider = window.ethereum;
  if (!provider?.on) return () => {};
  const onAccounts = (...args: unknown[]) => {
    const accounts = args[0] as string[] | undefined;
    handler(accounts?.length ? (accounts[0].toLowerCase() as `0x${string}`) : null);
  };
  const onChain = () => window.location.reload();
  provider.on('accountsChanged', onAccounts);
  provider.on('chainChanged', onChain);
  return () => {
    provider.removeListener?.('accountsChanged', onAccounts);
    provider.removeListener?.('chainChanged', onChain);
  };
}
