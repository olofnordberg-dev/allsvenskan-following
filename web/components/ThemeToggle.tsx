"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const ORDER: Theme[] = ["system", "dark", "light"];
const LABEL: Record<Theme, string> = { system: "Auto", dark: "Dark", light: "Light" };
const ICON: Record<Theme, string> = { system: "◐", dark: "☾", light: "☀" };

/** Runs before first paint (see layout) so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();
function read(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

/** Cycles Auto → Dark → Light. Auto follows the device setting. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system" as Theme,
  );
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        if (next === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try {
          if (next === "system") localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, next);
        } catch {
          // storage blocked: the choice still applies to this page view
        }
        listeners.forEach((l) => l());
      }}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <span aria-hidden>{ICON[theme]}</span>
      <span className="theme-label">{LABEL[theme]}</span>
    </button>
  );
}
