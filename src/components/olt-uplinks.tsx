"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FiberReach from "@/components/fiber-reach";

const speedOptions = ["100M", "1G", "2.5G", "10G", "25G", "40G", "100G"];
const mediaOptions = [
  { value: "sfp", label: "SFP" },
  { value: "sfp_plus", label: "SFP+" },
  { value: "sfp28", label: "SFP28" },
  { value: "qsfp", label: "QSFP" },
  { value: "rj45", label: "RJ45 (copper)" },
];
const mediaLabel: Record<string, string> = {
  sfp: "SFP",
  sfp_plus: "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP",
  rj45: "RJ45",
};
const roleOptions = [
  { value: "uplink", label: "Uplink" },
  { value: "management", label: "Management" },
  { value: "other", label: "Other" },
];
const roleLabel: Record<string, string> = {
  uplink: "Uplink",
  management: "Management",
  other: "Other",
};
const statusOptions = ["free", "active", "reserved", "faulty", "disabled"];
const linkOptions = [
  { value: "fiber", label: "Fiber (patch cord or cable)" },
  { value: "dac", label: "DAC cable (direct attach)" },
  { value: "cat5e", label: "RJ45 Cat5e" },
  { value: "cat6", label: "RJ45 Cat6" },
  { value: "cat6a", label: "RJ45 Cat6a" },
  { value: "other", label: "Other" },
];
const linkLabel: Record<string, string> = {};
for (const o of linkOptions) linkLabel[o.value] = o.label;
function linkText(
  type: string | null | undefined,
  len: number | string | null | undefined
) {
  if (!type) return null;
  const base = linkLabel[type] ?? type;
  return len !== null && len !== undefined && len !== "" ? `${base}, ${len} m` : base;
}
function linkHint(media: string, type: string) {
  if (type === "dac" && media === "rj45") {
    return "A DAC cable needs an SFP, SFP+ or SFP28 port, not an RJ45 port.";
  }
  if (["cat5e", "cat6", "cat6a"].includes(type) && media !== "rj45") {
    return "Cat5e, Cat6 and Cat6a cables plug into RJ45 ports. Choose an RJ45 port type, or an RJ45 SFP module.";
  }
  return null;
}
const statusCls: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  faulty: "bg-red-50 text-red-700",
  disabled: "bg-slate-200 text-slate-700",
};

const presets = [
  { key: "ge", label: "1G SFP", speed: "1G", media: "sfp", role: "uplink", prefix: "GE" },
  { key: "xge", label: "10G SFP+", speed: "10G", media: "sfp_plus", role: "uplink", prefix: "XGE" },
  { key: "eth", label: "RJ45 (1G)", speed: "1G", media: "rj45", role: "uplink", prefix: "ETH" },
  { key: "mgmt", label: "RJ45 management", speed: "1G", media: "rj45", role: "management", prefix: "MGMT" },
];

type PortRow = {
  id: string;
  label: string | null;
  speed: string;
  media: string;
  role: string;
  status: string;
  sfp_module: string | null;
  description: string | null;
  link_type: string | null;
  link_length_m: number | string | null;
  link_note: string | null;
  cable_id: string | null;
  core_id: string | null;
  fiber_cables: { name: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
  link_auto: boolean;
  switch_port_id: string | null;
  switch_ports: {
    id: string;
    port_number: number;
    label: string | null;
    network_switches: { id: string; name: string } | null;
  } | null;
};
type SwitchPortOpt = {
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
  media: string;
  role: string;
  status: string;
  sfp_module: string;
  switch_port_id: string;
  description: string;
  link_type: string;
  link_length_m: string;
  link_note: string;
  cable_id: string;
  core_id: string;
};

export default function OltUplinks({ oltId }: { oltId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [switchPorts, setSwitchPorts] = useState<SwitchPortOpt[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [presetKey, setPresetKey] = useState("xge");
  const [cables, setCables] = useState<
    { id: string; name: string; cable_type: string; core_count: number }[]
  >([]);
  const [draftCores, setDraftCores] = useState<
    { id: string; core_number: number; color: string; status: string }[]
  >([]);
  const [count, setCount] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: mine }, { data: all }, { data: portData }] = await Promise.all([
      supabase
        .from("olt_uplinks")
        .select(
          "id, label, speed, media, role, status, sfp_module, description, link_type, link_length_m, link_note, cable_id, core_id, fiber_cables(name), fiber_cores(core_number, color), link_auto, switch_port_id, switch_ports(id, port_number, label, network_switches(id, name))"
        )
        .eq("olt_id", oltId)
        .order("created_at")
        .order("id"),
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
    setPorts((mine ?? []) as unknown as PortRow[]);
    setSwitchPorts((portData ?? []) as unknown as SwitchPortOpt[]);
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

  useEffect(() => {
    supabase
      .from("fiber_cables")
      .select("id, name, cable_type, core_count")
      .order("name")
      .then(({ data }) =>
        setCables(
          (data ?? []) as unknown as {
            id: string;
            name: string;
            cable_type: string;
            core_count: number;
          }[]
        )
      );
  }, [supabase]);

  function portOptions(current: string) {
    const groups = new Map<string, { name: string; list: SwitchPortOpt[] }>();
    for (const p of switchPorts) {
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

  async function loadCoresFor(cableId: string) {
    if (!cableId) {
      setDraftCores([]);
      return;
    }
    const { data } = await supabase
      .from("fiber_cores")
      .select("id, core_number, color, status")
      .eq("cable_id", cableId)
      .order("core_number");
    setDraftCores(
      (data ?? []) as unknown as {
        id: string;
        core_number: number;
        color: string;
        status: string;
      }[]
    );
  }

  async function createPorts(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const preset = presets.find((p) => p.key === presetKey);
    if (!preset) return;
    const n = Math.max(1, Math.min(48, Number(count) || 0));
    const existing = ports.filter((p) => (p.label ?? "").startsWith(preset.prefix + "-")).length;
    const rows = Array.from({ length: n }).map((_, i) => ({
      olt_id: oltId,
      label: `${preset.prefix}-${String(existing + i + 1).padStart(2, "0")}`,
      speed: preset.speed,
      media: preset.media,
      role: preset.role,
    }));
    setBusy(true);
    const { error } = await supabase.from("olt_uplinks").insert(rows);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  function startEdit(p: PortRow) {
    setError(null);
    setEditingId(p.id);
    setDraft({
      label: p.label ?? "",
      speed: p.speed,
      media: p.media,
      role: p.role,
      status: p.status,
      sfp_module: p.sfp_module ?? "",
      switch_port_id: p.switch_port_id ?? "",
      description: p.description ?? "",
      link_type: p.link_type ?? "",
      link_length_m: p.link_length_m !== null ? String(p.link_length_m) : "",
      link_note: p.link_note ?? "",
      cable_id: p.cable_id ?? "",
      core_id: p.core_id ?? "",
    });
    loadCoresFor(p.cable_id ?? "");
  }

  function setField<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("olt_uplinks")
      .update({
        label: draft.label || null,
        speed: draft.speed,
        media: draft.media,
        role: draft.role,
        status: draft.status,
        sfp_module: draft.sfp_module || null,
        switch_port_id: draft.switch_port_id || null,
        description: draft.description || null,
        link_type: draft.link_type || null,
        link_length_m: draft.link_length_m !== "" ? Number(draft.link_length_m) : null,
        link_note: draft.link_note || null,
        cable_id: draft.link_type === "fiber" ? draft.cable_id || null : null,
        core_id: draft.link_type === "fiber" ? draft.core_id || null : null,
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    setDraft(null);
    await load();
  }

  async function removePort(id: string) {
    if (!confirm("Delete this port?")) return;
    setError(null);
    const { error } = await supabase.from("olt_uplinks").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    await load();
  }

  const sfpCount = ports.filter((p) => p.media !== "rj45").length;
  const rjCount = ports.length - sfpCount;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SFP and RJ45 ports</h2>
          <p className="text-sm text-gray-500">
            The uplink and management ports of this OLT, besides the PON ports below.
          </p>
        </div>
        <p className="text-sm text-gray-600">
          {ports.length} ports ({sfpCount} SFP, {rjCount} RJ45)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Port</th>
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Connected to</th>
              <th className="px-4 py-3 font-medium text-gray-500">Module and description</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{p.label || "Port"}</span>
                    <span className="block text-xs text-gray-400">
                      {roleLabel[p.role] ?? p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.speed}
                    <span className="block text-xs text-gray-500">
                      {mediaLabel[p.media] ?? p.media}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusCls[p.status] ?? statusCls.free
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.switch_ports?.network_switches ? (
                      <>
                        <Link
                          href={`/switches/${p.switch_ports.network_switches.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {p.switch_ports.network_switches.name}
                        </Link>
                        <span className="block text-xs text-gray-500">
                          {p.switch_ports.label || `Port ${p.switch_ports.port_number}`}
                          {p.link_auto ? " (found from the fiber)" : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">Not connected</span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-600">
                    <span className="block">{p.sfp_module ?? "Module not set"}</span>
                    {linkText(p.link_type, p.link_length_m) && (
                      <span className="block text-xs text-gray-500">
                        Linked with {linkText(p.link_type, p.link_length_m)}
                        {p.fiber_cables
                          ? `: ${p.fiber_cables.name}${
                              p.fiber_cores
                                ? `, core ${p.fiber_cores.core_number} (${p.fiber_cores.color})`
                                : ""
                            }`
                          : ""}
                      </span>
                    )}
                    {p.description && (
                      <span className="block text-xs text-gray-500">{p.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p))}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {editingId === p.id ? "Close" : "Edit"}
                    </button>
                  </td>
                </tr>

                {editingId === p.id && draft && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Label
                          </label>
                          <input
                            value={draft.label}
                            onChange={(e) => setField("label", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Speed
                          </label>
                          <select
                            value={draft.speed}
                            onChange={(e) => setField("speed", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {speedOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Port type
                          </label>
                          <select
                            value={draft.media}
                            onChange={(e) => setField("media", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {mediaOptions.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Use
                          </label>
                          <select
                            value={draft.role}
                            onChange={(e) => setField("role", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {roleOptions.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Status
                          </label>
                          <select
                            value={draft.status}
                            onChange={(e) => setField("status", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            SFP module or cable
                          </label>
                          <input
                            value={draft.sfp_module}
                            onChange={(e) => setField("sfp_module", e.target.value)}
                            placeholder="e.g. 10G LR SFP+, 10 km, or Cat6 patch cord"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Connection type
                          </label>
                          <select
                            value={draft.link_type}
                            onChange={(e) => setField("link_type", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">(not set)</option>
                            {linkOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Cable length (m)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={draft.link_length_m}
                            onChange={(e) => setField("link_length_m", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Cable note
                          </label>
                          <input
                            value={draft.link_note}
                            onChange={(e) => setField("link_note", e.target.value)}
                            placeholder="e.g. 10G SFP+ DAC 3 m, or Cat6 patch cord"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          {linkHint(draft.media, draft.link_type) && (
                            <p className="mt-1 text-xs text-amber-700">
                              {linkHint(draft.media, draft.link_type)}
                            </p>
                          )}
                        </div>

                        {draft.link_type === "fiber" && (
                          <>
                            <div className="md:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Fiber cable (the cable this link runs on)
                              </label>
                              <select
                                value={draft.cable_id}
                                onChange={(e) => {
                                  setField("cable_id", e.target.value);
                                  setField("core_id", "");
                                  loadCoresFor(e.target.value);
                                }}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                              >
                                <option value="">(not recorded)</option>
                                {cables.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({c.cable_type}, {c.core_count} cores)
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">
                                Core
                              </label>
                              <select
                                value={draft.core_id}
                                onChange={(e) => setField("core_id", e.target.value)}
                                disabled={!draft.cable_id}
                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                              >
                                <option value="">(not chosen)</option>
                                {draftCores
                                  .filter((c) => c.status === "free" || c.id === draft.core_id)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      Core {c.core_number} ({c.color})
                                    </option>
                                  ))}
                              </select>
                              <p className="mt-1 text-xs text-gray-400">Only free cores are listed.</p>
                              {draft.core_id && (
                                <FiberReach coreId={draft.core_id} selfId={p.id} />
                              )}
                            </div>
                          </>
                        )}

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Connected to switch port
                          </label>
                          <select
                            value={draft.switch_port_id}
                            onChange={(e) => setField("switch_port_id", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">(not connected)</option>
                            {portOptions(draft.switch_port_id)}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Description
                          </label>
                          <input
                            value={draft.description}
                            onChange={(e) => setField("description", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => saveEdit(p.id)}
                          disabled={busy}
                          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {busy ? "Saving..." : "Save port"}
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
                          onClick={() => removePort(p.id)}
                          className="ml-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete port
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {ports.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No SFP or RJ45 port recorded for this OLT yet. Create them below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={createPorts}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Port type</label>
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">How many</label>
          <input
            type="number"
            min={1}
            max={48}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Create ports
        </button>
        <p className="w-full text-xs text-gray-500">
          Ports are named automatically (XGE-01, GE-01, ETH-01, MGMT-01). Edit a port afterwards to
          set its module, connection and description.
        </p>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
