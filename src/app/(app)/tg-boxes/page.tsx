import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const categoryLabels: Record<string, string> = {
  joint_2port: "Joint 2-Port",
  joint_4port: "Joint 4-Port",
  joint_8port: "Joint 8-Port",
  joint_16port: "Joint 16-Port",
  splitter_primary_main: "Splitter Primary Main",
  splitter_primary_2nd: "Splitter Primary 2nd",
  splitter_customer: "Splitter Customer",
};

export default async function TgBoxesPage() {
  const supabase = await createClient();

  const { data: boxes, error } = await supabase
    .from("tg_boxes")
    .select("id, name, box_category, box_type, capacity, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">TG / Joint Boxes</h1>
        <Link
          href="/tg-boxes/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Add TG Box
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
              <th className="px-4 py-3 font-medium text-gray-500">Category</th>
              <th className="px-4 py-3 font-medium text-gray-500">Mount</th>
              <th className="px-4 py-3 font-medium text-gray-500">Capacity</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {boxes && boxes.length > 0 ? (
              boxes.map((box) => (
                <tr
                  key={box.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/tg-boxes/${box.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {box.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {box.box_category
                      ? categoryLabels[box.box_category] ?? box.box_category
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">
                    {box.box_type.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{box.capacity}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {box.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No TG boxes yet. Click &ldquo;Add TG Box&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
