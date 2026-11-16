"use client";

import { useSyncExternalStore } from "react";

function format(iso: string, timeZone: string | undefined, long: boolean): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone,
    ...(long ? { timeZoneName: "short" as const } : {}),
  }).format(new Date(iso));
}

const subscribe = () => () => {};

/** Kick-off in the viewer's own time zone; Swedish time in the server-rendered HTML. */
export function Kickoff({ iso, long = false }: { iso: string | null; long?: boolean }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!iso) return <span>TBD</span>;
  return (
    <time dateTime={iso}>
      {isClient ? format(iso, undefined, long) : format(iso, "Europe/Stockholm", false)}
    </time>
  );
}
