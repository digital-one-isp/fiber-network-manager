import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OltConnectionForm from "@/components/olt-connection-form";
import OltOnuMonitor from "@/components/olt-onu-monitor";

export default async function OltMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: olt } = await supabase
    .from("olts")
    .select("id, name, vendor, model")
    .eq("id", id)
    .single();
  if (!olt) notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/monitoring" className="text-xs text-blue-600 hover:underline">
          All OLTs
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">{olt.name}</h1>
        <p className="text-sm text-gray-500">
          {[olt.vendor, olt.model].filter(Boolean).join(" ") || "Device not set"}
          {" · "}
          <Link href={`/olts/${olt.id}`} className="text-blue-600 hover:underline">
            Open the OLT page
          </Link>
        </p>
      </div>
      <OltConnectionForm oltId={id} />
      <OltOnuMonitor oltId={id} />
    </div>
  );
}
