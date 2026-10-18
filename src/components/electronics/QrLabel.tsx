"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// Printable label. The QR encodes a link to /q/{token}; scanning it while signed in opens the item.
export default function QrLabel({ token, title, subtitle }: { token: string; title: string; subtitle?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(`${window.location.origin}/q/${token}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s)).catch(() => live && setSvg(null));
    return () => { live = false; };
  }, [token]);

  function print() {
    document.body.classList.add("printing-label");
    const done = () => { document.body.classList.remove("printing-label"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <div className="stack" style={{ alignItems: "flex-start" }}>
      <div className="label-sheet">
        <div className="qr-box">
          {svg ? <div role="img" aria-label={`QR code for ${title}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <div style={{ width: 160, height: 160 }} />}
          <b>{title}</b>
          {subtitle && <span style={{ fontSize: 12 }}>{subtitle}</span>}
        </div>
      </div>
      <button type="button" className="btn btn-sm no-print" onClick={print}>Print label</button>
    </div>
  );
}
