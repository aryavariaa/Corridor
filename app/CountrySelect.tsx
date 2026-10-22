"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CountryFlag } from "@/lib/flags";

// An accessible "select-only combobox" (WAI-ARIA APG pattern) for the From / To
// country fields, replacing the native <select> so each option can show its
// circle flag.
//
//   - The trigger is a <button role="combobox"> that keeps DOM focus the whole
//     time; the highlighted option is announced through aria-activedescendant.
//   - Keys (trigger): Enter / Space / ArrowDown / ArrowUp open it; Up / Down /
//     Home / End move; Enter or Space chooses; Escape closes (focus stays on the
//     trigger); Tab closes and moves on; typing letters jumps to the next country
//     starting with them (typeahead), and opens the list if it was closed.
//   - Click or tap an option chooses it; a pointer-down outside closes it.
//   - The visible <label> is tied to the trigger by id and htmlFor, and clicking
//     it focuses the trigger (it does not open the list).
//   - The first option is the empty choice ("Select"), so a selection can be
//     cleared, as with the native select it replaces.
//
// The list is absolutely positioned inside the field's box (z-50) and the
// hero doesn't clip overflow, so it layers above the artwork and the fields
// below. It inherits the form bar's .scope-light tokens, so it is a light surface
// in both themes. Everything it chooses between (and the rule that "To" only
// offers countries that pair with the chosen "From", and clears a stale choice)
// stays in HomeDirectory; this component only renders what it is given.

export type CountryOption = { code: string; name: string };

const TYPEAHEAD_RESET_MS = 700;

export default function CountrySelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  boxClassName,
  labelClassName,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  options: CountryOption[];
  placeholder?: string;
  boxClassName: string;
  labelClassName: string;
}) {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const all: CountryOption[] = [{ code: "", name: placeholder }, ...options];
  const selectedIndex = Math.max(0, all.findIndex((o) => o.code === value));
  const selected = all[selectedIndex];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typed = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null }>({ text: "", timer: null });

  function resetTypeahead() {
    if (typed.current.timer) clearTimeout(typed.current.timer);
    typed.current.text = "";
  }
  function show(at: number) {
    setActive(at);
    setOpen(true);
  }
  function choose(i: number) {
    const opt = all[i];
    if (opt && opt.code !== value) onChange(opt.code);
    resetTypeahead();
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Close on a pointer-down anywhere outside this field.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted option in view (and the selected one, on open).
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId depends only on baseId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  useEffect(() => () => {
    if (typed.current.timer) clearTimeout(typed.current.timer);
  }, []);

  // Typeahead: letters typed in quick succession form a prefix; a single repeated
  // letter cycles through the countries starting with it.
  function typeahead(char: string) {
    const t = typed.current;
    if (t.timer) clearTimeout(t.timer);
    t.text += char.toLowerCase();
    t.timer = setTimeout(() => {
      t.text = "";
    }, TYPEAHEAD_RESET_MS);
    const cycling = t.text.split("").every((c) => c === t.text[0]);
    const prefix = cycling ? t.text[0] : t.text;
    const from = open ? active : selectedIndex;
    const n = all.length;
    for (let step = cycling ? 1 : 0; step <= n; step++) {
      const i = (from + step) % n;
      if (all[i].code !== "" && all[i].name.toLowerCase().startsWith(prefix)) {
        show(i);
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const last = all.length - 1;
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        show(selectedIndex);
      } else if (e.key === "Home") {
        e.preventDefault();
        show(0);
      } else if (e.key === "End") {
        e.preventDefault();
        show(last);
      } else if (printable && e.key !== " ") {
        e.preventDefault();
        typeahead(e.key);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(last, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case "PageDown":
        e.preventDefault();
        setActive((a) => Math.min(last, a + 8));
        break;
      case "PageUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 8));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
        e.preventDefault();
        choose(active);
        break;
      case " ":
        e.preventDefault();
        if (typed.current.text) typeahead(" ");
        else choose(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        resetTypeahead();
        setOpen(false);
        break;
      case "Tab":
        // Close and let focus move on; the choice is not changed.
        resetTypeahead();
        setOpen(false);
        break;
      default:
        if (printable) {
          e.preventDefault();
          typeahead(e.key);
        }
    }
  }

  return (
    <div ref={rootRef} className={`${boxClassName} ${selected.code ? "country-has-flag" : ""}`}>
      {selected.code && (
        <CountryFlag code={selected.code} className="absolute left-3.5 top-1/2 h-8! w-8! -translate-y-1/2" />
      )}
      <label
        id={labelId}
        htmlFor={triggerId}
        className={`${labelClassName} ${selected.code ? "pl-11" : ""}`}
        // Clicking the label focuses the field; it does not open the list.
        onClick={(e) => {
          e.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        {label}
      </label>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : show(selectedIndex))}
        onKeyDown={onKeyDown}
        className={`mt-0.5 flex min-h-7 w-full items-center justify-between gap-2 text-left text-base font-semibold text-text outline-none ${
          selected.code ? "pl-11" : ""
        }`}
      >
        <span className="truncate">{selected.name}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-text-dim transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          // Keep DOM focus on the trigger while the pointer works the list.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 min-w-[15rem] overflow-y-auto overscroll-contain rounded-2xl border border-card-border bg-card p-1.5 shadow-[0_18px_40px_-12px_rgba(10,37,64,0.35)]"
        >
          {all.map((o, i) => (
            <li
              key={o.code || "none"}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIndex}
              onClick={() => choose(i)}
              onMouseMove={() => active !== i && setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-base text-text ${
                i === active ? "bg-mint" : ""
              } ${i === selectedIndex ? "font-semibold" : "font-medium"}`}
            >
              {o.code ? (
                <CountryFlag code={o.code} className="h-6! w-6!" />
              ) : (
                <span aria-hidden="true" className="inline-block h-6 w-6 shrink-0" />
              )}
              <span className={`flex-1 truncate ${o.code ? "" : "text-text-dim"}`}>{o.name}</span>
              {i === selectedIndex && (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-link" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 8.5 3.2 3.2L13 4.8" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
