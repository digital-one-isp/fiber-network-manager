import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResellerForm from "@/components/reseller-form";

const mediaLabel: Record<string, string> = {
  sfp: "SFP",
  sfp_plus: "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP",
  rj45: "RJ45",
};

const colorHex: Record<string, string> = {
  Blue: "#2563eb", Orange: "#ea580c", Green: "#16a34a", Brown: "#78350f",
  Slate: "#64748b", White: "#e5e7eb", Red: "#dc2626", Black: "#111827",
  Yellow: "#eab308", Violet: "#7c3aed", Rose: "#f43f5e", Aqua: "#06b6d4",
};

type PortRow = {
  id: string;
  port_number: number;
  label: string | null;
  speed: string;
  media: string;
  status: string;
  sfp_module: string | null;
  vlan: number | null;
  bandwidth_mbps: number | null;
  network_switches: { id: string; name: string } | null;
  fiber_cables: { name: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
};

export default async function ResellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("resellers").select("*").eq("id", id).single();
  if (!data) notFound();

  const { data: portData } = await supabase
    .from("switch_ports")
    .select(
      "id, port_number, label, speed, media, status, sfp_module, vlan, bandwidth_mbps, network_switches(id, name), fiber_cables(name), fiber_cores(core_number, color)"
    )
    .eq("reseller_id", id)
    .order("port_number");

  const ports = (portData ?? []) as unknown as PortRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Edit Reseller</h1>
        <p className="mb-6 text-xs text-gray-400">ID: {id}</p>
        <ResellerForm
          mode="edit"
          id={id}
          initial={{
            name: data.name ?? "",
            contact_person: data.contact_person ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            address: data.address ?? "",
            latitude: data.latitude !== null ? String(data.latitude) : "",
            longitude: data.longitude !== null ? String(data.longitude) : "",
            bandwidth_mbps: data.bandwidth_mbps !== null ? String(data.bandwidth_mbps) : "",
            status: data.status ?? "active",
            notes: data.notes ?? "",
          }}
        />
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Connected through</h2>
        <p className="mb-3 text-sm text-gray-500">
          The switch ports that hand this reseller its fiber and SFP. Change them from the
          switch page.
        </p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Switch</th>
                <th className="px-4 py-3 font-medium text-gray-500">Port</th>
                <th className="px-4 py-3 font-medium text-gray-500">Speed</th>
                <th className="px-4 py-3 font-medium text-gray-500">SFP and service</th>
                <th className="px-4 py-3 font-medium text-gray-500">Fiber</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    {p.network_switches ? (
                      <Link
                        href={`/switches/${p.network_switches.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {p.network_switches.name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {p.label || `Port ${p.port_number}`}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.speed}
                    <span className="block text-xs text-gray-500">
                      {mediaLabel[p.media] ?? p.media}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="block">{p.sfp_module ?? "SFP not set"}</span>
                    {(p.vlan !== null || p.bandwidth_mbps !== null) && (
                      <span className="block text-xs text-gray-500">
                        {[
                          p.vlan !== null ? `VLAN ${p.vlan}` : null,
                          p.bandwidth_mbps !== null ? `${p.bandwidth_mbps} Mbps` : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.fiber_cables ? (
                      <span className="flex items-center gap-1.5">
                        {p.fiber_cables.name}
                        {p.fiber_cores && (
                          <>
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-gray-300"
                              style={{
                                backgroundColor: colorHex[p.fiber_cores.color] ?? "#999",
                              }}
                            />
                            Core {p.fiber_cores.core_number}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not recorded</span>
                    )}
                  </td>
                </tr>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No switch port serves this reseller yet. Open a switch, edit a port and
                    choose this reseller.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
