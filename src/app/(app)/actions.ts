"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FABRICATION_LABEL, FABRICATION_TYPES } from "@/lib/fabrication";
import type { ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const newProject = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120, "Keep the name under 120 characters."),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(["custom", "sourced"]),
  fabrication: z.array(z.enum(FABRICATION_TYPES)),
});

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = newProject.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, description, type, fabrication } = parsed.data;

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ name, description: description || null, type })
    .select("id")
    .single();
  if (error || !project) return { ok: false, error: error?.message ?? "The project was not saved." };

  if (fabrication.length > 0) {
    const { error: aErr } = await supabase.from("assemblies").insert(
      fabrication.map((f, i) => ({
        project_id: project.id,
        name: FABRICATION_LABEL[f],
        fabrication_type: f,
        sort_order: i,
      })),
    );
    if (aErr) {
      // Do not leave a half-built project behind.
      await supabase.from("projects").delete().eq("id", project.id);
      return { ok: false, error: `Could not create the project's sections: ${aErr.message}` };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { id: project.id } };
}

// Soft delete. The caller must have passed two distinct confirmations; the second requires typing the project name,
// and the server re-checks it so a stale or forged request cannot delete the wrong project.
export async function deleteProject(id: string, typedName: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown project." };
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!project) return { ok: false, error: "That project no longer exists." };
  if (project.name.trim() !== typedName.trim()) return { ok: false, error: "The name you typed does not match the project." };

  const { data, error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length !== 1) return { ok: false, error: "The server did not confirm the deletion." };
  revalidatePath("/", "layout");
  return { ok: true };
}
