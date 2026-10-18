import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// QR scan target: resolves a label token to the component or location it was printed for.
export default async function ScanPage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  if (!uuid.test(token)) notFound();
  const supabase = await createClient();
  const { data: comp } = await supabase.from("electronic_components").select("id").eq("qr_token", token).maybeSingle();
  if (comp) redirect(`/electronics/inventory/${comp.id}`);
  const { data: loc } = await supabase.from("component_storage_locations").select("id").eq("qr_token", token).maybeSingle();
  if (loc) redirect(`/electronics/locations/${loc.id}`);
  notFound();
}
