// aws/refresh-lambda/handler.mjs
//
// Scheduled AWS Lambda that runs the same Wise/PayPal/Western Union refresh
// as scripts/refresh-wise-rows.mjs and, if it produces a safe change, commits
// data/provider-data.json to GitHub -- which the existing Vercel Git
// integration then deploys, exactly like every manual data commit. See
// docs/aws-automation.md for the architecture, setup, and the guard's exact
// semantics.
//
// Design rules this file enforces:
//   - The refresh/guard logic is refresh-core.mjs, copied verbatim from
//     scripts/lib at build time (aws/build.sh). Not reimplemented here.
//   - Always read the CURRENT file from GitHub, never a bundled copy --
//     otherwise a run would silently overwrite anyone's manual edits.
//   - Commit via the GitHub Contents API with the file's sha, so a push that
//     lands mid-run makes our write fail (409) instead of clobbering it.
//   - There is deliberately NO `force` option. Forced writes are a human
//     decision and stay in the local CLI.
//   - The GitHub token comes only from Secrets Manager. Wise's comparison
//     endpoint is unauthenticated, so there is no Wise credential to store.
//   - Everything notable is logged as one-line JSON so CloudWatch metric
//     filters can alarm on it (see aws/template.yaml). A blocked update must
//     be loud, not silent.

import { computeRefresh, applyChanges, serializeData } from "./refresh-core.mjs";

// ADDITIONAL Lambda-only safety net (not part of the shared guard): refuse
// to auto-apply any row whose implied rate moves more than this from its
// current value in one refresh. The shared peer-outlier guard only blocks
// values that look too GOOD versus peers; it cannot catch a garbage value
// that is far worse than before. Unattended, that gap matters. In the first
// real dry run against production data the largest legitimate move was
// ~1.6%, so this should never fire in normal operation. See
// docs/aws-automation.md ("The guard, precisely").
export const MAX_CHANGE_FROM_CURRENT = 0.08;

// The only fields a refresh is allowed to modify on an existing row.
const MUTABLE_ROW_FIELDS = new Set(["sendAmount", "amountReceived", "dateChecked", "source"]);

const COMMITTER = {
  name: "corridor-rate-refresh",
  email: "corridor-rate-refresh@users.noreply.github.com",
};

function log(level, event, fields = {}) {
  console.log(JSON.stringify({ level, event, ...fields }));
}

function rowLabel(row) {
  return `${row.sendCountry}->${row.receiveCountry} ${row.provider} ${row.tier}`;
}

export function readConfig(env) {
  const missing = ["GITHUB_REPO", "GITHUB_TOKEN_SECRET_ID"].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return {
    repo: env.GITHUB_REPO, // "owner/name"
    branch: env.GITHUB_BRANCH || "main",
    dataPath: env.DATA_PATH || "data/provider-data.json",
    secretId: env.GITHUB_TOKEN_SECRET_ID,
    // Stays "false" until a human has watched a dry run and flipped it.
    commitsEnabled: env.COMMITS_ENABLED === "true",
  };
}

// Splits the shared core's proposed changes into ones safe to auto-apply and
// ones this Lambda refuses, with the reason for each.
export function partitionChanges(changes, maxChange = MAX_CHANGE_FROM_CURRENT) {
  const safe = [];
  const blocked = [];
  for (const c of changes) {
    const { before, after } = c;
    if (!Number.isFinite(after.amountReceived) || after.amountReceived <= 0) {
      blocked.push({ change: c, reason: "invalid_value", detail: `fetched amountReceived=${after.amountReceived}` });
      continue;
    }
    const beforeRate = before.amountReceived / before.sendAmount;
    const afterRate = after.amountReceived / after.sendAmount;
    const deviation = Math.abs(afterRate - beforeRate) / beforeRate;
    if (!Number.isFinite(deviation) || deviation > maxChange) {
      blocked.push({
        change: c,
        reason: "exceeds_change_from_current",
        detail: `implied rate ${beforeRate.toFixed(4)} -> ${afterRate.toFixed(4)} (${(deviation * 100).toFixed(1)}% > ${(maxChange * 100).toFixed(0)}%)`,
      });
      continue;
    }
    safe.push(c);
  }
  return { safe, blocked };
}

// Post-condition run on the data we're about to commit: a refresh may only
// change the mutable fields of rows that already existed. Compares parsed
// values (not text), so pure formatting changes like 21842.0 -> 21842 are
// fine, but any added/removed/reordered row or touched corridor fails loudly.
export function verifyIntegrity(before, after) {
  const fail = (msg) => {
    throw new Error(`Integrity check failed, refusing to commit: ${msg}`);
  };
  const topKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of topKeys) {
    if (k === "providerRates") continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) fail(`top-level "${k}" changed`);
  }
  if (before.providerRates.length !== after.providerRates.length) {
    fail(`providerRates length ${before.providerRates.length} -> ${after.providerRates.length}`);
  }
  for (let i = 0; i < before.providerRates.length; i++) {
    const a = before.providerRates[i];
    const b = after.providerRates[i];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      if (!MUTABLE_ROW_FIELDS.has(k)) fail(`row ${i} (${rowLabel(a)}): immutable field "${k}" changed`);
    }
  }
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "corridor-rate-refresh",
  };
}

async function ghGetFile(fetchImpl, cfg, token) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.dataPath}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetchImpl(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`GitHub GET contents failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.encoding !== "base64") {
    // The Contents API only inlines files up to 1 MB. Fail clearly rather
    // than parse garbage; switch to the git blobs API if the file grows.
    throw new Error(`GitHub returned encoding "${body.encoding}" for ${cfg.dataPath}; file too large for the Contents API?`);
  }
  return { sha: body.sha, text: Buffer.from(body.content, "base64").toString("utf8") };
}

async function ghPutFile(fetchImpl, cfg, token, { text, sha, message }) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.dataPath}`;
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, "utf8").toString("base64"),
      sha,
      branch: cfg.branch,
      committer: COMMITTER,
      author: COMMITTER,
    }),
  });
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new Error(`GitHub PUT contents failed: HTTP ${res.status}`);
  const body = await res.json();
  return { conflict: false, sha: body.commit?.sha, url: body.commit?.html_url };
}

async function defaultGetToken(secretId) {
  // Lazy import: the AWS SDK v3 ships in the Lambda Node runtime but not on
  // a dev machine, and tests inject their own getToken.
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const out = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretId }));
  const token = (out.SecretString ?? "").trim();
  if (!token) throw new Error("GitHub token secret is empty");
  return token;
}

function buildCommitMessage({ applied, blocked, mode }) {
  const lines = [`Auto-refresh Wise/PayPal/Western Union rates (${applied.length} rows)`, ""];
  lines.push(
    "Refreshed from the Wise Comparison API by the corridor-rate-refresh Lambda",
    "(aws/refresh-lambda). Same refresh/guard logic as scripts/refresh-wise-rows.mjs."
  );
  if (blocked.length) {
    lines.push("", `${blocked.length} row(s) blocked by the guard and NOT applied:`);
    for (const b of blocked) lines.push(`- ${b.label}: ${b.reason} (${b.detail})`);
  }
  if (mode !== "commit") lines.push("", `(mode: ${mode})`);
  return lines.join("\n");
}

export async function run(event, context, deps) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const computeRefreshImpl = deps.computeRefresh ?? computeRefresh;
  const today = deps.today ?? new Date().toISOString().slice(0, 10);

  if (event && typeof event === "object" && "force" in event) {
    throw new Error("`force` is not supported in the Lambda. Forced writes are a human decision: use scripts/refresh-wise-rows.mjs --write --force locally.");
  }

  const cfg = readConfig(env);
  const dryRunRequested = event?.dryRun === true;
  const willCommit = !dryRunRequested && cfg.commitsEnabled;
  const mode = willCommit ? "commit" : "dry-run";
  log("INFO", "start", {
    mode,
    dryRunRequested,
    commitsEnabled: cfg.commitsEnabled,
    repo: cfg.repo,
    branch: cfg.branch,
    requestId: context?.awsRequestId,
  });
  if (!dryRunRequested && !cfg.commitsEnabled) {
    log("WARN", "commits_disabled", { note: "COMMITS_ENABLED is not \"true\"; running as a dry run. Set the EnableCommits stack parameter once a dry run has been reviewed." });
  }

  // Fail before any Wise traffic if we couldn't commit anyway.
  const token = await (deps.getToken ?? defaultGetToken)(cfg.secretId);

  const wiseFetch = (url) =>
    fetchImpl(url, {
      headers: {
        "User-Agent": "corridor-rate-refresh/1.0 (+https://github.com/aryavariaa/Corridor)",
        "X-External-Correlation-Id": context?.awsRequestId ?? "",
      },
    });

  const summary = { mode, committed: false, commitSha: null, applied: 0, blocked: 0, fetchErrors: 0, noChanges: false };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const file = await ghGetFile(fetchImpl, cfg, token);
    const data = JSON.parse(file.text);
    const before = structuredClone(data);

    // NOTE: `force` is intentionally never passed -- the shared peer guard
    // always applies here.
    const result = await computeRefreshImpl(data, { today, fetchImpl: wiseFetch });
    const { safe, blocked } = partitionChanges(result.changes);

    const blockedForLog = [
      ...result.skippedOutlier.map((s) => ({
        label: `${s.corridor.replace("|", "->")} ${s.provider} ${s.tier}`,
        reason: "peer_outlier",
        detail: `implied ${s.newImplied} beats best peer ${s.bestPeer} by more than 8%`,
      })),
      ...blocked.map((b) => ({ label: rowLabel(b.change.row), reason: b.reason, detail: b.detail })),
    ];
    for (const b of blockedForLog) log("WARN", "update_blocked", b);
    for (const e of result.errors) log("ERROR", "fetch_failed", e);
    log("INFO", "refresh_computed", {
      attempt,
      corridorsChecked: result.corridorsChecked,
      proposed: result.changes.length,
      safe: safe.length,
      blocked: blockedForLog.length,
      fetchErrors: result.errors.length,
      providerNotInApiResponse: result.skippedNotFound.length, // e.g. PayPal is often absent; expected
    });

    summary.applied = safe.length;
    summary.blocked = blockedForLog.length;
    summary.fetchErrors = result.errors.length;

    if (result.errors.length > 0 && result.changes.length === 0) {
      throw new Error(`Every Wise fetch failed (${result.errors.length}); nothing to apply. First error: ${result.errors[0].error}`);
    }

    applyChanges(safe);
    verifyIntegrity(before, data);
    const newText = serializeData(data);

    if (newText === file.text) {
      summary.noChanges = true;
      log("INFO", "no_changes");
    } else if (!willCommit) {
      log("INFO", "dry_run_complete", {
        wouldCommitRows: safe.length,
        sample: safe.slice(0, 5).map((c) => `${rowLabel(c.row)}: ${c.before.amountReceived} -> ${c.after.amountReceived}`),
      });
    } else {
      const put = await ghPutFile(fetchImpl, cfg, token, {
        text: newText,
        sha: file.sha,
        message: buildCommitMessage({ applied: safe, blocked: blockedForLog, mode }),
      });
      if (put.conflict) {
        log("WARN", "commit_conflict", { attempt, note: "data file changed on GitHub during the run; re-reading" });
        if (attempt < 2) continue;
        throw new Error("Commit conflicted twice; giving up (data file is being changed concurrently).");
      }
      summary.committed = true;
      summary.commitSha = put.sha;
      log("INFO", "committed", { commitSha: put.sha, commitUrl: put.url, rowsApplied: safe.length });
    }

    // Partial failure: whatever succeeded has been handled above, but make
    // the invocation *fail* so the Errors alarm fires -- some corridors were
    // not refreshed and someone should know.
    if (result.errors.length > 0) {
      throw new Error(`${result.errors.length} corridor/tier fetch(es) failed; the rest were processed. First: ${result.errors[0].corridor} ${result.errors[0].tier}: ${result.errors[0].error}`);
    }
    break;
  }

  log("INFO", "done", summary);
  return summary;
}

export const handler = (event, context) => run(event, context, {});
