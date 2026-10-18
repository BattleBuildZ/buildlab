"use client";

import { useState } from "react";
import {
  addPhase, deletePhase, deleteStep, movePhase, moveStep, renamePhase, saveStep, setStepDone,
} from "@/app/(app)/projects/[id]/actions";
import type { Phase, Step } from "@/lib/project-types";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, Meter, useRun } from "./ui";

const byOrder = <T extends { sort_order: number }>(a: T[]) => [...a].sort((x, y) => x.sort_order - y.sort_order);

function StepForm({ projectId, phases, step, defaultPhase, onDone }: { projectId: string; phases: Phase[]; step?: Step; defaultPhase?: string | null; onDone: () => void }) {
  const { pending, error, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => saveStep(projectId, step?.id ?? null, { title: f.get("title"), instructions: f.get("instructions") ?? "", phase_id: f.get("phase") || null }), onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="st-title">Step</label>
        <input id="st-title" name="title" className="input" required maxLength={200} defaultValue={step?.title} autoFocus placeholder="e.g. Glue and clamp the frame" />
      </div>
      <div className="field">
        <label htmlFor="st-phase">Phase</label>
        <select id="st-phase" name="phase" className="select" defaultValue={step?.phase_id ?? defaultPhase ?? ""}>
          <option value="">No phase</option>
          {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="st-ins">Instructions (optional)</label>
        <textarea id="st-ins" name="instructions" className="textarea" maxLength={4000} defaultValue={step?.instructions ?? ""} />
        <span className="hint">Write any size in both mm and in.</span>
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : step ? "Save changes" : "Add step"}</button>
      </div>
    </form>
  );
}

function StepRow({ projectId, step, phases, first, last, n }: { projectId: string; step: Step; phases: Phase[]; first: boolean; last: boolean; n: number }) {
  const toggle = useRun();
  const move = useRun();
  const del = useRun();
  const [editing, setEditing] = useState(false);
  const isDone = Boolean(step.completed_at);
  return (
    <li className="check-row" data-done={isDone} aria-busy={toggle.pending || move.pending || del.pending}>
      <label className="check-main">
        <input type="checkbox" checked={isDone} disabled={toggle.pending} onChange={(e) => toggle.run(() => setStepDone(projectId, step.id, e.target.checked))} />
        <span>
          <b><span className="stepno">{n}.</span> {step.title}</b>
          {step.instructions && <span className="hint block prewrap">{step.instructions}</span>}
        </span>
      </label>
      <span className="row no-print">
        <button type="button" className="btn btn-ghost btn-sm" disabled={first || move.pending} onClick={() => move.run(() => moveStep(projectId, step.id, "up"))} aria-label={`Move step ${step.title} up`}>↑</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={last || move.pending} onClick={() => move.run(() => moveStep(projectId, step.id, "down"))} aria-label={`Move step ${step.title} down`}>↓</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit step ${step.title}`}>Edit</button>
        <ConfirmDelete label="Delete step" what={step.title} pending={del.pending} onConfirm={() => del.run(() => deleteStep(projectId, step.id))} />
      </span>
      <ErrorLine error={toggle.error ?? move.error ?? del.error} />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit step">
        <StepForm projectId={projectId} phases={phases} step={step} onDone={() => setEditing(false)} />
      </Modal>
    </li>
  );
}

function PhaseHead({ projectId, phase, first, last, steps }: { projectId: string; phase: Phase; first: boolean; last: boolean; steps: Step[] }) {
  const [renaming, setRenaming] = useState(false);
  const move = useRun();
  const del = useRun();
  const rn = useRun();
  const d = steps.filter((s) => s.completed_at).length;
  return (
    <div className="asm-head">
      <div>
        <h3>{phase.name}</h3>
        <p className="hint">{d}/{steps.length} steps done</p>
      </div>
      <div className="row no-print">
        <button type="button" className="btn btn-ghost btn-sm" disabled={first || move.pending} onClick={() => move.run(() => movePhase(projectId, phase.id, "up"))} aria-label={`Move phase ${phase.name} up`}>↑</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={last || move.pending} onClick={() => move.run(() => movePhase(projectId, phase.id, "down"))} aria-label={`Move phase ${phase.name} down`}>↓</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)} aria-label={`Rename phase ${phase.name}`}>Rename</button>
        <ConfirmDelete label="Delete phase" what={`phase ${phase.name} (its steps are kept under No phase)`} pending={del.pending} onConfirm={() => del.run(() => deletePhase(projectId, phase.id))} />
      </div>
      <ErrorLine error={move.error ?? del.error} />
      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename phase">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); rn.run(() => renamePhase(projectId, phase.id, f.get("name")), () => setRenaming(false)); }}>
          <div className="field">
            <label htmlFor="ph-rn">Phase name</label>
            <input id="ph-rn" name="name" className="input" required maxLength={120} defaultValue={phase.name} autoFocus />
          </div>
          <ErrorLine error={rn.error} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setRenaming(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={rn.pending}>{rn.pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function StepsSection({ projectId, phases, steps }: { projectId: string; phases: Phase[]; steps: Step[] }) {
  const [addingStep, setAddingStep] = useState<{ phase: string | null } | null>(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const ph = useRun();
  const orderedPhases = byOrder(phases);
  const groups: { phase: Phase | null; steps: Step[] }[] = [
    ...orderedPhases.map((p) => ({ phase: p, steps: byOrder(steps.filter((s) => s.phase_id === p.id)) })),
    { phase: null, steps: byOrder(steps.filter((s) => !s.phase_id || !phases.some((p) => p.id === s.phase_id))) },
  ];
  const doneCount = steps.filter((s) => s.completed_at).length;
  let n = 0;

  return (
    <section id="steps" className="card section" aria-labelledby="h-steps">
      <div className="section-head">
        <div>
          <h2 id="h-steps">Build Steps</h2>
          <p className="hint">Group steps into phases, put them in order, and check each one off as you finish it.</p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn" onClick={() => setAddingPhase(true)}>Add phase</button>
          <button type="button" className="btn btn-primary" onClick={() => setAddingStep({ phase: null })}>Add step</button>
        </div>
      </div>
      {steps.length === 0 && phases.length === 0 ? (
        <p className="empty-inline">No steps yet. Add a phase (Prep, Assembly, Finish…) and the steps inside it, or just add steps.</p>
      ) : (
        <>
          <span className="hint" aria-live="polite">{doneCount} of {steps.length} steps done</span>
          <Meter done={doneCount} total={steps.length} label="Build steps progress" />
          <div className="stack">
            {groups.map((g, gi) => {
              if (!g.phase && g.steps.length === 0) return null;
              return (
                <div key={g.phase?.id ?? "none"} className="asm">
                  {g.phase ? (
                    <PhaseHead projectId={projectId} phase={g.phase} first={gi === 0} last={gi === orderedPhases.length - 1} steps={g.steps} />
                  ) : (
                    orderedPhases.length > 0 && <div className="asm-head"><h3>No phase</h3></div>
                  )}
                  {g.steps.length === 0 ? (
                    <p className="hint">No steps in this phase yet.</p>
                  ) : (
                    <ul className="checklist">
                      {g.steps.map((s, i) => (
                        <StepRow key={s.id} projectId={projectId} step={s} phases={orderedPhases} first={i === 0} last={i === g.steps.length - 1} n={++n} />
                      ))}
                    </ul>
                  )}
                  <button type="button" className="btn btn-sm no-print" onClick={() => setAddingStep({ phase: g.phase?.id ?? null })}>
                    Add step{g.phase ? ` to ${g.phase.name}` : ""}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <ErrorLine error={ph.error} />
      <Modal open={addingPhase} onClose={() => setAddingPhase(false)} title="Add phase">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); ph.run(() => addPhase(projectId, f.get("name")), () => setAddingPhase(false)); }}>
          <div className="field">
            <label htmlFor="ph-name">Phase name</label>
            <input id="ph-name" name="name" className="input" required maxLength={120} autoFocus placeholder="e.g. Prep, Assembly, Finish" />
          </div>
          <ErrorLine error={ph.error} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setAddingPhase(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={ph.pending}>{ph.pending ? "Saving…" : "Add phase"}</button>
          </div>
        </form>
      </Modal>
      <Modal open={addingStep !== null} onClose={() => setAddingStep(null)} title="Add step">
        <StepForm projectId={projectId} phases={orderedPhases} defaultPhase={addingStep?.phase ?? null} onDone={() => setAddingStep(null)} />
      </Modal>
    </section>
  );
}
