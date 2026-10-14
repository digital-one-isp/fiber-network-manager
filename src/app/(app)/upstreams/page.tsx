import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { upstreamKindLabel } from "@/components/upstream-form";

type UpstreamRow = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  capacity_mbps: number | null;
  status: string;
  sites: { name: string } | null;
};

export default async function UpstreamsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("upstream_providers")
    .select("id, name, kind, service, capacity_mbps, status, sites(name)")
    .order("name");

  const upstreams = (data ?? []) as unknown as UpstreamRow[];
  const totalMbps = upstreams.reduce((sum, u) => sum + (u.capacity_mbps ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Upstream ISPs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {upstreams.length} providers, {totalMbps} Mbps in total
          </p>
        </div>
        <Link
          href="/upstreams/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Upstream ISP
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
              <th className="px-4 py-3 font-medium text-gray-500">Service</th>
              <th className="px-4 py-3 font-medium text-gray-500">Capacity</th>
              <th className="px-4 py-3 font-medium text-gray-500">Ends at</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {upstreams.length > 0 ? (
              upstreams.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/upstreams/${u.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {upstreamKindLabel[u.kind] ?? u.kind}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.service ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.capacity_mbps !== null ? `${u.capacity_mbps} Mbps` : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.sites?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No upstream ISPs yet. Add the providers you buy bandwidth from.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
