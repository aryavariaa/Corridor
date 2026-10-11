"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { AMOUNT_MAX, AMOUNT_MIN, amountQuery, parseAmount } from "@/lib/amount";
import { money } from "@/lib/format";

// "Sending $200 . Change amount": the amount in play, with the control to
// change it right where it is shown. Opening it reveals a small field in
// place; submitting re-prices THIS page for the new amount by setting
// "?amount=" on the current URL (the corridor page and the head-to-head page
// both read it), so the visitor never has to go back to the homepage and
// re-pick the corridor. The homepage form stays the main entry point; this is
// only the shortcut once you are looking at results.
//
// `hasCustom` is whether the URL already carries an amount: it picks the link
// wording ("Set your own amount" vs "Change amount") and whether "Typical
// amount" (drop the parameter) is offered.
export default function AmountEditor({
  currency,
  amount,
  hasCustom,
  lead,
  className = "",
}: {
  currency: string;
  amount: number;
  hasCustom: boolean;
  lead: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = useId();
  const errorId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    // Hand focus back to the control that opened the editor.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseAmount(text, currency);
    if (!parsed.ok) {
      setError(parsed.empty ? "Enter an amount." : parsed.message);
      return;
    }
    router.push(`${pathname}${amountQuery(parsed.value)}`, { scroll: false });
    close();
  }

  const label = hasCustom ? "Change amount" : "Set your own amount";

  return (
    <div className={className}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          {lead} <strong className="font-bold text-text">{money(currency, amount, 0)}</strong>
        </span>
        <span aria-hidden="true">&middot;</span>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={`${fieldId}-form`}
          onClick={() => {
            setText(hasCustom ? String(amount) : "");
            setError(null);
            setOpen((v) => !v);
          }}
          className="font-semibold text-link underline underline-offset-4"
        >
          {label}
        </button>
      </p>

      {open && (
        <form
          id={`${fieldId}-form`}
          onSubmit={submit}
          noValidate
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="mt-3 flex flex-wrap items-start gap-2"
        >
          <div>
            <label htmlFor={fieldId} className="sr-only">
              Amount to send in {currency}
            </label>
            <div className="flex items-center rounded-xl border border-card-border bg-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
              <span aria-hidden="true" className="pl-3.5 text-sm font-semibold text-text-dim">
                {currency}
              </span>
              <input
                id={fieldId}
                autoFocus
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder={`${AMOUNT_MIN.toLocaleString("en-US")} to ${AMOUNT_MAX.toLocaleString("en-US")}`}
                className="field-in-wrapper w-40 bg-transparent px-2.5 py-2.5 text-base text-text outline-none"
              />
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-1.5 max-w-xs text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary px-5 py-2.5">
            Update
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-full px-3 py-2.5 text-sm font-semibold text-text-dim hover:text-text"
          >
            Cancel
          </button>
          {hasCustom && (
            <Link
              href={pathname}
              scroll={false}
              onClick={() => setOpen(false)}
              className="px-1 py-2.5 text-sm font-semibold text-link underline underline-offset-4"
            >
              Back to a typical amount
            </Link>
          )}
        </form>
      )}
    </div>
  );
}
