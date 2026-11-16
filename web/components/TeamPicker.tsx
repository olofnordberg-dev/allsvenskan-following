"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export const FAVORITE_KEY = "favorite-team";

export function readFavorite(fallback: string): string {
  try {
    return window.localStorage.getItem(FAVORITE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Header select. Choosing a team opens it and remembers it as "my team" on this device. */
export function TeamPicker({ teams, fallback }: { teams: { slug: string; name: string }[]; fallback: string }) {
  const router = useRouter();
  const params = useParams<{ team?: string }>();
  const current = teams.some((t) => t.slug === params.team) ? params.team : undefined;

  // Warm the favourite's page so the redirect from "/" is instant.
  useEffect(() => {
    router.prefetch(`/${readFavorite(fallback)}`);
  }, [router, fallback]);

  return (
    <label className="team-picker">
      <span>My team</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          const team = e.target.value;
          if (!team) return;
          try {
            window.localStorage.setItem(FAVORITE_KEY, team);
          } catch {
            // private mode: the choice still applies for this visit
          }
          router.push(`/${team}`);
        }}
      >
        {!current && <option value="">Choose…</option>}
        {teams.map((t) => (
          <option key={t.slug} value={t.slug}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}
