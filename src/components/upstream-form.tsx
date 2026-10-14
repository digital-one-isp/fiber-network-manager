"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const upstreamKindLabel: Record<string, string> = {
  iig: "IIG (international gateway)",
  ipt: "IPT / ITC",
  bdix: "BDIX / peering",
  cdn: "CDN / cache (GGC, FNA)",
  other: "Other",
};

const statusOptions = ["active", "inactive", "maintenance", "faulty"];

export type UpstreamFormValues = {
  name: string;
  kind: string;
  service: string;
  circuit_id: string;
  capacity_mbps: string;
  site_id: string;
  contact_person: string;
  phone: string;
  email: string;
  status: string;
  notes: string;
};

const emptyForm: UpstreamFormValues = {
  name: "",
  kind: "iig",
  service: "",
  circuit_id: "",
  capacity_mbps: "",
  site_id: "",
  contact_person: "",
  phone: "",
  email: "",
  status: "active",
  notes: "",
};

export default function UpstreamForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: UpstreamFormValues;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<UpstreamFormValues>(initial ?? emptyForm);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("sites")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSites((data ?? []) as unknown as { id: string; name: string }[]));
  }, [supabase]);

  function update<K extends keyof UpstreamFormValues>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function payload() {
    return {
      name: form.name,
      kind: form.kind,
      service: form.service || null,
      circuit_id: form.circuit_id || null,
      capacity_mbps: form.capacity_mbps !== "" ? Number(form.capacity_mbps) : null,
      site_id: form.site_id || null,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
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
        .from("upstream_providers")
        .insert(payload())
        .select("id")
        .single();
      setLoading(false);
      if (error || !data) {
        setError(error?.message ?? "Could not create the upstream ISP.");
        return;
      }
      router.push(`/upstreams/${data.id}`);
      router.refresh();
      return;
    }

    const { error } = await supabase
      .from("upstream_providers")
      .update(payload())
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
    if (!confirm("Delete this upstream ISP? Switch ports that use it will become unassigned."))
      return;
    setLoading(true);
    const { error } = await supabase.from("upstream_providers").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/upstreams");
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
          placeholder="e.g. Summit Communications"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select
            value={form.kind}
            onChange={(e) => update("kind", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {Object.entries(upstreamKindLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Capacity (Mbps)
          </label>
          <input
            type="number"
            min={1}
            value={form.capacity_mbps}
            onChange={(e) => update("capacity_mbps", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Service it carries
        </label>
        <input
          value={form.service}
          onChange={(e) => update("service", e.target.value)}
          placeholder="e.g. YouTube and Facebook, full internet, BDIX only"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Circuit ID</label>
          <input
            value={form.circuit_id}
            onChange={(e) => update("circuit_id", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Link ends at site
          </label>
          <select
            value={form.site_id}
            onChange={(e) => update("site_id", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">(not set)</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
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
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : mode === "create" ? "Create upstream ISP" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/upstreams")}
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
