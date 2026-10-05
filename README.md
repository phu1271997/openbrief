# OpenBrief

**Crowd-funded content bounties, settled by AI validator consensus on GenLayer studionet.**

Backers pool GEN behind a public **content brief** with explicit acceptance
criteria. A writer publishes the deliverable at a real URL, binds their wallet,
declares any co-authors, and lists the primary sources it rests on. The
GenLayer Intelligent Contract then **renders the published page and every cited
source directly on-chain** (`gl.nondet.web.render`), lets a set of validator
LLMs judge whether the piece meets the brief, grades a quality tier, assigns
each author an **impact role**, and splits the pool by weight — or refunds every
backer. No editor, server, or oracle holds the keys.

| | |
|---|---|
| **Live app** | https://openbrief-cyan.vercel.app |
| **Contract** | [`0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32`](https://explorer-studio.genlayer.com/address/0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32) |
| **Network** | GenLayer **studionet**, chain id `61999` (Studio-hosted → Explorer status *Preview*) |
| **Repo** | https://github.com/phu1271997/openbrief |

> **Why this dies without GenLayer:** the entire product is a *subjective
> judgment* about whether an arbitrary web page satisfies a written brief, plus
> a *fair split* of real money across the people who wrote it. Remove the
> on-chain web read + LLM and there is no verdict to pay against. Replace
> GenLayer consensus with an off-chain oracle and you have not removed the
> trusted editor — you have only hidden them behind an API.

---

## The flow

```
FUND a brief  →  PUBLISH + bind work  →  ADJUDICATE on-chain  →  SPLIT / refund  →  WITHDRAW
```

1. **Fund** — `open_brief(title, brief, criteria_json, min_sources)` is payable;
   anyone else can top up the same pool with `back_brief`.
2. **Publish** — the writer calls `submit_work(brief_id, article_url,
   coauthors_json, sources_json)`, binding their wallet and declaring authors +
   sources.
3. **Adjudicate** — `adjudicate(brief_id)` runs the non-deterministic block:
   every validator renders the page and each source, then an LLM returns a tier,
   a per-wallet role map, and a free-text reason.
4. **Split** — a `PUBLISHED_STRONG` verdict pays 100 % of the pool, split by
   impact weight (LEAD 5 · MAJOR 3 · SUPPORTING 1); `PUBLISHED_PARTIAL` pays
   50 %; `OFF_BRIEF` pays nothing and refunds backers pro-rata.
5. **Withdraw** — earnings and refunds accrue to a claimable balance pulled with
   `withdraw()`.

A brief that gets no submission in 7 days, or a submission left un-adjudicated
past a 3-day grace, can be reclaimed by its backers via `reclaim_expired`.

## Why the consensus is real (not a format check)

The nondet block uses `gl.vm.run_nondet(leader_fn, validator_fn)`. The
`validator_fn` compares the **meaning** of the verdict — the outcome `tier`, the
`sources_ok` flag, and the per-wallet `roles` map — and deliberately **ignores
the free-text `reason`**. Two validators that word their reasoning differently
still reach consensus; two that disagree on the *tier* or on *who contributed*
fail to settle, and no money moves. This is the line between a 1 and a 4+ on the
GenLayer rubric: validators check the content of the judgment, not the shape of
the JSON.

### Advanced nondet: multi-source cross-check

`adjudicate` does not only read the article. It renders **every declared source**
on-chain and counts how many resolve to real content. A brief that requires
sources only passes its source check when a strict majority of them are live;
an otherwise-strong piece whose sources 404 is capped at `PUBLISHED_PARTIAL`.
Fetching arbitrary pages and reasoning about them at settlement time is exactly
what Solidity cannot do.

## Repository layout

```
contracts/open_brief.py     # the Intelligent Contract (single contract)
frontend/                   # React + Vite + genlayer-js app (MetaMask signs)
scripts/deploy.py           # deploy to studionet from the central keystore
scripts/seed.mjs            # seed demo briefs (strong + off-brief)
tests/                      # offline logic tests (pytest)
docs/DEPLOY-STUDIONET.md    # step-by-step deployment runbook
```

## Run it locally

```bash
cd frontend
npm ci
npm run dev          # http://localhost:5173
```

The app ships with the current studionet address baked in as a default, so it
works on a fresh checkout. A `VITE_CONTRACT_ADDRESS` in `frontend/.env.local`
(or the Vercel dashboard) overrides it to point at a redeploy.

To use it you need a MetaMask account **funded with GEN on studionet** (transfer
from a pre-funded account in the Studio **Accounts** panel — the public testnet
faucet is a different chain). The app switches/adds the network for you on
connect; it never holds a private key.

## Deploy your own

See [`docs/DEPLOY-STUDIONET.md`](docs/DEPLOY-STUDIONET.md). In short:

```bash
source ~/.genlayer/env.sh              # exports GENLAYER_PRIVATE_KEY
python3 scripts/deploy.py --chain studionet
# put the printed address in frontend/.env.local (VITE_CONTRACT_ADDRESS) and src/lib/config.ts
```

## Seed demonstration data

```bash
source ~/.genlayer/env.sh              # GENLAYER_PRIVATE_KEY (creator) + _2 (writer)
cd frontend && npm ci && cd ..
node scripts/seed.mjs all
```

This opens two briefs end to end and settles them by real consensus: a
Bitcoin-explainer brief that a public reference page satisfies → `SETTLED_STRONG`,
and a telescope brief whose submission is off-topic → `SETTLED_OFF_BRIEF`
(refunded).

## Tests

```bash
pytest -q                 # offline logic tests for the payout + verdict rules
```

## Tag

- **Primary:** Social · **Tag 1:** Creator Rewards · **Tag 2:** Contributor Reputation
