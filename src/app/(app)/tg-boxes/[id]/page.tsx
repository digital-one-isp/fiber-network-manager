"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
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

const colorHex: Record<string, string> = {
  Blue: "#2563eb", Orange: "#ea580c", Green: "#16a34a", Brown: "#78350f",
  Slate: "#64748b", White: "#e5e7eb", Red: "#dc2626", Black: "#111827",
  Yellow: "#eab308", Violet: "#7c3aed", Rose: "#f43f5e", Aqua: "#06b6d4",
};

type Cable = { id: string; name: string };
type Core = { id: string; core_number: number; color: string; status: string };
type CableLink = { id: string; cable_id: string; direction: "input" | "output"; cables: Cable };
type Splice = {
  id: string;
  splice_point_id: string;
  core_a_id: string;
  core_b_id: string;
  splice_loss_db: number | null;
};
type SplicePoint = { id: string; tray_number: number };
type Splitter = { id: string; name: string; ratio: string; status: string; input_core_id: string | null };
type Customer = { id: string; name: string };
type CustomerLink = { id: string; customer_id: string; core_id: string | null; customers: Customer };

export default function TgBoxDetailPage({
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

  const [allCables, setAllCables] = useState<Cable[]>([]);
  const [links, setLinks] = useState<CableLink[]>([]);
  const [linkCableId, setLinkCableId] = useState("");
  const [linkDirection, setLinkDirection] = useState<"input" | "output">("input");

  const [coresByCable, setCoresByCable] = useState<Record<string, Core[]>>({});

  const [splicePoint, setSplicePoint] = useState<SplicePoint | null>(null);
  const [splices, setSplices] = useState<Splice[]>([]);
  const [spliceCoreA, setSpliceCoreA] = useState("");
  const [spliceCoreB, setSpliceCoreB] = useState("");

  const [splitters, setSplitters] = useState<Splitter[]>([]);

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [customerLinks, setCustomerLinks] = useState<CustomerLink[]>([]);
  const [linkCustomerId, setLinkCustomerId] = useState("");
  const [linkCustomerCoreId, setLinkCustomerCoreId] = useState("");

  async function loadCoresFor(cableId: string) {
    if (coresByCable[cableId]) return;
    const { data } = await supabase
      .from("fiber_cores")
      .select("id, core_number, color, status")
      .eq("cable_id", cableId)
      .order("core_number");
    setCoresByCable((prev) => ({ ...prev, [cableId]: data ?? [] }));
  }

  async function loadLinksAndDependents() {
    const { data: linkData } = await supabase
      .from("tg_box_cables")
      .select("id, cable_id, direction, cables:fiber_cables(id, name)")
      .eq("tg_box_id", id);
    const typedLinks = (linkData ?? []) as unknown as CableLink[];
    setLinks(typedLinks);
    for (const l of typedLinks) {
      await loadCoresFor(l.cable_id);
    }
  }

  async function loadSplicesData() {
    let point = splicePoint;
    if (!point) {
      const { data: existing } = await supabase
        .from("splice_points")
        .select("id, tray_number")
        .eq("tg_box_id", id)
        .order("tray_number")
        .limit(1)
        .maybeSingle();
      point = existing ?? null;
      setSplicePoint(point);
    }
    if (point) {
      const { data: spliceData } = await supabase
        .from("splices")
        .select("id, splice_point_id, core_a_id, core_b_id, splice_loss_db")
        .eq("splice_point_id", point.id);
      setSplices(spliceData ?? []);
    }
  }

  async function loadSplitters() {
    const { data } = await supabase
      .from("splitters")
      .select("id, name, ratio, status, input_core_id")
      .eq("tg_box_id", id);
    setSplitters(data ?? []);
  }

  async function loadCustomerLinks() {
    const { data } = await supabase
      .from("tg_box_customers")
      .select("id, customer_id, core_id, customers(id, name)")
      .eq("tg_box_id", id);
    setCustomerLinks((data ?? []) as unknown as CustomerLink[]);
  }

  useEffect(() => {
    async function load() {
      const [{ data, error }, { data: cableList }, { data: customerList }] =
        await Promise.all([
          supabase.from("tg_boxes").select("*").eq("id", id).single(),
          supabase.from("fiber_cables").select("id, name").order("name"),
          supabase.from("customers").select("id, name").order("name"),
        ]);

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setAllCables(cableList ?? []);
      setAllCustomers(customerList ?? []);
      setForm({
        name: data.name ?? "",
        box_category: data.box_category ?? "joint_4port",
        box_type: data.box_type ?? "pole_mounted",
        capacity: String(data.capacity ?? 0),
        latitude: String(data.latitude ?? ""),
        longitude: String(data.longitude ?? ""),
        address: data.address ?? "",
        status: data.status ?? "active",
        notes: data.notes ?? "",
      });

      await loadLinksAndDependents();
      await loadSplicesData();
      await loadSplitters();
      await loadCustomerLinks();
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
      .from("tg_boxes")
      .update({
        name: form.name,
        box_category: form.box_category,
        box_type: form.box_type,
        capacity: Number(form.capacity) || 0,
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
    router.push("/tg-boxes");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this TG box? This cannot be undone.")) return;
    setLoading(true);
    const { error } = await supabase.from("tg_boxes").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/tg-boxes");
    router.refresh();
  }

  async function addCableLink() {
    if (!linkCableId) return;
    const { error } = await supabase.from("tg_box_cables").insert({
      tg_box_id: id,
      cable_id: linkCableId,
      direction: linkDirection,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setLinkCableId("");
    await loadLinksAndDependents();
  }

  async function removeCableLink(linkId: string) {
    await supabase.from("tg_box_cables").delete().eq("id", linkId);
    setLinks((ls) => ls.filter((l) => l.id !== linkId));
  }

  async function ensureSplicePoint(): Promise<SplicePoint | null> {
    if (splicePoint) return splicePoint;
    const { data, error } = await supabase
      .from("splice_points")
      .insert({ tg_box_id: id, tray_number: 1 })
      .select("id, tray_number")
      .single();
    if (error) {
      alert(error.message);
      return null;
    }
    setSplicePoint(data);
    return data;
  }

  async function addSplice() {
    if (!spliceCoreA || !spliceCoreB) return;
    const point = await ensureSplicePoint();
    if (!point) return;

    const { error } = await supabase.from("splices").insert({
      splice_point_id: point.id,
      core_a_id: spliceCoreA,
      core_b_id: spliceCoreB,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setSpliceCoreA("");
    setSpliceCoreB("");
    await loadSplicesData();
  }

  async function removeSplice(spliceId: string) {
    await supabase.from("splices").delete().eq("id", spliceId);
    setSplices((ss) => ss.filter((s) => s.id !== spliceId));
  }

  async function addCustomerLink() {
    if (!linkCustomerId) return;
    const { error } = await supabase.from("tg_box_customers").insert({
      tg_box_id: id,
      customer_id: linkCustomerId,
      core_id: linkCustomerCoreId || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setLinkCustomerId("");
    setLinkCustomerCoreId("");
    await loadCustomerLinks();
  }

  async function removeCustomerLink(linkId: string) {
    await supabase.from("tg_box_customers").delete().eq("id", linkId);
    setCustomerLinks((ls) => ls.filter((l) => l.id !== linkId));
  }

  if (notFound) {
    return <p className="text-gray-500">TG box not found.</p>;
  }

  if (!form) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const inputLinks = links.filter((l) => l.direction === "input");
  const outputLinks = links.filter((l) => l.direction === "output");
  const allCoresInBox = links.flatMap((l) => coresByCable[l.cable_id] ?? []);

  function coreLabel(coreId: string) {
    for (const l of links) {
      const core = (coresByCable[l.cable_id] ?? []).find((c) => c.id === coreId);
      if (core) return `${l.cables.name} · Core ${core.core_number} (${core.color})`;
    }
    return coreId;
  }

  function coreColorDot(coreId: string) {
    for (const l of links) {
      const core = (coresByCable[l.cable_id] ?? []).find((c) => c.id === coreId);
      if (core) return colorHex[core.color] ?? "#999";
    }
    return "#999";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="mb-6 text-xl font-semibold text-gray-900">
          Edit TG / Joint Box
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
                onClick={() => router.push("/tg-boxes")}
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

      {/* Input / Output Cables */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Input / Output Cables
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Cable
            </label>
            <select
              value={linkCableId}
              onChange={(e) => setLinkCableId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select a cable...</option>
              {allCables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Direction
            </label>
            <select
              value={linkDirection}
              onChange={(e) =>
                setLinkDirection(e.target.value as "input" | "output")
              }
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="input">Input</option>
              <option value="output">Output</option>
            </select>
          </div>
          <button
            type="button"
            onClick={addCableLink}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Link Cable
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Input Cables ({inputLinks.length})
            </p>
            <ul className="space-y-1">
              {inputLinks.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded border border-gray-100 px-2 py-1 text-sm"
                >
                  <Link
                    href={`/fiber-cables/${l.cable_id}`}
                    className="text-gray-900 hover:underline"
                  >
                    {l.cables.name}
                  </Link>
                  <button
                    onClick={() => removeCableLink(l.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    remove
                  </button>
                </li>
              ))}
              {inputLinks.length === 0 && (
                <li className="text-xs text-gray-400">No input cables linked.</li>
              )}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Output Cables ({outputLinks.length})
            </p>
            <ul className="space-y-1">
              {outputLinks.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between rounded border border-gray-100 px-2 py-1 text-sm"
                >
                  <Link
                    href={`/fiber-cables/${l.cable_id}`}
                    className="text-gray-900 hover:underline"
                  >
                    {l.cables.name}
                  </Link>
                  <button
                    onClick={() => removeCableLink(l.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    remove
                  </button>
                </li>
              ))}
              {outputLinks.length === 0 && (
                <li className="text-xs text-gray-400">No output cables linked.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Customers */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Customers ({customerLinks.length})
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Customer
            </label>
            <select
              value={linkCustomerId}
              onChange={(e) => setLinkCustomerId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select a customer...</option>
              {allCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Core (optional)
            </label>
            <select
              value={linkCustomerCoreId}
              onChange={(e) => setLinkCustomerCoreId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">(none)</option>
              {allCoresInBox.map((c) => (
                <option key={c.id} value={c.id}>
                  {coreLabel(c.id)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addCustomerLink}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Link Customer
          </button>
        </div>

        <ul className="space-y-1">
          {customerLinks.map((cl) => (
            <li
              key={cl.id}
              className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <div>
                <Link
                  href={`/customers/${cl.customer_id}`}
                  className="font-medium text-gray-900 hover:underline"
                >
                  {cl.customers.name}
                </Link>
                <span className="ml-2 text-xs text-gray-400">
                  ID: {cl.customer_id}
                </span>
                {cl.core_id && (
                  <span className="ml-2 flex items-center gap-1 text-xs text-gray-500">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border border-gray-300"
                      style={{ backgroundColor: coreColorDot(cl.core_id) }}
                    />
                    {coreLabel(cl.core_id)}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeCustomerLink(cl.id)}
                className="text-xs text-red-500 hover:underline"
              >
                remove
              </button>
            </li>
          ))}
          {customerLinks.length === 0 && (
            <li className="text-xs text-gray-400">
              No customers linked to this box yet.
            </li>
          )}
        </ul>
      </div>

      {/* Splices */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Splices (Core ↔ Core)
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Core A
            </label>
            <select
              value={spliceCoreA}
              onChange={(e) => setSpliceCoreA(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select core...</option>
              {allCoresInBox.map((c) => (
                <option key={c.id} value={c.id}>
                  {coreLabel(c.id)}
                </option>
              ))}
            </select>
          </div>
          <span className="pb-2 text-gray-400">↔</span>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Core B
            </label>
            <select
              value={spliceCoreB}
              onChange={(e) => setSpliceCoreB(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select core...</option>
              {allCoresInBox.map((c) => (
                <option key={c.id} value={c.id}>
                  {coreLabel(c.id)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={addSplice}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Splice
          </button>
        </div>

        <ul className="space-y-1">
          {splices.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: coreColorDot(s.core_a_id) }}
                />
                <span>{coreLabel(s.core_a_id)}</span>
                <span className="text-gray-400">↔</span>
                <span
                  className="h-3 w-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: coreColorDot(s.core_b_id) }}
                />
                <span>{coreLabel(s.core_b_id)}</span>
              </div>
              <button
                onClick={() => removeSplice(s.id)}
                className="text-xs text-red-500 hover:underline"
              >
                remove
              </button>
            </li>
          ))}
          {splices.length === 0 && (
            <li className="text-xs text-gray-400">
              No splices recorded yet. Link input/output cables above first.
            </li>
          )}
        </ul>
      </div>

      {/* Splitters in this box */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Splitters in this Box ({splitters.length})
        </h2>
        <ul className="space-y-1">
          {splitters.map((sp) => (
            <li
              key={sp.id}
              className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{sp.name}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {sp.ratio}
                </span>
                <span className="text-xs text-gray-500">{sp.status}</span>
              </div>
              <span className="text-xs text-gray-500">
                {sp.input_core_id ? `PON: ${coreLabel(sp.input_core_id)}` : "No PON input set"}
              </span>
            </li>
          ))}
          {splitters.length === 0 && (
            <li className="text-xs text-gray-400">
              No splitters added to this box yet. (Add them from the Splitters
              page once it&apos;s built.)
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
