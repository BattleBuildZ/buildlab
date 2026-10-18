"use client";

import { useState } from "react";
import { addHardware, deleteHardware, setHardwareReady, updateHardware } from "@/app/(app)/projects/[id]/actions";
import type { Hardware } from "@/lib/project-types";
import Modal from "../Modal";
import { ConfirmDelete, ErrorLine, Meter, useRun } from "./ui";

const q = (v: number | string | null) => (v === null ? "" : String(parseFloat(String(v))));

function HardwareForm({ projectId, item, onDone }: { projectId: string; item?: Hardware; onDone: () => void }) {
  const { pending, error, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      name: f.get("name"),
      quantity_required: f.get("req"),
      quantity_acquired: f.get("have"),
      notes: f.get("notes") ?? "",
      product_url: f.get("url") ?? "",
    };
    run(() => (item ? updateHardware(projectId, item.id, input) : addHardware(projectId, input)), onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="hw-name">Name and size</label>
        <input id="hw-name" name="name" className="input" required maxLength={160} defaultValue={item?.name} autoFocus
          placeholder="e.g. M6 × 25 mm (1 in) hex bolt" />
        <span className="hint">Put the size in both mm and in, the way you want to read it at the bench.</span>
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="hw-req">Quantity needed</label>
          <input id="hw-req" name="req" className="input" inputMode="decimal" defaultValue={q(item?.quantity_required ?? null)} />
        </div>
        <div className="field">
          <label htmlFor="hw-have">Quantity on hand</label>
          <input id="hw-have" name="have" className="input" inputMode="decimal" defaultValue={q(item?.quantity_acquired ?? null)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="hw-url">Link (optional)</label>
        <input id="hw-url" name="url" className="input" type="url" maxLength={2000} defaultValue={item?.product_url ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="hw-notes">Notes (optional)</label>
        <textarea id="hw-notes" name="notes" className="textarea" maxLength={1000} defaultValue={item?.notes ?? ""} />
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Add hardware"}</button>
      </div>
    </form>
  );
}

function Row({ projectId, item }: { projectId: string; item: Hardware }) {
  const toggle = useRun();
  const del = useRun();
  const [editing, setEditing] = useState(false);
  const need = item.quantity_required, have = item.quantity_acquired;
  const short = need !== null && have !== null && Number(have) < Number(need);
  return (
    <li className="check-row" data-done={item.is_ready} aria-busy={toggle.pending || del.pending}>
      <label className="check-main">
        <input
          type="checkbox"
          checked={item.is_ready}
          disabled={toggle.pending}
          onChange={(e) => toggle.run(() => setHardwareReady(projectId, item.id, e.target.checked))}
        />
        <span>
          <b>{item.name}</b>
          <span className="hint block">
            {need !== null && <>Need {q(need)}</>}
            {need !== null && have !== null && " · "}
            {have !== null && <>Have {q(have)}</>}
            {short && <> · <span className="warn-text">short by {parseFloat((Number(need) - Number(have)).toFixed(3))}</span></>}
            {item.notes && <> · {item.notes}</>}
          </span>
        </span>
      </label>
      <span className="row">
        {item.product_url && <a className="btn btn-ghost btn-sm" href={item.product_url} target="_blank" rel="noreferrer noopener">Link</a>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${item.name}`}>Edit</button>
        <ConfirmDelete label="Delete" what={item.name} pending={del.pending} onConfirm={() => del.run(() => deleteHardware(projectId, item.id))} />
      </span>
      <ErrorLine error={toggle.error ?? del.error} />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit hardware">
        <HardwareForm projectId={projectId} item={item} onDone={() => setEditing(false)} />
      </Modal>
    </li>
  );
}

export default function HardwareSection({ projectId, items }: { projectId: string; items: Hardware[] }) {
  const [adding, setAdding] = useState(false);
  const ready = items.filter((i) => i.is_ready).length;
  return (
    <section id="hardware" className="card section" aria-labelledby="h-hardware">
      <div className="section-head">
        <div>
          <h2 id="h-hardware">Hardware &amp; Fasteners</h2>
          <p className="hint">Check each line off once it is in your hands — ready, not just listed.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add hardware</button>
      </div>
      {items.length === 0 ? (
        <p className="empty-inline">No hardware yet. Add screws, nuts, brackets and anything else you need to buy or pull from stock.</p>
      ) : (
        <>
          <div className="row between">
            <span className="hint" aria-live="polite">{ready} of {items.length} ready</span>
          </div>
          <Meter done={ready} total={items.length} label="Hardware ready" />
          <ul className="checklist">
            {items.map((i) => <Row key={i.id} projectId={projectId} item={i} />)}
          </ul>
        </>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add hardware">
        <HardwareForm projectId={projectId} onDone={() => setAdding(false)} />
      </Modal>
    </section>
  );
}
