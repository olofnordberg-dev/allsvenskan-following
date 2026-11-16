"use client";

import { useState } from "react";

/** Team logo in a round badge; falls back to the abbreviation on the team colour if the image fails. */
export function TeamLogo({ team, src, color, size = 28 }: { team: string; src?: string; color?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="team-logo"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.32), ...(failed || !src ? { background: color ?? "var(--track)" } : {}) }}
      aria-hidden
    >
      {failed || !src ? (
        <span className="team-logo-text">{team}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} />
      )}
    </span>
  );
}
