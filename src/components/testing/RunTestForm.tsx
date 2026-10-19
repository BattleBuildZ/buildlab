"use client";

import Link from "next/link";
import { useState } from "react";
import { recordTestRun } from "@/app/(app)/electronics/test-bench/actions";
import { TEST_STATUS_LABEL } from "@/lib/electronics";
import { fmtRange, judge, parseReading, type ProcedureDef } from "@/lib/testing";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

export type RunUnit = { id: string; label: string; retired_at: string | null };
export type RunTarget = { id: string; name: string; track_individual_units: boolean; units: RunUnit[] };
export type RunProcedure = { versionId: string; name: string; version: number; verified: boolean; def: ProcedureDef } | null;
type Extra = { label: string; unit: string; value: string; min: string; max: string };

function Form({ target, procedure, onClose }: { target: RunTarget; procedure: RunProcedure; onClose: () => void }) {
  const { pending, error, run } = useRun();
  const units = target.units.filter((u) => !u.retired_at);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : "");
  const [done, setDone] = useState<number[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [trouble, setTrouble] = useState("");
  const [saved, setSaved] = useState<{ id: string; status: string } | null>(null);

  const steps = procedure?.def.steps ?? [];
  const allDone = steps.length > 0 && done.length === steps.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const readings = [
      ...steps.filter((st) => st.measurement).map((st) => ({ step: st.n, value: values[st.n] ?? "" })),
      ...extras.map((x) => ({ step: null, label: x.label, unit: x.unit, value: x.value, expected_min: x.min, expected_max: x.max })),
    ];
    run(
      () => recordTestRun({ component_id: target.id, unit_id: unitId || null, version_id: procedure?.versionId ?? null, outcome, notes, troubleshooting_notes: trouble, steps_done: done, readings }),
      (d) => d && setSaved(d),
    );
  }

  if (saved)
    return (
      <div className="stack">
        <p className="toast-ok" role="status">Recorded. {target.name} now shows <b>{TEST_STATUS_LABEL[saved.status] ?? saved.status}</b>.</p>
        <p className="hint">This run is part of Test History and cannot be edited. To correct it, record a new run.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Link className="btn" href={`/electronics/history/${saved.id}`}>View the run</Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    );

  return (
    <form onSubmit={submit} className="stack">
      <p className="hint">Manual test of <b>{target.name}</b>{procedure ? <> using <b>{procedure.name}</b>, version {procedure.version}</> : " with no saved procedure"}. This run is recorded as <b>manual</b>.</p>
      {procedure && !procedure.verified && <div className="notice">This procedure is <b>Unverified</b>. Follow it by hand. Its wiring and voltages have not been checked against the part&apos;s documentation.</div>}

      {target.track_individual_units && (
        <div className="field">
          <label htmlFor="rt-unit">Which unit are you testing?</label>
          <select id="rt-unit" className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            <option value="">Choose a unit</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          {units.length === 0 && <span className="hint">Add a unit on the component page first.</span>}
        </div>
      )}

      {procedure && (
        <>
          {(procedure.def.equipment.length > 0 || procedure.def.wiring.length > 0 || procedure.def.supply_voltage || procedure.def.logic_level_voltage !== null) && (
            <details className="card section" style={{ padding: 12 }}>
              <summary>Setup for this test</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                {procedure.def.equipment.length > 0 && <div><b>Equipment</b><ul className="def-list">{procedure.def.equipment.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                {procedure.def.wiring.length > 0 && <div><b>Wiring</b><ul className="def-list">{procedure.def.wiring.map((w, i) => <li key={i}>{w.pin} → {w.connects_to}</li>)}</ul></div>}
                {procedure.def.supply_voltage && <p><b>Supply voltage (as written in the procedure):</b> {fmtRange(procedure.def.supply_voltage.min, procedure.def.supply_voltage.max, "V")}</p>}
                {procedure.def.logic_level_voltage !== null && <p><b>Logic level (as written):</b> {procedure.def.logic_level_voltage} V</p>}
              </div>
            </details>
          )}
          <div>
            <div className="section-head"><h3 style={{ margin: 0, fontSize: 15 }}>Steps</h3><span className="hint">{done.length} of {steps.length} ticked</span></div>
            {steps.map((st) => {
              const checked = done.includes(st.n);
              const m = st.measurement;
              const parsed = parseReading(values[st.n] ?? "");
              const verdict = m ? judge(parsed.numeric, m.expected_min, m.expected_max) : null;
              return (
                <div key={st.n} className="run-step">
                  <label className="check-main" data-done={checked}>
                    <input type="checkbox" checked={checked} onChange={(e) => setDone((a) => (e.target.checked ? [...a, st.n] : a.filter((x) => x !== st.n)))} />
                    <span><b>{st.n}. {st.instruction}</b></span>
                  </label>
                  {m && (
                    <div className="reading-row">
                      <div className="field">
                        <label htmlFor={`rt-r${st.n}`}>{m.label ?? "Reading"}{m.unit ? ` (${m.unit})` : ""}</label>
                        <input id={`rt-r${st.n}`} className="input" inputMode="decimal" value={values[st.n] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [st.n]: e.target.value }))} autoComplete="off" />
                      </div>
                      <span className={`badge ${verdict === true ? "badge-ok" : verdict === false ? "badge-bad" : "badge-type"}`}>{verdict === true ? "In range" : verdict === false ? "Out of range" : "Not judged"}</span>
                      <span className="hint">Expected: {fmtRange(m.expected_min, m.expected_max, m.unit)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <span className="label">{procedure ? "Extra readings (optional)" : "Readings (optional)"}</span>
        {extras.map((x, i) => (
          <div key={i} className="four">
            <input className="input" aria-label={`Reading ${i + 1} name`} placeholder="Name" value={x.label} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <input className="input" aria-label={`Reading ${i + 1} value`} placeholder="Value" inputMode="decimal" value={x.value} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
            <input className="input" aria-label={`Reading ${i + 1} unit`} placeholder="Unit" value={x.unit} onChange={(e) => setExtras((a) => a.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} />
            <button type="button" className="btn btn-sm" aria-label={`Remove reading ${i + 1}`} onClick={() => setExtras((a) => a.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setExtras((a) => [...a, { label: "", unit: "", value: "", min: "", max: "" }])}>Add a reading</button>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Result</legend>
        <div className="outcome-opts">
          {(["passed", "failed", "inconclusive"] as const).map((o) => (
            <label key={o}><input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} required />{TEST_STATUS_LABEL[o]}</label>
          ))}
        </div>
        {procedure && outcome === "passed" && !allDone && <span className="hint">Tick every step to record Passed.</span>}
      </fieldset>

      <div className="field"><label htmlFor="rt-notes">Notes</label><textarea id="rt-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
      {(outcome === "failed" || trouble) && <div className="field"><label htmlFor="rt-tr">What you tried (troubleshooting)</label><textarea id="rt-tr" className="textarea" rows={2} value={trouble} onChange={(e) => setTrouble(e.target.value)} maxLength={2000} /></div>}

      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending || !outcome}>{pending ? "Saving…" : "Record this run"}</button>
      </div>
    </form>
  );
}

export function RunTestButton({ target, procedure, label = "Run test", primary }: { target: RunTarget; procedure: RunProcedure; label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={primary ? "btn btn-primary" : "btn"} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={procedure ? `Run: ${procedure.name}` : "Record a test"} wide>
        <Form target={target} procedure={procedure} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

// For a procedure that is not tied to one component: pick which component is being tested.
export function RunTestPicker({ targets, procedure, label = "Run test" }: { targets: RunTarget[]; procedure: RunProcedure; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const target = targets.find((t) => t.id === pick) ?? null;
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => { setOpen(false); setPick(""); }} title={procedure ? `Run: ${procedure.name}` : "Record a test"} wide>
        {!target ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="rtp-c">Which component are you testing?</label>
              <select id="rtp-c" className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a component</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {targets.length === 0 && <span className="hint">Add a component to Inventory first.</span>}
            </div>
          </div>
        ) : (
          <Form key={target.id} target={target} procedure={procedure} onClose={() => { setOpen(false); setPick(""); }} />
        )}
      </Modal>
    </>
  );
}
