import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function SplittersPage() {
  const supabase = await createClient();

  const { data: splitters, error } = await supabase
    .from("splitters")
    .select("id, name, ratio, status, tg_boxes(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Splitters</h1>
        <Link
          href="/splitters/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add Splitter
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
              <th className="px-4 py-3 font-medium text-gray-500">Ratio</th>
              <th className="px-4 py-3 font-medium text-gray-500">TG Box</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitters && splitters.length > 0 ? (
              splitters.map((sp) => (
                <tr
                  key={sp.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/splitters/${sp.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {sp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{sp.ratio}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(sp.tg_boxes as unknown as { name: string } | null)?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {sp.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No splitters yet. Click &ldquo;Add Splitter&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
