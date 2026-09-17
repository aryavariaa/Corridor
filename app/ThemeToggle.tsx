"use client";

import { useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "corridor-theme";

// useSyncExternalStore, not useState+useEffect: [data-theme] on <html> is
// genuinely external state (set by the beforeInteractive script in
// app/layout.tsx before this component ever mounts, and mutated by
// setTheme below). useSyncExternalStore is the API React designed for
// exactly this -- reading real DOM state safely -- and its
// getServerSnapshot handles the server/no-DOM case without the
// setState-in-effect anti-pattern a manual "default, then correct in an
// effect" approach would need (and that this codebase's eslint config
// flags -- react-hooks/set-state-in-effect).
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ThemeMode {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// Matches the init script's own fallback branch -- server-rendered HTML
// has no localStorage/matchMedia access, so it can't know the real theme
// ahead of time either.
function getServerSnapshot(): ThemeMode {
  return "dark";
}

function setTheme(next: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing / storage disabled -- the choice just won't
    // persist across reloads, not worth failing the toggle over.
  }
  listeners.forEach((listener) => listener());
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-full border border-card-border p-0.5"
    >
      {(["light", "dark"] as ThemeMode[]).map((mode) => {
        const active = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(mode)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
              active
                ? "bg-accent text-accent-contrast"
                : "text-text-dim hover:text-text"
            }`}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}
