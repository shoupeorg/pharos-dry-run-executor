const base = (process.env.DRY_RUN_BASE_URL || "https://pharos-dry-run-executor.shoupeorg.workers.dev").replace(/\/$/, "");
async function check(path, expectedType) { const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20_000) }); const type = response.headers.get("content-type") || ""; if (!response.ok || !type.includes(expectedType)) throw new Error(`${path}: HTTP ${response.status}, Content-Type ${type}`); return response; }
const ui = await check("/", "text/html");
const logo = await check("/pharos-logo.png", "image/png");
const meta = await (await check("/api/meta", "application/json")).json();
const success = await (await check("/evidence/v1-live-success.json", "application/json")).json();
const failure = await (await check("/evidence/v1-live-failure.json", "application/json")).json();
if (meta.network.chainId !== 1672 || success.decision !== "GO" || failure.decision !== "NO_GO") throw new Error("Public semantic verification failed.");
console.log(JSON.stringify({ base, ui: ui.status, logo: logo.status, engine: meta.engineVersion, success: success.decision, failure: failure.decision }, null, 2));
