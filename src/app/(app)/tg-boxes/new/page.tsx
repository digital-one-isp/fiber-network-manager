"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const boxCategories = [
  { value: "joint_2port", label: "Joint Box - 2 Port" },
  { value: "joint_4port", label: "Joint Box - 4 Port" },
  { value: "joint_8port", label: "Joint Box - 8 Port" },
  { value: "joint_16port", label: "Joint Box - 16 Port" },
  { value: "splitter_primary_main", label: "Splitter Partition - Primary Main Box" },
  { value: "splitter_primary_2nd", label: "Splitter Partition - Primary 2nd Box" },
  { value: "splitter_customer", label: "Splitter Partition - Customer Box" },
];

const mountTypes = ["aerial", "underground", "wall_mounted", "pole_mounted"];
const statusOptions = ["active", "inactive", "maintenance", "faulty"];

export default function NewTgBoxPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    box_category: "joint_4port",
    box_type: "pole_mounted",
    capacity: "24",
    latitude: "",
    longitude: "",
    address: "",
    status: "active",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.from("tg_boxes").insert({
      name: form.name,
      box_category: form.box_category,
      box_type: form.box_type,
      capacity: Number(form.capacity) || 0,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      address: form.address || null,
      status: form.status,
      notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/tg-boxes");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add TG / Joint Box</h1>

      <form
        onSubmit={handleSubmit}
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

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Box Category *
          </label>
          <select
            value={form.box_category}
            onChange={(e) => update("box_category", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {boxCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Mount Type
            </label>
            <select
              value={form.box_type}
              onChange={(e) => update("box_type", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {mountTypes.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Capacity
            </label>
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => update("capacity", e.target.value)}
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
              placeholder="23.8103"
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
              placeholder="90.4125"
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

        <p className="text-xs text-gray-400">
          You can link input/output cables, splices, and splitters after
          creating the box, from its detail page.
        </p>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save TG Box"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/tg-boxes")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
