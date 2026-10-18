"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveComponent, restoreComponent } from "@/app/(app)/electronics/actions";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

// Two distinct confirmations (are you sure, then type the name). Archiving hides the component but keeps its stock and test history.
export default function ArchiveComponentButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const { pending, error, setError, run } = useRun();
  const restore = useRun();
  const close = () => { setStep(0); setTyped(""); setError(null); };

  if (archived)
    return (
      <>
        <button type="button" className="btn" disabled={restore.pending} onClick={() => restore.run(() => restoreComponent(id))}>{restore.pending ? "Restoring…" : "Restore"}</button>
        <ErrorLine error={restore.error} />
      </>
    );
  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setStep(1)} aria-label={`Archive ${name}`}>Archive</button>
      <Modal open={step === 1} onClose={close} title="Archive this component?">
        <div className="stack">
          <p><strong>{name}</strong> will be hidden from the inventory. Its stock movements and test history are kept, and you can restore it later.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      </Modal>
      <Modal open={step === 2} onClose={close} title="Confirm archive">
        <div className="stack">
          <div className="field">
            <label htmlFor="arc-name">Type the component name to confirm</label>
            <input id="arc-name" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <span className="hint">{name}</span>
          </div>
          <ErrorLine error={error} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-danger-solid" disabled={pending || typed.trim() !== name.trim()} onClick={() => run(() => archiveComponent(id, typed), () => { close(); router.push("/electronics/inventory"); })}>
              {pending ? "Archiving…" : "Archive component"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
