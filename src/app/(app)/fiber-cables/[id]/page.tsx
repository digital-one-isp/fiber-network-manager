"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const cableTypes = ["feeder", "distribution", "drop"];
const statusOptions = ["active", "inactive", "maintenance", "faulty"];

const colorOptions = [
  "Blue", "Orange", "Green", "Brown", "Slate", "White",
  "Red", "Black", "Yellow", "Violet", "Rose", "Aqua",
];

const colorHex: Record<string, string> = {
  Blue: "#2563eb",
  Orange: "#ea580c",
  Green: "#16a34a",
  Brown: "#78350f",
  Slate: "#64748b",
  White: "#e5e7eb",
  Red: "#dc2626",
  Black: "#111827",
  Yellow: "#eab308",
  Violet: "#7c3aed",
  Rose: "#f43f5e",
  Aqua: "#06b6d4",
};

const coreStatusOptions = ["free", "used", "damaged", "reserved"];

type Core = {
  id: string;
  core_number: number;
  tube_number: number | null;
  color: string;
  status: string;
};

type Tube = {
  id: string;
  tube_number: number;
  color: string;
};

export default function FiberCableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [olts, setOlts] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [cores, setCores] = useState<Core[]>([]);
  const [tubes, setTubes] = useState<Tube[]>([]);
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null);
  const [newTubeNumber, setNewTubeNumber] = useState("");
  const [newTubeColor, setNewTubeColor] = useState("Blue");
  const [newTubeCoreCount, setNewTubeCoreCount] = useState("6");
  const [assignCounts, setAssignCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function loadCoresAndTubes() {
    const [{ data: coreList }, { data: tubeList }] = await Promise.all([
      supabase
        .from("fiber_cores")
        .select("id, core_number, tube_number, color, status")
        .eq("cable_id", id)
        .order("core_number"),
      supabase
        .from("fiber_tubes")
        .select("id, tube_number, color")
        .eq("cable_id", id)
        .order("tube_number"),
    ]);
    setCores(coreList ?? []);
    setTubes(tubeList ?? []);
  }

  useEffect(() => {
    async function load() {
      const [{ data: cable, error }, { data: oltList }] = await Promise.all([
        supabase.from("fiber_cables").select("*").eq("id", id).single(),
        supabase.from("olts").select("id, name").order("name"),
      ]);

      if (error || !cable) {
        setNotFound(true);
        return;
      }

      setOlts(oltList ?? []);
      setForm({
        name: cable.name ?? "",
        cable_type: cable.cable_type ?? "feeder",
        core_count: String(cable.core_count ?? 0),
        olt_id: cable.olt_id ?? "",
        length_meters: cable.length_meters ? String(cable.length_meters) : "",
        status: cable.status ?? "active",
        notes: cable.notes ?? "",
      });
      await loadCoresAndTubes();
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
      .from("fiber_cables")
      .update({
        name: form.name,
        cable_type: form.cable_type,
        olt_id: form.olt_id || null,
        length_meters: form.length_meters ? Number(form.length_meters) : null,
        status: form.status,
        notes: form.notes || null,
      })
      .eq("id", id);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/fiber-cables");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this cable and all its cores/tubes? This cannot be undone."))
      return;
    setLoading(true);
    const { error } = await supabase.from("fiber_cables").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/fiber-cables");
    router.refresh();
  }

  // Assign the next N unassigned cores (by core_number order) to a tube
  async function assignNextCores(tubeNumber: number, count: number) {
    if (count <= 0) return;
    const pool = cores
      .filter((c) => c.tube_number === null)
      .sort((a, b) => a.core_number - b.core_number)
      .slice(0, count);

    if (pool.length === 0) {
      alert("No unassigned cores left.");
      return;
    }

    const ids = pool.map((c) => c.id);
    const { error } = await supabase
      .from("fiber_cores")
      .update({ tube_number: tubeNumber })
      .in("id", ids);

    if (error) {
      alert(error.message);
      return;
    }

    setCores((cs) =>
      cs.map((c) =>
        ids.includes(c.id) ? { ...c, tube_number: tubeNumber } : c
      )
    );
  }

  async function addTube(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(newTubeNumber);
    if (!num || num < 1) return;
    if (tubes.some((t) => t.tube_number === num)) {
      alert(`Tube ${num} already exists.`);
      return;
    }
    const { data, error } = await supabase
      .from("fiber_tubes")
      .insert({ cable_id: id, tube_number: num, color: newTubeColor })
      .select("id, tube_number, color")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      setTubes((ts) => [...ts, data].sort((a, b) => a.tube_number - b.tube_number));
    }
    const count = Number(newTubeCoreCount) || 0;
    if (count > 0) {
      await assignNextCores(num, count);
    }
    setNewTubeNumber("");
  }

  async function deleteTube(tubeId: string, tubeNumber: number) {
    if (!confirm(`Delete Tube ${tubeNumber}? Its cores will become unassigned.`))
      return;
    await supabase
      .from("fiber_cores")
      .update({ tube_number: null })
      .eq("cable_id", id)
      .eq("tube_number", tubeNumber);
    await supabase.from("fiber_tubes").delete().eq("id", tubeId);
    setTubes((ts) => ts.filter((t) => t.id !== tubeId));
    setCores((cs) =>
      cs.map((c) =>
        c.tube_number === tubeNumber ? { ...c, tube_number: null } : c
      )
    );
  }

  async function unassignAllInTube(tubeNumber: number) {
    if (!confirm(`Remove all cores from Tube ${tubeNumber}? The tube itself stays.`))
      return;
    await supabase
      .from("fiber_cores")
      .update({ tube_number: null })
      .eq("cable_id", id)
      .eq("tube_number", tubeNumber);
    setCores((cs) =>
      cs.map((c) =>
        c.tube_number === tubeNumber ? { ...c, tube_number: null } : c
      )
    );
  }

  async function updateTubeColor(tubeId: string, color: string) {
    await supabase.from("fiber_tubes").update({ color }).eq("id", tubeId);
    setTubes((ts) => ts.map((t) => (t.id === tubeId ? { ...t, color } : t)));
  }

  async function updateCoreColor(coreId: string, color: string) {
    await supabase.from("fiber_cores").update({ color }).eq("id", coreId);
    setCores((cs) => cs.map((c) => (c.id === coreId ? { ...c, color } : c)));
  }

  async function updateCoreStatus(coreId: string, status: string) {
    await supabase.from("fiber_cores").update({ status }).eq("id", coreId);
    setCores((cs) => cs.map((c) => (c.id === coreId ? { ...c, status } : c)));
  }

  async function updateCoreTube(coreId: string, value: string) {
    const tubeNumber = value === "" ? null : Number(value);
    await supabase
      .from("fiber_cores")
      .update({ tube_number: tubeNumber })
      .eq("id", coreId);
    setCores((cs) =>
      cs.map((c) => (c.id === coreId ? { ...c, tube_number: tubeNumber } : c))
    );
  }

  if (notFound) {
    return <p className="text-gray-500">Fiber cable not found.</p>;
  }

  if (!form) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const unassignedCores = cores.filter((c) => c.tube_number === null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="mb-6 text-xl font-semibold text-gray-900">
          Edit Fiber Cable
        </h1>

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
                Cable Type
              </label>
              <select
                value={form.cable_type}
                onChange={(e) => update("cable_type", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {cableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Core Count
              </label>
              <input
                disabled
                value={form.core_count}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Originating OLT
            </label>
            <select
              value={form.olt_id}
              onChange={(e) => update("olt_id", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">(none)</option>
              {olts.map((olt) => (
                <option key={olt.id} value={olt.id}>
                  {olt.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Length (meters)
              </label>
              <input
                type="number"
                step="any"
                value={form.length_meters}
                onChange={(e) => update("length_meters", e.target.value)}
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
                onClick={() => router.push("/fiber-cables")}
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

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Tubes</h2>
        <form
          onSubmit={addTube}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Tube Number
            </label>
            <input
              type="number"
              min={1}
              value={newTubeNumber}
              onChange={(e) => setNewTubeNumber(e.target.value)}
              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Tube Color
            </label>
            <select
              value={newTubeColor}
              onChange={(e) => setNewTubeColor(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {colorOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Cores to Assign
            </label>
            <input
              type="number"
              min={0}
              value={newTubeCoreCount}
              onChange={(e) => setNewTubeCoreCount(e.target.value)}
              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Tube
          </button>
        </form>

        {tubes.length === 0 && (
          <p className="mb-4 text-sm text-gray-400">
            No tubes created yet. Add one above (it will auto-fill with the
            given number of unassigned cores).
          </p>
        )}

        <div className="space-y-4">
          {tubes.map((tube) => {
            const tubeCores = cores.filter(
              (c) => c.tube_number === tube.tube_number
            );
            return (
              <div
                key={tube.id}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Tube {tube.tube_number} ({tubeCores.length} cores)
                    </span>
                    <div
                      className="h-3 w-3 rounded-full border border-gray-300"
                      style={{
                        backgroundColor: colorHex[tube.color] ?? "#999",
                      }}
                    />
                    <select
                      value={tube.color}
                      onChange={(e) => updateTubeColor(tube.id, e.target.value)}
                      className="rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-600"
                    >
                      {colorOptions.map((c) => (
                        <option key={c} value={c}>
                          {c} tube
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="add N"
                      value={assignCounts[tube.id] ?? ""}
                      onChange={(e) =>
                        setAssignCounts((a) => ({
                          ...a,
                          [tube.id]: e.target.value,
                        }))
                      }
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = Number(assignCounts[tube.id]) || 0;
                        assignNextCores(tube.tube_number, n);
                        setAssignCounts((a) => ({ ...a, [tube.id]: "" }));
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      + Add cores
                    </button>
                    <button
                      type="button"
                      onClick={() => unassignAllInTube(tube.tube_number)}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      remove all
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTube(tube.id, tube.tube_number)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      delete tube
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  {tubeCores.map((core) => (
                    <CoreBubble
                      key={core.id}
                      core={core}
                      tubes={tubes}
                      isEditing={editingCoreId === core.id}
                      onToggleEdit={() =>
                        setEditingCoreId(
                          editingCoreId === core.id ? null : core.id
                        )
                      }
                      onColorChange={(c) => updateCoreColor(core.id, c)}
                      onStatusChange={(s) => updateCoreStatus(core.id, s)}
                      onTubeChange={(v) => updateCoreTube(core.id, v)}
                    />
                  ))}
                  {tubeCores.length === 0 && (
                    <p className="text-xs text-gray-400">
                      No cores assigned to this tube yet.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Unassigned Cores ({unassignedCores.length})
          </p>
          <div className="flex flex-wrap gap-4">
            {unassignedCores.map((core) => (
              <CoreBubble
                key={core.id}
                core={core}
                tubes={tubes}
                isEditing={editingCoreId === core.id}
                onToggleEdit={() =>
                  setEditingCoreId(editingCoreId === core.id ? null : core.id)
                }
                onColorChange={(c) => updateCoreColor(core.id, c)}
                onStatusChange={(s) => updateCoreStatus(core.id, s)}
                onTubeChange={(v) => updateCoreTube(core.id, v)}
              />
            ))}
            {unassignedCores.length === 0 && (
              <p className="text-xs text-gray-400">All cores are assigned.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreBubble({
  core,
  tubes,
  isEditing,
  onToggleEdit,
  onColorChange,
  onStatusChange,
  onTubeChange,
}: {
  core: Core;
  tubes: Tube[];
  isEditing: boolean;
  onToggleEdit: () => void;
  onColorChange: (color: string) => void;
  onStatusChange: (status: string) => void;
  onTubeChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleEdit}
        className="flex flex-col items-center gap-1"
      >
        <div
          className="h-8 w-8 rounded-full border-2 border-gray-300 hover:ring-2 hover:ring-gray-400"
          style={{
            backgroundColor: colorHex[core.color] ?? "#999",
            opacity: core.status === "damaged" ? 0.4 : 1,
          }}
        />
        <span className="text-[10px] text-gray-500">{core.core_number}</span>
      </button>

      {isEditing && (
        <div className="absolute left-1/2 top-full z-10 mt-2 w-44 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Core Color
          </label>
          <select
            value={core.color}
            onChange={(e) => onColorChange(e.target.value)}
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {colorOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            value={core.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {coreStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-gray-600">
            Tube
          </label>
          <select
            value={core.tube_number ?? ""}
            onChange={(e) => onTubeChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">(unassigned)</option>
            {tubes.map((t) => (
              <option key={t.id} value={t.tube_number}>
                Tube {t.tube_number}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
