# Amplitude tracking plan

Extends the funnel tracking added earlier (`lib/analytics.ts`, README's
Analytics section). This revision changes where two events fire from,
adds identity resolution, and proposes one new event. Nothing here is
implemented yet — this is the plan for review.

## Identity model (new)

Two identifiers, used in sequence:

- **`device_id`** — Amplitude browser SDK's per-browser anonymous ID.
  Already implicitly in use for every client-side event today.
- **`user_id`** — `SHA-256(trim(email).toLowerCase())`, set only once a
  signup is confirmed by Buttondown. The raw email is never sent to
  Amplitude in any field, ever — hashing happens server-side, before
  the network call to Amplitude.

To keep `Corridor Viewed → Signup Started → Signup Completed` as one
continuous funnel even though the last event now fires from the server
(see below), the client sends its own `device_id` (via
`amplitude.getDeviceId()`) as an extra field on the `POST /api/subscribe`
request body. The server includes that same `device_id` on the event it
sends to Amplitude, so it stitches onto the same anonymous timeline
instead of starting a disconnected one. Once `user_id` is set, Amplitude
merges that device's prior anonymous history onto the identified user —
this is what makes "look at a subscriber's later visits" possible.

## Events

| Event | Trigger | Fired from | Properties | Why it matters |
|---|---|---|---|---|
| `Corridor Viewed` | Comparison results load for a corridor | Client (unchanged) | `corridor_id`, `send_country`, `receive_country`, `send_currency`, `receive_currency`, `tier` | Top-of-funnel: what people are actually comparing. |
| `Rate Alert Signup Started` | First focus of the email field, per corridor view | Client (unchanged) | `corridor_id` | Mid-funnel intent, before commitment. |
| `Rate Alert Signup Completed` | **Changed.** Buttondown confirms the subscription (2xx) | **Server** — `app/api/subscribe/route.ts`, after `subscribeToCorridorAlerts` returns `ok: true` | `corridor_id` | True conversion. Firing only after Buttondown confirms means nothing that gets past the honeypot/rate-limit already in place can inflate this number — there's no client-optimistic path left to skew it. |
| `Rate Alert Signup Failed` | **Changed.** Validation error, rate-limit (429), or a Buttondown API failure | **Server** — same route, each failure branch | `corridor_id`, `reason`, `status_code` | Real failure signal (bad email, rate-limited, Buttondown down) instead of a client-side guess. Honeypot-caught bot submissions still never reach this code at all — the route returns its fake `{ok:true}` before any tracking logic runs, same as today, so bots can't generate fake failures either. |
| `Corridor Sorted` | Sort-by dropdown above the results table changes | Client | `corridor_id`, `sort_field` (`cost_asc` \| `cost_desc` \| `provider_az`) | Tests whether engaging with sort correlates with signup rate. |

## Identify — folded into the server-side Completed event

Rather than a separate client-side `identify()` call, the plan sets
`user_id` in the *same* server request that fires `Rate Alert Signup
Completed` — same call to Amplitude's HTTP API, one extra field. Reasoning:
identical logic to why the event itself moved server-side applies here —
if `identify()` fired optimistically from the client on form submit, a
bot or a failed submission could still register an identity in Amplitude
even though no real subscription happened. Anchoring it to the confirmed
-signup code path means a `user_id` only ever gets created for a real
Buttondown subscriber.

## Technical approach

- New `lib/analytics-server.ts`: calls Amplitude's HTTP API v2 directly
  (`POST https://api2.amplitude.com/2/httpapi`) via `fetch` — no new npm
  dependency, since this is one JSON POST.
- Reuses the existing `NEXT_PUBLIC_AMPLITUDE_API_KEY` value, read
  server-side via `process.env`. No new secret needed: Amplitude
  ingestion keys are meant to be public/embeddable (that's why the
  existing one is already shipped in the client bundle), so there's no
  security downside to the server reading the same value.
- `lib/analytics.ts`'s client-side `trackSignupCompleted` /
  `trackSignupFailed` functions are removed; `handleSubscribe` in
  `app/page.tsx` no longer calls them, and instead sends `deviceId:
  amplitude.getDeviceId()` as part of the existing POST body.
- Edge case: if Amplitude never initialized client-side (no
  `NEXT_PUBLIC_AMPLITUDE_API_KEY` configured, or in the unlikely case
  someone reaches the subscribe form without `Corridor Viewed` or
  `Signup Started` having run first) there's no `device_id` to send.
  The server call still fires — Amplitude just can't link it to prior
  anonymous activity in that edge case, which is a reasonable, called-out
  tradeoff rather than a silent gap.

## `Corridor Sorted` — resolved and implemented

Decision: a "Sort by" dropdown above the results table (not click-to-sort
headers — more familiar to a first-time visitor), with three options:

- Cost % (low to high) — `cost_asc`, the default, matches the server's
  existing cost ranking.
- Cost % (high to low) — `cost_desc`.
- Provider (A–Z) — `provider_az`.

Sorting is client-side only (`app/page.tsx`'s `sortedProviders`) — it
reorders the already-fetched `result.providers` array without a new
API call. Each provider's `Rank` column still shows its true cost rank
from the server regardless of display order, so re-sorting by provider
name doesn't relabel anyone's rank. `Corridor Sorted` fires from the
dropdown's `onChange`, so only a genuine user-initiated change counts
(not the initial render, and not the reset back to `cost_asc` that
happens on a new corridor/comparison). More sort options (amount
received, etc.) are a straightforward follow-up if the plan changes
after review.
