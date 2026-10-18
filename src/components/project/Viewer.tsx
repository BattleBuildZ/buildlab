"use client";

import { useState } from "react";
import Modal from "../Modal";

export type ViewerFile = { title: string; url: string; mime: string | null };

// Drawing viewer: images can be fitted or shown at actual size; PDFs use the browser's own viewer.
export default function Viewer({ file, onClose }: { file: ViewerFile | null; onClose: () => void }) {
  const [actual, setActual] = useState(false);
  const isPdf = file?.mime === "application/pdf";
  return (
    <Modal open={file !== null} onClose={() => { setActual(false); onClose(); }} title={file?.title ?? "Viewer"} wide>
      {file && (
        <>
          <div className="viewer-bar">
            <div className="row">
              {!isPdf && (
                <button type="button" className="btn btn-sm" onClick={() => setActual((a) => !a)} aria-pressed={actual}>
                  {actual ? "Fit to window" : "Actual size"}
                </button>
              )}
              <a className="btn btn-sm" href={file.url} target="_blank" rel="noreferrer noopener">Open in new tab</a>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => { setActual(false); onClose(); }}>Close</button>
          </div>
          <div className="viewer-stage">
            {isPdf ? (
              <iframe src={file.url} title={file.title} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={file.title} data-actual={actual} />
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
