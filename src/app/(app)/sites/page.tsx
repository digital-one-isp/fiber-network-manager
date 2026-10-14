import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { siteTypeLabel } from "@/components/site-form";

type SiteRow = {
  id: string;
  name: string;
  site_type: string;
  address: string | null;
  status: string;
  olts: { id: string }[];
  network_switches: { id: string }[];
  upstream_providers: { id: string }[];
};

export default async function SitesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sites")
    .select(
      "id, name, site_type, address, status, olts(id), network_switches(id), upstream_providers(id)"
    )
    .order("name");

  const sites = (data ?? []) as unknown as SiteRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sites</h1>
        <Link
          href="/sites/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Site
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
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Address</th>
              <th className="px-4 py-3 font-medium text-gray-500">OLTs</th>
              <th className="px-4 py-3 font-medium text-gray-500">Switches</th>
              <th className="px-4 py-3 font-medium text-gray-500">Upstreams</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {sites.length > 0 ? (
              sites.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/sites/${s.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {siteTypeLabel[s.site_type] ?? s.site_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.address ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{s.olts.length}</td>
                  <td className="px-4 py-3 text-gray-600">{s.network_switches.length}</td>
                  <td className="px-4 py-3 text-gray-600">{s.upstream_providers.length}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No sites yet. Start with your Office / NOC.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
