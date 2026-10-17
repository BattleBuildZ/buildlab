import type { Metadata } from "next";
import { supabaseConfigured } from "@/lib/supabase/env";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="card auth-card stack">
        <div>
          <p className="eyebrow">Workshop projects</p>
          <h1 style={{ fontSize: 32 }}>
            Build<span style={{ color: "var(--accent)" }}>Lab</span>
          </h1>
          <p className="lede">Sign in to see your projects, cut lists and electronics inventory.</p>
        </div>
        {!supabaseConfigured() && (
          <div className="notice">
            Not connected to a database yet. Set the Supabase variables in <code>.env.local</code> (see README).
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
