"use client";

import { useState } from "react";
import { saveLocation, setLocationArchived } from "@/app/(app)/electronics/actions";
import { LOCATION_KINDS, LOCATION_KIND_LABEL, type Location } from "@/lib/electronics";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

function Form({ location, locations, onDone }: { location?: Location; locations: Location[]; onDone: () => void }) {
  const { pending, error, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => saveLocation(location?.id ?? null, { name: f.get("name"), kind: f.get("kind"), parent_id: f.get("parent") || null, notes: f.get("notes") ?? "" }), onDone);
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="two">
        <div className="field">
          <label htmlFor="lf-name">Name</label>
          <input id="lf-name" name="name" className="input" required maxLength={80} defaultValue={location?.name} autoFocus placeholder="e.g. Drawer A1" />
        </div>
        <div className="field">
          <label htmlFor="lf-kind">Kind</label>
          <select id="lf-kind" name="kind" className="select" defaultValue={location?.kind ?? "bin"}>
            {LOCATION_KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="lf-parent">Inside (optional)</label>
        <select id="lf-parent" name="parent" className="select" defaultValue={location?.parent_id ?? ""}>
          <option value="">Top level</option>
          {locations.filter((l) => l.id !== location?.id && !l.archived_at).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lf-notes">Notes (optional)</label>
        <textarea id="lf-notes" name="notes" className="textarea" maxLength={500} defaultValue={location?.notes ?? ""} />
      </div>
      <ErrorLine error={error} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : location ? "Save changes" : "Add location"}</button>
      </div>
    </form>
  );
}

export function AddLocationButton({ locations, label = "Add location" }: { locations: Location[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add storage location"><Form locations={locations} onDone={() => setOpen(false)} /></Modal>
    </>
  );
}

export function EditLocationButtons({ location, locations }: { location: Location; locations: Location[] }) {
  const [open, setOpen] = useState(false);
  const arch = useRun();
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label={`Edit ${location.name}`}>Edit</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={arch.pending} onClick={() => arch.run(() => setLocationArchived(location.id, !location.archived_at))}>
        {location.archived_at ? "Restore" : "Archive"}
      </button>
      <ErrorLine error={arch.error} />
      <Modal open={open} onClose={() => setOpen(false)} title="Edit storage location"><Form location={location} locations={locations} onDone={() => setOpen(false)} /></Modal>
    </>
  );
}
