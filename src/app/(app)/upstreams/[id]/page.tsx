import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UpstreamForm from "@/components/upstream-form";

const mediaLabel: Record<string, string> = {
  sfp: "SFP",
  sfp_plus: "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP",
  rj45: "RJ45",
};

type PortRow = {
  id: string;
  port_number: number;
  label: string | null;
  speed: string;
  media: string;
  sfp_module: string | null;
  vlan: number | null;
  bandwidth_mbps: number | null;
  network_switches: { id: string; name: string } | null;
};

export default async function UpstreamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("upstream_providers")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const { data: portData } = await supabase
    .from("switch_ports")
    .select(
      "id, port_number, label, speed, media, sfp_module, vlan, bandwidth_mbps, network_switches(id, name)"
    )
    .eq("upstream_id", id)
    .order("port_number");
  const ports = (portData ?? []) as unknown as PortRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Edit Upstream ISP</h1>
        <p className="mb-6 text-xs text-gray-400">ID: {id}</p>
        <UpstreamForm
          mode="edit"
          id={id}
          initial={{
            name: data.name ?? "",
            kind: data.kind ?? "iig",
            service: data.service ?? "",
            circuit_id: data.circuit_id ?? "",
            capacity_mbps: data.capacity_mbps !== null ? String(data.capacity_mbps) : "",
            site_id: data.site_id ?? "",
            contact_person: data.contact_person ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            status: data.status ?? "active",
            notes: data.notes ?? "",
          }}
        />
      </div>

      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Handed over on</h2>
        <p className="mb-3 text-sm text-gray-500">
          The switch ports where this upstream link comes in.
        </p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Switch</th>
                <th className="px-4 py-3 font-medium text-gray-500">Port</th>
                <th className="px-4 py-3 font-medium text-gray-500">Speed</th>
                <th className="px-4 py-3 font-medium text-gray-500">SFP and service</th>
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
                </tr>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No switch port is linked to this upstream yet.
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
