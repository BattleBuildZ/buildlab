"use client";

import { useActionState, useState } from "react";
import { authenticate } from "./actions";

export default function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState(authenticate, null);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="mode" value={mode} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          required
        />
        {mode === "signup" && <span className="hint">At least 8 characters.</span>}
      </div>
      <div aria-live="polite">
        {state?.error && <div className="error" role="alert">{state.error}</div>}
        {state?.info && <div className="notice">{state.info}</div>}
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
