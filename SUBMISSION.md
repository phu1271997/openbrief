# GENLAYER PROJECT EXPLORER — SUBMISSION DRAFT
**Project:** OpenBrief · **Prepared:** 2026-10-05 · **Status: READY TO SUBMIT**

All character-capped fields counted with `wc -m`. Copy the field bodies verbatim
into the Portal Explorer form.

---

## Project name
OpenBrief

## Primary category
**Social**
The mechanism is a creator-payout rail: it rewards published content and
classifies the people who produced it. Not chosen **AI & Agents** — although the
judging is AI, almost every project in the catalog is AI-powered, so that label
does not distinguish it and this is not agent infrastructure.

## Category tags
- **Tag 1 — Creator Rewards** — the pool pays out to the writers who produced the
  published piece, via `adjudicate` → impact-weighted split → `withdraw`.
- **Tag 2 — Contributor Reputation** — each author is classified LEAD / MAJOR /
  SUPPORTING by how much of the delivered piece they produced, and that tier
  governs their share. (The `roles` map in `adjudicate`.)

Rejected: *Community Moderation* (there is no takedown/appeal flow), *Group
Consensus* (consensus is validator-level, not a community vote).

## Logo
`frontend/public/logo-1024.png` + `logo-512.png` (source `logo.svg`) — a brief
page with a settling checkmark, amber on dark. PNG, 1024/512 px, < 2 MB.

## One-liner (162 chars / cap 180)
Crowd-fund a writing or research brief, then let GenLayer validators read the published page on-chain and split the payout among the people who actually wrote it.

## Description (898 chars / cap 1000)
Backers pool GEN behind a public content brief with explicit acceptance criteria. A writer publishes the deliverable at a real URL, binds their wallet, declares co-authors, and lists the primary sources used. The Intelligent Contract then renders the published page AND every cited source directly on-chain, and validator LLMs judge whether the piece meets the brief, grade a tier (PUBLISHED_STRONG / PUBLISHED_PARTIAL / OFF_BRIEF), and assign each author an impact role (LEAD / MAJOR / SUPPORTING). Consensus is on the verdict's meaning, not its wording. A STRONG verdict pays the full pool, split by impact weight; OFF_BRIEF refunds backers pro-rata. For editors, DAOs, and communities funding content who want payout tied to verified work, not trust. Solidity cannot read an arbitrary web page or judge whether it satisfies a brief; an off-chain oracle would just reintroduce the trusted editor.

## How to try it
Prerequisites: reading the registry and the settled verdicts needs **no wallet**.
To run a full brief end to end you need MetaMask with ~0.1 GEN on GenLayer
**studionet** (fund from the Studio Accounts panel — not the public faucet).

Step 1 — Browse settled briefs.
Open the app. Brief #1 shows a green PUBLISHED_STRONG verdict; brief #2 shows a
red OFF_BRIEF verdict. Open each and read the AI's on-chain `reason`.

Step 2 — (Optional) Fund your own brief.
Click "Fund a brief", write a title + brief + acceptance criteria, attach a GEN
deposit, and sign in MetaMask. Approve the switch to studionet if prompted.

Step 3 — Submit a deliverable.
On your brief, paste a public article URL and (optionally) co-author wallets and
source URLs, then submit. This binds your wallet to the work.

Step 4 — Run the AI jury.
Click "Adjudicate on-chain". Validators render the page + sources and judge the
brief; the consensus panel names each phase while you wait (this is slower than
a normal transaction by design).

Step 5 — See the split and withdraw.
The verdict panel shows the tier, confidence, `reason`, and the per-author
payout. Credited authors withdraw their balance.

Expected end state: a brief moves OPEN → SUBMITTED → SETTLED_*, with GEN credited
to authors (STRONG/PARTIAL) or refunded to backers (OFF_BRIEF).

If something goes wrong:
- "reverted … ARTICLE_UNREACHABLE" — the page is not publicly renderable; use a
  public URL (step 3).
- Writes fail with insufficient funds — the connected account is not funded on
  studionet (see Prerequisites).

## Expected verification outcome (428 chars / cap 500)
Open brief #1: status SETTLED_STRONG, confidence 92%, tier PUBLISHED_STRONG, pool 0.05 GEN paid in full to the writer (role LEAD). Open brief #2: status SETTLED_OFF_BRIEF, confidence 100%, 0 paid and the 0.03 GEN pool refunded to its backer. Each shows a free-text reason the validators produced on-chain (not this app's server). Reads need no wallet. Full flow (fund, submit, adjudicate) needs a studionet wallet with ~0.1 GEN.

## Contract link
https://explorer-studio.genlayer.com/address/0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32

Address: `0x51d7D8F697b9C6736ccDdec98eD481bc578b3C32`
Network: GenLayer studionet (chain id 61999)
Status: **Preview** (Studio-hosted deployment)
Verified in a browser: brief #1 (STRONG) and brief #2 (OFF_BRIEF) are settled on
chain with a `SUCCESS` adjudication transaction.

## Website
https://openbrief-cyan.vercel.app

## GitHub
https://github.com/phu1271997/openbrief

## Community links (optional)
— none —
