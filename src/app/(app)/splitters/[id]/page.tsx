"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const statusOptions = ["active", "inactive", "maintenance", "faulty"];
const portStatusOptions = ["free", "used", "damaged", "reserved"];

type Port = {
  id: string;
  port_number: number;
  power_percent: number | null;
  status: string;
};

type ChildSplitter = { id: string; name: string; ratio: string; parent_port_id: string };
type CustomerConn = { id: string; splitter_port_id: string | null; customers: { id: string; name: string } };
type Customer = { id: string; name: string };

export default function SplitterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [tgBoxes, setTgBoxes] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [ports, setPorts] = useState<Port[]>([]);
  const [childSplitters, setChildSplitters] = useState<ChildSplitter[]>([]);
  const [customerConns, setCustomerConns] = useState<CustomerConn[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [attachPortId, setAttachPortId] = useState("");
  const [attachCustomerId, setAttachCustomerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function loadDependents() {
    const [{ data: portList }, { data: children }, { data: conns }] =
      await Promise.all([
        supabase
          .from("splitter_ports")
          .select("id, port_number, power_percent, status")
          .eq("splitter_id", id)
          .order("port_number"),
        supabase
          .from("splitters")
          .select("id, name, ratio, parent_port_id")
          .not("parent_port_id", "is", null),
        supabase
          .from("customer_connections")
          .select("id, splitter_port_id, customers(id, name)")
          .not("splitter_port_id", "is", null),
      ]);
    setPorts(portList ?? []);
    const portIds = new Set((portList ?? []).map((p) => p.id));
    setChildSplitters(
      ((children ?? []) as ChildSplitter[]).filter((c) =>
        portIds.has(c.parent_port_id)
      )
    );
    setCustomerConns(
      ((conns ?? []) as unknown as CustomerConn[]).filter(
        (c) => c.splitter_port_id && portIds.has(c.splitter_port_id)
      )
    );
  }

  useEffect(() => {
    async function load() {
      const [{ data, error }, { data: boxList }, { data: customerList }] =
        await Promise.all([
          supabase.from("splitters").select("*").eq("id", id).single(),
          supabase.from("tg_boxes").select("id, name").order("name"),
          supabase.from("customers").select("id, name").order("name"),
        ]);

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setTgBoxes(boxList ?? []);
      setAllCustomers(customerList ?? []);
      setForm({
        name: data.name ?? "",
        ratio: data.ratio ?? "1:8",
        tg_box_id: data.tg_box_id ?? "",
        latitude: data.latitude ? String(data.latitude) : "",
        longitude: data.longitude ? String(data.longitude) : "",
        status: data.status ?? "active",
        notes: data.notes ?? "",
      });
      await loadDependents();
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
      .from("splitters")
      .update({
        name: form.name,
        tg_box_id: form.tg_box_id || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        status: form.status,
        notes: form.notes || null,
      })
      .eq("id", id);

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/splitters");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this splitter and all its ports? This cannot be undone."))
      return;
    setLoading(true);
    const { error } = await supabase.from("splitters").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/splitters");
    router.refresh();
  }

  async function updatePortStatus(portId: string, status: string) {
    await supabase.from("splitter_ports").update({ status }).eq("id", portId);
    setPorts((ps) => ps.map((p) => (p.id === portId ? { ...p, status } : p)));
  }

  async function attachCustomerToPort() {
    if (!attachPortId || !attachCustomerId) return;
    const { error } = await supabase.from("customer_connections").insert({
      customer_id: attachCustomerId,
      splitter_port_id: attachPortId,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setAttachPortId("");
    setAttachCustomerId("");
    await loadDependents();
  }

  async function detachCustomer(connId: string) {
    await supabase.from("customer_connections").delete().eq("id", connId);
    await loadDependents();
  }

  if (notFound) {
    return <p className="text-gray-500">Splitter not found.</p>;
  }

  if (!form) {
    return <p className="text-gray-500">Loading...</p>;
  }

  function portMeta(portId: string) {
    const child = childSplitters.find((c) => c.parent_port_id === portId);
    if (child) {
      return {
        label: `→ Splitter ${child.name} (${child.ratio})`,
        href: `/splitters/${child.id}`,
      };
    }
    const conn = customerConns.find((c) => c.splitter_port_id === portId);
    if (conn) {
      return {
        label: `→ Customer ${conn.customers.name}`,
        href: `/customers/${conn.customers.id}`,
        detach: conn.id,
      };
    }
    return null;
  }

  const freePorts = ports.filter((p) => p.status === "free");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="mb-6 text-xl font-semibold text-gray-900">Edit Splitter</h1>

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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ratio
            </label>
            <input
              disabled
              value={form.ratio}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              TG / Joint Box
            </label>
            <select
              value={form.tg_box_id}
              onChange={(e) => update("tg_box_id", e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">(standalone / in field)</option>
              {tgBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => update("latitude", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Longitude
              </label>
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
                onClick={() => router.push("/splitters")}
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
          Attach Customer to a Free Port
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Port
            </label>
            <select
              value={attachPortId}
              onChange={(e) => setAttachPortId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select free port...</option>
              {freePorts.map((p) => (
                <option key={p.id} value={p.id}>
                  Port {p.port_number}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Customer
            </label>
            <select
              value={attachCustomerId}
              onChange={(e) => setAttachCustomerId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select customer...</option>
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={attachCustomerToPort}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Attach
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Ports ({ports.length})
        </h2>
        <div className="space-y-2">
          {ports.map((port) => {
            const meta = portMeta(port.id);
            return (
              <div
                key={port.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    Port {port.port_number}
                  </span>
                  {port.power_percent !== null && (
                    <span className="text-xs text-gray-500">
                      {port.power_percent}% power
                    </span>
                  )}
                  {meta && (
                    <Link
                      href={meta.href}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {meta.label}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {meta?.detach && (
                    <button
                      onClick={() => detachCustomer(meta.detach!)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      detach
                    </button>
                  )}
                  <select
                    value={port.status}
                    onChange={(e) => updatePortStatus(port.id, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {portStatusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          {ports.length === 0 && (
            <p className="text-sm text-gray-400">No ports found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
