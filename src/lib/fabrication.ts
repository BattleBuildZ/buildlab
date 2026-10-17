export const FABRICATION_TYPES = ["woodworking", "metalworking", "3d_printing", "electronics"] as const;
export type FabricationType = (typeof FABRICATION_TYPES)[number];

export const FABRICATION_LABEL: Record<FabricationType, string> = {
  woodworking: "Woodworking",
  metalworking: "Metalworking",
  "3d_printing": "3D printing",
  electronics: "Electronics",
};

export const FABRICATION_BADGE: Record<FabricationType, string> = {
  woodworking: "badge-wood",
  metalworking: "badge-metal",
  "3d_printing": "badge-3d",
  electronics: "badge-elec",
};

export const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};
