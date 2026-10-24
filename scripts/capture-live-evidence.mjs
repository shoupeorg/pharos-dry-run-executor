import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = (process.env.DRY_RUN_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const direct = process.env.DRY_RUN_DIRECT_WORKER === "1";
const timeoutMs = 45_000;
const project = resolve(import.meta.dirname, "..");

async function request(path, options = {}) {
  let response;
  if (direct) {
    const { default: worker } = await import("../src/worker.js");
    response = await worker.fetch(new Request(`http://local.test${path}`, options), directEnv);
  } else response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok && !options.allowFailure) throw new Error(`${options.method || "GET"} ${path} failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  return { status: response.status, contentType: type, data };
}

const saved = new Map();
const directEnv = {
  DB: {
    prepare(sql) { return { bind(...values) { return {
      async run() { saved.set(values[0], values[5]); return { success: true }; },
      async first() { const raw = saved.get(values[0]); return raw ? { report_raw: raw } : null; },
      async all() { return { results: [...saved.values()].map(report_raw => ({ report_raw })) }; }
    }; } }; }
  },
  ASSETS: { fetch() { return new Response("Not found", { status: 404 }); } }
};

const common = {
  workspaceId: "public-evidence-v1",
  mode: "erc20",
  chainId: 1672,
  from: "0x15ddce897d76ac39c188ade4d353711a60395315",
  to: "0x4117b9737f64d816be36f6c18c72409c98e4737c",
  token: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815",
  amount: "1",
  minimumRetainedNative: "0.1",
  gasBufferBps: 2000,
  gasPriceCeilingGwei: "100"
};
const post = value => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const success = (await request("/api/simulate", post(common))).data;
if (success.decision !== "GO") throw new Error(`Success sample did not produce GO: ${success.decision}`);
const balance = BigInt(success.evidence.senderTokenBalanceRaw);
const decimals = Number(success.evidence.tokenDecimals);
const raw = (balance + 1n).toString().padStart(decimals + 1, "0");
const failureAmount = `${raw.slice(0, -decimals)}.${raw.slice(-decimals)}`.replace(/\.0+$/, "");
const failureRequest = { ...common, amount: failureAmount };
const failure = (await request("/api/simulate", post(failureRequest))).data;
if (failure.decision !== "NO_GO" || failure.simulation.call.status !== "REVERT") throw new Error("Over-balance sample did not produce a real EVM revert.");
const gate = await request(`/api/reports/${failure.id}/prepare`, { ...post(failureRequest), allowFailure: true });
if (gate.status !== 409 || gate.data.gate !== "BLOCKED") throw new Error(`Failed report was not rejected by the server gate: HTTP ${gate.status}`);

const gateEvidence = { capturedAt: new Date().toISOString(), method: "POST", path: `/api/reports/${failure.id}/prepare`, reportId: failure.id, request: failureRequest, response: gate };
for (const dir of [resolve(project, "evidence"), resolve(project, "public", "evidence")]) {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "v1-live-success.json"), `${JSON.stringify(success, null, 2)}\n`);
  await writeFile(resolve(dir, "v1-live-failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
  await writeFile(resolve(dir, "v1-live-gate-rejection.json"), `${JSON.stringify(gateEvidence, null, 2)}\n`);
}
console.log(JSON.stringify({ execution: direct ? "direct-worker-route" : base, success: { id: success.id, decision: success.decision, block: success.block }, failure: { id: failure.id, decision: failure.decision, reason: failure.reasons }, gate: { status: gate.status, body: gate.data } }, null, 2));
