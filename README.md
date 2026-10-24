# Pharos Dry-Run Executor

Evidence-backed transaction rehearsal for Pharos Pacific Mainnet (chain ID `1672`). It normalizes a native transfer, ERC-20 transfer, or strict advanced transaction; obtains live observations through the official Chain MCP; evaluates `eth_call` and `estimate_gas` independently; explains cost and modeled effects; persists reports in D1; and gates a separate unsigned-transaction export.

The application never accepts a private key, signs, broadcasts, approves tokens, deploys contracts, or spends funds.

## Safety model

- All quantities use exact integer or decimal-string arithmetic. JavaScript floating point is not used for payment values.
- `eth_call` is sent with a recorded block because the inspected official schema supports `block`.
- `estimate_gas` and gas price are live but unpinned because their schemas expose no block parameter.
- A network/transport failure is `INSUFFICIENT_DATA`, never an EVM revert.
- Expected post-state is `MODELED`, `MODELED_ASSUMPTION`, `MODELED_LIMITED`, or `UNKNOWN`; no trace/state-diff capability was advertised.
- A failed report remains downloadable, but unsigned preparation requires a fresh `GO` report with matching transaction, constraints, chain, integrity digests, and complete simulation evidence.

See [Architecture](docs/architecture.md) and the saved [MCP schemas](evidence/foundation-mcp-schemas-v1.json).

## Local verification

```powershell
npm ci
npm test
npm run build
```

Run a CLI simulation from an input JSON file:

```powershell
npm run cli -- .\request.json
```

Run the local Worker after applying the local D1 migration:

```powershell
npx wrangler d1 migrations apply pharos-dry-run-executor --local
npx wrangler dev --local
```

## API

- `GET /api/meta` — safety and engine metadata.
- `POST /api/simulate` — live read-only simulation and D1 persistence.
- `GET /api/reports?workspace=...` — isolated report history.
- `GET /api/reports/:id/json` and `/markdown` — report exports for any outcome.
- `POST /api/reports/:id/prepare` — guarded unsigned transaction preparation; never signs or broadcasts.

## Evidence and deployment

Versioned evidence is immutable under `evidence/`; public copies are under `public/evidence/`. The schema inspection artifact is foundation evidence, not a chain observation. Stage-specific scripts live in `scripts/`:

- `verify-local.ps1`
- `capture-live-evidence.mjs`
- `publish-source.ps1`
- `provision-deploy.ps1`
- `verify-public.mjs`
- `resume-publication-deploy.ps1` — resumes only external publication/deployment stages after local completion.

The Cloudflare D1 identifier in `wrangler.jsonc` must be replaced by the provision script before deployment.

## Limitations

- No tracing or state-diff tool is available in the inspected official MCP tool list.
- `estimate_gas` and gas price cannot be pinned to the `eth_call` block through the advertised schemas.
- ERC-20 expected balances are a model under explicitly verified standard-token assumptions, not observed post-state.
- A public address used in examples is not controlled by this project; simulation does not grant spending authority.
