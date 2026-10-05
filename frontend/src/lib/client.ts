import { createClient } from 'genlayer-js';
import {
  ExecutionResult,
  TransactionStatus,
  type CalldataEncodable,
  type GenLayerTransaction,
  type Hash,
} from 'genlayer-js/types';
import { chain, contractAddress } from './config';
import { connectWallet, ensureNetwork, getProvider } from './wallet';

/** The only place this app talks to the chain. */
const readClient = createClient({ chain });

export const GEN = 10n ** 18n;

/** Parse a human GEN amount ("1.5") to wei, without floats. */
export function parseGen(input: string): bigint {
  const s = (input ?? '').trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) throw new Error('Enter a GEN amount like 0.5 or 2.');
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole) * GEN + BigInt(fracPadded || '0');
}

/** Format wei to a short GEN string. */
export function formatGen(wei: bigint | string): string {
  const v = typeof wei === 'string' ? BigInt(wei || '0') : wei;
  const whole = v / GEN;
  const frac = (v % GEN).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// --------------------------------------------------------------------- reads
async function readJson<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const raw = await readClient.readContract({ address: contractAddress, functionName, args });
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}
async function readString(functionName: string, args: CalldataEncodable[] = []): Promise<string> {
  const raw = await readClient.readContract({ address: contractAddress, functionName, args });
  return typeof raw === 'string' ? raw : String(raw);
}

export type Role = 'LEAD' | 'MAJOR' | 'SUPPORTING' | 'NONE';
export interface Brief {
  id: string;
  creator: string;
  title: string;
  brief: string;
  criteria: string[];
  min_sources: number;
  pool: string;
  backers: string[];
  status: string;
  opened_at: string;
  submitted_at: string;
  article_url: string;
  author: string;
  coauthors: { wallet: string; byline: string }[];
  sources: string[];
  tier: string;
  confidence: number;
  sources_ok: boolean | null;
  roles: Record<string, Role>;
  reason: string;
  paid_total: string;
}

export function listBriefs(start = 0, limit = 50): Promise<{ items: Brief[]; total: number }> {
  return readJson('list_briefs', [start, limit]);
}
export function getBrief(id: string): Promise<Brief> {
  return readJson('get_brief', [id]);
}
export function getBalance(wallet: string): Promise<string> {
  return readString('get_balance', [wallet]);
}
export function getBacking(id: string, wallet: string): Promise<string> {
  return readString('get_backing', [id, wallet]);
}

// -------------------------------------------------------------------- writes
export type WritePhase = 'validating' | 'awaiting-signature' | 'awaiting-consensus' | 'finalized';
export interface WriteProgress {
  phase: WritePhase;
  hash?: `0x${string}`;
}

function assertExecuted(receipt: GenLayerTransaction): void {
  // Finality is not success: a transaction can be accepted having reverted
  // inside the GenVM. The result surfaces in two shapes depending on the SDK
  // build — the typed enum and the raw leader receipt — so both are checked.
  const execution = receipt.txExecutionResultName;
  const leader = receipt.consensus_data?.leader_receipt?.[0] as
    | { error?: unknown; execution_result?: string; genvm_result?: { stderr?: string } }
    | undefined;
  const reverted =
    execution === ExecutionResult.FINISHED_WITH_ERROR || leader?.execution_result === 'ERROR';
  if (reverted) {
    const raw = (typeof leader?.error === 'string' && leader.error) || leader?.genvm_result?.stderr || '';
    const marker = String(raw).match(/\[EXPECTED\]\s+[A-Z_]+/);
    const detail = marker ? `: ${marker[0]}` : '';
    throw new Error(`The transaction reverted inside the contract${detail}`);
  }
}

interface WriteOptions {
  functionName: string;
  args: CalldataEncodable[];
  value?: bigint;
  onProgress?: (p: WriteProgress) => void;
}

async function write({ functionName, args, value, onProgress }: WriteOptions): Promise<`0x${string}`> {
  onProgress?.({ phase: 'validating' });
  const account = await connectWallet();
  await ensureNetwork(getProvider());
  const client = createClient({ chain, account });
  onProgress?.({ phase: 'awaiting-signature' });
  const hash = (await client.writeContract({
    address: contractAddress,
    functionName,
    args,
    value: value ?? 0n,
  })) as Hash;
  onProgress?.({ phase: 'awaiting-consensus', hash });
  // Studionet can take minutes to FINALIZE; ACCEPTED already carries the
  // committed state and the leader's result, which is what the UI reads back.
  const receipt = (await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 4000,
    retries: 150,
  })) as GenLayerTransaction;
  assertExecuted(receipt);
  onProgress?.({ phase: 'finalized', hash });
  return hash;
}

export function openBrief(p: {
  title: string;
  brief: string;
  criteria: string[];
  minSources: number;
  deposit: bigint;
  onProgress?: (p: WriteProgress) => void;
}) {
  return write({
    functionName: 'open_brief',
    args: [p.title, p.brief, JSON.stringify(p.criteria), p.minSources],
    value: p.deposit,
    onProgress: p.onProgress,
  });
}
export function backBrief(p: { id: string; amount: bigint; onProgress?: (p: WriteProgress) => void }) {
  return write({ functionName: 'back_brief', args: [p.id], value: p.amount, onProgress: p.onProgress });
}
export function submitWork(p: {
  id: string;
  articleUrl: string;
  coauthors: { wallet: string; byline: string }[];
  sources: string[];
  onProgress?: (p: WriteProgress) => void;
}) {
  return write({
    functionName: 'submit_work',
    args: [p.id, p.articleUrl, JSON.stringify(p.coauthors), JSON.stringify(p.sources)],
    onProgress: p.onProgress,
  });
}
export function adjudicate(p: { id: string; onProgress?: (p: WriteProgress) => void }) {
  return write({ functionName: 'adjudicate', args: [p.id], onProgress: p.onProgress });
}
export function reclaimExpired(p: { id: string; onProgress?: (p: WriteProgress) => void }) {
  return write({ functionName: 'reclaim_expired', args: [p.id], onProgress: p.onProgress });
}
export function withdraw(p: { onProgress?: (p: WriteProgress) => void } = {}) {
  return write({ functionName: 'withdraw', args: [], onProgress: p.onProgress });
}

// --------------------------------------------------------------------- errors
const ERROR_COPY: Record<string, string> = {
  ZERO_DEPOSIT: 'A brief must be funded with GEN to open.',
  BRIEF_TOO_SHORT: 'Give the brief a real title (4+ chars) and body (20+ chars).',
  INVALID_CRITERIA: 'Add between 1 and 10 acceptance criteria, each with real substance.',
  DUPLICATE_CRITERION: 'Two criteria are identical. Each must be distinct.',
  INVALID_MIN_SOURCES: 'Minimum sources must be between 0 and 5.',
  BRIEF_NOT_FOUND: 'That brief does not exist.',
  BRIEF_NOT_OPEN: 'This brief is not open — it already has a submission or is settled.',
  SUBMIT_WINDOW_CLOSED: 'The submission window closed. Backers can reclaim the pool.',
  INVALID_URL: 'URLs must be public https addresses (no localhost / private hosts).',
  INVALID_COAUTHORS: 'Co-authors must each be a valid wallet with a byline (max 6).',
  DUPLICATE_COAUTHOR: 'A wallet is listed twice among the authors.',
  INVALID_SOURCES: 'Sources must be valid public URLs (max 5).',
  TOO_FEW_SOURCES: 'This brief requires more primary sources than you listed.',
  NOT_SUBMITTED: 'There is no submission to adjudicate yet.',
  ARTICLE_UNREACHABLE: 'Validators could not render the published page. Check the URL is public.',
  WINDOW_OPEN: 'The submission window has not closed yet.',
  GRACE_OPEN: 'The adjudication grace period has not elapsed yet.',
  ALREADY_SETTLED: 'This brief is already settled.',
  NOTHING_TO_WITHDRAW: 'You have no claimable balance.',
};

export function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const marker = message.match(/\[EXPECTED\]\s+([A-Z_]+)/);
  if (marker) return ERROR_COPY[marker[1]] ?? `The contract rejected this: ${marker[1]}.`;
  if (/insufficient funds/i.test(message))
    return 'This account has no GEN on Studionet. Fund it from the Studio Accounts panel first.';
  if (/user rejected|denied/i.test(message)) return 'You cancelled the signature request.';
  if (/'from'/.test(message))
    return 'Your wallet is on a different network. Approve the switch to GenLayer Studionet and retry.';
  return message;
}
