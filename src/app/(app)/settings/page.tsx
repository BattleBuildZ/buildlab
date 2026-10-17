import type { Metadata } from "next";
import SettingsForm from "@/components/SettingsForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name,theme_preference").maybeSingle();
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Settings</h1>
        </div>
      </div>
      <SettingsForm
        displayName={profile?.display_name ?? ""}
        theme={(profile?.theme_preference as "system" | "light" | "dark") ?? "system"}
      />
    </>
  );
}
