// Runs the REAL built handler (aws/.build/handler.mjs, i.e. what would ship)
// against an in-memory fake of GitHub's Contents API and a fake Wise API.
// No network, no AWS, no dependencies: `npm run aws:test`.
//
// What this proves: the handler's own logic -- commit vs. dry-run, the
// guards, the integrity check, conflict handling, failure behavior. What it
// cannot prove: anything about real AWS (IAM, Secrets Manager, EventBridge,
// whether Wise's Cloudflare front door accepts Lambda's IPs). Those are the
// first-invocation checks in docs/aws-automation.md.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, partitionChanges, verifyIntegrity, MAX_CHANGE_FROM_CURRENT } from "../.build/handler.mjs";
import { serializeData } from "../.build/refresh-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "ghp_TEST_TOKEN_MUST_NEVER_APPEAR_IN_LOGS";
const TODAY = "2026-09-20";

// ---------- fixtures ----------

function corridor(send, sendName, sendCur, recv, recvName, recvCur) {
  return {
    sendCountry: send, sendCountryName: sendName, sendCurrency: sendCur,
    receiveCountry: recv, receiveCountryName: recvName, receiveCurrency: recvCur,
    everydayAmount: 200, largeAmount: 2000,
  };
}

const BASE_IMPLIED = {
  "US|IN": { Wise: 95.0, PayPal: 94.8, "Western Union": 94.5, Revolut: 94.9 },
  "EUR|IN": { Wise: 109.5, PayPal: 109.2, "Western Union": 108.0, Revolut: 109.6 },
};

function makeData() {
  const corridors = [
    corridor("US", "United States", "USD", "IN", "India", "INR"),
    corridor("EUR", "EUR", "EUR", "IN", "India", "INR"),
  ];
  const providerRates = [];
  for (const [key, providers] of Object.entries(BASE_IMPLIED)) {
    const [send, recv] = key.split("|");
    for (const tier of ["Everyday", "Large"]) {
      const amt = tier === "Everyday" ? 200 : 2000;
      for (const [provider, implied] of Object.entries(providers)) {
        providerRates.push({
          sendCountry: send, receiveCountry: recv, provider, tier,
          sendAmount: amt, amountReceived: Math.round(implied * amt * 100) / 100,
          dateChecked: "2026-09-13", source: provider === "Revolut" ? "Revolut" : "seed",
        });
      }
    }
  }
  return { corridors, providerRates };
}

// Fake Wise: returns Wise + Western Union always, PayPal never (it is often
// absent from the real API too). `drift` nudges every implied rate;
// `override(pair, provider, amount)` can return a custom receivedAmount.
function makeWise({ drift = 1.003, override = () => undefined, status = 200 } = {}) {
  return (url) => {
    const u = new URL(url);
    const src = u.searchParams.get("sourceCurrency");
    const amt = Number(u.searchParams.get("sendAmount"));
    const key = src === "USD" ? "US|IN" : "EUR|IN";
    if (status !== 200) return Promise.resolve(new Response("nope", { status }));
    const mk = (name, sourceCountry) => {
      const o = override(key, name, amt);
      const base = BASE_IMPLIED[key][name] * drift;
      return { sourceCountry, rate: base, fee: 1.99, receivedAmount: o === undefined ? Math.round(base * amt * 100) / 100 : o };
    };
    const wu = src === "EUR"
      ? [{ ...mk("Western Union", "IT"), receivedAmount: 1 }, mk("Western Union", "ES")] // core must pick ES
      : [mk("Western Union", null)];
    return Promise.resolve(Response.json({
      providers: [
        { name: "Wise", quotes: [mk("Wise", null)] },
        { name: "Western Union", quotes: wu },
      ],
    }));
  };
}

// Fake GitHub Contents API over one in-memory file.
function makeGithub(initialData) {
  const state = { text: serializeData(initialData), sha: "sha-1", puts: [], gets: 0, beforePut: null };
  const handle = async (url, opts = {}) => {
    const method = opts.method ?? "GET";
    assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`, "GitHub calls must carry the token from getToken");
    if (method === "GET") {
      state.gets++;
      return Response.json({ encoding: "base64", sha: state.sha, content: Buffer.from(state.text).toString("base64") });
    }
    const body = JSON.parse(opts.body);
    state.beforePut?.(state);
    if (body.sha !== state.sha) return new Response("conflict", { status: 409 });
    state.puts.push(body);
    state.text = Buffer.from(body.content, "base64").toString("utf8");
    state.sha = `sha-${state.puts.length + 1}`;
    return Response.json({ commit: { sha: `commit-${state.puts.length}`, html_url: "https://github.test/commit" } });
  };
  return { state, handle };
}

function makeDeps({ github, wise, env = {}, today = TODAY, ...rest }) {
  const fetchImpl = (url, opts) =>
    String(url).startsWith("https://api.github.com/") ? github.handle(url, opts) : wise(String(url));
  return {
    fetchImpl, today,
    getToken: async () => TOKEN,
    env: {
      GITHUB_REPO: "owner/repo", GITHUB_TOKEN_SECRET_ID: "secret-id",
      COMMITS_ENABLED: "true", ...env,
    },
    ...rest,
  };
}

// Capture structured logs.
let logs;
const realLog = console.log;
beforeEach(() => { logs = []; console.log = (line) => logs.push(JSON.parse(line)); });
afterEach(() => { console.log = realLog; });
const events = (name) => logs.filter((l) => l.event === name);

// ---------- tests ----------

test("build parity: the shipped core is byte-identical to scripts/lib (guard cannot drift from the CLI)", () => {
  const shipped = fs.readFileSync(path.join(HERE, "../.build/refresh-core.mjs"));
  const source = fs.readFileSync(path.join(HERE, "../../scripts/lib/refresh-core.mjs"));
  assert.ok(shipped.equals(source));
});

test("real run: commits once, with the file's sha, only rate fields changed", async () => {
  const data = makeData();
  const gh = makeGithub(data);
  const summary = await run({}, { awsRequestId: "req-1" }, makeDeps({ github: gh, wise: makeWise() }));

  assert.equal(summary.committed, true);
  assert.equal(gh.state.puts.length, 1);
  const put = gh.state.puts[0];
  assert.equal(put.sha, "sha-1");
  assert.equal(put.branch, "main");
  assert.equal(put.committer.name, "corridor-rate-refresh");
  assert.match(put.message, /^Auto-refresh Wise\/PayPal\/Western Union rates \(8 rows\)/);

  const after = JSON.parse(gh.state.text);
  assert.doesNotThrow(() => verifyIntegrity(data, after)); // nothing but mutable fields moved
  const wise = after.providerRates.find((r) => r.provider === "Wise" && r.receiveCountry === "IN" && r.sendCountry === "US" && r.tier === "Everyday");
  assert.equal(wise.dateChecked, TODAY);
  assert.equal(wise.amountReceived, Math.round(95.0 * 1.003 * 200 * 100) / 100);
  const revolut = after.providerRates.find((r) => r.provider === "Revolut");
  assert.equal(revolut.dateChecked, "2026-09-13", "manual providers are never touched");
  const paypal = after.providerRates.find((r) => r.provider === "PayPal");
  assert.equal(paypal.source, "seed", "a provider absent from the API response is left exactly as-is");
});

test("Eurozone: Western Union uses the ES quote, not the first/other one", async () => {
  const gh = makeGithub(makeData());
  await run({}, {}, makeDeps({ github: gh, wise: makeWise() }));
  const after = JSON.parse(gh.state.text);
  const wu = after.providerRates.find((r) => r.provider === "Western Union" && r.sendCountry === "EUR" && r.tier === "Everyday");
  assert.match(wu.source, /sourceCountry=ES/);
  assert.notEqual(wu.amountReceived, 1);
});

test("dryRun:true never writes, even with commits enabled", async () => {
  const gh = makeGithub(makeData());
  const summary = await run({ dryRun: true }, {}, makeDeps({ github: gh, wise: makeWise() }));
  assert.equal(gh.state.puts.length, 0);
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.committed, false);
  assert.equal(events("dry_run_complete").length, 1);
});

test("EnableCommits=false (the safe default) is a dry run even for a real invocation, and says so", async () => {
  const gh = makeGithub(makeData());
  const summary = await run({}, {}, makeDeps({ github: gh, wise: makeWise(), env: { COMMITS_ENABLED: "false" } }));
  assert.equal(gh.state.puts.length, 0);
  assert.equal(summary.mode, "dry-run");
  assert.equal(events("commits_disabled").length, 1);
});

test("no changes => no commit", async () => {
  const gh = makeGithub(makeData());
  await run({}, {}, makeDeps({ github: gh, wise: makeWise() })); // first run commits
  const summary = await run({}, {}, makeDeps({ github: gh, wise: makeWise() })); // same day, same data
  assert.equal(gh.state.puts.length, 1);
  assert.equal(summary.noChanges, true);
  assert.equal(events("no_changes").length, 1);
});

test("peer-outlier guard (shared core): blocked, logged loudly, NOT applied; other rows still applied", async () => {
  const gh = makeGithub(makeData());
  // US->IN Wise Everyday implied 114 vs best peer 94.9: >8% better => guard blocks
  const wise = makeWise({ override: (k, p, amt) => (k === "US|IN" && p === "Wise" && amt === 200 ? 114 * 200 : undefined) });
  const summary = await run({}, {}, makeDeps({ github: gh, wise }));

  const blocked = events("update_blocked");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].level, "WARN");
  assert.equal(blocked[0].reason, "peer_outlier");
  assert.match(blocked[0].label, /US->IN Wise Everyday/);
  assert.equal(summary.blocked, 1);

  const after = JSON.parse(gh.state.text);
  const row = after.providerRates.find((r) => r.provider === "Wise" && r.sendCountry === "US" && r.tier === "Everyday");
  assert.equal(row.amountReceived, 19000, "blocked row keeps its old value");
  assert.equal(row.dateChecked, "2026-09-13");
  assert.match(gh.state.puts[0].message, /blocked by the guard and NOT applied/, "blocks are visible in git history too");
});

test("Lambda-only change-from-current guard: a far-WORSE value (which the peer guard cannot see) is blocked", async () => {
  const gh = makeGithub(makeData());
  // 10.5% worse than current (95 -> 85): passes the one-sided peer guard by design
  const wise = makeWise({ override: (k, p, amt) => (k === "US|IN" && p === "Wise" && amt === 200 ? 85 * 200 : undefined) });
  await run({}, {}, makeDeps({ github: gh, wise }));
  const blocked = events("update_blocked");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].reason, "exceeds_change_from_current");
  const row = JSON.parse(gh.state.text).providerRates.find((r) => r.provider === "Wise" && r.sendCountry === "US" && r.tier === "Everyday");
  assert.equal(row.amountReceived, 19000);
});

test("threshold is exactly 8% (same number as the local script's guard)", () => {
  assert.equal(MAX_CHANGE_FROM_CURRENT, 0.08);
  const row = (amountReceived) => ({ before: { amountReceived: 1000, sendAmount: 10 }, after: { amountReceived, sendAmount: 10 } });
  assert.equal(partitionChanges([row(1079)]).safe.length, 1);
  assert.equal(partitionChanges([row(1081)]).blocked.length, 1);
  assert.equal(partitionChanges([row(921)]).safe.length, 1);
  assert.equal(partitionChanges([row(919)]).blocked.length, 1);
});

test("malformed API value (receivedAmount missing) is blocked instead of corrupting the file", async () => {
  const gh = makeGithub(makeData());
  const wise = makeWise({ override: (k, p, amt) => (k === "US|IN" && p === "Wise" && amt === 200 ? null : undefined) });
  await run({}, {}, makeDeps({ github: gh, wise }));
  assert.equal(events("update_blocked").some((e) => e.reason === "invalid_value"), true);
  const after = JSON.parse(gh.state.text);
  assert.ok(after.providerRates.every((r) => Number.isFinite(r.amountReceived) && r.amountReceived > 0));
});

test("all Wise fetches failing (e.g. 429/403) throws, logs errors, commits nothing", async () => {
  const gh = makeGithub(makeData());
  await assert.rejects(run({}, {}, makeDeps({ github: gh, wise: makeWise({ status: 429 }) })), /Every Wise fetch failed/);
  assert.equal(gh.state.puts.length, 0);
  assert.ok(events("fetch_failed").length > 0);
});

test("a concurrent push mid-run => 409, re-read, retry succeeds; nothing clobbered", async () => {
  const gh = makeGithub(makeData());
  let injected = false;
  gh.state.beforePut = (s) => {
    if (injected) return;
    injected = true; // simulate a human pushing while we were fetching from Wise
    const d = JSON.parse(s.text);
    d.providerRates.find((r) => r.provider === "Revolut").amountReceived = 12345;
    s.text = serializeData(d);
    s.sha = "sha-human";
  };
  const summary = await run({}, {}, makeDeps({ github: gh, wise: makeWise() }));
  assert.equal(summary.committed, true);
  assert.equal(events("commit_conflict").length, 1);
  const after = JSON.parse(gh.state.text);
  assert.equal(after.providerRates.find((r) => r.provider === "Revolut").amountReceived, 12345, "the human's change survives");
});

test("conflicting twice gives up loudly", async () => {
  const gh = makeGithub(makeData());
  gh.state.beforePut = (s) => { s.sha = `sha-human-${Math.random()}`; };
  await assert.rejects(run({}, {}, makeDeps({ github: gh, wise: makeWise() })), /conflicted twice/);
  assert.equal(gh.state.puts.length, 0);
});

test("`force` in the event is rejected outright (no force in Lambda)", async () => {
  const gh = makeGithub(makeData());
  await assert.rejects(run({ force: true }, {}, makeDeps({ github: gh, wise: makeWise() })), /`force` is not supported/);
  assert.equal(gh.state.gets, 0);
});

test("integrity check refuses a refresh that adds a row (nothing committed)", async () => {
  const gh = makeGithub(makeData());
  const sneaky = async (data, opts) => {
    const out = await (await import("../.build/refresh-core.mjs")).computeRefresh(data, opts);
    data.providerRates.push({ ...data.providerRates[0], provider: "Invented" }); // core misbehaving
    return out;
  };
  await assert.rejects(run({}, {}, makeDeps({ github: gh, wise: makeWise(), computeRefresh: sneaky })), /Integrity check failed/);
  assert.equal(gh.state.puts.length, 0);
});

test("integrity check ignores pure formatting (21842.0 vs 21842) but catches a changed immutable field", () => {
  const a = { corridors: [], providerRates: [{ provider: "X", amountReceived: 21842.0 }] };
  const b = JSON.parse('{"corridors":[],"providerRates":[{"provider":"X","amountReceived":21842}]}');
  assert.doesNotThrow(() => verifyIntegrity(a, b));
  const c = { corridors: [], providerRates: [{ provider: "Y", amountReceived: 21842 }] };
  assert.throws(() => verifyIntegrity(a, c), /immutable field "provider"/);
});

test("the GitHub token never appears in any log line", async () => {
  const gh = makeGithub(makeData());
  await run({}, {}, makeDeps({ github: gh, wise: makeWise({ override: (k, p, amt) => (k === "US|IN" && p === "Wise" && amt === 200 ? 114 * 200 : undefined) }) }));
  assert.equal(JSON.stringify(logs).includes(TOKEN), false);
  assert.equal(gh.state.puts[0].message.includes(TOKEN), false);
});

test("missing config fails fast with a clear error", async () => {
  await assert.rejects(run({}, {}, { env: {}, fetchImpl: () => { throw new Error("no network expected"); } }), /Missing required environment variable/);
});
