import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const roleLabel: Record<string, string> = {
  core: "Core",
  aggregation: "Aggregation",
  access: "Access",
  other: "Other",
};

const speedOrder = ["100M", "1G", "2.5G", "10G", "25G", "40G", "100G"];

type PortLite = {
  speed: string;
  reseller_id: string | null;
  cable_id: string | null;
};
type SwitchRow = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  role: string;
  status: string;
  switch_ports: PortLite[];
};

export default async function SwitchesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("network_switches")
    .select(
      "id, name, vendor, model, role, status, switch_ports(speed, reseller_id, cable_id)"
    )
    .order("name");

  const switches = (data ?? []) as unknown as SwitchRow[];

  function portSummary(ports: PortLite[]) {
    const counts = new Map<string, number>();
    for (const p of ports) counts.set(p.speed, (counts.get(p.speed) ?? 0) + 1);
    const parts = speedOrder
      .filter((s) => counts.has(s))
      .map((s) => `${counts.get(s)}x${s}`);
    return parts.length > 0 ? parts.join(", ") : "No ports";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Switches</h1>
        <Link
          href="/switches/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Switch
        </Link>
      </div>

      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Device</th>
              <th className="px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 font-medium text-gray-500">Ports</th>
              <th className="px-4 py-3 font-medium text-gray-500">Connected</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {switches.length > 0 ? (
              switches.map((s) => {
                const connected = s.switch_ports.filter(
                  (p) => p.cable_id || p.reseller_id
                ).length;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/switches/${s.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {[s.vendor, s.model].filter(Boolean).join(" ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {roleLabel[s.role] ?? s.role}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {portSummary(s.switch_ports)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {connected} of {s.switch_ports.length}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No switches yet. Click &ldquo;Add Switch&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
