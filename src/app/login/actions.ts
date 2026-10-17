"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

export type AuthState = { error?: string; info?: string } | null;

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "BuildLab is not connected to a database yet (see README)." };
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const mode = formData.get("mode") === "signup" ? "signup" : "signin";
  const supabase = await createClient();

  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp(parsed.data);
    if (error) return { error: error.message };
    // With email confirmation enabled there is no session yet; say so rather than pretending we are signed in.
    if (!data.session) return { info: "Account created. Check your email to confirm it, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: error.message };
  }
  redirect("/");
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
