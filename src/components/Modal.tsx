"use client";

import { useEffect, useRef } from "react";

// Thin wrapper over native <dialog>: browser-managed focus trap, Esc to close, inert background.
export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="modal-title" onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <h2 id="modal-title">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
