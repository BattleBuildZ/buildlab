"use client";

import { useState } from "react";
import { recordMovement } from "@/app/(app)/electronics/actions";
import { MOVEMENT_LABEL, isLow } from "@/lib/electronics";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

type Move = { id: string; created_at: string; movement_type: string; quantity_delta: number; quantity_after: number | null; reason: string | null };
type Mode = "addition" | "consumption" | "adjustment";
const TITLE: Record<Mode, string> = { addition: "Add stock", consumption: "Use stock", adjustment: "Correct the count" };

function MoveForm({ componentId, mode, current, onDone }: { componentId: string; mode: Mode; current: number; onDone: (after: number) => void }) {
  const { pending, error, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = mode === "adjustment" ? { type: mode, counted: f.get("n"), reason: f.get("reason") ?? "" } : { type: mode, quantity: f.get("n"), reason: f.get("reason") ?? "" };
    run(() => recordMovement(componentId, input), (d) => d && onDone(d.quantityAfter));
  }
  return (
    <form onSubmit={submit} className="stack">
      <p className="hint">Currently {current} on hand.</p>
      <div className="field">
        <label htmlFor="mv-n">{mode === "addition" ? "How many to add" : mode === "consumption" ? "How many were used" : "Quantity you counted"}</label>
        <input id="mv-n" name="n" className="input" type="number" min={mode === "adjustment" ? 0 : 1} max={mode === "consumption" ? current : 1000000} step={1} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="mv-r">{mode === "adjustment" ? "Why did the count change?" : "Note (optional)"}</label>
        <input id="mv-r" name="reason" className="input" maxLength={300} required={mode === "adjustment"} placeholder={mode === "addition" ? "e.g. Ordered from supplier" : mode === "consumption" ? "e.g. Used in desk lamp" : "e.g. Found 2 more in the drawer"} />
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={() => onDone(-1)}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Record"}</button>
      </div>
    </form>
  );
}

export default function StockPanel({ componentId, quantity, threshold, archived, moves }: { componentId: string; quantity: number; threshold: number | null; archived: boolean; moves: Move[] }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const low = isLow({ quantity_on_hand: quantity, min_stock_threshold: threshold });
  return (
    <section id="stock" className="card section" aria-labelledby="h-stock">
      <div className="section-head">
        <div>
          <h2 id="h-stock">Stock</h2>
          <p className="hint">The count changes only when you record a movement, and every movement is kept.</p>
        </div>
        {!archived && (
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => setMode("addition")}>Add stock</button>
            <button type="button" className="btn" onClick={() => setMode("consumption")} disabled={quantity === 0}>Use stock</button>
            <button type="button" className="btn" onClick={() => setMode("adjustment")}>Correct count</button>
          </div>
        )}
      </div>
      <div className="row">
        <span className="qty" style={{ fontSize: 36 }} data-low={low && quantity > 0} data-out={quantity === 0}>{quantity}</span>
        <span className="hint">on hand{threshold !== null ? ` · low-stock level ${threshold}` : ""}</span>
        {quantity === 0 ? <span className="unverified" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Out of stock</span> : low ? <span className="unverified">Low stock</span> : null}
      </div>
      {confirmed !== null && <p className="toast-ok" role="status">Saved. {confirmed} on hand now.</p>}
      <h3>History</h3>
      {moves.length === 0 ? (
        <p className="empty-inline">No stock movements yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="inv-table">
            <thead><tr><th>Date</th><th>What</th><th>Change</th><th>After</th><th>Note</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td data-label="Date">{new Date(m.created_at).toLocaleString()}</td>
                  <td data-label="What">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                  <td data-label="Change"><span className="qty" style={{ fontSize: 14 }}>{m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}</span></td>
                  <td data-label="After">{m.quantity_after ?? "—"}</td>
                  <td data-label="Note">{m.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode ? TITLE[mode] : "Stock"}>
        {mode && <MoveForm componentId={componentId} mode={mode} current={quantity} onDone={(after) => { if (after >= 0) setConfirmed(after); setMode(null); }} />}
      </Modal>
    </section>
  );
}
