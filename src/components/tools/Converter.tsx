"use client";

import { useState } from "react";
import { fmtIn, fmtMm, parseInch, parseMm } from "@/lib/dimensions";
import { inToMm, mmToIn, nearestFraction } from "@/lib/convert";

const DENOMS = [2, 4, 8, 16, 32, 64];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked: the value stays on screen to copy by hand */ } }}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// A calculator, not a form: the answers appear on this page only and are never written into any
// other mm or inch field. Copy them yourself where you want them.
export default function Converter() {
  const [mmText, setMmText] = useState("");
  const [inText, setInText] = useState("");
  const [den, setDen] = useState(16);

  const mm = parseMm(mmText);
  const inch = parseInch(inText);
  const mmResult = mm.ok && mm.value !== null ? mmToIn(mm.value) : null;
  const inResult = inch.ok && inch.value !== null ? inToMm(inch.value) : null;
  const frac = mmResult !== null ? nearestFraction(mmResult, den) : null;
  const inFrac = inch.ok && inch.value !== null ? nearestFraction(inch.value, den) : null;

  return (
    <div className="stack">
      <div className="card section">
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="cv-den">Round fractions to the nearest</label>
          <select id="cv-den" className="select" value={den} onChange={(e) => setDen(Number(e.target.value))}>
            {DENOMS.map((d) => <option key={d} value={d}>1/{d} in</option>)}
          </select>
        </div>
      </div>

      <div className="cv-grid">
        <section className="card section" aria-labelledby="cv-mm">
          <h2 id="cv-mm">Millimetres to inches</h2>
          <div className="field">
            <label htmlFor="cv-mm-in">Millimetres (mm)</label>
            <input id="cv-mm-in" className="input" inputMode="decimal" value={mmText} onChange={(e) => setMmText(e.target.value)} placeholder="e.g. 600" autoComplete="off" aria-invalid={!mm.ok} aria-describedby="cv-mm-out" />
          </div>
          <div id="cv-mm-out" role="status" aria-live="polite" className="cv-out">
            {!mm.ok ? <span className="error-inline">{mm.error}</span> : mmResult === null ? <span className="hint">Type a value in mm.</span> : (
              <>
                <div className="cv-line"><strong>{fmtIn(mmResult)}</strong> <CopyButton text={String(parseFloat(mmResult.toFixed(4)))} /></div>
                {frac && <div className="cv-line"><span>≈ {frac.text} in</span> <span className="hint">{frac.errorIn === 0 ? "exact at 1/" + den : `off by ${fmtIn(Math.abs(frac.errorIn))} (${frac.errorIn > 0 ? "over" : "under"})`}</span></div>}
              </>
            )}
          </div>
        </section>

        <section className="card section" aria-labelledby="cv-in">
          <h2 id="cv-in">Inches to millimetres</h2>
          <div className="field">
            <label htmlFor="cv-in-in">Inches (in)</label>
            <input id="cv-in-in" className="input" inputMode="text" value={inText} onChange={(e) => setInText(e.target.value)} placeholder="e.g. 23.625 or 23 5/8" autoComplete="off" aria-invalid={!inch.ok} aria-describedby="cv-in-out" />
          </div>
          <div id="cv-in-out" role="status" aria-live="polite" className="cv-out">
            {!inch.ok ? <span className="error-inline">{inch.error}</span> : inResult === null ? <span className="hint">Type a value in inches, as a decimal or a fraction.</span> : (
              <>
                <div className="cv-line"><strong>{fmtMm(inResult)}</strong> <CopyButton text={String(parseFloat(inResult.toFixed(3)))} /></div>
                {inFrac && inch.ok && inch.value !== null && <div className="cv-line"><span className="hint">{fmtIn(inch.value)} as typed{inFrac.errorIn !== 0 ? `; nearest 1/${den} is ${inFrac.text} in` : ""}</span></div>}
              </>
            )}
          </div>
        </section>
      </div>

      <p className="hint">1 in = 25.4 mm exactly. This page only shows answers. It never fills in the mm or inch fields on your projects, which stay separate values you type yourself.</p>
    </div>
  );
}
