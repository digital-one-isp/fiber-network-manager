import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function FiberCablesPage() {
  const supabase = await createClient();

  const { data: cables, error } = await supabase
    .from("fiber_cables")
    .select("id, name, cable_type, core_count, status, olts(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Fiber Cables</h1>
        <Link
          href="/fiber-cables/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Cable
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
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Cores</th>
              <th className="px-4 py-3 font-medium text-gray-500">From OLT</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {cables && cables.length > 0 ? (
              cables.map((cable) => (
                <tr
                  key={cable.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/fiber-cables/${cable.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {cable.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">
                    {cable.cable_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{cable.core_count}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(cable.olts as unknown as { name: string } | null)?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {cable.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No fiber cables yet. Click &ldquo;Add Cable&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
