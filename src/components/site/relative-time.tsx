"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";

function format(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "just now";
  return `${formatDistanceToNowStrict(d)} ago`;
}

/** Auto-updating relative time label. Re-formats every 30s via a tick. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className}>
      {format(iso)}
    </time>
  );
}
