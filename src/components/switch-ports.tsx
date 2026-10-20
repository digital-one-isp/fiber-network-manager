"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
const colorHex: Record<string, string> = {
  Blue: "#2563eb", Orange: "#ea580c", Green: "#16a34a", Brown: "#78350f",
  Slate: "#64748b", White: "#e5e7eb", Red: "#dc2626", Black: "#111827",
  Yellow: "#eab308", Violet: "#7c3aed", Rose: "#f43f5e", Aqua: "#06b6d4",
};

type PortRow = {
  id: string;
  port_number: number;
  label: string | null;
  speed: string;
  media: string;
  status: string;
  sfp_module: string | null;
  description: string | null;
  cable_id: string | null;
  core_id: string | null;
  reseller_id: string | null;
  upstream_id: string | null;
  link_type: string | null;
  link_length_m: number | string | null;
  link_note: string | null;
  vlan: number | null;
  bandwidth_mbps: number | null;
  notes: string | null;
  fiber_cables: { name: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
  resellers: { id: string; name: string } | null;
  upstream_providers: { id: string; name: string } | null;
};
type Opt = { id: string; name: string };
type OltLink = {
  oltId: string;
  oltName: string;
  label: string | null;
  linkType: string | null;
  linkLength: number | string | null;
  fiber: string | null;
};
type CableOpt = { id: string; name: string; cable_type: string; core_count: number };
type CoreOpt = { id: string; core_number: number; color: string; status: string };
type Draft = {
  label: string;
  speed: string;
  media: string;
  status: string;
  sfp_module: string;
  vlan: string;
  bandwidth_mbps: string;
  reseller_id: string;
  upstream_id: string;
  link_type: string;
  link_length_m: string;
  link_note: string;
  cable_id: string;
  core_id: string;
  description: string;
  notes: string;
};

export default function SwitchPorts({ switchId }: { switchId: string }) {
  const supabase = createClient();

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [cables, setCables] = useState<CableOpt[]>([]);
  const [resellers, setResellers] = useState<Opt[]>([]);
  const [upstreams, setUpstreams] = useState<Opt[]>([]);
  const [oltLinks, setOltLinks] = useState<Record<string, OltLink>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftCores, setDraftCores] = useState<CoreOpt[]>([]);
  const [portError, setPortError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [addLabel, setAddLabel] = useState("");
  const [addSpeed, setAddSpeed] = useState("1G");
  const [addMedia, setAddMedia] = useState("sfp");
  const [addError, setAddError] = useState<string | null>(null);

  async function loadOltLinks(ids: string[]) {
    if (ids.length === 0) {
      setOltLinks({});
      return;
    }
    const { data } = await supabase
      .from("olt_uplinks")
      .select("switch_port_id, label, link_type, link_length_m, fiber_cables(name), fiber_cores(core_number, color), olts(id, name)")
      .in("switch_port_id", ids);
    const map: Record<string, OltLink> = {};
    for (const u of (data ?? []) as unknown as {
      switch_port_id: string | null;
      label: string | null;
      link_type: string | null;
      link_length_m: number | string | null;
      fiber_cables: { name: string } | null;
      fiber_cores: { core_number: number; color: string } | null;
      olts: { id: string; name: string } | null;
    }[]) {
      if (u.switch_port_id && u.olts) {
        map[u.switch_port_id] = {
          oltId: u.olts.id,
          oltName: u.olts.name,
          label: u.label,
          linkType: u.link_type,
          linkLength: u.link_length_m,
          fiber: u.fiber_cables
            ? `${u.fiber_cables.name}${
                u.fiber_cores
                  ? `, core ${u.fiber_cores.core_number} (${u.fiber_cores.color})`
                  : ""
              }`
            : null,
        };
      }
    }
    setOltLinks(map);
  }

  async function loadPorts() {
    const { data } = await supabase
      .from("switch_ports")
      .select(
        "id, port_number, label, speed, media, status, sfp_module, description, cable_id, core_id, reseller_id, upstream_id, vlan, bandwidth_mbps, notes, link_type, link_length_m, link_note, fiber_cables(name), fiber_cores(core_number, color), resellers(id, name), upstream_providers(id, name)"
      )
      .eq("switch_id", switchId)
      .order("port_number");
    const list = (data ?? []) as unknown as PortRow[];
    setPorts(list);
    await loadOltLinks(list.map((p) => p.id));
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
    setDraftCores((data ?? []) as unknown as CoreOpt[]);
  }

  useEffect(() => {
    async function init() {
      const [{ data: cableList }, { data: resellerList }] = await Promise.all([
        supabase
          .from("fiber_cables")
          .select("id, name, cable_type, core_count")
          .order("name"),
        supabase.from("resellers").select("id, name").order("name"),
      ]);
      setCables((cableList ?? []) as unknown as CableOpt[]);
      setResellers((resellerList ?? []) as unknown as Opt[]);
      const { data: upstreamList } = await supabase
        .from("upstream_providers")
        .select("id, name")
        .order("name");
      setUpstreams((upstreamList ?? []) as unknown as Opt[]);
      await loadPorts();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switchId, supabase]);

  function openEditor(p: PortRow) {
    setPortError(null);
    setEditingId(p.id);
    setDraft({
      label: p.label ?? "",
      speed: p.speed,
      media: p.media,
      status: p.status,
      sfp_module: p.sfp_module ?? "",
      vlan: p.vlan !== null ? String(p.vlan) : "",
      bandwidth_mbps: p.bandwidth_mbps !== null ? String(p.bandwidth_mbps) : "",
      reseller_id: p.reseller_id ?? "",
      upstream_id: p.upstream_id ?? "",
      link_type: p.link_type ?? "",
      link_length_m: p.link_length_m !== null ? String(p.link_length_m) : "",
      link_note: p.link_note ?? "",
      cable_id: p.cable_id ?? "",
      core_id: p.core_id ?? "",
      description: p.description ?? "",
      notes: p.notes ?? "",
    });
    loadCoresFor(p.cable_id ?? "");
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setPortError(null);
  }

  function setField<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function changeCable(cableId: string) {
    setDraft((d) => (d ? { ...d, cable_id: cableId, core_id: "" } : d));
    loadCoresFor(cableId);
  }

  async function savePort(portId: string) {
    if (!draft) return;
    setSaving(true);
    setPortError(null);

    const { error } = await supabase
      .from("switch_ports")
      .update({
        label: draft.label || null,
        speed: draft.speed,
        media: draft.media,
        status: draft.status,
        sfp_module: draft.sfp_module || null,
        vlan: draft.vlan !== "" ? Number(draft.vlan) : null,
        bandwidth_mbps:
          draft.bandwidth_mbps !== "" ? Number(draft.bandwidth_mbps) : null,
        reseller_id: draft.reseller_id || null,
        upstream_id: draft.upstream_id || null,
        cable_id:
          !draft.link_type || draft.link_type === "fiber" ? draft.cable_id || null : null,
        core_id:
          !draft.link_type || draft.link_type === "fiber" ? draft.core_id || null : null,
        link_type: draft.link_type || null,
        link_length_m: draft.link_length_m !== "" ? Number(draft.link_length_m) : null,
        link_note: draft.link_note || null,
        description: draft.description || null,
        notes: draft.notes || null,
      })
      .eq("id", portId);

    setSaving(false);
    if (error) {
      setPortError(error.message);
      return;
    }
    closeEditor();
    await loadPorts();
  }

  async function disconnectPort(portId: string) {
    if (!confirm("Remove the reseller and fiber from this port?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("switch_ports")
      .update({
        cable_id: null,
        core_id: null,
        reseller_id: null,
        upstream_id: null,
        link_type: null,
        link_length_m: null,
        link_note: null,
        status: "free",
      })
      .eq("id", portId);
    setSaving(false);
    if (error) {
      setPortError(error.message);
      return;
    }
    closeEditor();
    await loadPorts();
  }

  async function deletePort(portId: string) {
    if (!confirm("Delete this port? This cannot be undone.")) return;
    setSaving(true);
    const { error } = await supabase.from("switch_ports").delete().eq("id", portId);
    setSaving(false);
    if (error) {
      setPortError(error.message);
      return;
    }
    closeEditor();
    await loadPorts();
  }

  async function addPort(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const next = ports.reduce((m, p) => Math.max(m, p.port_number), 0) + 1;
    const { error } = await supabase.from("switch_ports").insert({
      switch_id: switchId,
      port_number: next,
      label: addLabel || null,
      speed: addSpeed,
      media: addMedia,
    });
    if (error) {
      setAddError(error.message);
      return;
    }
    setAddLabel("");
    await loadPorts();
  }

  const speedCounts = new Map<string, number>();
  for (const p of ports) speedCounts.set(p.speed, (speedCounts.get(p.speed) ?? 0) + 1);
  const summary = speedOptions
    .filter((s) => speedCounts.has(s))
    .map((s) => `${speedCounts.get(s)}x${s}`)
    .join(", ");
  const connected = ports.filter((p) => p.cable_id || p.reseller_id).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Ports</h2>
          <p className="text-sm text-gray-500">
            Record the SFP in each port, the fiber plugged in, and the reseller it serves.
          </p>
        </div>
        <p className="text-sm text-gray-600">
          {ports.length} ports{summary ? ` (${summary})` : ""}, {connected} connected
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500">Port</th>
              <th className="px-4 py-3 font-medium text-gray-500">Speed</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Connected to</th>
              <th className="px-4 py-3 font-medium text-gray-500">SFP and service</th>
              <th className="px-4 py-3 font-medium text-gray-500">Description</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">
                      {p.label || `Port ${p.port_number}`}
                    </span>
                    <span className="block text-xs text-gray-400">
                      Port {p.port_number}
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
                    {p.resellers && (
                      <Link
                        href={`/resellers/${p.resellers.id}`}
                        className="block font-medium text-blue-600 hover:underline"
                      >
                        {p.resellers.name}
                      </Link>
                    )}
                    {p.fiber_cables && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                        <Link
                          href={`/fiber-cables/${p.cable_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {p.fiber_cables.name}
                        </Link>
                        {p.fiber_cores && (
                          <>
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-gray-300"
                              style={{
                                backgroundColor:
                                  colorHex[p.fiber_cores.color] ?? "#999",
                              }}
                            />
                            Core {p.fiber_cores.core_number}
                          </>
                        )}
                      </span>
                    )}
                    {p.upstream_providers && (
                      <Link
                        href={`/upstreams/${p.upstream_providers.id}`}
                        className="block font-medium text-blue-600 hover:underline"
                      >
                        {p.upstream_providers.name}
                        <span className="ml-1.5 text-xs font-normal text-gray-500">
                          upstream
                        </span>
                      </Link>
                    )}
                    {oltLinks[p.id] && (
                      <Link
                        href={`/olts/${oltLinks[p.id].oltId}`}
                        className="block font-medium text-blue-600 hover:underline"
                      >
                        {oltLinks[p.id].oltName}
                        <span className="ml-1.5 text-xs font-normal text-gray-500">
                          OLT {oltLinks[p.id].label ?? "uplink"}
                          {oltLinks[p.id].fiber ? `, fiber ${oltLinks[p.id].fiber}` : ""}
                        </span>
                      </Link>
                    )}
                    {(() => {
                      const t = linkText(
                        p.link_type ?? oltLinks[p.id]?.linkType,
                        p.link_length_m ?? oltLinks[p.id]?.linkLength
                      );
                      return t ? (
                        <span className="mt-0.5 block text-xs text-gray-500">{t}</span>
                      ) : null;
                    })()}
                    {!p.resellers && !p.upstream_providers && !p.fiber_cables && !oltLinks[p.id] && (
                      <span className="text-gray-400">Nothing connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="block">{p.sfp_module ?? "SFP not set"}</span>
                    {(p.vlan !== null || p.bandwidth_mbps !== null) && (
                      <span className="block text-xs text-gray-500">
                        {[
                          p.vlan !== null ? `VLAN ${p.vlan}` : null,
                          p.bandwidth_mbps !== null ? `${p.bandwidth_mbps} Mbps` : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-600">
                    {p.description ?? <span className="text-gray-400">No description</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => (editingId === p.id ? closeEditor() : openEditor(p))}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {editingId === p.id ? "Close" : "Edit"}
                    </button>
                  </td>
                </tr>

                {editingId === p.id && draft && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid gap-4 md:grid-cols-4">
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

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            SFP module
                          </label>
                          <input
                            value={draft.sfp_module}
                            onChange={(e) => setField("sfp_module", e.target.value)}
                            placeholder="e.g. 1.25G BiDi SC 20 km, TX 1310"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            VLAN
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={4094}
                            value={draft.vlan}
                            onChange={(e) => setField("vlan", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Bandwidth (Mbps)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={draft.bandwidth_mbps}
                            onChange={(e) => setField("bandwidth_mbps", e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Reseller
                          </label>
                          <select
                            value={draft.reseller_id}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      reseller_id: e.target.value,
                                      upstream_id: e.target.value ? "" : d.upstream_id,
                                    }
                                  : d
                              )
                            }
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">(no reseller)</option>
                            {resellers.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Upstream ISP
                          </label>
                          <select
                            value={draft.upstream_id}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      upstream_id: e.target.value,
                                      reseller_id: e.target.value ? "" : d.reseller_id,
                                    }
                                  : d
                              )
                            }
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">(no upstream)</option>
                            {upstreams.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Connection type
                          </label>
                          <select
                            value={draft.link_type}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      link_type: e.target.value,
                                      cable_id:
                                        e.target.value && e.target.value !== "fiber"
                                          ? ""
                                          : d.cable_id,
                                      core_id:
                                        e.target.value && e.target.value !== "fiber"
                                          ? ""
                                          : d.core_id,
                                    }
                                  : d
                              )
                            }
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
                            placeholder="e.g. 10G SFP+ DAC 3 m, rack A to rack B"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          {linkHint(draft.media, draft.link_type) && (
                            <p className="mt-1 text-xs text-amber-700">
                              {linkHint(draft.media, draft.link_type)}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Fiber cable
                          </label>
                          <select
                            value={draft.cable_id}
                            disabled={!!draft.link_type && draft.link_type !== "fiber"}
                            onChange={(e) => changeCable(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">(nothing plugged in)</option>
                            {cables.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.cable_type}, {c.core_count} cores)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
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
                        </div>

                        <div className="md:col-span-4">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Description
                          </label>
                          <textarea
                            value={draft.description}
                            onChange={(e) => setField("description", e.target.value)}
                            rows={2}
                            placeholder="What this port serves, e.g. 1G handoff to Rahim Net, Mirpur"
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="md:col-span-4">
                          <label className="mb-1 block text-xs font-medium text-gray-600">
                            Notes
                          </label>
                          <textarea
                            value={draft.notes}
                            onChange={(e) => setField("notes", e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      {portError && <p className="mt-3 text-sm text-red-600">{portError}</p>}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => savePort(p.id)}
                          disabled={saving}
                          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save port"}
                        </button>
                        <button
                          type="button"
                          onClick={closeEditor}
                          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <div className="ml-auto flex gap-3">
                          {(p.cable_id || p.reseller_id) && (
                            <button
                              type="button"
                              onClick={() => disconnectPort(p.id)}
                              disabled={saving}
                              className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
                            >
                              Disconnect
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deletePort(p.id)}
                            disabled={saving}
                            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete port
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {ports.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  This switch has no ports yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={addPort}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Label (optional)
          </label>
          <input
            value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Speed</label>
          <select
            value={addSpeed}
            onChange={(e) => setAddSpeed(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {speedOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Port type</label>
          <select
            value={addMedia}
            onChange={(e) => setAddMedia(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {mediaOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add port
        </button>
        {addError && <p className="w-full text-sm text-red-600">{addError}</p>}
      </form>
    </div>
  );
}
