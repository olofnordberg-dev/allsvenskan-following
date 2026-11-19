import type { Format } from "./data";

export function formatValue(value: number | null | undefined, format: Format, digits?: number): string {
  if (value === null || value === undefined) return "–";
  switch (format) {
    case "pct":
      return `${(value * 100).toFixed(digits ?? (Math.abs(value) < 0.1 ? 1 : 0))}%`.replace("-", "−");
    case "int":
      return Math.round(value).toString();
    default:
      return value.toFixed(digits ?? (Math.abs(value) >= 10 ? 1 : 2)).replace("-", "−");
  }
}

export function signed(value: number | null | undefined, format: Format = "num", digits?: number): string {
  if (value === null || value === undefined) return "–";
  if (format === "pct") return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(digits ?? 0)} pts`;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits ?? 2)}`;
}

export function ordinal(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export const pct = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? "–" : `${(v * 100).toFixed(digits)}%`;

export const POSITION: Record<string, string> = { G: "Goalkeeper", D: "Defender", M: "Midfielder", F: "Forward" };

/** A date without the time, fixed to Swedish time so server and client agree. */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(new Date(iso));
}

/** Lower-case a label without breaking "xG". */
export const lower = (s: string): string => s.toLowerCase().replace(/\bxg\b/g, "xG");

/** "suspended (yellow cards)", "injured, knee injury": the feed's status and reason, readable. */
export function reasonText(status: string | null, reason: string | null): string {
  const r = (reason ?? "").toLowerCase().replace(/_/g, " ");
  if (!r || r === "unknown") return status ?? "unavailable";
  if (r.includes("yellow card accumulation")) return "suspended, yellow cards";
  if (r.includes("suspension")) return `suspended, ${r.replace(" suspension", "")}`;
  return `${status ?? "out"}, ${r}`;
}

export const TIER: Record<string, string> = { key: "Key player", regular: "Regular starter", rotation: "Rotation", fringe: "Fringe" };
