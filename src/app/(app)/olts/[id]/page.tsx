"use client";

import { Fragment, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OltUplinks from "@/components/olt-uplinks";

const statusOptions = ["active", "inactive", "maintenance", "faulty"];
const portStatusOptions = ["free", "active", "reserved", "faulty", "disabled"];

const portStatusCls: Record<string, string> = {
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
  description: string | null;
  status: string;
  sfp_module: string | null;
  tx_power_dbm: number | null;
  cable_id: string | null;
  core_id: string | null;
  notes: string | null;
  fiber_cables: { name: string; cable_type: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
};
type CableOpt = { id: string; name: string; cable_type: string; core_count: number };
type CoreOpt = { id: string; core_number: number; color: string; status: string };
type Draft = {
  label: string;
  description: string;
  status: string;
  sfp_module: string;
  tx_power_dbm: string;
  cable_id: string;
  core_id: string;
  notes: string;
};

export default function OltDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [cables, setCables] = useState<CableOpt[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftCores, setDraftCores] = useState<CoreOpt[]>([]);
  const [portError, setPortError] = useState<string | null>(null);
  const [savingPort, setSavingPort] = useState(false);

  async function loadPorts() {
    const { data } = await supabase
      .from("olt_ports")
      .select(
        "id, port_number, label, description, status, sfp_module, tx_power_dbm, cable_id, core_id, notes, fiber_cables(name, cable_type), fiber_cores(core_number, color)"
      )
      .eq("olt_id", id)
      .order("port_number");
    setPorts((data ?? []) as unknown as PortRow[]);
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
    async function load() {
      const [{ data, error }, { data: cableList }] = await Promise.all([
        supabase.from("olts").select("*").eq("id", id).single(),
        supabase
          .from("fiber_cables")
          .select("id, name, cable_type, core_count")
          .order("name"),
      ]);

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setCables((cableList ?? []) as unknown as CableOpt[]);
      setForm({
        name: data.name ?? "",
        vendor: data.vendor ?? "",
        model: data.model ?? "",
        management_ip: data.management_ip ?? "",
        total_pon_ports: String(data.total_pon_ports ?? 0),
        latitude: String(data.latitude ?? ""),
        longitude: String(data.longitude ?? ""),
        address: data.address ?? "",
        status: data.status ?? "active",
        notes: data.notes ?? "",
      });
      await loadPorts();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, supabase]);

  function update(key: string, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setLoading(true);

    const { error } = await supabase
      .from("olts")
      .update({
        name: form.name,
        vendor: form.vendor || null,
        model: form.model || null,
        management_ip: form.management_ip || null,
        total_pon_ports: Number(form.total_pon_ports) || 0,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        address: form.address || null,
        status: form.status,
        notes: form.notes || null,
      })
      .eq("id", id);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/olts");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this OLT and all its PON port records? This cannot be undone."))
      return;
    setLoading(true);
    const { error } = await supabase.from("olts").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/olts");
    router.refresh();
  }

  function openEditor(p: PortRow) {
    setPortError(null);
    setEditingId(p.id);
    setDraft({
      label: p.label ?? "",
      description: p.description ?? "",
      status: p.status,
      sfp_module: p.sfp_module ?? "",
      tx_power_dbm: p.tx_power_dbm !== null ? String(p.tx_power_dbm) : "",
      cable_id: p.cable_id ?? "",
      core_id: p.core_id ?? "",
      notes: p.notes ?? "",
    });
    loadCoresFor(p.cable_id ?? "");
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setPortError(null);
  }

  function setDraftField<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function changeDraftCable(cableId: string) {
    setDraft((d) => (d ? { ...d, cable_id: cableId, core_id: "" } : d));
    loadCoresFor(cableId);
  }

  async function savePort(portId: string) {
    if (!draft) return;
    setSavingPort(true);
    setPortError(null);

    const { error } = await supabase
      .from("olt_ports")
      .update({
        label: draft.label || null,
        description: draft.description || null,
        status: draft.status,
        sfp_module: draft.sfp_module || null,
        tx_power_dbm: draft.tx_power_dbm !== "" ? Number(draft.tx_power_dbm) : null,
        cable_id: draft.cable_id || null,
        core_id: draft.core_id || null,
        notes: draft.notes || null,
      })
      .eq("id", portId);

    setSavingPort(false);
    if (error) {
      setPortError(error.message);
      return;
    }
    closeEditor();
    await loadPorts();
  }

  async function disconnectPort(portId: string) {
    if (!confirm("Disconnect the fiber from this PON port?")) return;
    setSavingPort(true);
    const { error } = await supabase
      .from("olt_ports")
      .update({ cable_id: null, core_id: null, status: "free" })
      .eq("id", portId);
    setSavingPort(false);
    if (error) {
      setPortError(error.message);
      return;
    }
    closeEditor();
    await loadPorts();
  }

  if (notFound) {
    return <p className="text-gray-500">OLT not found.</p>;
  }

  if (!form) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const connected = ports.filter((p) => p.cable_id).length;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Edit OLT</h1>

        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Vendor
              </label>
              <input
                value={form.vendor}
                onChange={(e) => update("vendor", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Model
              </label>
              <input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Management IP
              </label>
              <input
                value={form.management_ip}
                onChange={(e) => update("management_ip", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Total PON Ports
              </label>
              <input
                type="number"
                value={form.total_pon_ports}
                onChange={(e) => update("total_pon_ports", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Latitude *
              </label>
              <input
                required
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => update("latitude", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Longitude *
              </label>
              <input
                required
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => update("longitude", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Address
            </label>
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/olts")}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </form>
      </div>

      <OltUplinks oltId={id} />

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">PON ports</h2>
            <p className="text-sm text-gray-500">
              Describe each port and record which fiber is plugged into it.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            {ports.length} ports, {connected} connected, {ports.length - connected} without a fiber
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Port</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Fiber connected</th>
                <th className="px-4 py-3 font-medium text-gray-500">Optics</th>
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
                        {p.label || `PON-${p.port_number}`}
                      </span>
                      <span className="block text-xs text-gray-400">
                        Port {p.port_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          portStatusCls[p.status] ?? portStatusCls.free
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.fiber_cables ? (
                        <div>
                          <Link
                            href={`/fiber-cables/${p.cable_id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {p.fiber_cables.name}
                          </Link>
                          {p.fiber_cores ? (
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                              <span
                                className="h-2.5 w-2.5 rounded-full border border-gray-300"
                                style={{
                                  backgroundColor:
                                    colorHex[p.fiber_cores.color] ?? "#999",
                                }}
                              />
                              Core {p.fiber_cores.core_number} ({p.fiber_cores.color})
                            </span>
                          ) : (
                            <span className="block text-xs text-gray-400">
                              Core not chosen
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Nothing plugged in</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="block">{p.sfp_module ?? "SFP not set"}</span>
                      {p.tx_power_dbm !== null && (
                        <span className="block text-xs text-gray-500">
                          Tx {p.tx_power_dbm} dBm
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-600">
                      {p.description ?? <span className="text-gray-400">No description</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          editingId === p.id ? closeEditor() : openEditor(p)
                        }
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {editingId === p.id ? "Close" : "Edit"}
                      </button>
                    </td>
                  </tr>

                  {editingId === p.id && draft && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Label
                            </label>
                            <input
                              value={draft.label}
                              onChange={(e) => setDraftField("label", e.target.value)}
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Status
                            </label>
                            <select
                              value={draft.status}
                              onChange={(e) => setDraftField("status", e.target.value)}
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              {portStatusOptions.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              SFP module
                            </label>
                            <input
                              value={draft.sfp_module}
                              onChange={(e) => setDraftField("sfp_module", e.target.value)}
                              placeholder="e.g. Class C+ SFP, 20 km"
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Tx power (dBm)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={draft.tx_power_dbm}
                              onChange={(e) => setDraftField("tx_power_dbm", e.target.value)}
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Fiber cable
                            </label>
                            <select
                              value={draft.cable_id}
                              onChange={(e) => changeDraftCable(e.target.value)}
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
                              onChange={(e) => setDraftField("core_id", e.target.value)}
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
                            <p className="mt-1 text-xs text-gray-400">
                              Only free cores are listed.
                            </p>
                          </div>

                          <div className="md:col-span-3">
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Description
                            </label>
                            <textarea
                              value={draft.description}
                              onChange={(e) => setDraftField("description", e.target.value)}
                              rows={2}
                              placeholder="What this port serves, e.g. Dhanmondi zone A, feeds TG-BOX-001"
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Notes
                            </label>
                            <textarea
                              value={draft.notes}
                              onChange={(e) => setDraftField("notes", e.target.value)}
                              rows={2}
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        {portError && (
                          <p className="mt-3 text-sm text-red-600">{portError}</p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => savePort(p.id)}
                            disabled={savingPort}
                            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                          >
                            {savingPort ? "Saving..." : "Save port"}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditor}
                            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          {p.cable_id && (
                            <button
                              type="button"
                              onClick={() => disconnectPort(p.id)}
                              disabled={savingPort}
                              className="ml-auto rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Disconnect fiber
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No PON ports yet. Set &ldquo;Total PON Ports&rdquo; above and save.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
