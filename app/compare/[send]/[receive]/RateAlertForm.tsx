"use client";

import { useState } from "react";
import type { Corridor } from "@/lib/corridors";
import { corridorId } from "@/lib/corridor-id";
import { getDeviceId, trackSignupStarted } from "@/lib/analytics";

// "Email me when this corridor moves." Behavior is unchanged from the old
// inline form: a hidden honeypot field bots fill in, a "Signup Started" event
// that fires once on the first real focus, and the server (not this component)
// reporting the Completed/Failed outcome so a bot or a client-only failure
// can't record a fake conversion (see app/api/subscribe/route.ts and
// docs/amplitude-tracking-plan.md). Only the styling changed.
export default function RateAlertForm({ corridor }: { corridor: Corridor }) {
  const id = corridorId(corridor);
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  // Guards "Rate Alert Signup Started" so it fires once per corridor view, on
  // the first genuine focus of the email field, not once per focus/blur cycle.
  const [startTracked, setStartTracked] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          sendCountry: corridor.sendCountry,
          receiveCountry: corridor.receiveCountry,
          company: honeypot,
          deviceId: getDeviceId(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <section className="mt-10 rounded-3xl bg-mint p-5 sm:p-7">
      <h2 className="font-heading text-xl font-extrabold tracking-[-0.03em] text-brand sm:text-2xl">
        Get rate alerts for {corridor.sendCurrency} → {corridor.receiveCurrency}
      </h2>
      <p className="mt-1 text-sm text-text-dim">
        We&rsquo;ll email you when the cheapest provider or the live rate moves.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        {/* Honeypot: hidden from real users, invisible to screen readers. Bots
            that fill every field trip it server-side. */}
        <input
          type="text"
          name="company"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <input
          id="subscribe-email"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => {
            // Real users only; the honeypot field is unreachable by tab/click
            // (tabIndex=-1, aria-hidden) so a genuine focus event here can't
            // come from the same bots that trip it.
            if (!startTracked) {
              trackSignupStarted({ corridorId: id });
              setStartTracked(true);
            }
          }}
          disabled={status === "submitting"}
          className="w-full flex-1 rounded-full border border-card-border bg-white px-5 py-3 text-base disabled:opacity-60"
        />
        <button type="submit" disabled={status === "submitting"} className="btn-primary px-7 disabled:cursor-not-allowed disabled:opacity-60">
          {status === "submitting" ? "Subscribing…" : "Notify me"}
        </button>
      </form>
      {status === "success" && (
        <p className="mt-3 text-sm font-medium text-link">You&rsquo;re subscribed. Check your inbox to confirm.</p>
      )}
      {status === "error" && error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
