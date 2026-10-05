#!/usr/bin/env python3
"""Deploy contracts/open_brief.py to a GenLayer network (default: studionet).

Usage:
    source ~/.genlayer/env.sh        # exports GENLAYER_PRIVATE_KEY
    python3 scripts/deploy.py --chain studionet

Reads the deployer key from GENLAYER_PRIVATE_KEY. Prints the deployed contract
address on success. Never hard-codes or prints the private key.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import localnet, studionet, testnet_asimov

CHAINS = {"studionet": studionet, "localnet": localnet, "testnet": testnet_asimov}
CONTRACT = Path(__file__).resolve().parent.parent / "contracts" / "open_brief.py"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chain", default="studionet", choices=list(CHAINS))
    ap.add_argument("--check-only", action="store_true", help="load schema, do not deploy")
    args = ap.parse_args()

    code = CONTRACT.read_text()

    key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not args.check_only and (not key or "REPLACE_ME" in key):
        print("ERROR: GENLAYER_PRIVATE_KEY not set. Run: source ~/.genlayer/env.sh", file=sys.stderr)
        return 2

    chain = CHAINS[args.chain]
    account = create_account(key) if key else None
    client = create_client(chain=chain, account=account)

    try:
        client.get_contract_schema_for_code(code.encode())
        print("Schema:   OK")
    except Exception as e:  # noqa: BLE001
        print(f"Schema check failed: {e}", file=sys.stderr)
        return 1
    if args.check_only:
        return 0

    print(f"Deployer: {account.address}")
    print(f"Chain:    {chain.name} (id={chain.id})")

    tx_hash = client.deploy_contract(code=code, account=account)
    print(f"Deploy tx: {tx_hash}")
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, status="FINALIZED", interval=5000, retries=80
    )
    addr = (
        receipt.get("data", {}).get("contract_address")
        if isinstance(receipt, dict)
        else getattr(receipt, "contract_address", None)
    )
    if not addr and isinstance(receipt, dict):
        addr = receipt.get("contract_address") or receipt.get("to")
    print(f"\nContract address: {addr}")
    print(f"Explorer: https://explorer-studio.genlayer.com/address/{addr}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
