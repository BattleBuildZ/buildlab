"use client";

import { useEffect, useState, useTransition } from "react";
import { saveSettings } from "@/app/(app)/settings/actions";

type Theme = "system" | "light" | "dark";

export function applyTheme(t: Theme) {
  try {
    if (t === "system") {
      localStorage.removeItem("buildlab-theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("buildlab-theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch {
    /* storage unavailable: the theme still applies for this page view */
    if (t !== "system") document.documentElement.setAttribute("data-theme", t);
  }
}

export default function SettingsForm({ displayName, theme }: { displayName: string; theme: Theme }) {
  const [name, setName] = useState(displayName);
  const [pref, setPref] = useState<Theme>(theme);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // The saved profile is the source of truth; make this browser agree with it.
  useEffect(() => applyTheme(theme), [theme]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await saveSettings({ display_name: name, theme_preference: pref });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      applyTheme(pref);
      setMsg({ ok: true, text: "Saved." });
    });
  }

  return (
    <form onSubmit={save} className="stack card" style={{ maxWidth: 520 }}>
      <div className="field">
        <label htmlFor="s-name">Display name</label>
        <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Theme</legend>
        <div className="checks" style={{ marginTop: 6 }}>
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <label key={t}>
              <input type="radio" name="theme" checked={pref === t} onChange={() => setPref(t)} />
              {t === "system" ? "Match device" : t === "light" ? "Light" : "Dark"}
            </label>
          ))}
        </div>
        <span className="hint">Your choice is remembered on this account and applied before the page paints.</span>
      </fieldset>
      <div aria-live="polite">
        {msg && (msg.ok ? <div className="toast-ok" role="status">{msg.text}</div> : <div className="error" role="alert">{msg.text}</div>)}
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  );
}
