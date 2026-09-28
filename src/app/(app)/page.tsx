import { createClient } from "@/lib/supabase/server";

async function getCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filter?: { column: string; value: string }
) {
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }
  const { count } = await query;
  return count ?? 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [olts, cables, customers, openFaults] = await Promise.all([
    getCount(supabase, "olts"),
    getCount(supabase, "fiber_cables"),
    getCount(supabase, "customers"),
    getCount(supabase, "faults", { column: "status", value: "open" }),
  ]);

  const stats = [
    { label: "Total OLTs", value: olts },
    { label: "Fiber Cables", value: cables },
    { label: "Customers", value: customers },
    { label: "Open Faults", value: openFaults },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
