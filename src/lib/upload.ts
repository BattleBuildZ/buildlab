"use client";

// Browser-side upload helpers. Files go straight from the browser to the private project-files bucket under
// {user id}/{project id}/..., then a server action registers them. Nothing is claimed as saved until that action succeeds.
import { createClient } from "@/lib/supabase/browser";
import { DISPLAY_MAX_PX, IMAGE_MIME, MAX_UPLOAD_BYTES, PRINT_EXT_MIME, extOf, safeFilename } from "./files";

export type UploadedMeta = {
  storage_path: string;
  display_path: string | null;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
};


async function resizeTo640(file: File): Promise<{ blob: Blob; width: number; height: number; origW: number; origH: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { width: w, height: h } = bmp;
    const scale = Math.min(1, DISPLAY_MAX_PX / Math.max(w, h));
    if (scale === 1) {
      bmp.close();
      return { blob: file, width: w, height: h, origW: w, origH: h };
    }
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // JPEG has no transparency; drawings and PNGs with clear backgrounds should end up white, not black
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(bmp, 0, 0, cw, ch);
    bmp.close();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? { blob, width: cw, height: ch, origW: w, origH: h } : null;
  } catch {
    return null; // e.g. unsupported image: keep the original only
  }
}

export function contentTypeFor(file: File, mode: "print" | "document") {
  if (mode === "print") return PRINT_EXT_MIME[extOf(file.name)] ?? "application/octet-stream";
  return file.type || (extOf(file.name) === "pdf" ? "application/pdf" : "application/octet-stream");
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  opts: { mode: "print" | "document"; optimize?: boolean; bucket?: "project-files" | "component-files" },
): Promise<{ ok: true; meta: UploadedMeta } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `${file.name} is larger than 50 MB.` };
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` };
  if (opts.mode === "print" && !(extOf(file.name) in PRINT_EXT_MIME)) {
    return { ok: false, error: `${file.name}: print files can be .stl, .3mf, .step, .gcode, .obj or .zip.` };
  }
  const BUCKET = opts.bucket ?? "project-files";
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "You are signed out. Sign in again and retry." };

  const base = `${auth.user.id}/${projectId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const type = contentTypeFor(file, opts.mode);
  const up = await supabase.storage.from(BUCKET).upload(base, file, { contentType: type, upsert: false });
  if (up.error) return { ok: false, error: `Upload failed: ${up.error.message}` };

  let display: string | null = null;
  let w: number | null = null, h: number | null = null;
  if (opts.optimize && IMAGE_MIME.includes(type)) {
    const r = await resizeTo640(file);
    if (r) {
      w = r.origW; h = r.origH;
      if (r.blob !== file) {
        const dpath = `${auth.user.id}/${projectId}/${crypto.randomUUID()}-display-${safeFilename(file.name).replace(/\.[^.]+$/, "")}.jpg`;
        const d = await supabase.storage.from(BUCKET).upload(dpath, r.blob, { contentType: "image/jpeg", upsert: false });
        if (!d.error) display = dpath;
      }
    }
  }
  return {
    ok: true,
    meta: { storage_path: base, display_path: display, original_filename: file.name, mime_type: type, size_bytes: file.size, width_px: w, height_px: h },
  };
}

// Best effort: used when registering the upload failed, so orphaned objects do not pile up.
export async function discardUpload(meta: UploadedMeta, bucket: "project-files" | "component-files" = "project-files") {
  const supabase = createClient();
  await supabase.storage.from(bucket).remove([meta.storage_path, ...(meta.display_path ? [meta.display_path] : [])]);
}
