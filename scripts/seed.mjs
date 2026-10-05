#!/usr/bin/env node
/**
 * Seed demonstration briefs on Studionet so a reviewer opening the app sees a
 * working system rather than an empty page.
 *
 * Keys are read from the environment only (never disk, never logged):
 *   source ~/.genlayer/env.sh   # exports GENLAYER_PRIVATE_KEY (+ _2, _3)
 *   node scripts/seed.mjs all
 *
 * GENLAYER_PRIVATE_KEY   = the brief creator / backer.
 * GENLAYER_PRIVATE_KEY_2 = the writer who submits work (must differ).
 *
 * Commands:
 *   node scripts/seed.mjs strong     # a brief a real public page satisfies  -> PUBLISHED_STRONG
 *   node scripts/seed.mjs offbrief   # a brief the page does NOT satisfy     -> OFF_BRIEF (refund)
 *   node scripts/seed.mjs all
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
let createAccount, createClient, studionet, TransactionStatus;
try {
  ({ createAccount, createClient } = await import(pathToFileURL(require.resolve('genlayer-js')).href));
  ({ studionet } = await import(pathToFileURL(require.resolve('genlayer-js/chains')).href));
  ({ TransactionStatus } = await import(pathToFileURL(require.resolve('genlayer-js/types')).href));
} catch (e) {
  console.error('Could not load genlayer-js. Run `npm ci` in frontend/ first.');
  console.error(e?.message ?? e);
  process.exit(4);
}

const GEN = 10n ** 18n;
const CONTRACT =
  process.env.OPENBRIEF_ADDRESS || '0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32';

function accountFrom(name) {
  const raw = process.env[name];
  if (!raw) fail(`${name} is not set. Run: source ~/.genlayer/env.sh`);
  const key = raw.trim().startsWith('0x') ? raw.trim() : `0x${raw.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail(`${name} is not a 32-byte hex key.`);
  return createAccount(key);
}
function fail(m) { console.error(`\n${m}\n`); process.exit(2); }

const reader = createClient({ chain: studionet });
async function readJson(fn, args = []) {
  const raw = await reader.readContract({ address: CONTRACT, functionName: fn, args });
  return typeof raw === 'string' ? (raw ? JSON.parse(raw) : null) : raw;
}
async function send(account, fn, args, value = 0n) {
  const client = createClient({ chain: studionet, account });
  process.stdout.write(`  -> ${fn} ... `);
  const hash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value });
  // Studionet is slow to FINALIZE; ACCEPTED already carries the leader result
  // and committed state, which is all the seeder needs.
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 4000,
    retries: 120,
  });
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  const reverted =
    receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' ||
    leader?.execution_result === 'ERROR';
  if (reverted) {
    console.log('reverted');
    const stderr = leader?.genvm_result?.stderr || leader?.error || '';
    if (stderr) console.error('  ' + String(stderr).split('\n').slice(-4).join('\n  '));
    process.exit(1);
  }
  console.log('ok');
  return receipt;
}

const SCENARIOS = {
  strong: {
    title: 'Explain Bitcoin for a general reader',
    brief:
      'Publish a clear, accurate explainer of what Bitcoin is: a decentralized ' +
      'digital currency, the role of proof-of-work mining, and that it has a ' +
      'capped supply. It must cite a public reference.',
    criteria: [
      'Describes Bitcoin as a decentralized / peer-to-peer digital currency.',
      'Explains that new coins are created through mining / proof-of-work.',
      'Mentions the capped or limited total supply of bitcoin.',
    ],
    min_sources: 1,
    article_url: 'https://en.wikipedia.org/wiki/Bitcoin',
    sources: ['https://en.wikipedia.org/wiki/Proof_of_work'],
    deposit: (GEN * 5n) / 100n,
  },
  offbrief: {
    title: 'Deep technical analysis of the James Webb Space Telescope',
    brief:
      'Publish an in-depth technical analysis of the James Webb Space Telescope: ' +
      'its mirror design, the NIRCam and MIRI instruments, and the L2 orbit.',
    criteria: [
      'Describes the segmented primary mirror design of the telescope.',
      'Explains at least one science instrument (NIRCam, NIRSpec, or MIRI).',
      'Describes the Sun-Earth L2 orbit the observatory uses.',
    ],
    min_sources: 1,
    // The writer points at an unrelated page — it must be judged OFF_BRIEF.
    article_url: 'https://en.wikipedia.org/wiki/Bitcoin',
    sources: ['https://en.wikipedia.org/wiki/Bitcoin'],
    deposit: (GEN * 3n) / 100n,
  },
};

async function run(name) {
  const s = SCENARIOS[name];
  if (!s) fail(`Unknown scenario ${name}`);
  const creator = accountFrom('GENLAYER_PRIVATE_KEY');
  const writer = accountFrom('GENLAYER_PRIVATE_KEY_2');
  if (creator.address.toLowerCase() === writer.address.toLowerCase())
    fail('Creator and writer must be different accounts.');

  console.log(`\n[${name}] creator=${creator.address} writer=${writer.address}`);
  console.log(`Opening + funding brief with ${s.deposit / GEN === 0n ? Number(s.deposit) / 1e18 : s.deposit / GEN} GEN`);
  await send(creator, 'open_brief', [s.title, s.brief, JSON.stringify(s.criteria), s.min_sources], s.deposit);

  const count = Number(await readJson('get_brief_count'));
  const briefId = String(count);
  console.log(`Opened brief #${briefId}`);

  await send(writer, 'submit_work', [briefId, s.article_url, JSON.stringify([]), JSON.stringify(s.sources)]);
  console.log('Work submitted. Convening validators (each renders the page + sources and runs a model)...');
  await send(writer, 'adjudicate', [briefId]);

  const rec = await readJson('get_brief', [briefId]);
  console.log(`\nBrief #${briefId} => status=${rec.status} tier=${rec.tier} confidence=${rec.confidence}%`);
  console.log(`reason: ${rec.reason}`);
}

const cmd = process.argv[2] || 'all';
(async () => {
  if (cmd === 'all') { await run('strong'); await run('offbrief'); }
  else await run(cmd);
})().catch((e) => { console.error(`\n${e?.message ?? e}\n`); process.exit(1); });
