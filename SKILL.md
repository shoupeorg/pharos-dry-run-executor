---
name: pharos-dry-run-executor
description: Rehearse an unsigned native, ERC-20, or advanced transaction on Pharos Pacific Mainnet using official Chain MCP observations, exact arithmetic, explicit provenance, and a fail-closed unsigned-export gate. Use for transaction simulation and readiness checks, never signing or broadcasting.
---

# Pharos Dry-Run Executor

Normalize the user's proposed unsigned transaction and constraints, then use the official Pharos Chain MCP at `https://mcp.pharos.xyz/mcp` for read-only observations.

## Workflow

1. Require chain ID `1672`, an explicit sender, and decimal-string values. Reject numeric payment amounts.
2. For a native transfer, encode only `from`, `to`, `value`, and empty calldata. For ERC-20, read token metadata and encode `transfer(address,uint256)`. For advanced mode, accept only the documented strict transaction fields.
3. Record the latest block. Send `block` only to tools whose current advertised schema contains that property. The saved foundation schema shows `eth_call` supports it while `estimate_gas` does not.
4. Run `eth_call` and `estimate_gas` independently. Treat transport failure as unavailable evidence, never as an EVM revert.
5. Compute value, gas, buffers, ceilings, and retained balance using integer arithmetic. Keep native value separate from gas.
6. Explain every effect with provenance. Without trace/state diff, label post-state `MODELED` or `UNKNOWN`; never claim observed post-state.
7. Return `GO`, `NO_GO`, or `INSUFFICIENT_DATA` with reasons. Reports may always be exported.
8. Prepare an unsigned transaction only through the server gate and only for a fresh `GO` report whose transaction, constraints, chain, evidence, and integrity digests still match.

## Hard boundaries

- Never request or store private keys or seed phrases.
- Never sign, broadcast, approve tokens, deploy contracts, or spend funds.
- Never treat simulation as authorization to use the sender account.
- Never reconstruct missing chain responses or relabel historical evidence as fresh.

Implementation details and trust boundaries are documented in [docs/architecture.md](docs/architecture.md).
