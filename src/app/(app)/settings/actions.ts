"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  display_name: z.string().trim().max(80, "Keep the display name under 80 characters."),
  theme_preference: z.enum(["system", "light", "dark"]),
});

export async function saveSettings(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, error: "You are signed out." };

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.display_name || null, theme_preference: parsed.data.theme_preference })
    .eq("id", uid)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length !== 1) return { ok: false, error: "The server did not confirm the change." };
  revalidatePath("/settings");
  return { ok: true };
}
