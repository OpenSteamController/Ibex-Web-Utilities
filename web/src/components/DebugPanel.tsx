import { useState, useEffect, useRef } from "react";
import {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  onDebug,
  getDebugLog,
  clearDebugLog,
  watchInputReports,
} from "@lib/index.js";
import type { DebugEntry } from "@lib/index.js";
import { ChevronUpIcon, CopyIcon, CheckIcon } from "./Icons";
import styles from "./DebugPanel.module.sass";

function formatData(data: unknown): string {
  if (data === undefined) return "";
  try {
    if (data instanceof Error) return `${data.name}: ${data.message}`;
    if (typeof data === "object") return JSON.stringify(data, null, 2);
    return String(data);
  } catch {
    return String(data);
  }
}

const STORAGE_KEY = "fwu-debug";

function loadPersistedDebug(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

if (loadPersistedDebug()) {
  enableDebug();
}

export function DebugPanel() {
  const [active, setActive] = useState(isDebugEnabled);
  const [entries, setEntries] = useState<DebugEntry[]>([...getDebugLog()]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    enableDebug();
    setEntries([...getDebugLog()]);
    const unsub = onDebug(() => {
      setEntries([...getDebugLog()]);
    });
    return () => {
      unsub();
    };
  }, [active]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const toggle = () => {
    if (active) {
      disableDebug();
      localStorage.removeItem(STORAGE_KEY);
      setActive(false);
    } else {
      enableDebug();
      localStorage.setItem(STORAGE_KEY, "1");
      setActive(true);
    }
  };

  const handleClear = () => {
    clearDebugLog();
    setEntries([]);
  };

  const [watching, setWatching] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const toggleWatch = async () => {
    if (watching) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      setWatching(false);
    } else {
      const stop = await watchInputReports();
      stopWatchRef.current = stop;
      setWatching(true);
    }
  };

  useEffect(() => {
    return () => { stopWatchRef.current?.(); };
  }, []);

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = entries
      .map((e) => {
        const dataStr = e.data !== undefined ? `\n  ${formatData(e.data)}` : "";
        return `${(e.timestamp / 1000).toFixed(3)}s ${e.message}${dataStr}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <button
          onClick={toggle}
          className={`${styles.toggleButton} ${active ? styles.active : styles.inactive}`}
        >
          <ChevronUpIcon className={`${styles.chevron} ${active ? styles.open : ""}`} />
          Debug Console
        </button>
        {active && (
          <button onClick={handleClear} className={styles.actionButton}>
            Clear
          </button>
        )}
        {active && (
          <button
            onClick={toggleWatch}
            className={`${styles.actionButton} ${watching ? styles.watching : ""}`}
          >
            {watching ? "Watching Reports" : "Watch Reports"}
          </button>
        )}
        {active && entries.length > 0 && (
          <button onClick={handleCopy} className={`${styles.actionButton} flex items-center gap-1.5`}>
            {copied ? (
              <>
                <CheckIcon className="w-3 h-3" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        )}
        {active && (
          <span className="text-xs text-gray-600">{entries.length} entries</span>
        )}
      </div>
      <div className={`${styles.drawer} ${active ? styles.open : styles.closed}`}>
        <div className={styles.logContainer}>
          {entries.length === 0 ? (
            <p className="text-gray-600">
              Debug logging active. Connect a device to see output.
            </p>
          ) : (
            entries.map((entry, i) => {
              const isError = entry.data instanceof Error;
              return (
                <div key={i} className={`${styles.logEntry} ${isError ? styles.error : ""}`}>
                  <span className={styles.timestamp}>
                    {(entry.timestamp / 1000).toFixed(3)}s
                  </span>
                  <span className={styles.message}>{entry.message}</span>
                  {entry.data !== undefined && (
                    <pre className={styles.data}>
                      {formatData(entry.data)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
