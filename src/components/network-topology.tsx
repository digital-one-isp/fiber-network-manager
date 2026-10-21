"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import CoreNetwork from "@/components/core-network";
import FiberPath from "@/components/fiber-path";
import BoxInside from "@/components/box-inside";
import type { CoreData } from "@/lib/core-network-data";

/* ---------- Data types (built on the server, rendered here) ---------- */

export type Fault = { severity: string; title: string };
export type PortState =
  | "customer"
  | "cascade"
  | "used"
  | "reserved"
  | "damaged"
  | "free";

export type CustomerLeaf = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  pkg: string | null;
  onu: string | null;
  lat: number | null;
  lng: number | null;
  faults: Fault[];
};
export type PortNode = {
  id: string;
  number: number;
  power: number | null;
  state: PortState;
  customer: CustomerLeaf | null;
  child: SplitterNode | null;
};
export type SplitterNode = {
  id: string;
  name: string;
  ratio: string;
  status: string;
  lat: number | null;
  lng: number | null;
  faults: Fault[];
  ports: PortNode[];
};
export type BoxNode = {
  id: string;
  name: string;
  category: string | null;
  mount: string;
  status: string;
  capacity: number;
  address: string | null;
  lat: number | null;
  lng: number | null;
  faults: Fault[];
  splitters: SplitterNode[];
  outCables: CableNode[];
};
export type CableNode = {
  id: string;
  name: string;
  type: string;
  coreCount: number;
  usedCores: number;
  damagedCores: number;
  lengthM: number | null;
  status: string;
  faults: Fault[];
  pon: PonLink | null;
  route: RoutePoint[];
  boxes: BoxNode[];
};
export type OltNode = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  ip: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  ponPorts: number;
  status: string;
  faults: Fault[];
  ports: OltPortNode[];
  otherPorts: OltOtherPort[];
  cables: CableNode[];
};
export type RoutePoint = {
  id: string;
  mark: number | null;
  place: string | null;
  kind: string;
  note: string | null;
  lat: number | null;
  lng: number | null;
  linked: string | null;
};
export type Ref = { id: string; name: string };
export type OltOtherPort = {
  id: string;
  label: string;
  speed: string;
  media: string;
  role: string;
  status: string;
  sfp: string | null;
  description: string | null;
  switchId: string | null;
  switchName: string | null;
  switchPortLabel: string | null;
  link: string | null;
  fiber: string | null;
};
export type PonLink = {
  number: number;
  label: string;
  description: string | null;
  coreNumber: number | null;
  coreColor: string | null;
};
export type OltPortNode = {
  id: string;
  number: number;
  label: string;
  description: string | null;
  status: string;
  sfp: string | null;
  tx: number | null;
  cableId: string | null;
  coreNumber: number | null;
  coreColor: string | null;
};
export type NetworkData = {
  olts: OltNode[];
  orphans: { cables: Ref[]; boxes: Ref[]; splitters: Ref[]; customers: Ref[] };
  totals: {
    olts: number;
    cables: number;
    coresTotal: number;
    coresUsed: number;
    boxes: number;
    splitters: number;
    customers: number;
    customersActive: number;
    openFaults: number;
    ponPorts: { total: number; connected: number };
    ports: {
      used: number;
      reserved: number;
      damaged: number;
      free: number;
      total: number;
    };
  };
};

/* ---------- Visual constants ---------- */

const C = {
  feeder: "#f59e0b",
  distribution: "#2563eb",
  drop: "#7c3aed",
  box: "#ea580c",
  splitter: "#16a34a",
  customer: "#e11d48",
  navy: "#0f2a4a",
};

function cableColor(type: string) {
  if (type === "feeder") return C.feeder;
  if (type === "distribution") return C.distribution;
  return C.drop;
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "#16a34a";
    case "pending":
    case "maintenance":
      return "#f59e0b";
    case "faulty":
    case "suspended":
      return "#dc2626";
    default:
      return "#9ca3af";
  }
}

function statusChipCls(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
    case "maintenance":
      return "bg-amber-50 text-amber-700";
    case "faulty":
    case "suspended":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

const categoryLabel: Record<string, string> = {
  joint_2port: "Joint box, 2 port",
  joint_4port: "Joint box, 4 port",
  joint_8port: "Joint box, 8 port",
  joint_16port: "Joint box, 16 port",
  splitter_primary_main: "Splitter, primary main",
  splitter_primary_2nd: "Splitter, primary 2nd",
  splitter_customer: "Splitter, customer box",
};

const portStyle: Record<PortState, string> = {
  customer: "border-violet-600 bg-violet-600 text-white",
  cascade: "border-blue-600 bg-blue-600 text-white",
  used: "border-emerald-600 bg-emerald-600 text-white",
  reserved: "border-amber-500 bg-amber-50 text-amber-700",
  damaged: "border-red-600 bg-red-600 text-white",
  free: "border-gray-300 bg-white text-gray-400",
};

const portLabel: Record<PortState, string> = {
  customer: "Customer attached",
  cascade: "Feeds another splitter",
  used: "In use",
  reserved: "Reserved",
  damaged: "Damaged",
  free: "Free",
};

const ponStatusCls: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  faulty: "bg-red-50 text-red-700",
  disabled: "bg-slate-200 text-slate-700",
};

const coreHex: Record<string, string> = {
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

function ponLed(p: OltPortNode) {
  if (p.status === "faulty") return "#ef4444";
  if (p.cableId) return C.feeder;
  if (p.status === "reserved") return "#60a5fa";
  return "rgba(255,255,255,0.22)";
}

function routeLength(route: RoutePoint[]) {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1].mark;
    const b = route[i].mark;
    if (a !== null && b !== null) total += Math.abs(b - a);
  }
  return total;
}
function fmtM(n: number) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} m`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtCoords(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}
function ponText(p: PonLink) {
  const core =
    p.coreNumber !== null
      ? `, core ${p.coreNumber}${p.coreColor ? ` (${p.coreColor})` : ""}`
      : "";
  return `${p.label}${core}`;
}
function mapsUrl(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/* ---------- Icons ---------- */

function IconOlt() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </svg>
  );
}
function IconCable() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12c3-6 6-6 9 0s6 6 9 0" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" />
    </svg>
  );
}
function IconSplitter() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4l9 16H3L12 4z" />
    </svg>
  );
}
function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

type NodeKind = "olt" | "cable" | "box" | "splitter" | "customer";

const kindIcon: Record<NodeKind, ReactNode> = {
  olt: <IconOlt />,
  cable: <IconCable />,
  box: <IconBox />,
  splitter: <IconSplitter />,
  customer: <IconHouse />,
};
const kindColor: Record<NodeKind, string> = {
  olt: C.navy,
  cable: C.feeder,
  box: C.box,
  splitter: C.splitter,
  customer: C.customer,
};
const kindLabel: Record<NodeKind, string> = {
  olt: "OLT",
  cable: "Fiber cable",
  box: "TG / joint box",
  splitter: "Splitter",
  customer: "Customer",
};

/* ---------- Small building blocks ---------- */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

function FaultDot({ faults }: { faults: Fault[] }) {
  if (faults.length === 0) return null;
  return (
    <span
      title={faults.map((f) => `${f.severity}: ${f.title}`).join("\n")}
      className="relative flex h-2.5 w-2.5 shrink-0"
    >
      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-70 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
    </span>
  );
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <span className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

function PortTile({ p }: { p: PortNode }) {
  return (
    <span
      title={`Port ${p.number}: ${portLabel[p.state].toLowerCase()}${p.customer ? ` (${p.customer.name})` : ""}`}
      className={`grid h-5 w-5 place-items-center rounded-[4px] border text-[10px] font-medium ${portStyle[p.state]}`}
    >
      {p.number}
    </span>
  );
}

type Kid = { color: string; node: ReactNode };

function Fork({ kids }: { kids: Kid[] }) {
  return (
    <div className="flex flex-col">
      {kids.map((k, i) => (
        <div key={i} className="relative flex items-center py-1.5 pl-7">
          <span
            className="absolute left-0 top-1/2 h-0.5 w-7 -translate-y-1/2"
            style={{ background: k.color }}
          />
          {kids.length > 1 && (
            <span
              className="absolute left-0 w-0.5"
              style={{
                background: k.color,
                top: i === 0 ? "50%" : 0,
                bottom: i === kids.length - 1 ? "50%" : 0,
              }}
            />
          )}
          {k.node}
        </div>
      ))}
    </div>
  );
}

function Chain({ node, kids }: { node: ReactNode; kids: Kid[] }) {
  return (
    <div className="flex items-center">
      {node}
      {kids.length > 0 && (
        <>
          <span className="h-0.5 w-7 shrink-0" style={{ background: kids[0].color }} />
          <Fork kids={kids} />
        </>
      )}
    </div>
  );
}

function cardCls(active: boolean) {
  return `shrink-0 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-gray-400 ${focusRing} ${
    active ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
  }`;
}

function chipCls(active: boolean) {
  return `flex shrink-0 items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm shadow-sm transition-colors hover:border-gray-400 ${focusRing} ${
    active ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
  }`;
}

/* ---------- Counting and search ---------- */

function tally(o: OltNode) {
  const t = { cables: 0, boxes: 0, splitters: 0, customers: 0 };
  function sp(s: SplitterNode) {
    t.splitters++;
    for (const p of s.ports) {
      if (p.customer) t.customers++;
      if (p.child) sp(p.child);
    }
  }
  function box(b: BoxNode) {
    t.boxes++;
    b.splitters.forEach(sp);
    b.outCables.forEach(cb);
  }
  function cb(c: CableNode) {
    t.cables++;
    c.boxes.forEach(box);
  }
  o.cables.forEach(cb);
  return t;
}

const mediaName: Record<string, string> = {
  sfp: "SFP",
  sfp_plus: "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP",
  rj45: "RJ45",
};
const otherRoleLabel: Record<string, string> = {
  uplink: "Uplink",
  management: "Management",
  other: "Other",
};

function portSummary(o: OltNode) {
  const sfp = o.otherPorts.filter((p) => p.media !== "rj45").length;
  const rj = o.otherPorts.length - sfp;
  const parts = [`${o.ports.length} PON`];
  if (sfp) parts.push(`${sfp} SFP`);
  if (rj) parts.push(`${rj} RJ45`);
  return parts.join(", ");
}

function splitterInUse(s: SplitterNode) {
  return s.ports.filter(
    (p) => p.state === "customer" || p.state === "cascade" || p.state === "used"
  ).length;
}

// Keys of nodes that stay visible for a query, or null when there is no query.
function computeVisible(olts: OltNode[], q: string): Set<string> | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const vis = new Set<string>();
  const hit = (...vals: (string | null | undefined)[]) =>
    vals.some((v) => !!v && v.toLowerCase().includes(s));

  function splitter(sp: SplitterNode, force: boolean): boolean {
    const self = force || hit(sp.name, sp.ratio);
    let any = self;
    for (const p of sp.ports) {
      let rowVisible = false;
      if (p.customer && (self || hit(p.customer.name, p.customer.phone, p.customer.id))) {
        rowVisible = true;
      }
      const childVisible = p.child ? splitter(p.child, self) : false;
      if (childVisible) rowVisible = true;
      if (rowVisible) {
        vis.add("pt:" + p.id);
        any = true;
      }
    }
    if (any) vis.add("sp:" + sp.id);
    return any;
  }
  function box(b: BoxNode, force: boolean): boolean {
    const self = force || hit(b.name, b.category);
    let any = self;
    for (const sp of b.splitters) if (splitter(sp, self)) any = true;
    for (const c of b.outCables) if (cable(c, self)) any = true;
    if (any) vis.add("bx:" + b.id);
    return any;
  }
  function cable(c: CableNode, force: boolean): boolean {
    const self = force || hit(c.name, c.type, c.pon?.label, c.pon?.description, ...c.route.flatMap((r) => [r.place, r.linked]));
    let any = self;
    for (const b of c.boxes) if (box(b, self)) any = true;
    if (any) vis.add("cb:" + c.id);
    return any;
  }
  for (const o of olts) {
    const self = hit(o.name, o.vendor, o.model);
    let any = self;
    for (const c of o.cables) if (cable(c, self)) any = true;
    if (any) vis.add("ol:" + o.id);
  }
  return vis;
}

/* ---------- Selection model (what the popup shows) ---------- */

type Crumb = { kind: NodeKind; label: string; sub?: string };

type Selection =
  | { key: string; kind: "olt"; node: OltNode; path: Crumb[] }
  | { key: string; kind: "cable"; node: CableNode; path: Crumb[] }
  | { key: string; kind: "box"; node: BoxNode; path: Crumb[] }
  | { key: string; kind: "splitter"; node: SplitterNode; path: Crumb[] }
  | {
      key: string;
      kind: "customer";
      node: CustomerLeaf;
      portId: string;
      portNumber: number;
      path: Crumb[];
    };

function selOlt(o: OltNode): Selection {
  return {
    key: "ol:" + o.id,
    kind: "olt",
    node: o,
    path: [
      {
        kind: "olt",
        label: o.name,
        sub: [o.vendor, o.model].filter(Boolean).join(" ") || undefined,
      },
    ],
  };
}
function selCable(c: CableNode, parent: Crumb[]): Selection {
  return {
    key: "cb:" + c.id,
    kind: "cable",
    node: c,
    path: [
      ...parent,
      { kind: "cable", label: c.name, sub: `${cap(c.type)}, ${c.coreCount} cores` },
    ],
  };
}
function selBox(b: BoxNode, parent: Crumb[]): Selection {
  return {
    key: "bx:" + b.id,
    kind: "box",
    node: b,
    path: [
      ...parent,
      { kind: "box", label: b.name, sub: categoryLabel[b.category ?? ""] },
    ],
  };
}
function selSplitter(s: SplitterNode, parent: Crumb[], via?: number): Selection {
  return {
    key: "sp:" + s.id,
    kind: "splitter",
    node: s,
    path: [
      ...parent,
      {
        kind: "splitter",
        label: s.name,
        sub: via ? `${s.ratio}, fed from port ${via}` : s.ratio,
      },
    ],
  };
}
function selCustomer(
  cu: CustomerLeaf,
  portId: string,
  portNumber: number,
  parent: Crumb[]
): Selection {
  return {
    key: "cu:" + portId,
    kind: "customer",
    node: cu,
    portId,
    portNumber,
    path: [...parent, { kind: "customer", label: cu.name, sub: `Splitter port ${portNumber}` }],
  };
}

type Info = {
  title: string;
  subtitle: string;
  status: string | null;
  facts: [string, string | null][];
  faults: Fault[];
  href: string;
  lat: number | null;
  lng: number | null;
};

function describe(sel: Selection): Info {
  if (sel.kind === "olt") {
    const o = sel.node;
    return {
      title: o.name,
      subtitle: "OLT",
      status: o.status,
      facts: [
        ["Device", [o.vendor, o.model].filter(Boolean).join(" ") || null],
        ["Management IP", o.ip],
        [
          "PON ports",
          `${o.ports.filter((p) => p.cableId).length} of ${o.ponPorts} connected`,
        ],
        ["SFP and RJ45 ports", String(o.otherPorts.length)],
        ["Cables attached", String(o.cables.length)],
        ["Address", o.address],
        ["Coordinates", fmtCoords(o.lat, o.lng)],
      ],
      faults: o.faults,
      href: `/olts/${o.id}`,
      lat: o.lat,
      lng: o.lng,
    };
  }
  if (sel.kind === "cable") {
    const c = sel.node;
    return {
      title: c.name,
      subtitle: `${cap(c.type)} cable`,
      status: c.status,
      facts: [
        ["Type", cap(c.type)],
        ["OLT PON port", c.pon ? ponText(c.pon) : null],
        ["Cores", String(c.coreCount)],
        ["In use", String(c.usedCores)],
        ["Damaged", String(c.damagedCores)],
        ["Length", c.lengthM !== null ? `${c.lengthM} m` : null],
        [
          "Route",
          c.route.length > 0
            ? `${c.route.length} points, ${fmtM(routeLength(c.route))} from the marks`
            : null,
        ],
      ],
      faults: c.faults,
      href: `/fiber-cables/${c.id}`,
      lat: null,
      lng: null,
    };
  }
  if (sel.kind === "box") {
    const b = sel.node;
    return {
      title: b.name,
      subtitle: categoryLabel[b.category ?? ""] ?? "TG / joint box",
      status: b.status,
      facts: [
        ["Category", categoryLabel[b.category ?? ""] ?? null],
        ["Mount", cap(b.mount.replace("_", " "))],
        ["Capacity", String(b.capacity)],
        ["Splitters inside", String(b.splitters.length)],
        ["Address", b.address],
        ["Coordinates", fmtCoords(b.lat, b.lng)],
      ],
      faults: b.faults,
      href: `/tg-boxes/${b.id}`,
      lat: b.lat,
      lng: b.lng,
    };
  }
  if (sel.kind === "splitter") {
    const s = sel.node;
    return {
      title: s.name,
      subtitle: `Splitter ${s.ratio}`,
      status: s.status,
      facts: [
        ["Ratio", s.ratio],
        ["Ports in use", `${splitterInUse(s)} of ${s.ports.length}`],
        ["Coordinates", fmtCoords(s.lat, s.lng)],
      ],
      faults: s.faults,
      href: `/splitters/${s.id}`,
      lat: s.lat,
      lng: s.lng,
    };
  }
  const cu = sel.node;
  return {
    title: cu.name,
    subtitle: "Customer",
    status: cu.status,
    facts: [
      ["Phone", cu.phone],
      ["Email", cu.email],
      ["Package", cu.pkg],
      ["ONU serial", cu.onu],
      ["Splitter port", `P${sel.portNumber}`],
      ["Address", cu.address],
      ["Coordinates", fmtCoords(cu.lat, cu.lng)],
      ["Customer ID", cu.id],
    ],
    faults: cu.faults,
    href: `/customers/${cu.id}`,
    lat: cu.lat,
    lng: cu.lng,
  };
}

/* ---------- Popup ---------- */

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-gray-900">{children}</h3>;
}

function DrillRow({
  color,
  icon,
  title,
  meta,
  onClick,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:border-gray-400 hover:bg-gray-50 ${focusRing}`}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ background: color + "1a", color }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{title}</span>
        {meta && <span className="block truncate text-xs text-gray-500">{meta}</span>}
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function DetailModal({
  sel,
  canGoBack,
  onBack,
  onClose,
  onSelect,
}: {
  sel: Selection;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelect: (s: Selection) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [sel.key]);

  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])"
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const info = describe(sel);
  const oltCables: CableNode[] = sel.kind === "olt" ? sel.node.cables : [];
  const color = kindColor[sel.kind];
  const maps = mapsUrl(info.lat, info.lng);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        onMouseDown={onClose}
        className={`absolute inset-0 bg-gray-900/50 transition-opacity duration-150 motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onKeyDown={trapTab}
        className={`relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl transition duration-150 motion-reduce:transition-none sm:rounded-2xl ${
          entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="h-1 w-full shrink-0" style={{ background: color }} />

        <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-5 py-4">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg [&_svg]:h-5 [&_svg]:w-5"
            style={{ background: color + "1a", color }}
          >
            {kindIcon[sel.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="detail-title" className="truncate text-lg font-semibold text-gray-900">
              {info.title}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{info.subtitle}</span>
              {info.status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChipCls(info.status)}`}
                >
                  {cap(info.status)}
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className={`rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${focusRing}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {info.faults.length > 0 && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{plural(info.faults.length, "open fault")}</p>
              <ul className="mt-1 space-y-0.5">
                {info.faults.map((f, i) => (
                  <li key={i}>
                    {f.title} (severity: {f.severity})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
            <section>
              <SectionTitle>Details</SectionTitle>
              <dl className="divide-y divide-gray-100 text-sm">
                {info.facts.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-2">
                    <dt className="shrink-0 text-gray-500">{label}</dt>
                    <dd
                      className={`break-all text-right ${
                        value ? "font-medium text-gray-900" : "text-gray-400"
                      }`}
                    >
                      {value ?? "Not set"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <SectionTitle>Signal path from the OLT</SectionTitle>
              <ol>
                {sel.path.map((c, i) => {
                  const last = i === sel.path.length - 1;
                  return (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && (
                        <span className="absolute bottom-0 left-[13px] top-7 w-px bg-gray-200" />
                      )}
                      <span
                        className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-white"
                        style={{ borderColor: kindColor[c.kind], color: kindColor[c.kind] }}
                      >
                        {kindIcon[c.kind]}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p
                          className={`truncate text-sm ${
                            last ? "font-semibold text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {c.label}
                        </p>
                        {c.sub && <p className="truncate text-xs text-gray-500">{c.sub}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          {sel.kind === "olt" && sel.node.ports.length > 0 && (
            <section className="mt-6">
              <SectionTitle>PON ports</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Port</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Fiber</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.node.ports.map((p) => {
                      const cable = p.cableId
                        ? oltCables.find((c) => c.id === p.cableId)
                        : undefined;
                      return (
                        <tr key={p.id} className="border-t border-gray-100 align-top">
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {p.label}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                ponStatusCls[p.status] ?? ponStatusCls.free
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {p.cableId ? (
                              <>
                                {cable ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelect(selCable(cable, sel.path))}
                                    className={`text-blue-600 hover:underline ${focusRing}`}
                                  >
                                    {cable.name}
                                  </button>
                                ) : (
                                  <span className="text-gray-700">Cable linked</span>
                                )}
                                {p.coreNumber !== null && (
                                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                                    <span
                                      className="h-2 w-2 rounded-full border border-gray-300"
                                      style={{
                                        backgroundColor: coreHex[p.coreColor ?? ""] ?? "#999",
                                      }}
                                    />
                                    Core {p.coreNumber}
                                    {p.coreColor ? ` (${p.coreColor})` : ""}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400">Nothing plugged in</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {p.description ?? (
                              <span className="text-gray-400">No description</span>
                            )}
                            {(p.sfp || p.tx !== null) && (
                              <span className="mt-0.5 block text-xs text-gray-400">
                                {[p.sfp, p.tx !== null ? `Tx ${p.tx} dBm` : null]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sel.kind === "olt" && sel.node.otherPorts.length > 0 && (
            <section className="mt-6">
              <SectionTitle>SFP and RJ45 ports</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Port</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Connected to</th>
                      <th className="px-3 py-2 font-medium">Module and description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.node.otherPorts.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100 align-top">
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-900">{p.label}</span>
                          <span className="block text-xs text-gray-400">
                            {otherRoleLabel[p.role] ?? p.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.speed} {mediaName[p.media] ?? p.media}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              ponStatusCls[p.status] ?? ponStatusCls.free
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {p.switchName ? (
                            <>
                              {p.switchName}
                              {p.switchPortLabel && (
                                <span className="block text-xs text-gray-500">
                                  {p.switchPortLabel}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">Not connected</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.sfp ?? <span className="text-gray-400">Module not set</span>}
                          {p.link && (
                            <span className="block text-xs text-gray-500">
                              Linked with {p.link}
                            </span>
                          )}
                          {p.fiber && (
                            <span className="block text-xs text-gray-500">
                              Fiber: {p.fiber}
                            </span>
                          )}
                          {p.description && (
                            <span className="block text-xs text-gray-500">{p.description}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sel.kind === "olt" && sel.node.cables.length > 0 && (
            <section className="mt-6">
              <SectionTitle>Cables from this OLT</SectionTitle>
              <div className="space-y-2">
                {sel.node.cables.map((c) => (
                  <DrillRow
                    key={c.id}
                    color={cableColor(c.type)}
                    icon={<IconCable />}
                    title={c.name}
                    meta={`${cap(c.type)}, ${c.usedCores} of ${c.coreCount} cores in use`}
                    onClick={() => onSelect(selCable(c, sel.path))}
                  />
                ))}
              </div>
            </section>
          )}

          {sel.kind === "cable" && (
            <>
              <section className="mt-6">
                <SectionTitle>Core usage</SectionTitle>
                {(() => {
                  const c = sel.node;
                  const free = Math.max(0, c.coreCount - c.usedCores - c.damagedCores);
                  const segs = [
                    { label: "In use", n: c.usedCores, color: "#16a34a" },
                    { label: "Damaged", n: c.damagedCores, color: "#dc2626" },
                    { label: "Free", n: free, color: "#d1d5db" },
                  ];
                  return (
                    <>
                      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
                        {segs.map((s) => (
                          <div
                            key={s.label}
                            style={{
                              width: c.coreCount ? `${(s.n / c.coreCount) * 100}%` : 0,
                              background: s.color,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                        {segs.map((s) => (
                          <span key={s.label} className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                            {s.label}
                            <b className="font-semibold tabular-nums text-gray-800">{s.n}</b>
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </section>
              {sel.node.boxes.length > 0 && (
                <section className="mt-6">
                  <SectionTitle>Boxes on this cable</SectionTitle>
                  <div className="space-y-2">
                    {sel.node.boxes.map((b) => (
                      <DrillRow
                        key={b.id}
                        color={C.box}
                        icon={<IconBox />}
                        title={b.name}
                        meta={categoryLabel[b.category ?? ""]}
                        onClick={() => onSelect(selBox(b, sel.path))}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {sel.kind === "cable" && <FiberPath cableId={sel.node.id} />}

          {sel.kind === "cable" && sel.node.route.length > 0 && (
            <section className="mt-6">
              <SectionTitle>
                Route, {plural(sel.node.route.length, "point")}, {fmtM(routeLength(sel.node.route))}
              </SectionTitle>
              {(() => {
                const route = sel.node.route;
                let run = 0;
                return (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Point</th>
                          <th className="px-3 py-2 font-medium">Place</th>
                          <th className="px-3 py-2 font-medium">Length mark</th>
                          <th className="px-3 py-2 font-medium">Leg</th>
                          <th className="px-3 py-2 font-medium">From start</th>
                          <th className="px-3 py-2 font-medium">How it goes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {route.map((p, i) => {
                          const prev = i > 0 ? route[i - 1] : null;
                          const leg =
                            prev && prev.mark !== null && p.mark !== null
                              ? Math.abs(p.mark - prev.mark)
                              : null;
                          run += leg ?? 0;
                          const tag =
                            i === 0 ? "Start" : i === route.length - 1 ? "End" : `Via ${i}`;
                          return (
                            <tr key={p.id} className="border-t border-gray-100 align-top">
                              <td className="px-3 py-2 text-gray-700">{tag}</td>
                              <td className="px-3 py-2 text-gray-900">
                                {p.place || p.linked || "Unnamed point"}
                                <span className="block text-xs text-gray-400">
                                  {cap(p.kind.replace("_", " "))}
                                  {p.linked && p.place ? `, ${p.linked}` : ""}
                                </span>
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gray-700">
                                {p.mark !== null ? fmtM(p.mark) : "Not set"}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gray-700">
                                {leg !== null ? fmtM(leg) : "-"}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gray-700">
                                {i === 0 ? "-" : fmtM(run)}
                              </td>
                              <td className="px-3 py-2 text-gray-600">
                                {p.note ?? <span className="text-gray-400">-</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </section>
          )}

          {sel.kind === "box" && <BoxInside boxId={sel.node.id} />}

          {sel.kind === "box" && (
            <>
              {sel.node.splitters.length > 0 && (
                <section className="mt-6">
                  <SectionTitle>Splitters in this box</SectionTitle>
                  <div className="space-y-2">
                    {sel.node.splitters.map((s) => (
                      <DrillRow
                        key={s.id}
                        color={C.splitter}
                        icon={<IconSplitter />}
                        title={`${s.name} (${s.ratio})`}
                        meta={`${splitterInUse(s)} of ${s.ports.length} ports in use`}
                        onClick={() => onSelect(selSplitter(s, sel.path))}
                      />
                    ))}
                  </div>
                </section>
              )}
              {sel.node.outCables.length > 0 && (
                <section className="mt-6">
                  <SectionTitle>Cables leaving this box</SectionTitle>
                  <div className="space-y-2">
                    {sel.node.outCables.map((c) => (
                      <DrillRow
                        key={c.id}
                        color={cableColor(c.type)}
                        icon={<IconCable />}
                        title={c.name}
                        meta={`${cap(c.type)}, ${c.usedCores} of ${c.coreCount} cores in use`}
                        onClick={() => onSelect(selCable(c, sel.path))}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {sel.kind === "splitter" && (
            <section className="mt-6">
              <SectionTitle>Ports</SectionTitle>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Port</th>
                      <th className="px-3 py-2 font-medium">Power</th>
                      <th className="px-3 py-2 font-medium">State</th>
                      <th className="px-3 py-2 font-medium">Connected to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.node.ports.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <PortTile p={p} />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">
                          {p.power !== null ? `${p.power}%` : "Not set"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{portLabel[p.state]}</td>
                        <td className="px-3 py-2">
                          {p.customer ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSelect(
                                  selCustomer(p.customer!, p.id, p.number, sel.path.slice())
                                )
                              }
                              className={`text-blue-600 hover:underline ${focusRing}`}
                            >
                              {p.customer.name}
                            </button>
                          ) : p.child ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSelect(selSplitter(p.child!, sel.path, p.number))
                              }
                              className={`text-blue-600 hover:underline ${focusRing}`}
                            >
                              {p.child.name} ({p.child.ratio})
                            </button>
                          ) : (
                            <span className="text-gray-400">Nothing yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-4">
            {canGoBack && (
              <button
                type="button"
                onClick={onBack}
                className={`text-sm text-gray-700 hover:underline ${focusRing}`}
              >
                Back
              </button>
            )}
            {maps && (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm text-blue-600 hover:underline ${focusRing}`}
              >
                View on Google Maps
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 ${focusRing}`}
            >
              Close
            </button>
            <Link
              href={info.href}
              className={`rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 ${focusRing}`}
            >
              Open full page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- The page component (redesigned) ---------- */

// Fixed widths per level keep every branch in the same column.
const W = {
  olt: "w-56",
  cable: "w-60",
  box: "w-56",
  splitter: "w-60",
  leaf: "w-52",
} as const;

const COLS = [
  { label: "OLT", w: W.olt, color: "#0f2a4a" },
  { label: "Fiber cable", w: W.cable, color: "#f59e0b" },
  { label: "TG box", w: W.box, color: "#ea580c" },
  { label: "Splitters, customers and links to other boxes", w: "w-[26rem]", color: "#16a34a" },
];

const dotGrid = {
  backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
  backgroundSize: "18px 18px",
};

const pillCls =
  "shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400";

function countLabel(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
function fmtRate(n: number) {
  if (n >= 1000) {
    const g = n / 1000;
    return `${Number.isInteger(g) ? g : g.toFixed(1)} Gbps`;
  }
  return `${n} Mbps`;
}
function fmtLength(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${n} m`;
}
function pctOf(a: number, b: number) {
  return b > 0 ? (a / b) * 100 : 0;
}

function FlowCloud() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.2A4 4 0 0117 18H7z" />
    </svg>
  );
}
function FlowSwitch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 12h.01M11 12h.01M15 12h.01M19 12h.01" />
    </svg>
  );
}

type FKid = { color: string; label?: string; node: ReactNode };

// Children sit to the right, joined by a rail. Each line ends in an arrow
// and may carry a small label (for example the splitter port number).
function FlowFork({ kids }: { kids: FKid[] }) {
  return (
    <div className="flex flex-col">
      {kids.map((k, i) => (
        <div key={i} className="relative flex items-center py-1.5 pl-7">
          <span
            className="absolute left-0 top-1/2 h-0.5 w-7 -translate-y-1/2"
            style={{ background: k.color }}
          />
          <span
            aria-hidden="true"
            className="absolute left-[21px] top-1/2 -translate-y-1/2 border-y-[4px] border-l-[7px] border-y-transparent"
            style={{ borderLeftColor: k.color }}
          />
          {k.label && (
            <span className="absolute left-0 top-1/2 -mt-1 w-[21px] -translate-y-full text-center text-[9px] font-semibold leading-none text-slate-500">
              {k.label}
            </span>
          )}
          {kids.length > 1 && (
            <span
              className="absolute left-0 w-0.5"
              style={{
                background: k.color,
                top: i === 0 ? "50%" : 0,
                bottom: i === kids.length - 1 ? "50%" : 0,
              }}
            />
          )}
          {k.node}
        </div>
      ))}
    </div>
  );
}

function FlowChain({ node, kids }: { node: ReactNode; kids: FKid[] }) {
  return (
    <div className="flex items-center">
      {node}
      {kids.length > 0 && (
        <>
          <span className="h-0.5 w-7 shrink-0" style={{ background: kids[0].color }} />
          <FlowFork kids={kids} />
        </>
      )}
    </div>
  );
}

function NodeCard({
  width,
  color,
  icon,
  title,
  badge,
  subtitle,
  dot,
  faults,
  active,
  onClick,
  compact,
  children,
}: {
  width: string;
  color: string;
  icon: ReactNode;
  title: string;
  badge?: string;
  subtitle?: string | null;
  dot?: string;
  faults?: Fault[];
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${width} shrink-0 rounded-xl border bg-white text-left shadow-sm transition-colors hover:border-slate-400 hover:shadow-md motion-reduce:transition-none ${focusRing} ${
        compact ? "p-2.5" : "p-3"
      } ${active ? "border-gray-900 ring-2 ring-gray-900/10" : "border-slate-200"}`}
    >
      <span className="flex items-start gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: color + "1a", color }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-gray-900">{title}</span>
            {badge && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {badge}
              </span>
            )}
            {dot && (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
            )}
            {faults && <FaultDot faults={faults} />}
          </span>
          {subtitle && (
            <span className="block truncate text-xs text-gray-500">{subtitle}</span>
          )}
        </span>
      </span>
      {children}
    </button>
  );
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} 0deg ${p * 3.6}deg, #e5e7eb ${p * 3.6}deg 360deg)`,
      }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-semibold tabular-nums text-gray-900">
        {Math.round(p)}%
      </span>
    </span>
  );
}

type Stage = {
  key: string;
  label: string;
  value: string;
  sub: string;
  color: string;
  href: string;
  icon: ReactNode;
  pct?: number;
};

function StageCard({ s }: { s: Stage }) {
  return (
    <Link
      href={s.href}
      className={`flex w-44 shrink-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-400 hover:shadow-md motion-reduce:transition-none ${focusRing}`}
    >
      <span className="flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: s.color + "1a", color: s.color }}
        >
          {s.icon}
        </span>
        <span className="text-xs font-medium text-slate-600">{s.label}</span>
      </span>
      <span className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
        {s.value}
      </span>
      <span className="mt-0.5 text-xs text-gray-500">{s.sub}</span>
      {s.pct !== undefined && (
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, background: s.color }}
          />
        </span>
      )}
    </Link>
  );
}

function FlowArrow() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center px-1">
      <span className="h-0.5 w-4 bg-slate-300" />
      <span className="border-y-[5px] border-l-[7px] border-y-transparent border-l-slate-300" />
    </span>
  );
}

function HealthCard({
  label,
  used,
  total,
  color,
  note,
}: {
  label: string;
  used: number;
  total: number;
  color: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <Ring pct={pctOf(used, total)} color={color} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-gray-900">
          {used} of {total}
        </p>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
    </div>
  );
}

export default function NetworkTopology({
  data,
  core,
}: {
  data: NetworkData;
  core?: CoreData;
}) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<Selection[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const selected = history.length > 0 ? history[history.length - 1] : null;
  const openFromMap = useCallback((s: Selection) => setHistory([s]), []);
  const drill = useCallback((s: Selection) => setHistory((h) => [...h, s]), []);
  const back = useCallback(() => setHistory((h) => h.slice(0, -1)), []);
  const close = useCallback(() => setHistory([]), []);

  const vis = useMemo(() => computeVisible(data.olts, query), [data.olts, query]);
  const show = (k: string) => vis === null || vis.has(k);
  const isActive = (k: string) => selected?.key === k;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openOlt(id: string) {
    const o = data.olts.find((x) => x.id === id);
    if (o) openFromMap(selOlt(o));
  }

  /* ----- diagram nodes ----- */

  function renderCustomer(
    cu: CustomerLeaf,
    portId: string,
    portNumber: number,
    parent: Crumb[]
  ) {
    const sel = selCustomer(cu, portId, portNumber, parent);
    return (
      <NodeCard
        key={sel.key}
        width={W.leaf}
        compact
        color={C.customer}
        icon={<IconHouse />}
        title={cu.name}
        subtitle={cu.pkg ?? cu.phone ?? "Customer"}
        dot={statusColor(cu.status)}
        faults={cu.faults}
        active={isActive(sel.key)}
        onClick={() => openFromMap(sel)}
      />
    );
  }

  function renderSplitter(sp: SplitterNode, parent: Crumb[], via?: number): ReactNode {
    const sel = selSplitter(sp, parent, via);
    const inUse = splitterInUse(sp);

    const kids: FKid[] = sp.ports
      .filter((p) => (p.customer || p.child) && show("pt:" + p.id))
      .map((p) => ({
        color: p.child ? C.distribution : C.drop,
        label: `P${p.number}`,
        node: (
          <div className="flex items-center gap-2">
            {p.customer && renderCustomer(p.customer, p.id, p.number, sel.path)}
            {p.child && renderSplitter(p.child, sel.path, p.number)}
          </div>
        ),
      }));

    const card = (
      <NodeCard
        width={W.splitter}
        color={C.splitter}
        icon={<IconSplitter />}
        title={sp.name}
        badge={sp.ratio}
        subtitle={via ? `Fed from port ${via}` : null}
        dot={statusColor(sp.status)}
        faults={sp.faults}
        active={isActive(sel.key)}
        onClick={() => openFromMap(sel)}
      >
        <span className="mt-2.5 flex flex-wrap gap-1">
          {sp.ports.map((p) => (
            <PortTile key={p.id} p={p} />
          ))}
        </span>
        <span className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          <Bar value={inUse} total={sp.ports.length} color={C.splitter} />
          {inUse} of {sp.ports.length} ports in use
        </span>
      </NodeCard>
    );

    return <FlowChain key={sp.id} node={card} kids={kids} />;
  }

  function renderBox(b: BoxNode, parent: Crumb[]): ReactNode {
    const sel = selBox(b, parent);
    const kids: FKid[] = [];
    for (const sp of b.splitters) {
      if (show("sp:" + sp.id)) {
        kids.push({ color: C.splitter, node: renderSplitter(sp, sel.path) });
      }
    }
    for (const c of b.outCables) {
      if (show("cb:" + c.id)) {
        kids.push({ color: cableColor(c.type), node: renderCable(c, sel.path) });
      }
    }

    const card = (
      <NodeCard
        width={W.box}
        color={C.box}
        icon={<IconBox />}
        title={b.name}
        subtitle={categoryLabel[b.category ?? ""] ?? "Category not set"}
        dot={statusColor(b.status)}
        faults={b.faults}
        active={isActive(sel.key)}
        onClick={() => openFromMap(sel)}
      >
        <span className="mt-2 block text-[11px] text-gray-500">
          {countLabel(b.splitters.length, "splitter", "splitters")} inside
          {b.outCables.length > 0
            ? `, links on to ${
                b.outCables.flatMap((c) => c.boxes.map((x) => x.name)).join(", ") ||
                "another box"
              }`
            : ""}
        </span>
      </NodeCard>
    );

    return <FlowChain key={b.id} node={card} kids={kids} />;
  }

  function renderCable(c: CableNode, parent: Crumb[]): ReactNode {
    const sel = selCable(c, parent);
    const color = cableColor(c.type);
    const kids: FKid[] = c.boxes
      .filter((b) => show("bx:" + b.id))
      .map((b) => ({ color, node: renderBox(b, sel.path) }));

    const detail = [
      cap(c.type),
      countLabel(c.coreCount, "core", "cores"),
      c.lengthM !== null ? fmtLength(c.lengthM) : null,
    ]
      .filter(Boolean)
      .join(", ");

    const card = (
      <NodeCard
        width={W.cable}
        color={color}
        icon={<IconCable />}
        title={c.name}
        subtitle={detail}
        faults={c.faults}
        active={isActive(sel.key)}
        onClick={() => openFromMap(sel)}
      >
        {c.pon && (
          <span className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-700">
            <span className="rounded-[4px] bg-slate-800 px-1.5 py-0.5 font-medium text-white">
              {c.pon.label}
            </span>
            {c.pon.coreNumber !== null && (
              <span className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full border border-gray-300"
                  style={{ background: coreHex[c.pon.coreColor ?? ""] ?? "#999" }}
                />
                Core {c.pon.coreNumber}
              </span>
            )}
          </span>
        )}
        <span className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          <Bar value={c.usedCores} total={c.coreCount} color={color} />
          {c.usedCores} of {c.coreCount} cores in use
        </span>
      </NodeCard>
    );

    return <FlowChain key={c.id} node={card} kids={kids} />;
  }

  function renderOlt(o: OltNode): ReactNode {
    const sel = selOlt(o);
    const kids: FKid[] = o.cables
      .filter((c) => show("cb:" + c.id))
      .map((c) => ({ color: cableColor(c.type), node: renderCable(c, sel.path) }));

    const card = (
      <button
        type="button"
        onClick={() => openFromMap(sel)}
        className={`${W.olt} shrink-0 rounded-xl p-3 text-left text-white shadow-md ${focusRing} ${
          isActive(sel.key) ? "ring-2 ring-slate-900 ring-offset-2" : ""
        }`}
        style={{ background: C.navy }}
      >
        <span className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10">
            <IconOlt />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{o.name}</span>
              <FaultDot faults={o.faults} />
            </span>
            <span className="block truncate text-xs text-white/70">
              {[o.vendor, o.model].filter(Boolean).join(" ") || "Device not set"}
            </span>
          </span>
        </span>
        <span className="mt-2 block text-[11px] text-white/60">{portSummary(o)}</span>
        <span
          className="mt-1.5 flex flex-wrap gap-1"
          title="PON ports (lit = has a cable)"
        >
          {o.ports.slice(0, 32).map((p) => (
            <span
              key={p.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ponLed(p) }}
            />
          ))}
        </span>
      </button>
    );

    return <FlowChain node={card} kids={kids} />;
  }

  /* ----- numbers for the top of the page ----- */

  const t = data.totals;
  const pt = t.ports;

  const upstreamCap = new Map<string, number | null>();
  const switchIds = new Set<string>();
  const resellerIds = new Set<string>();
  if (core) {
    const switches = [...core.sites.flatMap((s) => s.switches), ...core.unplacedSwitches];
    for (const s of switches) {
      switchIds.add(s.id);
      for (const u of s.upstreams) upstreamCap.set(u.id, u.capacityMbps);
      for (const r of s.resellers) resellerIds.add(r.id);
    }
    const loose = [
      ...core.sites.flatMap((s) => s.looseUpstreams),
      ...core.unplacedUpstreams,
    ];
    for (const u of loose) upstreamCap.set(u.id, u.capacityMbps);
  }
  let upstreamTotal = 0;
  for (const v of upstreamCap.values()) upstreamTotal += v ?? 0;

  const stages: Stage[] = [
    {
      key: "up",
      label: "Upstream ISPs",
      value: String(upstreamCap.size),
      sub: upstreamCap.size > 0 ? `${fmtRate(upstreamTotal)} in total` : "None added yet",
      color: "#0284c7",
      href: "/upstreams",
      icon: <FlowCloud />,
    },
    {
      key: "sw",
      label: "Switches",
      value: String(switchIds.size),
      sub: `${countLabel(resellerIds.size, "reseller", "resellers")} served`,
      color: C.navy,
      href: "/switches",
      icon: <FlowSwitch />,
    },
    {
      key: "olt",
      label: "OLTs",
      value: String(t.olts),
      sub: `${t.ponPorts.connected} of ${t.ponPorts.total} PON ports in use`,
      color: "#334155",
      href: "/olts",
      icon: <IconOlt />,
      pct: pctOf(t.ponPorts.connected, t.ponPorts.total),
    },
    {
      key: "cab",
      label: "Fiber cables",
      value: String(t.cables),
      sub: `${t.coresUsed} of ${t.coresTotal} cores in use`,
      color: C.feeder,
      href: "/fiber-cables",
      icon: <IconCable />,
      pct: pctOf(t.coresUsed, t.coresTotal),
    },
    {
      key: "box",
      label: "TG boxes",
      value: String(t.boxes),
      sub: "Joint and splitter boxes",
      color: C.box,
      href: "/tg-boxes",
      icon: <IconBox />,
    },
    {
      key: "spl",
      label: "Splitters",
      value: String(t.splitters),
      sub: `${pt.used} of ${pt.total} ports in use`,
      color: C.splitter,
      href: "/splitters",
      icon: <IconSplitter />,
      pct: pctOf(pt.used, pt.total),
    },
    {
      key: "cus",
      label: "Customers",
      value: String(t.customers),
      sub: `${t.customersActive} active`,
      color: C.customer,
      href: "/customers",
      icon: <IconHouse />,
      pct: pctOf(t.customersActive, t.customers),
    },
  ];

  const lineLegend = [
    { label: "Feeder cable", color: C.feeder },
    { label: "Distribution cable", color: C.distribution },
    { label: "Drop to customer", color: C.drop },
    { label: "Inside a box", color: C.splitter },
    { label: "Upstream link", color: "#0284c7" },
    { label: "OLT uplink", color: "#334155" },
    { label: "Reseller handoff", color: "#0d9488" },
  ];
  const tileLegend: PortState[] = ["customer", "cascade", "used", "reserved", "damaged", "free"];
  const nodeLegend: NodeKind[] = ["olt", "cable", "box", "splitter", "customer"];

  const orphanGroups = [
    { label: "Cables", items: data.orphans.cables, href: "/fiber-cables/" },
    { label: "TG boxes", items: data.orphans.boxes, href: "/tg-boxes/" },
    { label: "Splitters", items: data.orphans.splitters, href: "/splitters/" },
    { label: "Customers", items: data.orphans.customers, href: "/customers/" },
  ].filter((g) => g.items.length > 0);

  const visibleOlts = data.olts.filter((o) => show("ol:" + o.id));
  const allOltIds = data.olts.map((o) => o.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Network overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          See how the internet reaches your customers, step by step, and where capacity or
          faults need attention.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">From upstream to customer</h2>
          <p className="text-xs text-slate-500">
            Each step shows what you have and how much of it is in use. Select a step to open its
            list.
          </p>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-center">
            {stages.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <StageCard s={s} />
                {i < stages.length - 1 && <FlowArrow />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="PON ports in use"
          used={t.ponPorts.connected}
          total={t.ponPorts.total}
          color="#334155"
        />
        <HealthCard
          label="Splitter ports in use"
          used={pt.used}
          total={pt.total}
          color={C.splitter}
          note={pt.damaged > 0 ? `${pt.damaged} damaged` : undefined}
        />
        <HealthCard
          label="Fiber cores in use"
          used={t.coresUsed}
          total={t.coresTotal}
          color={C.feeder}
        />
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <span
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-semibold tabular-nums ${
              t.openFaults > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {t.openFaults}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Open faults</p>
            <p className="text-sm font-semibold text-gray-900">
              {t.openFaults > 0 ? "Needs attention" : "All clear"}
            </p>
          </div>
        </div>
      </div>

      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          How to read this map
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className="grid gap-5 border-t border-slate-100 px-4 py-4 text-xs text-slate-600 md:grid-cols-3">
          <div>
            <p className="mb-2 font-medium text-slate-800">Line colors</p>
            <div className="space-y-1.5">
              {lineLegend.map((l) => (
                <span key={l.label} className="flex items-center gap-2">
                  <span className="h-0.5 w-6" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-slate-500">
              Arrows point downstream. The label on a line is the splitter port it leaves from.
            </p>
          </div>
          <div>
            <p className="mb-2 font-medium text-slate-800">Splitter port tiles</p>
            <div className="space-y-1.5">
              {tileLegend.map((s) => (
                <span key={s} className="flex items-center gap-2">
                  <span className={`h-4 w-4 rounded-[3px] border ${portStyle[s]}`} />
                  {portLabel[s]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium text-slate-800">What the boxes are</p>
            <div className="space-y-1.5">
              {nodeLegend.map((k) => (
                <span key={k} className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 place-items-center rounded-md"
                    style={{ background: kindColor[k] + "1a", color: kindColor[k] }}
                  >
                    {kindIcon[k]}
                  </span>
                  {kindLabel[k]}
                </span>
              ))}
            </div>
            <p className="mt-2 text-slate-500">
              Select any box on the map to open its details. Long names are shortened on the map
              and shown in full in the details.
            </p>
          </div>
        </div>
      </details>

      <div className="sticky top-0 z-20 -mx-6 border-b border-slate-200 bg-slate-50/90 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search the network</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ratio, phone or pole"
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gray-900"
            />
          </label>
          <nav
            aria-label="Jump to a section"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
          >
            <span className="shrink-0 text-xs text-slate-500">Jump to</span>
            {core && (
              <a href="#office" className={pillCls}>
                Office and upstream
              </a>
            )}
            {data.olts.map((o) => (
              <a key={o.id} href={`#olt-${o.id}`} className={pillCls}>
                {o.name}
              </a>
            ))}
          </nav>
          {data.olts.length > 0 && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setCollapsed(new Set())}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(new Set(allOltIds))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Collapse all
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {vis === null && core && (
          <div id="office" className="scroll-mt-20">
            <CoreNetwork core={core} onOpenOlt={openOlt} />
          </div>
        )}

        {visibleOlts.map((o) => {
          const tl = tally(o);
          const open = vis !== null || !collapsed.has(o.id);
          const sel = selOlt(o);
          const chips = [
            countLabel(tl.cables, "cable", "cables"),
            countLabel(tl.boxes, "box", "boxes"),
            countLabel(tl.splitters, "splitter", "splitters"),
            countLabel(tl.customers, "customer", "customers"),
          ];
          return (
            <section
              key={o.id}
              id={`olt-${o.id}`}
              className="scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-white"
                style={{ background: C.navy }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                    <IconOlt />
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openFromMap(sel)}
                      className="block max-w-full truncate text-left text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-white"
                    >
                      {o.name}
                    </button>
                    <span className="flex items-center gap-1.5 text-xs text-white/70">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: statusColor(o.status) }}
                      />
                      {cap(o.status)}, {portSummary(o)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/85"
                    >
                      {c}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    aria-expanded={open}
                    aria-label={open ? `Collapse ${o.name}` : `Expand ${o.name}`}
                    className="rounded-md bg-white/10 p-1.5 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                        open ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
              </div>

              {open && (
                <div className="overflow-x-auto bg-slate-50 px-5 py-5" style={dotGrid}>
                  <div className="min-w-max">
                    <div className="mb-4 flex gap-14 border-b border-slate-200 pb-2">
                      {COLS.map((c) => (
                        <div
                          key={c.label}
                          className={`${c.w} flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: c.color }}
                          />
                          {c.label}
                        </div>
                      ))}
                    </div>
                    {renderOlt(o)}
                    {o.cables.length === 0 && (
                      <p className="mt-4 text-sm text-slate-500">
                        No cable starts at this OLT yet. Create a feeder cable and choose this
                        OLT, or plug a cable into one of its PON ports.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {data.olts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">
              There are no OLTs yet. Add your first OLT to start mapping the network.
            </p>
            <Link
              href="/olts/new"
              className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add OLT
            </Link>
          </div>
        )}

        {vis !== null && visibleOlts.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Nothing matches &ldquo;{query}&rdquo;. Try a customer name, a splitter ratio, a phone
            number or a pole number.
          </p>
        )}

        {vis === null && orphanGroups.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Not linked into a path yet</h2>
            <p className="mt-0.5 text-xs text-amber-800/80">
              These records exist but are not connected to an OLT, a cable or a splitter port.
            </p>
            <div className="mt-3 space-y-2">
              {orphanGroups.map((g) => (
                <div key={g.label} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs text-amber-900">{g.label}</span>
                  {g.items.map((it) => (
                    <Link
                      key={it.id}
                      href={g.href + it.id}
                      className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-gray-800 hover:border-amber-400"
                    >
                      {it.name}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {selected && (
        <DetailModal
          sel={selected}
          canGoBack={history.length > 1}
          onBack={back}
          onClose={close}
          onSelect={drill}
        />
      )}
    </div>
  );
}
