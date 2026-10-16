"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const cableTypes = ["feeder", "distribution", "drop"];
const statusOptions = ["active", "inactive", "maintenance", "faulty"];

function num(s: string) {
  return s.trim() === "" ? null : Number(s);
}

export default function NewFiberCablePage() {
  const router = useRouter();
  const supabase = createClient();

  const [olts, setOlts] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    cable_type: "feeder",
    core_count: "24",
    olt_id: "",
    length_meters: "",
    status: "active",
    notes: "",
    start_mark: "",
    start_place: "",
    end_mark: "",
    end_place: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("olts")
      .select("id, name")
      .order("name")
      .then(({ data }) => setOlts((data ?? []) as unknown as { id: string; name: string }[]));
  }, [supabase]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const sm = num(form.start_mark);
  const em = num(form.end_mark);
  const fromMarks =
    sm !== null && em !== null && !Number.isNaN(sm) && !Number.isNaN(em)
      ? Math.abs(em - sm)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if ((sm !== null && (Number.isNaN(sm) || sm < 0)) || (em !== null && (Number.isNaN(em) || em < 0))) {
      setError("The length marks must be numbers, 0 or more.");
      return;
    }
    const typedLength = num(form.length_meters);
    if (typedLength !== null && (Number.isNaN(typedLength) || typedLength < 0)) {
      setError("The length must be a number, 0 or more.");
      return;
    }

    setLoading(true);
    const lengthMeters = typedLength !== null ? typedLength : fromMarks;

    const { data, error } = await supabase
      .from("fiber_cables")
      .insert({
        name: form.name,
        cable_type: form.cable_type,
        core_count: Number(form.core_count) || 0,
        olt_id: form.olt_id || null,
        length_meters: lengthMeters,
        status: form.status,
        notes: form.notes || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setError(error?.message ?? "Could not create the cable.");
      setLoading(false);
      return;
    }
    const id = data.id as string;

    const rows: Record<string, unknown>[] = [];
    if (sm !== null || form.start_place.trim() || form.olt_id) {
      rows.push({
        cable_id: id,
        sort_order: 1024,
        length_mark_m: sm,
        place: form.start_place.trim() || null,
        kind: form.olt_id ? "olt" : "other",
        olt_id: form.olt_id || null,
      });
    }
    if (em !== null || form.end_place.trim()) {
      rows.push({
        cable_id: id,
        sort_order: 2048,
        length_mark_m: em,
        place: form.end_place.trim() || null,
        kind: "other",
      });
    }

    if (rows.length > 0) {
      const res = await supabase.from("cable_route_points").insert(rows);
      if (res.error) {
        setLoading(false);
        setCreatedId(id);
        setError(
          `The cable was saved, but its route points could not be: ${res.error.message}`
        );
        return;
      }
    }

    router.push(`/fiber-cables/${id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Fiber Cable</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
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
              Core Count *
            </label>
            <input
              required
              type="number"
              min={1}
              value={form.core_count}
              onChange={(e) => update("core_count", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              All cores will be auto-generated with color codes.
            </p>
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

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-800">Route and length</p>
          <p className="mb-3 mt-0.5 text-xs text-gray-500">
            Write the length mark printed on the cable at the start and at the end. Points in the
            middle can be added on the cable page after saving.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Start mark (m)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.start_mark}
                onChange={(e) => update("start_mark", e.target.value)}
                placeholder="e.g. 1000"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                End mark (m)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.end_mark}
                onChange={(e) => update("end_mark", e.target.value)}
                placeholder="e.g. 2180"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Start place or pole
              </label>
              <input
                value={form.start_place}
                onChange={(e) => update("start_place", e.target.value)}
                placeholder="e.g. NOC rack 2"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                End place or pole
              </label>
              <input
                value={form.end_place}
                onChange={(e) => update("end_place", e.target.value)}
                placeholder="e.g. Pole 31"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          {fromMarks !== null && (
            <p className="mt-3 text-xs text-gray-600">
              Length from the marks: <b>{fromMarks.toLocaleString("en-US")} m</b>
              {form.length_meters === "" ? ". It will be saved as the cable length." : "."}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Total length (meters)
            </label>
            <input
              type="number"
              step="any"
              min={0}
              value={form.length_meters}
              onChange={(e) => update("length_meters", e.target.value)}
              placeholder={fromMarks !== null ? String(fromMarks) : ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              Leave empty to use the length from the marks.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {createdId && (
          <Link
            href={`/fiber-cables/${createdId}`}
            className="block text-sm text-blue-600 hover:underline"
          >
            Open the saved cable
          </Link>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Cable"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/fiber-cables")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
