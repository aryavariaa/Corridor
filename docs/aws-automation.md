# Automated rate refresh (AWS Lambda)

`scripts/refresh-wise-rows.mjs` used to be a manual, dry-run-by-default script. The same logic now also runs on a schedule as an AWS Lambda that commits safe changes to GitHub; Vercel's existing Git integration deploys them like any other data commit.

Scope is unchanged: **Wise, PayPal and Western Union rows only**, on corridors where the row already exists. Every other provider stays manual (see `docs/provider-data-sourcing.md`, "Automated refresh").

## How data reaches the live site

- `data/provider-data.json` is a static file imported at build time by `lib/corridors.ts`. There is no runtime database.
- Vercel project `corridor` is connected to GitHub `aryavariaa/Corridor`; a commit to `main` triggers a production deploy.
- So the Lambda has to write to the repo, not to a store. It does this with the GitHub Contents API (no `git` binary in Lambda), then Vercel redeploys.

```
EventBridge (daily) -> Lambda corridor-rate-refresh
                          |-- GET  api.wise.com/v3/comparisons  (unauthenticated)
                          |-- GET  GitHub contents (current data file + sha)
                          |-- guards + integrity check
                          |-- PUT  GitHub contents (only if safe changes exist)
                          `-- JSON logs -> CloudWatch -> metric filter -> alarms -> SNS email
GitHub commit on main -> Vercel production deploy -> live site
```

## The guard, precisely

There are two layers. Read this before trusting either.

1. **Shared peer-outlier guard** (`scripts/lib/refresh-core.mjs`, used by both the CLI and the Lambda, byte-identical copy at build time). A fetched value is blocked when its implied rate (`amountReceived / sendAmount`) beats the **best other provider in the same corridor+tier by more than 8%**. This is what "the 8% guard" has always meant in this repo. Note what it is *not*: it does not compare a row to its own previous value, and it is one-sided: a fetched value that is far *worse* than expected passes it.
2. **Lambda-only change-from-current check** (`aws/refresh-lambda/handler.mjs`, `MAX_CHANGE_FROM_CURRENT = 0.08`). Added because unattended runs have no human to notice the gap in (1): a row whose implied rate moves more than 8% from its current value, or whose fetched amount is not a positive finite number, is blocked. It only ever *adds* blocking; it never lets through anything (1) blocked. In the first real dry run the largest legitimate move was about 1.6%, so it should not fire in normal operation. It is easy to remove if you disagree (delete the `partitionChanges` call).

Also enforced in the Lambda:

- **No `force`.** An event containing `force` is rejected. Forced writes stay a local, human decision (`node scripts/refresh-wise-rows.mjs --write --force`).
- **Integrity post-condition.** Before committing, the parsed result is compared with the file as read: only `sendAmount`, `amountReceived`, `dateChecked` and `source` of existing rows may differ; no row added, removed or reordered; nothing else in the file touched. Otherwise the run fails and commits nothing.
- **Optimistic concurrency.** The PUT carries the file's blob `sha`; if someone pushed in the meantime GitHub answers 409, the Lambda re-reads and recomputes once, then fails rather than overwrite.

Blocked rows are never applied. They are logged as `update_blocked` (WARN) with row, reason (`peer_outlier`, `exceeds_change_from_current`, `invalid_value`) and detail, listed in the commit message when other rows were applied, and raise the `corridor-rate-refresh-blocked-update` alarm.

## Components (`aws/template.yaml`, deployed with SAM)

| Piece | Config |
| --- | --- |
| Lambda `corridor-rate-refresh` | Node 22, arm64, 256 MB, 180 s timeout, no retries (a failure alarms; the next run is the retry). Code = `aws/refresh-lambda/handler.mjs` + `scripts/lib/refresh-core.mjs`, assembled by `aws/build.sh`. No npm dependencies (AWS SDK v3 is in the runtime). |
| EventBridge rule | `cron(17 6 * * ? *)` daily, 06:17 UTC. Wise's comparison data refreshes hourly and the endpoint has no published rate limit (only a documented 429), so once a day (about 20 requests) is far below any plausible limit. |
| Secrets Manager | `corridor/github-token`: fine-grained GitHub PAT, **Contents: read and write on `aryavariaa/Corridor` only**. Created out-of-band; the template only references its name. The Lambda reads it at runtime. |
| Wise credentials | **None exist.** The Comparison API is unauthenticated, so there is nothing to store. |
| IAM (execution role) | `secretsmanager:GetSecretValue` on `secret:corridor/github-token-*` only, plus SAM's default CloudWatch Logs write. Nothing else. |
| Logs | `/aws/lambda/corridor-rate-refresh`, 90-day retention, one-line JSON events. |
| Alarms -> SNS email | `blocked-update` (metric filter on `update_blocked`), `errors` (Lambda Errors), `not-running` (no invocation in ~25 h). |
| `EnableCommits` parameter | Defaults to `false`: scheduled runs are **dry runs** until you flip it. |

Invocation events: `{}` runs in the configured mode; `{"dryRun": true}` never commits even when commits are enabled.

## One-time setup (needs your AWS account)

Prerequisites: AWS CLI v2 and [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed, and credentials configured (`aws configure sso` or `aws configure`). Check with `aws sts get-caller-identity`. Costs are pennies per month (one short daily invocation, one secret at about $0.40/month, a few alarms at about $0.10 each).

1. Create the GitHub token: GitHub -> Settings -> Developer settings -> Fine-grained tokens. Repository access: only `aryavariaa/Corridor`. Permissions: Contents = Read and write, nothing else. Set an expiry and note the date.
2. Store it (paste when prompted; do not put it in shell history or the repo):
   ```bash
   read -rs GH_TOKEN && aws secretsmanager create-secret --name corridor/github-token --secret-string "$GH_TOKEN" && unset GH_TOKEN
   ```
3. Build and deploy (dry-run mode):
   ```bash
   npm run aws:test
   sam deploy --template-file aws/template.yaml --stack-name corridor-rate-refresh --resolve-s3 --capabilities CAPABILITY_IAM --parameter-overrides AlertEmail=you@example.com
   ```
   Use `sam build --template-file aws/template.yaml` first if `sam deploy` does not pick up `aws/.build`; `npm run aws:build` produces that directory. Confirm the SNS subscription email, or no alarm will reach you.
4. Dry-run in AWS against the real corridors:
   ```bash
   aws lambda invoke --function-name corridor-rate-refresh --cli-binary-format raw-in-base64-out --payload '{"dryRun":true}' out.json && cat out.json
   aws logs tail /aws/lambda/corridor-rate-refresh --since 10m
   ```
   Expect `mode: dry-run`, `dry_run_complete`, and `blocked: 0`. If Wise answers 403/429 from Lambda IPs (Cloudflare fronts `api.wise.com` and can treat datacenter IPs differently from a laptop), the `fetch_failed` lines will say so.
5. Enable commits: redeploy with `EnableCommits=true` (add it to `--parameter-overrides`).
6. Verify end to end: invoke once with `{}`. Check that the commit by `corridor-rate-refresh` lands on `main`, that Vercel starts a production deploy for it, and that the live site shows the new figure and `dateChecked`.

To stop automation: `aws events disable-rule` on the schedule, set `EnableCommits=false`, or `sam delete`.

## Operating notes

- **Local proof.** `npm run aws:test` (18 tests: guard boundaries, dry-run, no-force, 409 retry, integrity check, secret handling, partial failures) plus a replay of recorded real Wise responses against the production data file, which produced a file byte-identical to the CLI's.
- **First automated commit** will also rewrite about 14 unchanged rows from `21842.0` to `21842` (JSON float normalization by `JSON.stringify`). Values are equal; only text differs.
- **Branch protection.** If `main` requires pull requests or reviews, the PAT cannot push and the Lambda will fail with a 403/422 (alarm fires). Either exempt the token or leave protection off for this branch.
- **Local clones** must `git pull --rebase` before their next push, since the bot now commits to `main`.
- **Token expiry** will surface as an `errors` alarm (GitHub 401). Rotate with `aws secretsmanager put-secret-value`.
- **Overlap.** Concurrency is not reserved (a fresh AWS account's limit makes that fail); the sha-based PUT is what prevents two runs clobbering each other.
