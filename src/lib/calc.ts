// A small arithmetic evaluator. It parses the text itself (no eval, no network) and supports
// + - * / ^ , parentheses, a trailing %, sqrt(), and fractions typed as 5/8 (just division).
// Numbers are plain decimals. Everything runs in the browser.

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "fn"; v: string };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/√/g, "sqrt");
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (!m) return `Unexpected "${ch}".`;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      const m = s.slice(i).match(/^[a-z]+/i)!;
      const name = m[0].toLowerCase();
      if (name !== "sqrt") return `Unknown function "${m[0]}". Only sqrt( ) is available.`;
      out.push({ t: "fn", v: name });
      i += m[0].length;
      continue;
    }
    if ("+-*/^()%".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
    return `Unexpected "${ch}".`;
  }
  return out;
}

export function evaluate(src: string): CalcResult {
  if (src.trim() === "") return { ok: false, error: "Type something to calculate." };
  const toks = tokenize(src);
  if (typeof toks === "string") return { ok: false, error: toks };
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;
  const fail = (m: string): never => { throw new Error(m); };

  // expr := term (('+'|'-') term)*
  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: string }).v;
      const r = unary();
      if (op === "/" && r === 0) fail("Cannot divide by zero.");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function unary(): number {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }
  function power(): number {
    const base = postfix();
    if (isOp("^")) { p++; const e = unary(); return Math.pow(base, e); }
    return base;
  }
  function postfix(): number {
    let v = atom();
    while (isOp("%")) { p++; v = v / 100; }
    return v;
  }
  function atom(): number {
    const t = peek();
    if (!t) return fail("The expression ends too soon.");
    if (t.t === "num") { p++; return t.v; }
    if (t.t === "fn") {
      p++;
      if (!isOp("(")) return fail("Write sqrt( ) with brackets, e.g. sqrt(9).");
      p++;
      const v = expr();
      if (!isOp(")")) return fail("A bracket is not closed.");
      p++;
      if (v < 0) return fail("Cannot take the square root of a negative number.");
      return Math.sqrt(v);
    }
    if (t.t === "op" && t.v === "(") {
      p++;
      const v = expr();
      if (!isOp(")")) return fail("A bracket is not closed.");
      p++;
      return v;
    }
    return fail(`Unexpected "${(t as { v: string }).v}".`);
  }

  try {
    const v = expr();
    if (p < toks.length) return { ok: false, error: `Unexpected "${(toks[p] as { v: string }).v}".` };
    if (!Number.isFinite(v)) return { ok: false, error: "That result is too large to show." };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not calculate that." };
  }
}

// Show up to 10 significant decimals without floating-point noise (0.1 + 0.2 -> 0.3).
export function fmtResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const r = parseFloat(n.toPrecision(12));
  return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0) ? r.toExponential(6) : String(r);
}
