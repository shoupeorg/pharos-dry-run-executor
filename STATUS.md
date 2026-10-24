# Status

- Project: Pharos Dry-Run Executor
- Stage: LOCAL_DELIVERY_COMPLETE_PUBLICATION_PENDING
- Updated: 2026-10-24

## Preserved implementation

- Shared exact-arithmetic normalization and decision engine.
- Native, ERC-20 and strict advanced unsigned transaction templates.
- Independent `eth_call` and `estimate_gas` handling.
- Modeled/unknown change previews without tracing claims.
- Server-side unsigned-export gate bound to decision, transaction digest, constraints digest, chain and expiry.
- D1 persistence, API routes, CLI, English-only retro UI and verified Pharos PNG branding.

## Verified after recovery

- `npm test`: 18/18 passed on 2026-10-24.
- `npm run build`: passed on 2026-10-24; generated root `worker.js` only.
- `node --check public/app.js`: passed on 2026-10-24.

## Remaining

- GitHub publication and Cloudflare deployment.

## Gate verification

- Full suite now contains 21 tests; all 21 passed after hardening on 2026-10-24.
- Production build passed after hardening.
- Final verification on 2026-10-24: 21/21 tests passed, production build passed, browser JavaScript syntax passed, English-only repository scan passed, and all required source/evidence files were present.
- Failed, incomplete, historical, expired, wrong-chain, changed-transaction, changed-constraint and internally modified reports are rejected.

## Documentation and operations

- Root `SKILL.md`, `README.md`, `docs/architecture.md`, and stage-specific verify, capture, publish, deploy and public-verification scripts are complete.

## Evidence capture note

- The first direct Worker capture exposed a real optional-result bug: ERC-20 mode attempted to inspect the absent native-recipient task. The accessor is now null-safe; no evidence was saved or relabeled from the failed attempt.
- A corrected production Worker-route capture used fresh official Chain MCP reads at block `21098653`.
- Success report `fe6cbbe5-35e6-478f-a857-034e4a9a72db`: `GO`, successful block-pinned `eth_call`, unpinned gas estimate `79786`.
- Failure report `732144a9-1b5b-4f58-bc1f-08787affce1c`: `NO_GO`; both call and estimate reverted with `ERC20: transfer amount exceeds balance` for balance + 1 raw unit.
- The server prepare route rejected the failed report with HTTP `409`, `gate: BLOCKED`. Versioned raw records and SHA-256 manifest are saved under `evidence/` and `public/evidence/`.

## MCP schema inspection

- Inspected the official Streamable HTTP endpoint once on 2026-10-24.
- `eth_call` advertises `block`; calls may be pinned to the recorded block.
- `estimate_gas` does not advertise `block`; estimates are accurately labeled live/unpinned.
- No trace or state-diff tool was advertised. Raw schemas are saved in `evidence/foundation-mcp-schemas-v1.json`.

## Safety

No private key, signer, approval, broadcast method, contract deployment or token spending is present or authorized.
