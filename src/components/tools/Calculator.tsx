"use client";

import { useRef, useState } from "react";
import { evaluate, fmtResult } from "@/lib/calc";

type Entry = { expr: string; result: string };
const KEYS: { label: string; insert?: string; aria: string; kind?: "op" | "fn" }[] = [
  { label: "(", insert: "(", aria: "open bracket", kind: "fn" }, { label: ")", insert: ")", aria: "close bracket", kind: "fn" }, { label: "%", insert: "%", aria: "percent", kind: "fn" }, { label: "÷", insert: "/", aria: "divide", kind: "op" },
  { label: "7", insert: "7", aria: "7" }, { label: "8", insert: "8", aria: "8" }, { label: "9", insert: "9", aria: "9" }, { label: "×", insert: "*", aria: "multiply", kind: "op" },
  { label: "4", insert: "4", aria: "4" }, { label: "5", insert: "5", aria: "5" }, { label: "6", insert: "6", aria: "6" }, { label: "−", insert: "-", aria: "minus", kind: "op" },
  { label: "1", insert: "1", aria: "1" }, { label: "2", insert: "2", aria: "2" }, { label: "3", insert: "3", aria: "3" }, { label: "+", insert: "+", aria: "plus", kind: "op" },
  { label: "0", insert: "0", aria: "0" }, { label: ".", insert: ".", aria: "decimal point" }, { label: "xʸ", insert: "^", aria: "power", kind: "fn" }, { label: "√", insert: "sqrt(", aria: "square root", kind: "fn" },
];

// Everything here runs in the browser. Nothing typed on this page is sent anywhere or saved.
export default function Calculator() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const input = useRef<HTMLInputElement>(null);

  function insert(s: string) {
    const el = input.current;
    const start = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? expr.length;
    const next = expr.slice(0, start) + s + expr.slice(end);
    setExpr(next);
    setResult(null); setError(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + s.length, start + s.length); });
  }
  function backspace() {
    const el = input.current;
    const start = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? expr.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    setExpr(expr.slice(0, from) + expr.slice(end));
    setResult(null); setError(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(from, from); });
  }
  function calc(e?: React.FormEvent) {
    e?.preventDefault();
    const r = evaluate(expr);
    if (!r.ok) { setResult(null); setError(r.error); return; }
    const shown = fmtResult(r.value);
    setError(null); setResult(shown);
    setHistory((h) => [{ expr, result: shown }, ...h].slice(0, 20));
  }
  function clearAll() { setExpr(""); setResult(null); setError(null); input.current?.focus(); }

  return (
    <div className="calc card section">
      <form onSubmit={calc} className="stack" aria-label="Calculator">
        <div className="field">
          <label htmlFor="calc-expr">Expression</label>
          <input id="calc-expr" ref={input} className="input calc-input" value={expr} onChange={(e) => { setExpr(e.target.value); setResult(null); setError(null); }} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="text" placeholder="e.g. 23 + 5/8" aria-describedby="calc-out" />
        </div>
        <div id="calc-out" className="calc-out" role="status" aria-live="polite">
          {error ? <span className="error-inline">{error}</span> : result !== null ? <><span className="hint">Result</span> <strong>{result}</strong></> : <span className="hint">Press = or Enter to calculate.</span>}
        </div>
        <div className="calc-pad">
          {KEYS.map((k) => (
            <button key={k.label} type="button" className={`btn calc-key${k.kind ? ` calc-${k.kind}` : ""}`} aria-label={k.aria} onClick={() => insert(k.insert!)}>{k.label}</button>
          ))}
          <button type="button" className="btn calc-key" aria-label="Backspace" onClick={backspace}>⌫</button>
          <button type="button" className="btn calc-key" aria-label="Clear" onClick={clearAll}>C</button>
          <button type="submit" className="btn btn-primary calc-key calc-eq" aria-label="Equals">=</button>
        </div>
      </form>
      {history.length > 0 && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 15 }}>This session</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>Clear list</button>
          </div>
          <ul className="calc-history">
            {history.map((h, i) => (
              <li key={i}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setExpr(h.expr); setResult(h.result); setError(null); input.current?.focus(); }} aria-label={`Reuse ${h.expr} equals ${h.result}`}>
                  <span>{h.expr}</span> <b>= {h.result}</b>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">This list lives only in this browser tab and is gone when you leave the page.</p>
        </div>
      )}
    </div>
  );
}
