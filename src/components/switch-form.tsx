"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const roleOptions = [
  { value: "core", label: "Core" },
  { value: "aggregation", label: "Aggregation" },
  { value: "access", label: "Access" },
  { value: "other", label: "Other" },
];
const statusOptions = ["active", "inactive", "maintenance", "faulty"];
const vendors = [
  "BDCOM",
  "Cisco",
  "Huawei",
  "MikroTik",
  "Juniper",
  "H3C",
  "Ruijie",
  "ZTE",
  "TP-Link",
  "Ubiquiti",
  "VSOL",
  "Dasan",
];

export type SwitchFormValues = {
  name: string;
  vendor: string;
  model: string;
  management_ip: string;
  role: string;
  ports_1g: string;
  ports_10g: string;
  latitude: string;
  longitude: string;
  address: string;
  status: string;
  notes: string;
};

const emptyForm: SwitchFormValues = {
  name: "",
  vendor: "",
  model: "",
  management_ip: "",
  role: "aggregation",
  ports_1g: "0",
  ports_10g: "0",
  latitude: "",
  longitude: "",
  address: "",
  status: "active",
  notes: "",
};

export default function SwitchForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: SwitchFormValues;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<SwitchFormValues>(initial ?? emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof SwitchFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function basePayload() {
    return {
      name: form.name,
      vendor: form.vendor || null,
      model: form.model || null,
      management_ip: form.management_ip || null,
      role: form.role,
      latitude: form.latitude !== "" ? Number(form.latitude) : null,
      longitude: form.longitude !== "" ? Number(form.longitude) : null,
      address: form.address || null,
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
        .from("network_switches")
        .insert({
          ...basePayload(),
          ports_1g: Number(form.ports_1g) || 0,
          ports_10g: Number(form.ports_10g) || 0,
        })
        .select("id")
        .single();
      setLoading(false);
      if (error || !data) {
        setError(error?.message ?? "Could not create the switch.");
        return;
      }
      router.push(`/switches/${data.id}`);
      router.refresh();
      return;
    }

    const { error } = await supabase
      .from("network_switches")
      .update(basePayload())
      .eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Changes saved.");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this switch and all its port records? This cannot be undone."))
      return;
    setLoading(true);
    const { error } = await supabase.from("network_switches").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/switches");
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
          <input
            list="switch-vendors"
            value={form.vendor}
            onChange={(e) => update("vendor", e.target.value)}
            placeholder="BDCOM, Cisco..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <datalist id="switch-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
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
            placeholder="10.0.0.2"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
          <select
            value={form.role}
            onChange={(e) => update("role", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "create" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-sm font-medium text-gray-700">SFP ports to create now</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                1G SFP ports
              </label>
              <input
                type="number"
                min={0}
                max={96}
                value={form.ports_1g}
                onChange={(e) => update("ports_1g", e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                10G SFP+ ports
              </label>
              <input
                type="number"
                min={0}
                max={96}
                value={form.ports_10g}
                onChange={(e) => update("ports_10g", e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            You can add other ports (25G, 40G, RJ45) or remove ports later from the
            switch page.
          </p>
        </div>
      )}

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
        <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
        <input
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
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
            {loading ? "Saving..." : mode === "create" ? "Create switch" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/switches")}
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
