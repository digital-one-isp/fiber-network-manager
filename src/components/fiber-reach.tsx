"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Terminal = { kind: string; ref_id: string; label: string; detail: string | null };
type Hop = {
  box_name: string;
  a_cable: string;
  a_core: number;
  b_cable: string;
  b_core: number;
};

const kindText: Record<string, string> = {
  olt_port: "OLT PON port",
  olt_uplink: "OLT uplink",
  switch_port: "Switch port",
  splitter: "Splitter input",
  box_customer: "Customer on a TG box",
};

export default function FiberReach({
  coreId,
  selfId,
}: {
  coreId: string;
  selfId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<{ terminals: Terminal[]; hops: Hop[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    Promise.all([
      supabase.rpc("fiber_terminals", { p_core: coreId }),
      supabase.rpc("fiber_hops", { p_core: coreId }),
    ]).then(([t, h]) => {
      if (cancelled) return;
      if (t.error || h.error) {
        setError((t.error ?? h.error)?.message ?? "Could not check this fiber.");
        return;
      }
      setData({
        terminals: (t.data ?? []) as unknown as Terminal[],
        hops: (h.data ?? []) as unknown as Hop[],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [coreId, supabase]);

  if (error) {
    return <p className="mt-2 text-xs text-gray-400">Could not check this fiber: {error}</p>;
  }
  if (!data) {
    return <p className="mt-2 text-xs text-gray-400">Checking where this fiber leads...</p>;
  }

  const others = data.terminals.filter((t) => t.ref_id !== selfId);

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">
      <p className="font-medium text-slate-800">Where this fiber leads</p>

      {data.hops.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {data.hops.map((h, i) => (
            <li key={i}>
              Joined in {h.box_name}: {h.a_cable} core {h.a_core} to {h.b_cable} core {h.b_core}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-slate-500">This core is not spliced to another cable.</p>
      )}

      {others.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-slate-200 pt-2">
          {others.map((t) => (
            <li key={t.kind + t.ref_id}>
              <span className="text-slate-500">{kindText[t.kind] ?? t.kind}:</span> {t.label}
              {t.detail ? `, ${t.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">
          No other device uses this fiber yet.
        </p>
      )}

      <p className="mt-2 text-slate-500">
        When an OLT uplink and a switch port are on the same fiber, they are linked automatically
        on save. If nothing matches, choose the switch port yourself.
      </p>
    </div>
  );
}
