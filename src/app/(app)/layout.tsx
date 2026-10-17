import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured()) {
    return (
      <main className="main">
        <div className="notice">
          <strong>BuildLab is not connected to a database yet.</strong> Copy <code>.env.local.example</code> to{" "}
          <code>.env.local</code> and set the Supabase URL and publishable key (see README), then restart.
        </div>
      </main>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const email = (data.claims.email as string | undefined) ?? "Signed in";
  return <AppShell email={email}>{children}</AppShell>;
}
