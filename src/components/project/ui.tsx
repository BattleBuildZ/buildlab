"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/result";

// Runs a server action and keeps the pending/error state next to the control that started it.
// The page only changes after the server confirmed the write (the action revalidates the route).
export function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: (data?: T) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else onOk?.(res.data);
    });
  }
  return { pending, error, setError, run };
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <div className="error" role="alert">{error}</div> : null;
}

export function Meter({ done, total, label }: { done: number; total: number; label: string }) {
  const p = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-valuetext={`${done} of ${total} done`}
    >
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

// Delete with an inline "are you sure?" step so one stray tap cannot remove anything.
export function ConfirmDelete({
  label,
  what,
  onConfirm,
  pending,
}: {
  label: string;
  what: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={() => setAsking(true)} aria-label={`${label} ${what}`}>
        Delete
      </button>
    );
  return (
    <span className="row" role="group" aria-label={`Confirm: ${label} ${what}`}>
      <span className="hint">Delete {what}?</span>
      <button type="button" className="btn btn-danger-solid btn-sm" disabled={pending} onClick={() => { onConfirm(); setAsking(false); }}>
        Yes, delete
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}
