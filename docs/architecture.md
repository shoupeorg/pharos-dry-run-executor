# Architecture

```mermaid
flowchart LR
    U[User request] --> N[Exact normalization]
    N --> M[Official Chain MCP]
    M --> C[eth_call at recorded block]
    M --> G[estimate_gas live / unpinned]
    M --> P[Balances, code, gas price]
    C --> E[Decision engine]
    G --> E
    P --> E
    E --> R[D1 report]
    R --> X[JSON / Markdown report export]
    R --> A{Server-side unsigned gate}
    A -->|fresh GO + exact digests| T[Unsigned transaction JSON]
    A -->|failed, incomplete, expired, changed, wrong chain| B[BLOCKED]
```

## Trust and provenance

The browser submits only a request. The Worker performs Chain MCP reads and computes the authoritative report. D1 stores the exact report used by the export gate. The browser cannot convert a downloaded/static report into an authorized export.

`eth_call` is block-pinned because the live official schema advertises `block`. `estimate_gas` and `get_gas_price` expose no block parameter and are labeled live/unpinned. Since the advertised tool list contains no trace/state-diff method, effect previews are models or unknowns rather than claimed observed post-state.

The preparation endpoint recomputes the normalized request and both digests, validates internal report integrity, checks chain `1672`, checks complete successful call/estimate evidence, and enforces the five-minute expiry. It emits data only; no signing or broadcasting code exists.
