"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setProcedureArchived } from "@/app/(app)/electronics/test-bench/actions";
import Modal from "../Modal";
import { ErrorLine, useRun } from "../project/ui";

// Two distinct confirmations. Archiving hides the procedure from the bench; every version and past run is kept.
export default function ArchiveProcedureButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const { pending, error, setError, run } = useRun();
  const restore = useRun();
  const close = () => { setStep(0); setTyped(""); setError(null); };
  if (archived)
    return (
      <>
        <button type="button" className="btn" disabled={restore.pending} onClick={() => restore.run(() => setProcedureArchived(id, false))}>{restore.pending ? "Restoring…" : "Restore"}</button>
        <ErrorLine error={restore.error} />
      </>
    );
  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setStep(1)} aria-label={`Archive ${name}`}>Archive</button>
      <Modal open={step === 1} onClose={close} title="Archive this procedure?">
        <div className="stack">
          <p><strong>{name}</strong> will be hidden from the Test Bench. Its versions and every test run stay in Test History, and you can restore it later.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={() => setStep(2)}>Continue</button>
          </div>
        </div>
      </Modal>
      <Modal open={step === 2} onClose={close} title="Confirm archive">
        <div className="stack">
          <div className="field">
            <label htmlFor="arcp-name">Type the procedure name to confirm</label>
            <input id="arcp-name" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <span className="hint">{name}</span>
          </div>
          <ErrorLine error={error} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-danger-solid" disabled={pending || typed.trim() !== name.trim()} onClick={() => run(() => setProcedureArchived(id, true, typed), () => { close(); router.push("/electronics/test-bench"); })}>
              {pending ? "Archiving…" : "Archive procedure"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
