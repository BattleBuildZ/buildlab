"use client";

import { useState } from "react";
import { addUnit, setUnitRetired } from "@/app/(app)/electronics/test-bench/actions";
import { TEST_STATUS_BADGE, TEST_STATUS_LABEL } from "@/lib/electronics";
import { ErrorLine, useRun } from "../project/ui";

export type UnitRow = { id: string; label: string; notes: string | null; test_status: string; last_tested_at: string | null; retired_at: string | null };

function UnitItem({ componentId, unit }: { componentId: string; unit: UnitRow }) {
  const { pending, error, run } = useRun();
  return (
    <li className="check-row">
      <div className="check-main" style={{ cursor: "default" }}>
        <span>
          <b>{unit.label}</b>{unit.retired_at && <span className="badge badge-warn" style={{ marginLeft: 8 }}>Retired</span>}
          <span className="hint" style={{ display: "block" }}>{unit.last_tested_at ? `Last tested ${new Date(unit.last_tested_at).toLocaleDateString()}` : "Never tested"}{unit.notes ? ` · ${unit.notes}` : ""}</span>
        </span>
      </div>
      <div className="row">
        <span className={`badge ${TEST_STATUS_BADGE[unit.test_status] ?? "badge-type"}`}>{TEST_STATUS_LABEL[unit.test_status] ?? unit.test_status}</span>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => setUnitRetired(componentId, unit.id, !unit.retired_at))}>{unit.retired_at ? "Bring back" : "Retire"}</button>
      </div>
      <ErrorLine error={error} />
    </li>
  );
}

// Units exist only so each physical part can keep its own test history. They do not change the stock count.
export default function UnitsPanel({ componentId, units, archived }: { componentId: string; units: UnitRow[]; archived: boolean }) {
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const { pending, error, run } = useRun();
  return (
    <section id="units" className="card section" aria-labelledby="h-units">
      <h2 id="h-units">Units</h2>
      <p className="hint">This component is tracked unit by unit, so each physical part keeps its own test result. Units do not change the stock count.</p>
      {units.length === 0 ? <p>No units yet. Add one to start testing.</p> : <ul className="check-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>{units.map((u) => <UnitItem key={u.id} componentId={componentId} unit={u} />)}</ul>}
      {!archived && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => addUnit(componentId, { label, notes }), () => { setLabel(""); setNotes(""); }); }}>
          <div className="two">
            <div className="field"><label htmlFor="un-l">Unit label</label><input id="un-l" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Serial, sticker or 'unit 3'" required /></div>
            <div className="field"><label htmlFor="un-n">Note (optional)</label><input id="un-n" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
          </div>
          <ErrorLine error={error} />
          <div><button type="submit" className="btn" disabled={pending || !label.trim()}>{pending ? "Adding…" : "Add unit"}</button></div>
        </form>
      )}
    </section>
  );
}
