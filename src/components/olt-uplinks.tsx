"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const speedOptions = ["1G", "2.5G", "10G", "25G", "40G", "100G"];

type Uplink = {
  id: string;
  label: string | null;
  speed: string;
  sfp_module: string | null;
  description: string | null;
  switch_port_id: string | null;
  switch_ports: {
    id: string;
    port_number: number;
    label: string | null;
    network_switches: { id: string; name: string } | null;
  } | null;
};
type PortOpt = {
  id: string;
  port_number: number;
  label: string | null;
  speed: string;
  reseller_id: string | null;
  upstream_id: string | null;
  network_switches: { id: string; name: string } | null;
};
type Draft = {
  label: string;
  speed: string;
  sfp_module: string;
  switch_port_id: string;
  description: string;
};

const emptyDraft: Draft = {
  label: "",
  speed: "10G",
  sfp_module: "",
  switch_port_id: "",
  description: "",
};

export default function OltUplinks({ oltId }: { oltId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [uplinks, setUplinks] = useState<Uplink[]>([]);
  const [ports, setPorts] = useState<PortOpt[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: mine }, { data: all }, { data: portData }] = await Promise.all([
      supabase
        .from("olt_uplinks")
        .select(
          "id, label, speed, sfp_module, description, switch_port_id, switch_ports(id, port_number, label, network_switches(id, name))"
        )
        .eq("olt_id", oltId)
        .order("created_at"),
      supabase.from("olt_uplinks").select("switch_port_id"),
      supabase
        .from("switch_ports")
        .select(
          "id, port_number, label, speed, reseller_id, upstream_id, network_switches(id, name)"
        )
        .order("switch_id")
        .order("port_number")
        .limit(1000),
    ]);
    setUplinks((mine ?? []) as unknown as Uplink[]);
    setPorts((portData ?? []) as unknown as PortOpt[]);
    setUsedIds(
      new Set(
        ((all ?? []) as unknown as { switch_port_id: string | null }[])
          .map((r) => r.switch_port_id)
          .filter((x): x is string => !!x)
      )
    );
  }, [supabase, oltId]);

  useEffect(() => {
    load();
  }, [load]);

  function portOptions(current: string) {
    const groups = new Map<string, { name: string; list: PortOpt[] }>();
    for (const p of ports) {
      if (p.reseller_id || p.upstream_id) continue;
      if (usedIds.has(p.id) && p.id !== current) continue;
      const key = p.network_switches?.id ?? "none";
      const g = groups.get(key) ?? { name: p.network_switches?.name ?? "Switch", list: [] };
      g.list.push(p);
      groups.set(key, g);
    }
    return Array.from(groups.entries()).map(([key, g]) => (
      <optgroup key={key} label={g.name}>
        {g.list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label || `Port ${p.port_number}`} ({p.speed})
          </option>
        ))}
      </optgroup>
    ));
  }

  function fields(d: Draft, set: (d: Draft) => void) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Uplink name</label>
          <input
            value={d.label}
            onChange={(e) => set({ ...d, label: e.target.value })}
            placeholder="e.g. Uplink 1"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Speed</label>
          <select
            value={d.speed}
            onChange={(e) => set({ ...d, speed: e.target.value })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {speedOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">SFP module</label>
          <input
            value={d.sfp_module}
            onChange={(e) => set({ ...d, sfp_module: e.target.value })}
            placeholder="e.g. 10G LR SFP+, 10 km"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Connected to switch port
          </label>
          <select
            value={d.switch_port_id}
            onChange={(e) => set({ ...d, switch_port_id: e.target.value })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">(not connected yet)</option>
            {portOptions(d.switch_port_id)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
          <input
            value={d.description}
            onChange={(e) => set({ ...d, description: e.target.value })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>
    );
  }

  function payload(d: Draft) {
    return {
      label: d.label || null,
      speed: d.speed,
      sfp_module: d.sfp_module || null,
      switch_port_id: d.switch_port_id || null,
      description: d.description || null,
    };
  }

  async function addUplink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("olt_uplinks")
      .insert({ olt_id: oltId, ...payload(adding) });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAdding(emptyDraft);
    await load();
  }

  function startEdit(u: Uplink) {
    setError(null);
    setEditingId(u.id);
    setDraft({
      label: u.label ?? "",
      speed: u.speed,
      sfp_module: u.sfp_module ?? "",
      switch_port_id: u.switch_port_id ?? "",
      description: u.description ?? "",
    });
  }

  async function saveEdit(id: string) {
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("olt_uplinks").update(payload(draft)).eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    await load();
  }

  async function removeUplink(id: string) {
    if (!confirm("Remove this uplink?")) return;
    setError(null);
    const { error } = await supabase.from("olt_uplinks").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Uplinks</h2>
        <p className="text-sm text-gray-500">
          The ports on this OLT that go up to a switch, and the switch port each one plugs into.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Uplink</th>
              <th className="px-4 py-3 font-medium text-gray-500">Speed and SFP</th>
              <th className="px-4 py-3 font-medium text-gray-500">Connected to</th>
              <th className="px-4 py-3 font-medium text-gray-500">Description</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {uplinks.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.label || "Uplink"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {u.speed}
                    <span className="block text-xs text-gray-500">
                      {u.sfp_module ?? "SFP not set"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.switch_ports?.network_switches ? (
                      <>
                        <Link
                          href={`/switches/${u.switch_ports.network_switches.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {u.switch_ports.network_switches.name}
                        </Link>
                        <span className="block text-xs text-gray-500">
                          {u.switch_ports.label || `Port ${u.switch_ports.port_number}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">Not connected yet</span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-600">
                    {u.description ?? <span className="text-gray-400">No description</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {editingId === u.id ? "Close" : "Edit"}
                    </button>
                  </td>
                </tr>
                {editingId === u.id && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={5} className="px-4 py-4">
                      {fields(draft, setDraft)}
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => saveEdit(u.id)}
                          disabled={busy}
                          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {busy ? "Saving..." : "Save uplink"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => removeUplink(u.id)}
                          className="ml-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Remove uplink
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {uplinks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No uplink recorded for this OLT yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={addUplink}
        className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4"
      >
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          Add an uplink
        </p>
        {fields(adding, setAdding)}
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Add uplink
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
