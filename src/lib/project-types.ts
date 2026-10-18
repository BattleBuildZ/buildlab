import type { FabricationType } from "./fabrication";

export type Assembly = { id: string; name: string; fabrication_type: FabricationType; sort_order: number };
export type Dimension = { id: string; label: string; mm: number | string | null; inch: number | string | null; sort_order: number };
export type CutUnit = { id: string; unit_index: number; completed_at: string | null };
export type CutItem = {
  id: string;
  assembly_id: string;
  name: string;
  material: string | null;
  quantity: number;
  fabrication_note: string | null;
  product_url: string | null;
  needs_review: boolean;
  review_note: string | null;
  sort_order: number;
  cut_item_dimensions: Dimension[];
  cut_units: CutUnit[];
};
export type Hardware = {
  id: string;
  name: string;
  quantity_required: number | string | null;
  quantity_acquired: number | string | null;
  notes: string | null;
  product_url: string | null;
  is_ready: boolean;
  sort_order: number;
};
export type Phase = { id: string; name: string; sort_order: number };
export type Step = {
  id: string;
  phase_id: string | null;
  title: string;
  instructions: string | null;
  completed_at: string | null;
  sort_order: number;
};
