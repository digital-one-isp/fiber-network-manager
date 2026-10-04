"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const statusOptions = ["pending", "active", "inactive", "suspended"];

type SplitterInfo = { id: string; name: string; ratio: string; tg_box_id: string | null };
type TgBoxInfo = { id: string; name: string };
type PortConn = {
  id: string;
  splitter_port_id: string | null;
  onu_serial_number: string | null;
  status: string;
  splitter_ports: { id: string; port_number: number; splitters: SplitterInfo } | null;
};

export default function CustomerDetailPage({
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

  const [portConns, setPortConns] = useState<PortConn[]>([]);
  const [tgBoxNames, setTgBoxNames] = useState<Record<string, string>>({});
  const [directBoxLinks, setDirectBoxLinks] = useState<
    { id: string; tg_box_id: string; core_id: string | null; tg_boxes: TgBoxInfo }[]
  >([]);

  async function loadConnections() {
    const { data: conns } = await supabase
      .from("customer_connections")
      .select(
        "id, splitter_port_id, onu_serial_number, status, splitter_ports(id, port_number, splitters(id, name, ratio, tg_box_id))"
      )
      .eq("customer_id", id);
    const typed = (conns ?? []) as unknown as PortConn[];
    setPortConns(typed);

    const boxIds = typed
      .map((c) => c.splitter_ports?.splitters?.tg_box_id)
      .filter((x): x is string => !!x);
    if (boxIds.length > 0) {
      const { data: boxes } = await supabase
        .from("tg_boxes")
        .select("id, name")
        .in("id", boxIds);
      const map: Record<string, string> = {};
      for (const b of boxes ?? []) map[b.id] = b.name;
      setTgBoxNames(map);
    }

    const { data: directLinks } = await supabase
      .from("tg_box_customers")
      .select("id, tg_box_id, core_id, tg_boxes(id, name)")
      .eq("customer_id", id);
    setDirectBoxLinks(
      (directLinks ?? []) as unknown as {
        id: string;
        tg_box_id: string;
        core_id: string | null;
        tg_boxes: TgBoxInfo;
      }[]
    );
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setForm({
        name: data.name ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        latitude: String(data.latitude ?? ""),
        longitude: String(data.longitude ?? ""),
        package_name: data.package_name ?? "",
        status: data.status ?? "pending",
        notes: data.notes ?? "",
      });

      await loadConnections();
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
      .from("customers")
      .update({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        package_name: form.package_name || null,
        status: form.status,
        notes: form.notes || null,
      })
      .eq("id", id);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/customers");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    setLoading(true);
    const { error } = await supabase.from("customers").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/customers");
    router.refresh();
  }

  if (notFound) {
    return <p className="text-gray-500">Customer not found.</p>;
  }

  if (!form) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="mb-6 text-xl font-semibold text-gray-900">
          Edit Customer
        </h1>
        <p className="mb-4 text-xs text-gray-400">ID: {id}</p>

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
                Phone
              </label>
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
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
              Package
            </label>
            <input
              value={form.package_name}
              onChange={(e) => update("package_name", e.target.value)}
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
                onClick={() => router.push("/customers")}
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

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Network Connection
        </h2>
        {portConns.length === 0 && directBoxLinks.length === 0 && (
          <p className="text-sm text-gray-400">
            Not connected to any splitter port or TG box yet. Attach this
            customer to a splitter port from the Splitters or TG Box page.
          </p>
        )}

        {portConns.map((conn) => {
          const port = conn.splitter_ports;
          const splitter = port?.splitters;
          const boxName = splitter?.tg_box_id
            ? tgBoxNames[splitter.tg_box_id]
            : null;
          return (
            <div
              key={conn.id}
              className="mb-2 flex flex-wrap items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {conn.status}
              </span>
              {conn.onu_serial_number && (
                <span className="text-xs text-gray-500">
                  ONU: {conn.onu_serial_number}
                </span>
              )}
              {port && splitter ? (
                <span className="flex items-center gap-1">
                  <Link
                    href={`/splitters/${splitter.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {splitter.name} ({splitter.ratio})
                  </Link>
                  <span className="text-gray-400">· Port {port.port_number}</span>
                  {boxName && splitter.tg_box_id && (
                    <>
                      <span className="text-gray-400">in</span>
                      <Link
                        href={`/tg-boxes/${splitter.tg_box_id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {boxName}
                      </Link>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-xs text-gray-400">
                  (port/splitter details unavailable)
                </span>
              )}
            </div>
          );
        })}

        {directBoxLinks.map((link) => (
          <div
            key={link.id}
            className="mb-2 flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
          >
            <span className="text-xs text-gray-500">Direct box link:</span>
            <Link
              href={`/tg-boxes/${link.tg_box_id}`}
              className="text-blue-600 hover:underline"
            >
              {link.tg_boxes.name}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
