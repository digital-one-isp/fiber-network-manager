"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TgBoxSplices from "@/components/tg-box-splices";

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
const ratioGroups = {
  "Symmetric (PON)": ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"],
  "Asymmetric (Tap)": ["5:95", "10:90", "15:85", "20:80", "30:70", "40:60", "50:50"],
};

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
type Customer = { id: string; name: string };
type CustomerLink = { id: string; customer_id: string; core_id: string | null; customers: Customer };

type BoxSplitter = {
  id: string;
  name: string;
  ratio: string;
  status: string;
  input_core_id: string | null;
  parent_port_id: string | null;
};
type PortRow = {
  id: string;
  splitter_id: string;
  port_number: number;
  power_percent: number | null;
  status: string;
};
type ParentInfo = { portNumber: number; splitterId: string; splitterName: string; ratio: string };
type ChildInfo = { splitterId: string; name: string; ratio: string };
type CustomerInfo = { connId: string; customerId: string; customerName: string };

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

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [customerLinks, setCustomerLinks] = useState<CustomerLink[]>([]);
  const [linkCustomerId, setLinkCustomerId] = useState("");
  const [linkCustomerCoreId, setLinkCustomerCoreId] = useState("");

  // Splitter chain state
  const [boxSplitters, setBoxSplitters] = useState<BoxSplitter[]>([]);
  const [portsBySplitter, setPortsBySplitter] = useState<Record<string, PortRow[]>>({});
  const [parentInfoBySplitter, setParentInfoBySplitter] = useState<
    Record<string, ParentInfo>
  >({});
  const [childByPort, setChildByPort] = useState<Record<string, ChildInfo>>({});
  const [customerByPort, setCustomerByPort] = useState<Record<string, CustomerInfo>>({});

  // New splitter form state
  const [newSpName, setNewSpName] = useState("");
  const [newSpRatio, setNewSpRatio] = useState("1:8");
  const [newSpFeedType, setNewSpFeedType] = useState<"core" | "parent_port">("core");
  const [newSpCableId, setNewSpCableId] = useState("");
  const [newSpCoreId, setNewSpCoreId] = useState("");
  const [newSpParentSplitterId, setNewSpParentSplitterId] = useState("");
  const [newSpParentPortId, setNewSpParentPortId] = useState("");

  // Editing existing splitter
  const [editingSplitterId, setEditingSplitterId] = useState<string | null>(null);
  const [editSpName, setEditSpName] = useState("");
  const [editSpStatus, setEditSpStatus] = useState("active");

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

  async function loadCustomerLinks() {
    const { data } = await supabase
      .from("tg_box_customers")
      .select("id, customer_id, core_id, customers(id, name)")
      .eq("tg_box_id", id);
    setCustomerLinks((data ?? []) as unknown as CustomerLink[]);
  }

  async function loadSplitterChain() {
    const { data: splittersData } = await supabase
      .from("splitters")
      .select("id, name, ratio, status, input_core_id, parent_port_id")
      .eq("tg_box_id", id);
    const splitters = (splittersData ?? []) as BoxSplitter[];
    setBoxSplitters(splitters);
    if (splitters.length === 0) {
      setPortsBySplitter({});
      setParentInfoBySplitter({});
      setChildByPort({});
      setCustomerByPort({});
      return;
    }

    const splitterIds = splitters.map((s) => s.id);

    const { data: portsData } = await supabase
      .from("splitter_ports")
      .select("id, splitter_id, port_number, power_percent, status")
      .in("splitter_id", splitterIds)
      .order("port_number");
    const ports = (portsData ?? []) as PortRow[];

    const byS: Record<string, PortRow[]> = {};
    for (const p of ports) {
      byS[p.splitter_id] = byS[p.splitter_id] ?? [];
      byS[p.splitter_id].push(p);
    }
    setPortsBySplitter(byS);

    const portIds = ports.map((p) => p.id);

    const parentPortIds = splitters
      .map((s) => s.parent_port_id)
      .filter((x): x is string => !!x);

    const parentInfo: Record<string, ParentInfo> = {};
    if (parentPortIds.length > 0) {
      const { data: parentPortsData } = await supabase
        .from("splitter_ports")
        .select("id, port_number, splitter_id")
        .in("id", parentPortIds);
      const parentSplitterIds = (parentPortsData ?? []).map((p) => p.splitter_id);
      const { data: parentSplittersData } = await supabase
        .from("splitters")
        .select("id, name, ratio")
        .in("id", parentSplitterIds.length > 0 ? parentSplitterIds : ["00000000-0000-0000-0000-000000000000"]);
      const parentSplitterMap: Record<string, { name: string; ratio: string }> = {};
      for (const ps of parentSplittersData ?? []) {
        parentSplitterMap[ps.id] = { name: ps.name, ratio: ps.ratio };
      }
      const portMap: Record<string, { port_number: number; splitter_id: string }> = {};
      for (const pp of parentPortsData ?? []) {
        portMap[pp.id] = pp;
      }
      for (const s of splitters) {
        if (s.parent_port_id && portMap[s.parent_port_id]) {
          const pp = portMap[s.parent_port_id];
          const psInfo = parentSplitterMap[pp.splitter_id];
          if (psInfo) {
            parentInfo[s.id] = {
              portNumber: pp.port_number,
              splitterId: pp.splitter_id,
              splitterName: psInfo.name,
              ratio: psInfo.ratio,
            };
          }
        }
      }
    }
    setParentInfoBySplitter(parentInfo);

    const childByP: Record<string, ChildInfo> = {};
    if (portIds.length > 0) {
      const { data: childrenData } = await supabase
        .from("splitters")
        .select("id, name, ratio, parent_port_id")
        .in("parent_port_id", portIds);
      for (const c of childrenData ?? []) {
        if (c.parent_port_id) {
          childByP[c.parent_port_id] = { splitterId: c.id, name: c.name, ratio: c.ratio };
        }
      }
    }
    setChildByPort(childByP);

    const customerByP: Record<string, CustomerInfo> = {};
    if (portIds.length > 0) {
      const { data: connsData } = await supabase
        .from("customer_connections")
        .select("id, splitter_port_id, customers(id, name)")
        .in("splitter_port_id", portIds);
      for (const c of (connsData ?? []) as unknown as {
        id: string;
        splitter_port_id: string;
        customers: { id: string; name: string };
      }[]) {
        customerByP[c.splitter_port_id] = {
          connId: c.id,
          customerId: c.customers.id,
          customerName: c.customers.name,
        };
      }
    }
    setCustomerByPort(customerByP);
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
      await loadCustomerLinks();
      await loadSplitterChain();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, supabase]);

  useEffect(() => {
    if (!newSpCableId) return;
    loadCoresFor(newSpCableId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSpCableId]);

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

  async function detachCustomerFromPort(connId: string) {
    await supabase.from("customer_connections").delete().eq("id", connId);
    await loadSplitterChain();
  }

  // --- Splitter add/edit/delete, all inline on this page ---

  async function addSplitterToBox() {
    if (!newSpName) {
      alert("Name is required.");
      return;
    }
    if (newSpFeedType === "core" && !newSpCoreId) {
      alert("Select a core for the input.");
      return;
    }
    if (newSpFeedType === "parent_port" && !newSpParentPortId) {
      alert("Select a parent splitter port.");
      return;
    }

    const { error } = await supabase.from("splitters").insert({
      name: newSpName,
      ratio: newSpRatio,
      tg_box_id: id,
      input_core_id: newSpFeedType === "core" ? newSpCoreId : null,
      parent_port_id: newSpFeedType === "parent_port" ? newSpParentPortId : null,
      status: "active",
    });

    if (error) {
      alert(error.message);
      return;
    }

    setNewSpName("");
    setNewSpRatio("1:8");
    setNewSpCableId("");
    setNewSpCoreId("");
    setNewSpParentSplitterId("");
    setNewSpParentPortId("");
    await loadSplitterChain();
  }

  function startEditSplitter(sp: BoxSplitter) {
    setEditingSplitterId(sp.id);
    setEditSpName(sp.name);
    setEditSpStatus(sp.status);
  }

  async function saveEditSplitter(splitterId: string) {
    const { error } = await supabase
      .from("splitters")
      .update({ name: editSpName, status: editSpStatus })
      .eq("id", splitterId);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingSplitterId(null);
    await loadSplitterChain();
  }

  async function deleteSplitter(splitterId: string) {
    if (
      !confirm(
        "Delete this splitter and all its ports? Any cascaded child splitters or customer links on its ports will be unassigned."
      )
    )
      return;
    const { error } = await supabase.from("splitters").delete().eq("id", splitterId);
    if (error) {
      alert(error.message);
      return;
    }
    await loadSplitterChain();
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
  const newSpCableCores = newSpCableId ? coresByCable[newSpCableId] ?? [] : [];
  const newSpParentPorts = newSpParentSplitterId
    ? portsBySplitter[newSpParentSplitterId] ?? []
    : [];

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
                <li key={l.id} className="rounded border border-gray-100 px-2 py-1 text-sm">
                  <div className="flex items-center justify-between">
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
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(coresByCable[l.cable_id] ?? []).map((c) => (
                      <span
                        key={c.id}
                        title={`Core ${c.core_number} - ${c.color} - ${c.status}`}
                        className="inline-block h-3 w-3 rounded-full border border-gray-300"
                        style={{ backgroundColor: colorHex[c.color] ?? "#999" }}
                      />
                    ))}
                  </div>
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
                <li key={l.id} className="rounded border border-gray-100 px-2 py-1 text-sm">
                  <div className="flex items-center justify-between">
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
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(coresByCable[l.cable_id] ?? []).map((c) => (
                      <span
                        key={c.id}
                        title={`Core ${c.core_number} - ${c.color} - ${c.status}`}
                        className="inline-block h-3 w-3 rounded-full border border-gray-300"
                        style={{ backgroundColor: colorHex[c.color] ?? "#999" }}
                      />
                    ))}
                  </div>
                </li>
              ))}
              {outputLinks.length === 0 && (
                <li className="text-xs text-gray-400">No output cables linked.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Customers (direct box link) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Customers Directly Linked to Box ({customerLinks.length})
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
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500">
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

      <TgBoxSplices tgBoxId={id} />

      {/* Full splitter chain: add/edit/delete inline */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          Splitter Chain ({boxSplitters.length} splitter{boxSplitters.length === 1 ? "" : "s"})
        </h2>
        <p className="mb-4 text-xs text-gray-400">
          Add, edit, delete, and link splitters right here — shows each
          splitter&apos;s input source and what each port connects to.
        </p>

        {/* Add splitter form */}
        <div className="mb-5 rounded-lg border border-dashed border-gray-300 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            + Add Splitter to this Box
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Name
              </label>
              <input
                value={newSpName}
                onChange={(e) => setNewSpName(e.target.value)}
                className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Ratio
              </label>
              <select
                value={newSpRatio}
                onChange={(e) => setNewSpRatio(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {Object.entries(ratioGroups).map(([group, ratios]) => (
                  <optgroup key={group} label={group}>
                    {ratios.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={newSpFeedType === "core"}
                onChange={() => setNewSpFeedType("core")}
              />
              Feed from Core
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={newSpFeedType === "parent_port"}
                onChange={() => setNewSpFeedType("parent_port")}
              />
              Feed from another Splitter&apos;s Port
            </label>
          </div>

          {newSpFeedType === "core" ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Cable (from this box&apos;s linked cables)
                </label>
                <select
                  value={newSpCableId}
                  onChange={(e) => {
                    setNewSpCableId(e.target.value);
                    setNewSpCoreId("");
                  }}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select cable...</option>
                  {links.map((l) => (
                    <option key={l.id} value={l.cable_id}>
                      {l.cables.name} ({l.direction})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Core
                </label>
                <select
                  value={newSpCoreId}
                  onChange={(e) => setNewSpCoreId(e.target.value)}
                  disabled={!newSpCableId}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                >
                  <option value="">Select core...</option>
                  {newSpCableCores.map((c) => (
                    <option key={c.id} value={c.id}>
                      Core {c.core_number} ({c.color})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Parent Splitter (in this box)
                </label>
                <select
                  value={newSpParentSplitterId}
                  onChange={(e) => {
                    setNewSpParentSplitterId(e.target.value);
                    setNewSpParentPortId("");
                  }}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select splitter...</option>
                  {boxSplitters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.ratio})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Parent Port
                </label>
                <select
                  value={newSpParentPortId}
                  onChange={(e) => setNewSpParentPortId(e.target.value)}
                  disabled={!newSpParentSplitterId}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                >
                  <option value="">Select port...</option>
                  {newSpParentPorts.map((p) => (
                    <option key={p.id} value={p.id}>
                      Port {p.port_number} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={addSplitterToBox}
            className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            + Add Splitter
          </button>
        </div>

        <div className="space-y-4">
          {boxSplitters.map((sp) => {
            const parent = parentInfoBySplitter[sp.id];
            const ports = portsBySplitter[sp.id] ?? [];
            const isEditing = editingSplitterId === sp.id;
            return (
              <div
                key={sp.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  {sp.input_core_id ? (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-50 px-2 py-1">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-gray-300"
                        style={{ backgroundColor: coreColorDot(sp.input_core_id) }}
                      />
                      {coreLabel(sp.input_core_id)}
                    </span>
                  ) : parent ? (
                    <Link
                      href={`/splitters/${parent.splitterId}`}
                      className="rounded bg-gray-50 px-2 py-1 text-blue-600 hover:underline"
                    >
                      {parent.splitterName} ({parent.ratio}) · Port {parent.portNumber}
                    </Link>
                  ) : (
                    <span className="rounded bg-gray-50 px-2 py-1 text-gray-400">
                      (no input set)
                    </span>
                  )}
                  <span className="text-gray-400">↔</span>

                  {isEditing ? (
                    <>
                      <input
                        value={editSpName}
                        onChange={(e) => setEditSpName(e.target.value)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <select
                        value={editSpStatus}
                        onChange={(e) => setEditSpStatus(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => saveEditSplitter(sp.id)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        save
                      </button>
                      <button
                        onClick={() => setEditingSplitterId(null)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/splitters/${sp.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {sp.name}
                      </Link>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {sp.ratio}
                      </span>
                      <span className="text-xs text-gray-500">{sp.status}</span>
                      <button
                        onClick={() => startEditSplitter(sp)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteSplitter(sp.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        delete
                      </button>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ports.map((port) => {
                    const child = childByPort[port.id];
                    const cust = customerByPort[port.id];
                    return (
                      <div
                        key={port.id}
                        className="flex items-center justify-between rounded border border-gray-100 px-2 py-1 text-xs"
                      >
                        <span className="text-gray-600">
                          Port {port.port_number}
                          {port.power_percent !== null
                            ? ` (${port.power_percent}%)`
                            : ""}
                        </span>
                        <span className="text-gray-400">↔</span>
                        {child ? (
                          <Link
                            href={`/splitters/${child.splitterId}`}
                            className="text-blue-600 hover:underline"
                          >
                            Splitter {child.name} ({child.ratio})
                          </Link>
                        ) : cust ? (
                          <span className="flex items-center gap-1">
                            <Link
                              href={`/customers/${cust.customerId}`}
                              className="text-blue-600 hover:underline"
                            >
                              Customer {cust.customerName}
                            </Link>
                            <button
                              onClick={() => detachCustomerFromPort(cust.connId)}
                              className="text-red-500 hover:underline"
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <span className="text-gray-300">free</span>
                        )}
                      </div>
                    );
                  })}
                  {ports.length === 0 && (
                    <p className="text-xs text-gray-400">No ports found.</p>
                  )}
                </div>
              </div>
            );
          })}
          {boxSplitters.length === 0 && (
            <p className="text-xs text-gray-400">
              No splitters in this box yet. Use the form above to add one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
