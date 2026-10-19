"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Side = "input" | "output";
type PortState = "customer" | "cascade" | "used" | "reserved" | "damaged" | "free";

const colorHex: Record<string, string> = {
  Blue: "#2563eb", Orange: "#ea580c", Green: "#16a34a", Brown: "#78350f",
  Slate: "#64748b", White: "#e5e7eb", Red: "#dc2626", Black: "#111827",
  Yellow: "#eab308", Violet: "#7c3aed", Rose: "#f43f5e", Aqua: "#06b6d4",
};
const typeColor: Record<string, string> = {
  feeder: "#f59e0b",
  distribution: "#2563eb",
  drop: "#7c3aed",
};
const portStyle: Record<PortState, string> = {
  customer: "border-violet-600 bg-violet-600 text-white",
  cascade: "border-blue-600 bg-blue-600 text-white",
  used: "border-emerald-600 bg-emerald-600 text-white",
  reserved: "border-amber-500 bg-amber-50 text-amber-700",
  damaged: "border-red-600 bg-red-600 text-white",
  free: "border-gray-300 bg-white text-gray-400",
};
const portWord: Record<PortState, string> = {
  customer: "Customer",
  cascade: "Next splitter",
  used: "In use",
  reserved: "Reserved",
  damaged: "Damaged",
  free: "Free",
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtLen(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${n} m`;
}
function countOf(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
function empty<T>(): Promise<T[]> {
  return Promise.resolve([]);
}

/* ---------- raw rows ---------- */

type CableEmbed = {
  id: string;
  name: string;
  cable_type: string;
  core_count: number;
  length_meters: number | string | null;
  olt_id: string | null;
};
type LinkRow = { id: string; cable_id: string; direction: Side; fiber_cables: CableEmbed | null };
type OtherLink = {
  cable_id: string;
  direction: Side;
  tg_box_id: string;
  tg_boxes: { id: string; name: string } | null;
};
type CoreRow = { id: string; cable_id: string; core_number: number; color: string };
type OltPortRow = {
  cable_id: string | null;
  label: string | null;
  olts: { id: string; name: string } | null;
};
type SpliceRow = {
  id: string;
  core_a_id: string;
  side_a: Side;
  core_b_id: string;
  side_b: Side;
  splice_loss_db: number | string | null;
  description: string | null;
};
type SplitterRow = {
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
type ConnRow = {
  splitter_port_id: string | null;
  customers: { id: string; name: string } | null;
};
type ChildRow = { id: string; name: string; ratio: string; parent_port_id: string | null };
type DirectRow = {
  id: string;
  core_id: string | null;
  customers: { id: string; name: string } | null;
};
type InputCoreRow = {
  id: string;
  core_number: number;
  color: string;
  fiber_cables: { id: string; name: string } | null;
};
type ParentPortRow = {
  id: string;
  port_number: number;
  splitters: { id: string; name: string; ratio: string } | null;
};

/* ---------- what we show ---------- */

type Ref = { label: string; href: string };
type CableView = {
  id: string;
  name: string;
  type: string;
  cores: number;
  lengthM: number | null;
  direction: Side;
  spliced: number;
  from: Ref[];
  to: Ref[];
};
type SpliceItem = {
  aNo: number;
  aColor: string;
  bNo: number;
  bColor: string;
  note: string | null;
  loss: number | null;
};
type SpliceGroup = {
  key: string;
  a: string;
  b: string;
  sameCable: boolean;
  items: SpliceItem[];
};
type Feed =
  | { kind: "core"; cable: string; cableId: string | null; coreNo: number; color: string }
  | { kind: "port"; splitter: string; splitterId: string; port: number }
  | { kind: "none" };
type PortView = {
  id: string;
  number: number;
  power: number | null;
  state: PortState;
  target: Ref | null;
};
type SplitterView = {
  id: string;
  name: string;
  ratio: string;
  status: string;
  feed: Feed;
  ports: PortView[];
};
type DirectView = { id: string; name: string; customerId: string; core: string | null };
type Model = {
  cables: CableView[];
  groups: SpliceGroup[];
  spliceCount: number;
  splitters: SplitterView[];
  directs: DirectView[];
};

async function rows<T>(
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as T[];
}

function stateOf(status: string, hasCustomer: boolean, hasChild: boolean): PortState {
  if (status === "damaged") return "damaged";
  if (hasCustomer) return "customer";
  if (hasChild) return "cascade";
  if (status === "used") return "used";
  if (status === "reserved") return "reserved";
  return "free";
}

async function loadInside(boxId: string): Promise<Model> {
  const supabase = createClient();

  const links = await rows<LinkRow>(
    supabase
      .from("tg_box_cables")
      .select(
        "id, cable_id, direction, fiber_cables(id, name, cable_type, core_count, length_meters, olt_id)"
      )
      .eq("tg_box_id", boxId)
  );
  const cableIds = Array.from(new Set(links.map((l) => l.cable_id)));

  const [cores, others, oltPorts, points, splitters, directs] = await Promise.all([
    cableIds.length > 0
      ? rows<CoreRow>(
          supabase
            .from("fiber_cores")
            .select("id, cable_id, core_number, color")
            .in("cable_id", cableIds)
            .order("core_number")
            .limit(5000)
        )
      : empty<CoreRow>(),
    cableIds.length > 0
      ? rows<OtherLink>(
          supabase
            .from("tg_box_cables")
            .select("cable_id, direction, tg_box_id, tg_boxes(id, name)")
            .in("cable_id", cableIds)
            .neq("tg_box_id", boxId)
        )
      : empty<OtherLink>(),
    cableIds.length > 0
      ? rows<OltPortRow>(
          supabase
            .from("olt_ports")
            .select("cable_id, label, olts(id, name)")
            .in("cable_id", cableIds)
        )
      : empty<OltPortRow>(),
    rows<{ id: string }>(supabase.from("splice_points").select("id").eq("tg_box_id", boxId)),
    rows<SplitterRow>(
      supabase
        .from("splitters")
        .select("id, name, ratio, status, input_core_id, parent_port_id")
        .eq("tg_box_id", boxId)
        .order("name")
    ),
    rows<DirectRow>(
      supabase
        .from("tg_box_customers")
        .select("id, core_id, customers(id, name)")
        .eq("tg_box_id", boxId)
    ),
  ]);

  const pointIds = points.map((p) => p.id);
  const splitterIds = splitters.map((s) => s.id);
  const inputCoreIds = splitters
    .map((s) => s.input_core_id)
    .filter((x): x is string => !!x);
  const parentPortIds = splitters
    .map((s) => s.parent_port_id)
    .filter((x): x is string => !!x);
  const oltIds = Array.from(
    new Set(
      links.map((l) => l.fiber_cables?.olt_id).filter((x): x is string => !!x)
    )
  );

  const [splices, oltRows, ports, inputCores, parentPorts] = await Promise.all([
    pointIds.length > 0
      ? rows<SpliceRow>(
          supabase
            .from("splices")
            .select("id, core_a_id, side_a, core_b_id, side_b, splice_loss_db, description")
            .in("splice_point_id", pointIds)
        )
      : empty<SpliceRow>(),
    oltIds.length > 0
      ? rows<{ id: string; name: string }>(
          supabase.from("olts").select("id, name").in("id", oltIds)
        )
      : empty<{ id: string; name: string }>(),
    splitterIds.length > 0
      ? rows<PortRow>(
          supabase
            .from("splitter_ports")
            .select("id, splitter_id, port_number, power_percent, status")
            .in("splitter_id", splitterIds)
            .order("port_number")
        )
      : empty<PortRow>(),
    inputCoreIds.length > 0
      ? rows<InputCoreRow>(
          supabase
            .from("fiber_cores")
            .select("id, core_number, color, fiber_cables(id, name)")
            .in("id", inputCoreIds)
        )
      : empty<InputCoreRow>(),
    parentPortIds.length > 0
      ? rows<ParentPortRow>(
          supabase
            .from("splitter_ports")
            .select(
              "id, port_number, splitters:splitters!splitter_ports_splitter_id_fkey(id, name, ratio)"
            )
            .in("id", parentPortIds)
        )
      : empty<ParentPortRow>(),
  ]);

  const portIds = ports.map((p) => p.id);
  const [conns, children] = await Promise.all([
    portIds.length > 0
      ? rows<ConnRow>(
          supabase
            .from("customer_connections")
            .select("splitter_port_id, customers(id, name)")
            .in("splitter_port_id", portIds)
        )
      : empty<ConnRow>(),
    portIds.length > 0
      ? rows<ChildRow>(
          supabase
            .from("splitters")
            .select("id, name, ratio, parent_port_id")
            .in("parent_port_id", portIds)
        )
      : empty<ChildRow>(),
  ]);

  /* ----- lookups ----- */

  const coreById = new Map(cores.map((c) => [c.id, c]));
  const cableNameById = new Map<string, string>();
  for (const l of links) {
    if (l.fiber_cables) cableNameById.set(l.cable_id, l.fiber_cables.name);
  }
  const oltNameById = new Map(oltRows.map((o) => [o.id, o.name]));
  const ponByCable = new Map<string, OltPortRow>();
  for (const p of oltPorts) {
    if (p.cable_id && p.olts && !ponByCable.has(p.cable_id)) ponByCable.set(p.cable_id, p);
  }

  /* ----- splices, grouped by the two cable sides they join ----- */

  type End = { cableId: string; side: Side; coreNo: number; color: string };
  const endOf = (coreId: string, side: Side): End | null => {
    const c = coreById.get(coreId);
    return c ? { cableId: c.cable_id, side, coreNo: c.core_number, color: c.color } : null;
  };
  const sideWord = (s: Side) => (s === "input" ? "in" : "out");
  const nameOf = (id: string) => cableNameById.get(id) ?? "Cable";

  const groupMap = new Map<string, SpliceGroup>();
  const spliceUse = new Map<string, number>();
  let spliceCount = 0;

  for (const s of splices) {
    let a = endOf(s.core_a_id, s.side_a);
    let b = endOf(s.core_b_id, s.side_b);
    if (!a || !b) continue;
    spliceCount++;
    for (const e of [a, b]) {
      const k = `${e.cableId}:${e.side}`;
      spliceUse.set(k, (spliceUse.get(k) ?? 0) + 1);
    }
    if (`${a.cableId}:${a.side}` > `${b.cableId}:${b.side}`) {
      const t = a;
      a = b;
      b = t;
    }
    const key = `${a.cableId}:${a.side}|${b.cableId}:${b.side}`;
    let g = groupMap.get(key);
    if (!g) {
      g = {
        key,
        a: `${nameOf(a.cableId)} (${sideWord(a.side)})`,
        b: `${nameOf(b.cableId)} (${sideWord(b.side)})`,
        sameCable: a.cableId === b.cableId,
        items: [],
      };
      groupMap.set(key, g);
    }
    g.items.push({
      aNo: a.coreNo,
      aColor: a.color,
      bNo: b.coreNo,
      bColor: b.color,
      note: s.description,
      loss: s.splice_loss_db === null ? null : Number(s.splice_loss_db),
    });
  }
  const groups = Array.from(groupMap.values()).sort((x, y) => x.key.localeCompare(y.key));
  for (const g of groups) g.items.sort((x, y) => x.aNo - y.aNo);

  /* ----- cables in and out, and where they lead ----- */

  const boxRefs = (cableId: string, dir: Side): Ref[] =>
    others
      .filter((o) => o.cable_id === cableId && o.direction === dir && o.tg_boxes)
      .map((o) => ({ label: o.tg_boxes!.name, href: `/tg-boxes/${o.tg_boxes!.id}` }));

  const oltRef = (cableId: string, oltId: string | null): Ref[] => {
    const pon = ponByCable.get(cableId);
    if (pon && pon.olts) {
      return [
        {
          label: `${pon.olts.name}${pon.label ? `, ${pon.label}` : ""}`,
          href: `/olts/${pon.olts.id}`,
        },
      ];
    }
    if (oltId) {
      return [{ label: oltNameById.get(oltId) ?? "OLT", href: `/olts/${oltId}` }];
    }
    return [];
  };

  const cableViews: CableView[] = links
    .filter((l) => l.fiber_cables)
    .map((l) => {
      const c = l.fiber_cables as CableEmbed;
      return {
        id: c.id,
        name: c.name,
        type: c.cable_type,
        cores: c.core_count,
        lengthM: c.length_meters === null ? null : Number(c.length_meters),
        direction: l.direction,
        spliced: spliceUse.get(`${l.cable_id}:${l.direction}`) ?? 0,
        from:
          l.direction === "input"
            ? [...boxRefs(l.cable_id, "output"), ...oltRef(l.cable_id, c.olt_id)]
            : [],
        to: boxRefs(l.cable_id, "input"),
      };
    })
    .sort((x, y) => (x.direction === y.direction ? x.name.localeCompare(y.name) : x.direction === "input" ? -1 : 1));

  /* ----- splitters inside ----- */

  const inputCoreById = new Map(inputCores.map((c) => [c.id, c]));
  const parentPortById = new Map(parentPorts.map((p) => [p.id, p]));
  const connByPort = new Map<string, ConnRow>();
  for (const c of conns) {
    if (c.splitter_port_id && c.customers) connByPort.set(c.splitter_port_id, c);
  }
  const childByPort = new Map<string, ChildRow>();
  for (const c of children) {
    if (c.parent_port_id) childByPort.set(c.parent_port_id, c);
  }
  const portsBySplitter = new Map<string, PortRow[]>();
  for (const p of ports) {
    const list = portsBySplitter.get(p.splitter_id) ?? [];
    list.push(p);
    portsBySplitter.set(p.splitter_id, list);
  }

  const splitterViews: SplitterView[] = splitters.map((s) => {
    let feed: Feed = { kind: "none" };
    if (s.input_core_id) {
      const c = inputCoreById.get(s.input_core_id);
      if (c) {
        feed = {
          kind: "core",
          cable: c.fiber_cables?.name ?? "Cable",
          cableId: c.fiber_cables?.id ?? null,
          coreNo: c.core_number,
          color: c.color,
        };
      }
    } else if (s.parent_port_id) {
      const pp = parentPortById.get(s.parent_port_id);
      if (pp && pp.splitters) {
        feed = {
          kind: "port",
          splitter: pp.splitters.name,
          splitterId: pp.splitters.id,
          port: pp.port_number,
        };
      }
    }
    const portViews: PortView[] = (portsBySplitter.get(s.id) ?? []).map((p) => {
      const conn = connByPort.get(p.id);
      const child = childByPort.get(p.id);
      let target: Ref | null = null;
      if (conn && conn.customers) {
        target = { label: conn.customers.name, href: `/customers/${conn.customers.id}` };
      } else if (child) {
        target = { label: `${child.name} (${child.ratio})`, href: `/splitters/${child.id}` };
      }
      return {
        id: p.id,
        number: p.port_number,
        power: p.power_percent,
        state: stateOf(p.status, !!conn, !!child),
        target,
      };
    });
    return { id: s.id, name: s.name, ratio: s.ratio, status: s.status, feed, ports: portViews };
  });

  const directViews: DirectView[] = directs
    .filter((d) => d.customers)
    .map((d) => {
      const core = d.core_id ? coreById.get(d.core_id) : undefined;
      return {
        id: d.id,
        name: d.customers!.name,
        customerId: d.customers!.id,
        core: core ? `${nameOf(core.cable_id)}, core ${core.core_number} (${core.color})` : null,
      };
    });

  return {
    cables: cableViews,
    groups,
    spliceCount,
    splitters: splitterViews,
    directs: directViews,
  };
}

/* ---------- pieces ---------- */

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-300"
      style={{ backgroundColor: colorHex[color] ?? "#999" }}
    />
  );
}

function RefLinks({ refs }: { refs: Ref[] }) {
  return (
    <>
      {refs.map((r, i) => (
        <span key={r.href + i}>
          {i > 0 ? ", " : ""}
          <Link href={r.href} className="text-blue-600 hover:underline">
            {r.label}
          </Link>
        </span>
      ))}
    </>
  );
}

function CableCard({ c }: { c: CableView }) {
  const color = typeColor[c.type] ?? "#64748b";
  const pct = c.cores > 0 ? Math.min(100, (c.spliced / c.cores) * 100) : 0;
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <Link
        href={`/fiber-cables/${c.id}`}
        className="text-sm font-medium text-gray-900 hover:underline"
      >
        {c.name}
      </Link>
      <span className="block text-xs text-gray-500">
        {cap(c.type)}, {countOf(c.cores, "core", "cores")}
        {c.lengthM !== null ? `, ${fmtLen(c.lengthM)}` : ""}
      </span>
      <span className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-gray-200">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </span>
        {c.spliced} of {c.cores} cores spliced here
      </span>
      {c.from.length > 0 && (
        <p className="mt-1.5 text-xs text-gray-600">
          Comes from <RefLinks refs={c.from} />
        </p>
      )}
      {c.to.length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          {c.direction === "output" ? "Goes on to " : "Also reaches "}
          <RefLinks refs={c.to} />
        </p>
      )}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-xs font-medium text-gray-500">{children}</h4>;
}

function FeedText({ feed }: { feed: Feed }) {
  if (feed.kind === "core") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {feed.cableId ? (
          <Link href={`/fiber-cables/${feed.cableId}`} className="text-blue-600 hover:underline">
            {feed.cable}
          </Link>
        ) : (
          <span>{feed.cable}</span>
        )}
        <Dot color={feed.color} />
        <span>
          core {feed.coreNo} ({feed.color})
        </span>
      </span>
    );
  }
  if (feed.kind === "port") {
    return (
      <span>
        port {feed.port} of{" "}
        <Link href={`/splitters/${feed.splitterId}`} className="text-blue-600 hover:underline">
          {feed.splitter}
        </Link>
      </span>
    );
  }
  return <span className="text-gray-400">not recorded</span>;
}

export default function BoxInside({ boxId }: { boxId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; model: Model }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadInside(boxId)
      .then((model) => {
        if (!cancelled) setState({ status: "ready", model });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load the inside of this box.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boxId]);

  const head = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-gray-900">Inside this box</h3>
      <Link
        href={`/tg-boxes/${boxId}`}
        className="text-xs text-blue-600 hover:underline"
      >
        Edit cables, splices and splitters
      </Link>
    </div>
  );

  if (state.status === "loading") {
    return (
      <section className="mt-6">
        {head}
        <p className="text-sm text-gray-400">Loading the inside of this box...</p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="mt-6">
        {head}
        <p className="text-sm text-red-600">{state.message}</p>
      </section>
    );
  }

  const m = state.model;
  const inCables = m.cables.filter((c) => c.direction === "input");
  const outCables = m.cables.filter((c) => c.direction === "output");
  const nothing =
    m.cables.length === 0 &&
    m.splitters.length === 0 &&
    m.directs.length === 0 &&
    m.spliceCount === 0;

  if (nothing) {
    return (
      <section className="mt-6">
        {head}
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          Nothing is recorded inside this box yet. Link cables, add splices and place splitters
          on the box page.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-6">
      <div>
        {head}
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <Title>Comes in ({inCables.length})</Title>
            <div className="space-y-2">
              {inCables.map((c) => (
                <CableCard key={c.id + c.direction} c={c} />
              ))}
              {inCables.length === 0 && (
                <p className="text-xs text-gray-400">No input cable linked.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="hidden h-0.5 w-5 bg-slate-300 md:block"
              />
              <div className="rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-3 text-center">
                <p className="text-xs font-medium text-orange-900">Inside the box</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                  {countOf(m.spliceCount, "splice", "splices")}
                </p>
                <p className="text-sm font-semibold tabular-nums text-gray-900">
                  {countOf(m.splitters.length, "splitter", "splitters")}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="hidden h-0.5 w-5 bg-slate-300 md:block"
              />
              <span
                aria-hidden="true"
                className="hidden border-y-[5px] border-l-[7px] border-y-transparent border-l-slate-300 md:block"
              />
            </div>
          </div>

          <div>
            <Title>Goes out ({outCables.length + m.splitters.length})</Title>
            <div className="space-y-2">
              {outCables.map((c) => (
                <CableCard key={c.id + c.direction} c={c} />
              ))}
              {m.splitters.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                  style={{ borderLeftColor: "#16a34a", borderLeftWidth: 4 }}
                >
                  <Link
                    href={`/splitters/${s.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {s.name}
                  </Link>
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {s.ratio}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {s.ports.filter((p) => p.state !== "free").length} of {s.ports.length} ports in
                    use
                  </span>
                </div>
              ))}
              {outCables.length === 0 && m.splitters.length === 0 && (
                <p className="text-xs text-gray-400">Nothing leaves this box yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          Splices, {m.spliceCount}
        </h3>
        {m.groups.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No splice is recorded in this box yet.
          </p>
        ) : (
          <div className="space-y-3">
            {m.groups.map((g) => {
              const straight = g.sameCable && g.items.every((i) => i.aNo === i.bNo);
              const sameColor = g.items.every((i) => i.aColor === i.bColor);
              const noted = g.items.filter((i) => i.note || i.loss !== null);
              return (
                <div key={g.key} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{g.a}</span>
                    <span className="text-gray-400">↔</span>
                    <span className="font-medium text-gray-900">{g.b}</span>
                    <span className="text-xs text-gray-500">
                      {countOf(g.items.length, "splice", "splices")}
                    </span>
                    {straight && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        Straight through
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        sameColor ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {sameColor ? "Same colors" : "Colors change"}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {g.items.map((i, idx) => (
                      <span
                        key={idx}
                        title={`Core ${i.aNo} (${i.aColor}) to core ${i.bNo} (${i.bColor})${
                          i.note ? `: ${i.note}` : ""
                        }`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] tabular-nums text-gray-700"
                      >
                        <Dot color={i.aColor} />
                        {i.aNo}
                        <span className="text-gray-400">↔</span>
                        {i.bNo}
                        <Dot color={i.bColor} />
                      </span>
                    ))}
                  </div>
                  {noted.length > 0 && (
                    <ul className="mt-2.5 space-y-0.5 border-t border-gray-100 pt-2 text-xs text-gray-600">
                      {noted.map((i, idx) => (
                        <li key={idx}>
                          Core {i.aNo} ↔ core {i.bNo}
                          {i.note ? `: ${i.note}` : ""}
                          {i.loss !== null ? ` (loss ${i.loss} dB)` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          Splitters inside, {m.splitters.length}
        </h3>
        {m.splitters.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No splitter is placed in this box yet.
          </p>
        ) : (
          <div className="space-y-3">
            {m.splitters.map((s) => {
              const used = s.ports.filter((p) => p.target);
              const free = s.ports.filter((p) => p.state === "free").length;
              return (
                <div key={s.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/splitters/${s.id}`}
                      className="text-sm font-medium text-gray-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {s.ratio}
                    </span>
                    <span className="text-xs text-gray-500">{cap(s.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Fed from <FeedText feed={s.feed} />
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {s.ports.map((p) => (
                      <span
                        key={p.id}
                        title={`Port ${p.number}: ${portWord[p.state]}${
                          p.target ? ` (${p.target.label})` : ""
                        }${p.power !== null ? `, ${p.power}% power` : ""}`}
                        className={`grid h-5 w-5 place-items-center rounded-[4px] border text-[10px] font-medium ${portStyle[p.state]}`}
                      >
                        {p.number}
                      </span>
                    ))}
                  </div>
                  {used.length > 0 && (
                    <ul className="mt-2.5 space-y-0.5 border-t border-gray-100 pt-2 text-xs text-gray-700">
                      {used.map((p) => (
                        <li key={p.id}>
                          Port {p.number}
                          {p.power !== null ? ` (${p.power}%)` : ""}
                          <span className="text-gray-400"> goes to </span>
                          <Link
                            href={p.target!.href}
                            className="text-blue-600 hover:underline"
                          >
                            {p.target!.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-gray-500">
                    {free} of {s.ports.length} ports free
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {m.directs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            Customers linked to this box, {m.directs.length}
          </h3>
          <ul className="space-y-1">
            {m.directs.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-gray-100 px-3 py-2 text-sm"
              >
                <Link
                  href={`/customers/${d.customerId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {d.name}
                </Link>
                {d.core && <span className="block text-xs text-gray-500">{d.core}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
