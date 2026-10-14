import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ResellerRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  bandwidth_mbps: number | null;
  status: string;
  switch_ports: { id: string }[];
};

export default async function ResellersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resellers")
    .select("id, name, contact_person, phone, bandwidth_mbps, status, switch_ports(id)")
    .order("name");

  const resellers = (data ?? []) as unknown as ResellerRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Resellers</h1>
        <Link
          href="/resellers/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Reseller
        </Link>
      </div>

      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
              <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
              <th className="px-4 py-3 font-medium text-gray-500">Bandwidth</th>
              <th className="px-4 py-3 font-medium text-gray-500">Switch ports</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {resellers.length > 0 ? (
              resellers.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/resellers/${r.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.contact_person ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.phone ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.bandwidth_mbps !== null ? `${r.bandwidth_mbps} Mbps` : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.switch_ports.length}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No resellers yet. Click &ldquo;Add Reseller&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
