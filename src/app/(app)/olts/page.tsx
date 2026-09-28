import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function OltsPage() {
  const supabase = await createClient();

  const { data: olts, error } = await supabase
    .from("olts")
    .select("id, name, vendor, model, total_pon_ports, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">OLTs</h1>
        <Link
          href="/olts/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add OLT
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
              <th className="px-4 py-3 font-medium text-gray-500">Vendor</th>
              <th className="px-4 py-3 font-medium text-gray-500">Model</th>
              <th className="px-4 py-3 font-medium text-gray-500">PON Ports</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {olts && olts.length > 0 ? (
              olts.map((olt) => (
                <tr
                  key={olt.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/olts/${olt.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {olt.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{olt.vendor ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{olt.model ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{olt.total_pon_ports}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {olt.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No OLTs yet. Click &ldquo;Add OLT&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
