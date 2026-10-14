"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const statusOptions = ["active", "pending", "inactive", "suspended"];

export type ResellerFormValues = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  latitude: string;
  longitude: string;
  bandwidth_mbps: string;
  status: string;
  notes: string;
};

const emptyForm: ResellerFormValues = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  latitude: "",
  longitude: "",
  bandwidth_mbps: "",
  status: "active",
  notes: "",
};

export default function ResellerForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: ResellerFormValues;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<ResellerFormValues>(initial ?? emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof ResellerFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function payload() {
    return {
      name: form.name,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      latitude: form.latitude !== "" ? Number(form.latitude) : null,
      longitude: form.longitude !== "" ? Number(form.longitude) : null,
      bandwidth_mbps: form.bandwidth_mbps !== "" ? Number(form.bandwidth_mbps) : null,
      status: form.status,
      notes: form.notes || null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "create") {
      const { data, error } = await supabase
        .from("resellers")
        .insert(payload())
        .select("id")
        .single();
      setLoading(false);
      if (error || !data) {
        setError(error?.message ?? "Could not create the reseller.");
        return;
      }
      router.push(`/resellers/${data.id}`);
      router.refresh();
      return;
    }

    const { error } = await supabase.from("resellers").update(payload()).eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Changes saved.");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this reseller? Ports that served it will become unassigned.")) return;
    setLoading(true);
    const { error } = await supabase.from("resellers").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/resellers");
    router.refresh();
  }

  return (
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
            Contact person
          </label>
          <input
            value={form.contact_person}
            onChange={(e) => update("contact_person", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Total bandwidth (Mbps)
          </label>
          <input
            type="number"
            min={1}
            value={form.bandwidth_mbps}
            onChange={(e) => update("bandwidth_mbps", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
        <input
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Latitude</label>
          <input
            type="number"
            step="any"
            value={form.latitude}
            onChange={(e) => update("latitude", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Longitude</label>
          <input
            type="number"
            step="any"
            value={form.longitude}
            onChange={(e) => update("longitude", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
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
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : mode === "create" ? "Create reseller" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/resellers")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {mode === "create" ? "Cancel" : "Back to list"}
          </button>
        </div>
        {mode === "edit" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
