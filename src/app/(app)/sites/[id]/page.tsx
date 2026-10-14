import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteForm from "@/components/site-form";
import SiteEquipment from "@/components/site-equipment";
import { upstreamKindLabel } from "@/components/upstream-form";

type UpstreamRow = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  capacity_mbps: number | null;
  status: string;
};

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("sites").select("*").eq("id", id).single();
  if (!data) notFound();

  const { data: upData } = await supabase
    .from("upstream_providers")
    .select("id, name, kind, service, capacity_mbps, status")
    .eq("site_id", id)
    .order("name");
  const upstreams = (upData ?? []) as unknown as UpstreamRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Edit Site</h1>
        <p className="mb-6 text-xs text-gray-400">ID: {id}</p>
        <SiteForm
          mode="edit"
          id={id}
          initial={{
            name: data.name ?? "",
            site_type: data.site_type ?? "pop",
            address: data.address ?? "",
            latitude: data.latitude !== null ? String(data.latitude) : "",
            longitude: data.longitude !== null ? String(data.longitude) : "",
            contact_person: data.contact_person ?? "",
            phone: data.phone ?? "",
            status: data.status ?? "active",
            notes: data.notes ?? "",
          }}
        />
      </div>

      <SiteEquipment siteId={id} />

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Upstream links ending here</h2>
        <p className="mb-4 text-sm text-gray-500">
          Providers whose link terminates at this site. Set the site on the upstream ISP page.
        </p>
        <ul className="space-y-1.5">
          {upstreams.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <div>
                <Link
                  href={`/upstreams/${u.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {u.name}
                </Link>
                <span className="block text-xs text-gray-500">
                  {upstreamKindLabel[u.kind] ?? u.kind}
                  {u.service ? `, ${u.service}` : ""}
                </span>
              </div>
              <span className="text-xs text-gray-600">
                {u.capacity_mbps !== null ? `${u.capacity_mbps} Mbps` : "Capacity not set"}
              </span>
            </li>
          ))}
          {upstreams.length === 0 && (
            <li className="text-xs text-gray-400">No upstream link ends at this site yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
