"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Side = "input" | "output";

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
const kindStyle: Record<string, { label: string; color: string }> = {
  olt_port: { label: "OLT PON port", color: "#0f2a4a" },
  olt_uplink: { label: "OLT uplink", color: "#334155" },
  switch_port: { label: "Switch port", color: "#0f766e" },
  splitter: { label: "Splitter input", color: "#16a34a" },
  customer: { label: "Customer on a TG box", color: "#e11d48" },
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

type CoreChip = { id: string; core_number: number; color: string; status: string };
type TraceCore = {
  id: string;
  core_number: number;
  color: string;
  cable_id: string;
  cable_name: string;
  cable_type: string;
  length_meters: number | string | null;
};
type TraceSplice = {
  id: string;
  box_id: string;
  box: string;
  a: string;
  a_side: Side;
  b: string;
  b_side: Side;
  note: string | null;
  loss: number | string | null;
};
type TraceTerminal = {
  kind: string;
  ref_id: string;
  core: string;
  parent_id: string;
  label: string;
  detail: string | null;
};
type Trace = { cores: TraceCore[]; splices: TraceSplice[]; terminals: TraceTerminal[] };

type Joint = { boxId: string; box: string; note: string | null; loss: number | null };
type PathNode = {
  core: TraceCore;
  terminals: TraceTerminal[];
  through: Joint[];
  children: { joint: Joint; node: PathNode }[];
};

function jointOf(s: TraceSplice): Joint {
  return {
    boxId: s.box_id,
    box: s.box,
    note: s.note,
    loss: s.loss === null ? null : Number(s.loss),
  };
}

// Builds the path as a tree. It starts at the OLT end when one is recorded,
// so the OLT is on the left and the far ends are on the right. A core joined
// to several cores shows as a fork.
function buildTree(trace: Trace, start: string): PathNode | null {
  const coreById = new Map(trace.cores.map((c) => [c.id, c]));
  const edges = trace.splices.filter((s) => s.a !== s.b);
  const through = trace.splices.filter((s) => s.a === s.b);
  const termsByCore = new Map<string, TraceTerminal[]>();
  for (const t of trace.terminals) {
    const list = termsByCore.get(t.core) ?? [];
    list.push(t);
    termsByCore.set(t.core, list);
  }

  const rootId =
    trace.terminals.find((t) => t.kind === "olt_port")?.core ??
    trace.terminals.find((t) => t.kind === "olt_uplink")?.core ??
    start;

  const visited = new Set<string>();

  function walk(coreId: string): PathNode | null {
    const core = coreById.get(coreId);
    if (!core || visited.has(coreId)) return null;
    visited.add(coreId);
    const node: PathNode = {
      core,
      terminals: termsByCore.get(coreId) ?? [],
      through: through.filter((s) => s.a === coreId).map(jointOf),
      children: [],
    };
    for (const s of edges) {
      if (s.a !== coreId && s.b !== coreId) continue;
      const other = s.a === coreId ? s.b : s.a;
      if (visited.has(other)) continue;
      const child = walk(other);
      if (child) node.children.push({ joint: jointOf(s), node: child });
    }
    return node;
  }

  return walk(rootId);
}

function collectBoxes(root: PathNode | null): Joint[] {
  const out: Joint[] = [];
  const seen = new Set<string>();
  const add = (j: Joint) => {
    if (!seen.has(j.boxId)) {
      seen.add(j.boxId);
      out.push(j);
    }
  };
  function visit(n: PathNode) {
    n.through.forEach(add);
    for (const c of n.children) {
      add(c.joint);
      visit(c.node);
    }
  }
  if (root) visit(root);
  return out;
}

function terminalHref(t: TraceTerminal) {
  switch (t.kind) {
    case "olt_port":
    case "olt_uplink":
      return `/olts/${t.parent_id}`;
    case "switch_port":
      return `/switches/${t.parent_id}`;
    case "splitter":
      return `/splitters/${t.parent_id}`;
    case "customer":
      return `/customers/${t.parent_id}`;
    default:
      return null;
  }
}

/* ---------- pieces of the diagram ---------- */

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-gray-300"
      style={{ backgroundColor: colorHex[color] ?? "#999" }}
    />
  );
}

function TerminalChip({ t }: { t: TraceTerminal }) {
  const k = kindStyle[t.kind] ?? { label: t.kind, color: "#64748b" };
  const href = terminalHref(t);
  const body = (
    <>
      <span className="block text-[10px] text-gray-500">{k.label}</span>
      <span className="block truncate text-xs font-medium text-gray-900">
        {t.label}
        {t.detail ? `, ${t.detail}` : ""}
      </span>
    </>
  );
  const cls =
    "block rounded-md border border-gray-200 bg-gray-50 px-2 py-1 hover:border-gray-400";
  return href ? (
    <Link href={href} className={cls} style={{ borderLeftColor: k.color, borderLeftWidth: 3 }}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={{ borderLeftColor: k.color, borderLeftWidth: 3 }}>
      {body}
    </div>
  );
}

function CoreCard({ node, isStart }: { node: PathNode; isStart: boolean }) {
  const c = node.core;
  const color = typeColor[c.cable_type] ?? "#64748b";
  const len = c.length_meters === null ? null : Number(c.length_meters);
  return (
    <div
      className={`w-60 shrink-0 rounded-xl border bg-white p-3 shadow-sm ${
        isStart ? "border-blue-600 ring-2 ring-blue-600/20" : "border-slate-200"
      }`}
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <Link
        href={`/fiber-cables/${c.cable_id}`}
        className="block truncate text-sm font-semibold text-gray-900 hover:underline"
      >
        {c.cable_name}
      </Link>
      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
        <Dot color={c.color} />
        Core {c.core_number} ({c.color})
      </span>
      <span className="block text-[11px] text-gray-500">
        {cap(c.cable_type)}
        {len !== null && !Number.isNaN(len) ? `, ${fmtLen(len)}` : ""}
      </span>
      {node.through.length > 0 && (
        <span className="mt-1.5 block text-[11px] text-slate-600">
          Straight through {node.through.map((j) => j.box).join(", ")}
        </span>
      )}
      {node.terminals.length > 0 && (
        <div className="mt-2 space-y-1">
          {node.terminals.map((t) => (
            <TerminalChip key={t.kind + t.ref_id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function JointChip({ j }: { j: Joint }) {
  return (
    <Link
      href={`/tg-boxes/${j.boxId}`}
      className="w-44 shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm hover:border-slate-400"
      style={{ borderTopColor: "#ea580c", borderTopWidth: 3 }}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          style={{ color: "#ea580c" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M4 7.5L12 12l8-4.5M12 12v9" />
        </svg>
        <span className="truncate">{j.box}</span>
      </span>
      <span className="block text-[11px] text-gray-500">
        Splice joint{j.loss !== null ? `, ${j.loss} dB` : ""}
      </span>
      {j.note && <span className="mt-0.5 block text-[11px] text-gray-600">{j.note}</span>}
    </Link>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center">
      <span className="h-0.5 w-5 bg-slate-400" />
      <span className="border-y-[4px] border-l-[7px] border-y-transparent border-l-slate-400" />
    </span>
  );
}

function Branch({ node, startId }: { node: PathNode; startId: string }) {
  const n = node.children.length;
  return (
    <div className="flex items-center">
      <CoreCard node={node} isStart={node.core.id === startId} />
      {n > 0 && (
        <>
          <span className="h-0.5 w-7 shrink-0 bg-slate-400" />
          <div className="flex flex-col">
            {node.children.map((ch, i) => (
              <div key={i} className="relative flex items-center py-1.5 pl-7">
                <span className="absolute left-0 top-1/2 h-0.5 w-7 -translate-y-1/2 bg-slate-400" />
                {n > 1 && (
                  <span
                    className="absolute left-0 w-0.5 bg-slate-400"
                    style={{
                      top: i === 0 ? "50%" : 0,
                      bottom: i === n - 1 ? "50%" : 0,
                    }}
                  />
                )}
                <JointChip j={ch.joint} />
                <Arrow />
                <Branch node={ch.node} startId={startId} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- the section ---------- */

export default function FiberPath({ cableId }: { cableId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [cores, setCores] = useState<CoreChip[] | null>(null);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [selected, setSelected] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCores(null);
    setSelected("");
    setTrace(null);
    supabase
      .from("fiber_cores")
      .select("id, core_number, color, status")
      .eq("cable_id", cableId)
      .order("core_number")
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []) as unknown as CoreChip[];
        setCores(list);
        const firstUsed = list.find((c) => c.status === "used");
        setOnlyUsed(!!firstUsed);
        if (firstUsed) setSelected(firstUsed.id);
      });
    return () => {
      cancelled = true;
    };
  }, [cableId, supabase]);

  useEffect(() => {
    if (!selected) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    setTrace(null);
    setError(null);
    supabase.rpc("fiber_trace", { p_core: selected }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      setTrace(data as unknown as Trace);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, supabase]);

  const tree = useMemo(() => (trace ? buildTree(trace, selected) : null), [trace, selected]);
  const boxes = useMemo(() => collectBoxes(tree), [tree]);

  const usedCount = cores ? cores.filter((c) => c.status === "used").length : 0;
  const shown = cores
    ? cores.filter((c) => !onlyUsed || c.status === "used" || c.id === selected)
    : [];
  const selectedCore = cores?.find((c) => c.id === selected);
  const hasAnything =
    !!tree && (tree.children.length > 0 || tree.terminals.length > 0 || tree.through.length > 0);

  return (
    <section className="mt-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">Follow a fiber end to end</h3>
      <p className="mb-3 text-xs text-gray-500">
        Pick a core to see every TG box where it is joined, from one end to the other.
      </p>

      {cores === null ? (
        <p className="text-sm text-gray-400">Loading the cores...</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
            <span>
              {countOf(usedCount, "core", "cores")} in use of {cores.length}
            </span>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={onlyUsed}
                onChange={(e) => setOnlyUsed(e.target.checked)}
              />
              Only cores in use
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((c) => {
              const isSel = c.id === selected;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  title={`Core ${c.core_number}, ${c.color}, ${c.status}`}
                  className={`grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-semibold ${
                    isSel ? "border-blue-600 ring-2 ring-blue-600/30" : "border-gray-300"
                  } ${c.status === "damaged" ? "opacity-40" : ""}`}
                  style={{
                    backgroundColor: colorHex[c.color] ?? "#999",
                    color: ["White", "Yellow", "Aqua"].includes(c.color) ? "#111827" : "#ffffff",
                  }}
                >
                  {c.core_number}
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-xs text-gray-400">
                No core is in use on this cable yet. Untick the box above to see all of them.
              </p>
            )}
          </div>
        </>
      )}

      {selected && (
        <div className="mt-4">
          {error && <p className="text-sm text-red-600">Could not trace this fiber: {error}</p>}
          {!error && !trace && <p className="text-sm text-gray-400">Tracing the fiber...</p>}
          {!error && trace && tree && (
            <>
              <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                {boxes.length > 0 ? (
                  <>
                    <p className="font-medium text-gray-900">
                      Core {selectedCore?.core_number} is joined in{" "}
                      {countOf(boxes.length, "TG box", "TG boxes")}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {boxes.map((b, i) => (
                        <span key={b.boxId}>
                          {i > 0 ? "  →  " : ""}
                          <Link href={`/tg-boxes/${b.boxId}`} className="text-blue-600 hover:underline">
                            {b.box}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </>
                ) : (
                  <p className="font-medium text-gray-900">
                    Core {selectedCore?.core_number} is not joined in any TG box.
                  </p>
                )}
              </div>

              {hasAnything ? (
                <div
                  className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
                  style={{
                    backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
                    backgroundSize: "18px 18px",
                  }}
                >
                  <div className="min-w-max">
                    <Branch node={tree} startId={selected} />
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                  This core is not joined to another cable and no device is plugged into it yet.
                  Record a splice in a TG box, or plug a device into this core on its port, and
                  the path will appear here.
                </p>
              )}
              <p className="mt-2 text-[11px] text-gray-500">
                The blue outline marks the core you picked. A core is treated as one continuous
                fiber along its cable.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
