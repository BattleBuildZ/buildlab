"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addProcedureVersion, createProcedure } from "@/app/(app)/electronics/test-bench/actions";
import type { ProcedureDef } from "@/lib/testing";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

export type CompOption = { id: string; name: string; part_number: string | null; variant: string | null };
type StepForm = { instruction: string; measures: boolean; label: string; unit: string; min: string; max: string };
const blankStep = (): StepForm => ({ instruction: "", measures: false, label: "", unit: "", min: "", max: "" });
const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function fromDef(def: ProcedureDef | null): { steps: StepForm[]; equipment: string; wiring: { pin: string; connects_to: string }[]; smin: string; smax: string; logic: string; rules: string; trouble: string } {
  return {
    steps: def?.steps.length ? def.steps.map((st) => ({ instruction: st.instruction, measures: Boolean(st.measurement), label: st.measurement?.label ?? "", unit: st.measurement?.unit ?? "", min: s(st.measurement?.expected_min), max: s(st.measurement?.expected_max) })) : [blankStep()],
    equipment: (def?.equipment ?? []).join("\n"),
    wiring: def?.wiring.length ? def.wiring.map((w) => ({ ...w })) : [],
    smin: s(def?.supply_voltage?.min), smax: s(def?.supply_voltage?.max), logic: s(def?.logic_level_voltage),
    rules: def?.evaluation_rules ?? "", trouble: def?.troubleshooting ?? "",
  };
}

function Form({ mode, components, initial, onDone }: {
  mode: { kind: "create"; defaultComponentId?: string } | { kind: "version"; procedureId: string; name: string; variant: string | null; def: ProcedureDef; verified: boolean };
  components: CompOption[];
  initial?: undefined;
  onDone: (result?: { id?: string }) => void;
}) {
  void initial;
  const creating = mode.kind === "create";
  const seed = fromDef(creating ? null : mode.def);
  const [name, setName] = useState(creating ? "" : mode.name);
  const [componentId, setComponentId] = useState(creating ? mode.defaultComponentId ?? "" : "");
  const [variant, setVariant] = useState(creating ? "" : mode.variant ?? "");
  const [steps, setSteps] = useState<StepForm[]>(seed.steps);
  const [equipment, setEquipment] = useState(seed.equipment);
  const [wiring, setWiring] = useState(seed.wiring);
  const [smin, setSmin] = useState(seed.smin);
  const [smax, setSmax] = useState(seed.smax);
  const [logic, setLogic] = useState(seed.logic);
  const [rules, setRules] = useState(seed.rules);
  const [trouble, setTrouble] = useState(seed.trouble);
  const [verified, setVerified] = useState(creating ? false : mode.verified);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRun();

  const patchStep = (i: number, p: Partial<StepForm>) => setSteps((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const moveStep = (i: number, d: -1 | 1) => setSteps((a) => { const j = i + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name, supported_variant: variant, verified, change_note: note,
      definition: {
        equipment: equipment.split("\n").map((l) => l.trim()).filter(Boolean),
        wiring: wiring.filter((w) => w.pin.trim() || w.connects_to.trim()),
        supply_min: smin, supply_max: smax, logic_level: logic,
        steps: steps.map((st) => ({ instruction: st.instruction, measurement: st.measures ? { label: st.label, unit: st.unit, expected_min: st.min, expected_max: st.max } : null })),
        evaluation_rules: rules, troubleshooting: trouble,
      },
    };
    if (creating) run(() => createProcedure({ ...payload, component_id: componentId || null }), (d) => onDone(d));
    else run(() => addProcedureVersion(mode.procedureId, payload), () => onDone());
  }

  return (
    <form onSubmit={submit} className="stack">
      {!creating && <p className="hint">Saving adds a new version. Earlier versions and every past run keep exactly what they were judged against.</p>}
      <div className="field">
        <label htmlFor="pf-name">Procedure name</label>
        <input id="pf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required autoFocus placeholder="e.g. Basic function check" />
      </div>
      <div className="two">
        {creating && (
          <div className="field">
            <label htmlFor="pf-comp">Component (optional)</label>
            <select id="pf-comp" className="select" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
              <option value="">Any component</option>
              {components.map((c) => <option key={c.id} value={c.id}>{[c.name, c.part_number].filter(Boolean).join(" · ")}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="pf-var">Exact part or variant this covers</label>
          <input id="pf-var" className="input" value={variant} onChange={(e) => setVariant(e.target.value)} maxLength={120} placeholder="Variants can behave differently" />
        </div>
      </div>

      <fieldset className="dims">
        <legend>Setup</legend>
        <div className="field">
          <label htmlFor="pf-eq">Equipment needed (one per line)</label>
          <textarea id="pf-eq" className="textarea" rows={3} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Wiring</span>
          {wiring.map((w, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
              <input className="input" aria-label={`Wiring ${i + 1} from`} value={w.pin} onChange={(e) => setWiring((a) => a.map((x, j) => (j === i ? { ...x, pin: e.target.value } : x)))} placeholder="Pin" />
              <input className="input" aria-label={`Wiring ${i + 1} to`} value={w.connects_to} onChange={(e) => setWiring((a) => a.map((x, j) => (j === i ? { ...x, connects_to: e.target.value } : x)))} placeholder="Connects to" />
              <button type="button" className="btn btn-sm" aria-label={`Remove wiring row ${i + 1}`} onClick={() => setWiring((a) => a.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setWiring((a) => [...a, { pin: "", connects_to: "" }])}>Add wiring row</button>
        </div>
        <div className="three">
          <div className="field"><label htmlFor="pf-smin">Supply voltage min (V)</label><input id="pf-smin" className="input" inputMode="decimal" value={smin} onChange={(e) => setSmin(e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-smax">Supply voltage max (V)</label><input id="pf-smax" className="input" inputMode="decimal" value={smax} onChange={(e) => setSmax(e.target.value)} /></div>
          <div className="field"><label htmlFor="pf-logic">Logic level (V)</label><input id="pf-logic" className="input" inputMode="decimal" value={logic} onChange={(e) => setLogic(e.target.value)} /></div>
        </div>
        <p className="hint">Voltages are saved exactly as you type them. BuildLab does not check them against the part.</p>
      </fieldset>

      <fieldset className="dims">
        <legend>Steps</legend>
        {steps.map((st, i) => (
          <div key={i} className="step-edit">
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <b className="step-n">{i + 1}</b>
              <textarea className="textarea" rows={2} aria-label={`Step ${i + 1} instruction`} value={st.instruction} onChange={(e) => patchStep(i, { instruction: e.target.value })} placeholder="What to do or check" />
              <div className="stack" style={{ gap: 4 }}>
                <button type="button" className="btn btn-sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, -1)}>↑</button>
                <button type="button" className="btn btn-sm" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>↓</button>
                <button type="button" className="btn btn-sm" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => setSteps((a) => a.filter((_, j) => j !== i))}>×</button>
              </div>
            </div>
            <label className="inline-check" style={{ marginLeft: 34 }}>
              <input type="checkbox" checked={st.measures} onChange={(e) => patchStep(i, { measures: e.target.checked })} /> This step records a reading
            </label>
            {st.measures && (
              <div className="four" style={{ marginLeft: 34 }}>
                <div className="field"><label htmlFor={`pf-l${i}`}>Reading name</label><input id={`pf-l${i}`} className="input" value={st.label} onChange={(e) => patchStep(i, { label: e.target.value })} placeholder="Output voltage" /></div>
                <div className="field"><label htmlFor={`pf-u${i}`}>Unit</label><input id={`pf-u${i}`} className="input" value={st.unit} onChange={(e) => patchStep(i, { unit: e.target.value })} placeholder="V" /></div>
                <div className="field"><label htmlFor={`pf-a${i}`}>Expected min</label><input id={`pf-a${i}`} className="input" inputMode="decimal" value={st.min} onChange={(e) => patchStep(i, { min: e.target.value })} /></div>
                <div className="field"><label htmlFor={`pf-b${i}`}>Expected max</label><input id={`pf-b${i}`} className="input" inputMode="decimal" value={st.max} onChange={(e) => patchStep(i, { max: e.target.value })} /></div>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setSteps((a) => [...a, blankStep()])}>Add step</button>
        <p className="hint">A reading is judged only if you give it an expected range. With no range it is recorded, not judged.</p>
      </fieldset>

      <div className="field"><label htmlFor="pf-rules">How to decide pass or fail (your notes)</label><textarea id="pf-rules" className="textarea" rows={2} value={rules} onChange={(e) => setRules(e.target.value)} /></div>
      <div className="field"><label htmlFor="pf-tr">Troubleshooting notes</label><textarea id="pf-tr" className="textarea" rows={2} value={trouble} onChange={(e) => setTrouble(e.target.value)} /></div>

      <label className="inline-check">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        <span>I checked this procedure against the part&apos;s documentation</span>
      </label>
      <p className="hint">Left unticked, it is saved as <b>Unverified</b> and can only be followed by hand. BuildLab never marks it verified for you.</p>
      {!creating && (
        <div className="field"><label htmlFor="pf-note">What changed in this version</label><input id="pf-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
      )}
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={() => onDone()}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : creating ? "Save procedure" : "Save as new version"}</button>
      </div>
    </form>
  );
}

export function NewProcedureButton({ components, defaultComponentId, label = "New procedure" }: { components: CompOption[]; defaultComponentId?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New test procedure" wide>
        <Form mode={{ kind: "create", defaultComponentId }} components={components} onDone={(r) => { setOpen(false); if (r?.id) router.push(`/electronics/test-bench/${r.id}`); }} />
      </Modal>
    </>
  );
}

export function NewVersionButton({ procedureId, name, variant, def, verified }: { procedureId: string; name: string; variant: string | null; def: ProcedureDef; verified: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Edit (new version)</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit procedure" wide>
        <Form mode={{ kind: "version", procedureId, name, variant, def, verified }} components={[]} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
