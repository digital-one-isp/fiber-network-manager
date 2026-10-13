import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SwitchForm from "@/components/switch-form";
import SwitchPorts from "@/components/switch-ports";

export default async function SwitchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("network_switches")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Edit Switch</h1>
        <SwitchForm
          mode="edit"
          id={id}
          initial={{
            name: data.name ?? "",
            vendor: data.vendor ?? "",
            model: data.model ?? "",
            management_ip: data.management_ip ?? "",
            role: data.role ?? "aggregation",
            ports_1g: String(data.ports_1g ?? 0),
            ports_10g: String(data.ports_10g ?? 0),
            latitude: data.latitude !== null ? String(data.latitude) : "",
            longitude: data.longitude !== null ? String(data.longitude) : "",
            address: data.address ?? "",
            status: data.status ?? "active",
            notes: data.notes ?? "",
          }}
        />
      </div>

      <SwitchPorts switchId={id} />
    </div>
  );
}
