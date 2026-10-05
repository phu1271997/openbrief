# Deploying OpenBrief to GenLayer Studionet

Everything lives on **Studionet** — the hosted network behind
`https://studio.genlayer.com`, chain id `61999`. A contract deployed here exists
only here; the public testnet faucet funds a different chain entirely.

## 0. Before you start

- A wallet with a **GEN balance on Studionet**. Fund it from the Studio
  **Accounts** panel by transferring from a pre-funded Studio account. Do not
  use the public testnet faucet, and do not generate a burner in the browser —
  a fresh address starts at zero and the hosted RPC will not fund it.
- The deployer key available as `GENLAYER_PRIVATE_KEY` (the central keystore
  exports it: `source ~/.genlayer/env.sh`).
- `python3` with `genlayer-py` installed (used by `scripts/deploy.py`).

## 1. Deploy the contract

```bash
source ~/.genlayer/env.sh
python3 scripts/deploy.py --chain studionet
```

The script loads the contract schema first (a cheap pre-flight), deploys, waits
for the receipt, and prints the address and an Explorer link. `Status:
FINALIZED` alone is not success on Studionet — the script reads the receipt, and
you should confirm the address resolves on the Explorer with a `SUCCESS` row.

Record the printed address.

## 2. Point the frontend at the deployment

Public addresses are not secrets, so the current address is the hard-coded
default in `frontend/src/lib/config.ts`. To point a build at a different
deployment either edit that default or set an override:

```bash
cd frontend
cp .env.example .env.local
# set VITE_CONTRACT_ADDRESS=0x…
```

There is **no key** in that file and there must never be one — anything prefixed
`VITE_` is compiled into the public bundle. MetaMask signs every write.

## 3. Deploy the frontend

```bash
cd frontend
npm ci
npx vercel --prod
```

If you use the `VITE_CONTRACT_ADDRESS` override, set the same variable in the
Vercel project's environment settings and redeploy so the build picks it up.

## 4. Seed demonstration data

```bash
source ~/.genlayer/env.sh      # GENLAYER_PRIVATE_KEY (creator) + _2 (writer)
node scripts/seed.mjs all
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `AttributeError: module 'genlayer.gl.vm' has no attribute 'get_timestamp'` | An older runner API. This contract uses plain Python `datetime` for time, which the pinned runner supports. |
| Deploy tx finalizes but state stays empty | A GenVM revert reports a finalized tx. Read the leader receipt's `genvm_result.stderr`; the seed script and frontend already surface `[EXPECTED]` markers. |
| `Timed out waiting for … FINALIZED` | Studionet is slow to finalize. The app and seeder wait for `ACCEPTED` (state is already committed there). |
| Every write fails on a funded-looking account | Confirm the **connected** account is funded **on Studionet**, not another chain. |
