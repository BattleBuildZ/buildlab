// Shared (client + server) helpers for uploads. Originals are always kept as uploaded; images additionally get a
// small display copy (max 640 px on the long side) so lists and the viewer load fast.

export const DISPLAY_MAX_PX = 640;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the project-files bucket limit

export const ASSET_KINDS = ["thumbnail", "piece_image", "step_image", "plan_pdf", "drawing", "print_file", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const FILE_KIND_LABEL: Record<string, string> = {
  plan_pdf: "Plan PDF",
  drawing: "Drawing",
  piece_image: "Photo",
  step_image: "Step photo",
  thumbnail: "Project photo",
  print_file: "Print file",
  other: "Other",
};

// Print-file extensions and the MIME type each is uploaded as. All of these are allowed by the bucket.
export const PRINT_EXT_MIME: Record<string, string> = {
  stl: "model/stl",
  "3mf": "model/3mf",
  gcode: "text/x.gcode",
  step: "application/step",
  stp: "application/step",
  obj: "application/octet-stream",
  zip: "application/zip",
};
export const PRINT_ACCEPT = Object.keys(PRINT_EXT_MIME).map((e) => `.${e}`).join(",");
export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function safeFilename(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  return (cleaned || "file").slice(-120);
}

export function fmtBytes(n: number | string | null | undefined) {
  const b = Number(n ?? 0);
  if (!b) return "0 KB";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
