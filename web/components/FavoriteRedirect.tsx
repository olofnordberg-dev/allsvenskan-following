"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FAVORITE_KEY, readFavorite } from "./TeamPicker";

/** Sends the visitor to their saved team (the default team until they pick another). */
export function FavoriteRedirect({ fallback, known }: { fallback: string; known: string[] }) {
  const router = useRouter();
  useEffect(() => {
    let team = readFavorite(fallback);
    if (!known.includes(team)) {
      // e.g. the saved team was relegated: forget it
      try { window.localStorage.removeItem(FAVORITE_KEY); } catch { /* ignore */ }
      team = fallback;
    }
    router.replace(`/${team}`);
  }, [router, fallback, known]);
  return null;
}
