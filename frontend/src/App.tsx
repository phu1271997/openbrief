import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adjudicate,
  backBrief,
  type Brief,
  explainError,
  formatGen,
  getBalance,
  getBrief,
  listBriefs,
  openBrief,
  parseGen,
  reclaimExpired,
  submitWork,
  withdraw,
  type WriteProgress,
} from './lib/client';
import { contractAddress, explorerAddress } from './lib/config';
import { connectWallet, getBalance as getWalletBalance, getConnectedAccount, watchAccount } from './lib/wallet';

// --------------------------------------------------------------- tiny router
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}
function go(hash: string) {
  window.location.hash = hash;
}

// --------------------------------------------------------------- helpers
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  SUBMITTED: 'Awaiting AI judgment',
  SETTLED_STRONG: 'Published · strong',
  SETTLED_PARTIAL: 'Published · partial',
  SETTLED_OFF_BRIEF: 'Off brief · refunded',
  EXPIRED: 'Expired · refunded',
};
function statusClass(s: string): string {
  if (s === 'OPEN') return 'badge badge-open';
  if (s === 'SUBMITTED') return 'badge badge-wait';
  if (s === 'SETTLED_STRONG') return 'badge badge-strong';
  if (s === 'SETTLED_PARTIAL') return 'badge badge-partial';
  return 'badge badge-off';
}
function short(addr: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

// --------------------------------------------------------------- wallet ctx
function useWallet() {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [bal, setBal] = useState<bigint>(0n);
  useEffect(() => {
    getConnectedAccount().then(setAccount).catch(() => {});
    return watchAccount(setAccount);
  }, []);
  useEffect(() => {
    if (!account) return setBal(0n);
    getWalletBalance(account).then(setBal).catch(() => {});
  }, [account]);
  const connect = useCallback(async () => {
    setAccount(await connectWallet());
  }, []);
  return { account, bal, connect };
}

// --------------------------------------------------------------- progress UI
const PHASES: { key: WriteProgress['phase']; label: string }[] = [
  { key: 'validating', label: 'Preparing' },
  { key: 'awaiting-signature', label: 'Signing in wallet' },
  { key: 'awaiting-consensus', label: 'Validator consensus' },
  { key: 'finalized', label: 'Finalized' },
];
function ConsensusProgress({ progress, nondet }: { progress: WriteProgress | null; nondet?: boolean }) {
  if (!progress) return null;
  const idx = PHASES.findIndex((p) => p.key === progress.phase);
  return (
    <div className="progress">
      <div className="progress-steps">
        {PHASES.map((p, i) => (
          <div key={p.key} className={`step ${i <= idx ? 'step-done' : ''} ${i === idx ? 'step-active' : ''}`}>
            <span className="dot" />
            {p.label}
          </div>
        ))}
      </div>
      {nondet && progress.phase === 'awaiting-consensus' && (
        <p className="progress-note">
          Validators are each rendering the published page and its sources, then running a model to
          judge the brief. This is slower than a normal transaction — that wait <em>is</em> the product
          working.
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- header
function Header({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <a className="brand" href="#/" onClick={() => go('#/')}>
          <span className="brand-mark">◆</span> OpenBrief
        </a>
        <nav className="nav">
          <a href="#/" >Briefs</a>
          <a href="#/new">Fund a brief</a>
          <a href={explorerAddress(contractAddress) ?? '#'} target="_blank" rel="noreferrer">
            Contract ↗
          </a>
        </nav>
        <div className="wallet-box">
          {wallet.account ? (
            <span className="wallet-chip" title={wallet.account}>
              {formatGen(wallet.bal)} GEN · {short(wallet.account)}
            </span>
          ) : (
            <button className="btn btn-small" onClick={() => wallet.connect().catch(() => {})}>
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// --------------------------------------------------------------- home
function Home() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    listBriefs(0, 50)
      .then((p) => setBriefs(p.items.reverse()))
      .catch((e) => setErr(explainError(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>
            Pool money behind a brief.<br />
            Let the chain decide if the work earned it.
          </h1>
          <p className="lede">
            OpenBrief is a crowd-funded bounty board for writing, research and data work. Backers pool
            GEN behind a public brief. A writer publishes the piece at a real URL. GenLayer validators
            then read the page — and its cited sources — <strong>on-chain</strong>, judge it against the
            brief, and split the pool by each author's impact. No editor holds the keys.
          </p>
          <div className="hero-cta">
            <button className="btn" onClick={() => go('#/new')}>Fund a brief</button>
            <a className="btn btn-ghost" href="#browse">Browse open briefs</a>
          </div>
        </div>
      </section>

      <section className="wrap steps">
        <div className="step-card"><b>1 · Fund</b><p>Post a brief with explicit acceptance criteria and attach a GEN pool. Anyone can add to it.</p></div>
        <div className="step-card"><b>2 · Publish</b><p>A writer publishes the deliverable at a public URL, binds their wallet, and lists co-authors + sources.</p></div>
        <div className="step-card"><b>3 · Judge on-chain</b><p>Validators render the page and sources, then an LLM judges the brief — consensus on the verdict, not the prose.</p></div>
        <div className="step-card"><b>4 · Split</b><p>The pool pays authors by impact weight (LEAD/MAJOR/SUPPORTING), or refunds backers if the work is off-brief.</p></div>
      </section>

      <section className="wrap" id="browse">
        <h2 className="section-title">Briefs</h2>
        {err && <p className="error">{err}</p>}
        {!briefs && !err && <p className="muted">Loading briefs…</p>}
        {briefs && briefs.length === 0 && (
          <p className="muted">No briefs yet. <a href="#/new">Fund the first one →</a></p>
        )}
        <div className="grid">
          {briefs?.map((b) => (
            <a key={b.id} className="card brief-card" href={`#/brief/${b.id}`}>
              <div className="card-top">
                <span className={statusClass(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</span>
                <span className="pool">{formatGen(b.pool)} GEN</span>
              </div>
              <h3>{b.title}</h3>
              <p className="muted clamp">{b.brief}</p>
              <div className="card-foot">
                <span>{b.criteria.length} criteria</span>
                <span>{b.backers?.length ?? 1} backer{(b.backers?.length ?? 1) > 1 ? 's' : ''}</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

// --------------------------------------------------------------- create
function CreateBrief() {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [criteria, setCriteria] = useState<string[]>(['', '']);
  const [minSources, setMinSources] = useState(1);
  const [deposit, setDeposit] = useState('0.05');
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setCrit = (i: number, v: string) => setCriteria((c) => c.map((x, j) => (j === i ? v : x)));
  const addCrit = () => setCriteria((c) => (c.length < 10 ? [...c, ''] : c));
  const rmCrit = (i: number) => setCriteria((c) => (c.length > 1 ? c.filter((_, j) => j !== i) : c));

  const submit = async () => {
    setErr('');
    try {
      const clean = criteria.map((c) => c.trim()).filter(Boolean);
      if (clean.length < 1) throw new Error('Add at least one acceptance criterion.');
      const value = parseGen(deposit);
      if (value <= 0n) throw new Error('Attach a GEN deposit.');
      setBusy(true);
      await openBrief({ title: title.trim(), brief: brief.trim(), criteria: clean, minSources, deposit: value, onProgress: setProgress });
      go('#/');
    } catch (e) {
      setErr(explainError(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section className="wrap narrow">
      <a className="back" href="#/">← All briefs</a>
      <h1>Fund a brief</h1>
      <p className="muted">Describe exactly what "done" means. The acceptance criteria are what the validators judge against.</p>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Explain zk-rollups for a non-technical reader" /></label>
      <label>Brief<textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="What should the piece cover, and for whom?" /></label>
      <div className="criteria-edit">
        <span className="label">Acceptance criteria</span>
        {criteria.map((c, i) => (
          <div key={i} className="crit-row">
            <input value={c} onChange={(e) => setCrit(i, e.target.value)} placeholder={`Criterion ${i + 1}`} />
            <button className="btn btn-small btn-ghost" onClick={() => rmCrit(i)} disabled={criteria.length <= 1}>✕</button>
          </div>
        ))}
        <button className="btn btn-small btn-ghost" onClick={addCrit} disabled={criteria.length >= 10}>+ Add criterion</button>
      </div>
      <div className="row2">
        <label>Minimum primary sources
          <input type="number" min={0} max={5} value={minSources} onChange={(e) => setMinSources(Math.max(0, Math.min(5, Number(e.target.value))))} />
        </label>
        <label>Pool deposit (GEN)
          <input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.05" />
        </label>
      </div>
      {err && <p className="error">{err}</p>}
      <ConsensusProgress progress={progress} />
      <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Opening…' : 'Open & fund brief'}</button>
    </section>
  );
}

// --------------------------------------------------------------- detail
function BriefDetail({ id, wallet }: { id: string; wallet: ReturnType<typeof useWallet> }) {
  const [b, setB] = useState<Brief | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    getBrief(id).then(setB).catch((e) => setErr(explainError(e)));
  }, [id]);
  useEffect(load, [load]);

  if (err) return <section className="wrap"><p className="error">{err}</p></section>;
  if (!b || !b.id) return <section className="wrap"><p className="muted">Loading brief…</p></section>;

  const authorWallets = [b.author, ...(b.coauthors?.map((c) => c.wallet) ?? [])].filter(Boolean);
  const settled = ['SETTLED_STRONG', 'SETTLED_PARTIAL', 'SETTLED_OFF_BRIEF', 'EXPIRED'].includes(b.status);

  return (
    <section className="wrap narrow">
      <a className="back" href="#/">← All briefs</a>
      <div className="detail-head">
        <span className={statusClass(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</span>
        <h1>{b.title}</h1>
        <p className="pool-big">{formatGen(b.pool)} GEN pool · {b.backers?.length ?? 1} backer(s)</p>
      </div>
      <p className="brief-body">{b.brief}</p>

      <div className="panel">
        <h3>Acceptance criteria</h3>
        <ul className="criteria-list">
          {b.criteria.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
        <p className="muted small">Requires at least {b.min_sources} primary source(s).</p>
      </div>

      {b.article_url && (
        <div className="panel">
          <h3>Submission</h3>
          <p><a href={b.article_url} target="_blank" rel="noreferrer">{b.article_url} ↗</a></p>
          <p className="muted small">Submitted by {short(b.author)}{b.coauthors?.length ? ` + ${b.coauthors.length} co-author(s)` : ''}</p>
          {b.sources?.length > 0 && (
            <>
              <p className="label">Cited sources</p>
              <ul className="src-list">{b.sources.map((s, i) => <li key={i}><a href={s} target="_blank" rel="noreferrer">{s} ↗</a></li>)}</ul>
            </>
          )}
        </div>
      )}

      {settled && b.tier && (
        <div className={`verdict verdict-${b.status}`}>
          <div className="verdict-top">
            <span className={statusClass(b.status)}>{b.tier.replace('_', ' ')}</span>
            <span className="muted">confidence {b.confidence}%</span>
            <span className={`src-flag ${b.sources_ok ? 'ok' : 'bad'}`}>sources {b.sources_ok ? 'verified' : 'not verified'}</span>
          </div>
          <blockquote className="reason">“{b.reason}”</blockquote>
          <p className="muted small">The verdict above was produced by validator consensus on GenLayer — not by this site's server.</p>
          {Object.keys(b.roles ?? {}).length > 0 && (
            <table className="roles">
              <thead><tr><th>Author</th><th>Role</th></tr></thead>
              <tbody>
                {authorWallets.map((w) => (
                  <tr key={w}><td title={w}>{short(w)}</td><td>{b.roles?.[w] ?? b.roles?.[w.toLowerCase()] ?? 'NONE'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Paid to authors: {formatGen(b.paid_total)} GEN. Residual refunded to backers.</p>
        </div>
      )}

      {b.status === 'OPEN' && <BackPanel id={b.id} onDone={load} />}
      {b.status === 'OPEN' && <SubmitPanel id={b.id} minSources={b.min_sources} onDone={load} />}
      {b.status === 'OPEN' && <ReclaimRow id={b.id} onDone={load} />}
      {b.status === 'SUBMITTED' && <AdjudicatePanel id={b.id} onDone={load} />}

      <WithdrawPanel wallet={wallet} />
    </section>
  );
}

function BackPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const [amount, setAmount] = useState('0.02');
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr('');
    try {
      setBusy(true);
      await backBrief({ id, amount: parseGen(amount), onProgress: setProgress });
      onDone();
    } catch (e) { setErr(explainError(e)); } finally { setBusy(false); setProgress(null); }
  };
  return (
    <div className="panel">
      <h3>Back this brief</h3>
      <p className="muted small">Add GEN to the pool. If the work lands off-brief you are refunded pro-rata.</p>
      <div className="inline-form">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="GEN" />
        <button className="btn" onClick={run} disabled={busy}>{busy ? 'Backing…' : 'Add to pool'}</button>
      </div>
      {err && <p className="error">{err}</p>}
      <ConsensusProgress progress={progress} />
    </div>
  );
}

function SubmitPanel({ id, minSources, onDone }: { id: string; minSources: number; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [coauthors, setCoauthors] = useState<{ wallet: string; byline: string }[]>([]);
  const [sources, setSources] = useState<string[]>(minSources > 0 ? [''] : []);
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr('');
    try {
      const cleanSrc = sources.map((s) => s.trim()).filter(Boolean);
      const cleanCo = coauthors.filter((c) => c.wallet.trim());
      setBusy(true);
      await submitWork({ id, articleUrl: url.trim(), coauthors: cleanCo, sources: cleanSrc, onProgress: setProgress });
      onDone();
    } catch (e) { setErr(explainError(e)); } finally { setBusy(false); setProgress(null); }
  };
  return (
    <div className="panel">
      <h3>Submit your work</h3>
      <label>Published URL<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
      <div className="label">Co-authors (optional)</div>
      {coauthors.map((c, i) => (
        <div key={i} className="crit-row">
          <input value={c.wallet} onChange={(e) => setCoauthors((a) => a.map((x, j) => j === i ? { ...x, wallet: e.target.value } : x))} placeholder="0x wallet" />
          <input value={c.byline} onChange={(e) => setCoauthors((a) => a.map((x, j) => j === i ? { ...x, byline: e.target.value } : x))} placeholder="byline / name in piece" />
          <button className="btn btn-small btn-ghost" onClick={() => setCoauthors((a) => a.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="btn btn-small btn-ghost" onClick={() => setCoauthors((a) => a.length < 6 ? [...a, { wallet: '', byline: '' }] : a)}>+ Add co-author</button>
      <div className="label">Primary sources (min {minSources})</div>
      {sources.map((s, i) => (
        <div key={i} className="crit-row">
          <input value={s} onChange={(e) => setSources((a) => a.map((x, j) => j === i ? e.target.value : x))} placeholder="https://source…" />
          <button className="btn btn-small btn-ghost" onClick={() => setSources((a) => a.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="btn btn-small btn-ghost" onClick={() => setSources((a) => a.length < 5 ? [...a, ''] : a)}>+ Add source</button>
      {err && <p className="error">{err}</p>}
      <ConsensusProgress progress={progress} />
      <button className="btn" onClick={run} disabled={busy}>{busy ? 'Submitting…' : 'Bind & submit work'}</button>
    </div>
  );
}

function AdjudicatePanel({ id, onDone }: { id: string; onDone: () => void }) {
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr('');
    try {
      setBusy(true);
      await adjudicate({ id, onProgress: setProgress });
      onDone();
    } catch (e) { setErr(explainError(e)); } finally { setBusy(false); setProgress(null); }
  };
  return (
    <div className="panel panel-accent">
      <h3>Run the AI jury</h3>
      <p className="muted small">Validators render the published page and every cited source, judge the brief, and release the pool. Anyone can trigger this.</p>
      {err && <p className="error">{err}</p>}
      <ConsensusProgress progress={progress} nondet />
      <button className="btn" onClick={run} disabled={busy}>{busy ? 'Judging…' : 'Adjudicate on-chain'}</button>
    </div>
  );
}

function ReclaimRow({ id, onDone }: { id: string; onDone: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr('');
    try { setBusy(true); await reclaimExpired({ id }); onDone(); }
    catch (e) { setErr(explainError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="reclaim-row">
      <button className="btn btn-small btn-ghost" onClick={run} disabled={busy}>Reclaim pool (if expired)</button>
      {err && <span className="error small"> {err}</span>}
    </div>
  );
}

function WithdrawPanel({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [claimable, setClaimable] = useState<string>('0');
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!wallet.account) return setClaimable('0');
    getBalance(wallet.account).then(setClaimable).catch(() => {});
  }, [wallet.account]);
  useEffect(load, [load]);
  const run = async () => {
    setErr('');
    try { setBusy(true); await withdraw({ onProgress: setProgress }); load(); }
    catch (e) { setErr(explainError(e)); } finally { setBusy(false); setProgress(null); }
  };
  if (!wallet.account) return null;
  return (
    <div className="panel">
      <h3>Your claimable balance</h3>
      <p className="pool-big">{formatGen(claimable)} GEN</p>
      {err && <p className="error">{err}</p>}
      <ConsensusProgress progress={progress} />
      <button className="btn" onClick={run} disabled={busy || BigInt(claimable || '0') <= 0n}>
        {busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </div>
  );
}

// --------------------------------------------------------------- app
export default function App() {
  const wallet = useWallet();
  const route = useHashRoute();
  const briefId = useMemo(() => {
    const m = route.match(/^#\/brief\/([0-9]+)$/);
    return m ? m[1] : null;
  }, [route]);

  return (
    <>
      <Header wallet={wallet} />
      <main>
        {route === '#/new' ? (
          <CreateBrief />
        ) : briefId ? (
          <BriefDetail id={briefId} wallet={wallet} />
        ) : (
          <Home />
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <span>OpenBrief · GenLayer Studionet</span>
          <a href={explorerAddress(contractAddress) ?? '#'} target="_blank" rel="noreferrer">{short(contractAddress)} ↗</a>
        </div>
      </footer>
    </>
  );
}
