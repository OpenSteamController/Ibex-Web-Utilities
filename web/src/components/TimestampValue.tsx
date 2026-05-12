import { useState, useRef, useEffect } from "react";

function formatTimestampHex(ts: number): string {
  if (ts === 0) return "Unknown";
  return ts.toString(16).toUpperCase();
}

function formatTimestampFull(ts: number): string {
  if (ts === 0) return "";
  return new Date(ts * 1000).toLocaleString();
}

export function TimestampValue({ ts }: { ts: number }) {
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const hex = formatTimestampHex(ts);
  const full = formatTimestampFull(ts);

  useEffect(() => {
    if (!pinned) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [pinned]);

  if (ts === 0) return <dd className="font-mono text-gray-500">Unknown</dd>;

  return (
    <dd
      ref={ref}
      className="font-mono cursor-pointer relative group"
      onClick={() => setPinned(!pinned)}
      onMouseLeave={() => setPinned(false)}
    >
      {hex}
      <span
        className={`pointer-events-none absolute right-0 bottom-full mb-1 bg-surface-overlay border border-border-subtle text-gray-200 text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap ${
          pinned ? "block" : "hidden group-hover:block"
        }`}
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        {full}
      </span>
    </dd>
  );
}
