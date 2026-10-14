"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Kind = "olts" | "network_switches";
type Item = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  site_id: string | null;
  sites: { name: string } | null;
};

export default function SiteEquipment({ siteId }: { siteId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [olts, setOlts] = useState<Item[]>([]);
  const [switches, setSwitches] = useState<Item[]>([]);
  const [addOlt, setAddOlt] = useState("");
  const [addSwitch, setAddSwitch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase
        .from("olts")
        .select("id, name, vendor, model, site_id, sites(name)")
        .order("name"),
      supabase
        .from("network_switches")
        .select("id, name, vendor, model, site_id, sites(name)")
        .order("name"),
    ]);
    setOlts((o ?? []) as unknown as Item[]);
    setSwitches((s ?? []) as unknown as Item[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function setSite(kind: Kind, id: string, value: string | null) {
    setError(null);
    const { error } = await supabase.from(kind).update({ site_id: value }).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    if (kind === "olts") setAddOlt("");
    else setAddSwitch("");
    await load();
  }

  function column(
    title: string,
    kind: Kind,
    items: Item[],
    hrefBase: string,
    pick: string,
    setPick: (v: string) => void
  ) {
    const here = items.filter((i) => i.site_id === siteId);
    const others = items.filter((i) => i.site_id !== siteId);
    return (
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          {title} ({here.length})
        </h3>
        <ul className="space-y-1.5">
          {here.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <div>
                <Link
                  href={`${hrefBase}/${i.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {i.name}
                </Link>
                <span className="block text-xs text-gray-500">
                  {[i.vendor, i.model].filter(Boolean).join(" ") || "Device not set"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSite(kind, i.id, null)}
                className="text-xs text-red-500 hover:underline"
              >
                Remove from site
              </button>
            </li>
          ))}
          {here.length === 0 && (
            <li className="text-xs text-gray-400">Nothing placed at this site yet.</li>
          )}
        </ul>
        <div className="mt-3 flex gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Place existing equipment here...</option>
            {others.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.sites ? ` (now at ${i.sites.name})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick}
            onClick={() => setSite(kind, pick, siteId)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Place
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Equipment at this site</h2>
      <p className="mb-4 text-sm text-gray-500">
        Choose which OLTs and switches are installed here.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {column("OLTs", "olts", olts, "/olts", addOlt, setAddOlt)}
        {column("Switches", "network_switches", switches, "/switches", addSwitch, setAddSwitch)}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
