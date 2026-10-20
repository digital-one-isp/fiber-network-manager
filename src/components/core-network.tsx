"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  CoreData,
  CoreOlt,
  CorePort,
  CoreReseller,
  CoreSite,
  CoreSwitch,
  CoreUpstream,
  FiberRef,
} from "@/lib/core-network-data";

const NAVY = "#0f2a4a";
const LINE = { upstream: "#0284c7", olt: "#334155", reseller: "#0d9488" };

const kindColor: Record<string, string> = {
  iig: "#0284c7",
  ipt: "#0d9488",
  bdix: "#9333ea",
  cdn: "#ea580c",
  other: "#64748b",
};
const kindShort: Record<string, string> = {
  iig: "IIG",
  ipt: "IPT",
  bdix: "BDIX",
  cdn: "CDN",
  other: "Other",
};
const kindLong: Record<string, string> = {
  iig: "IIG (international gateway)",
  ipt: "IPT / ITC",
  bdix: "BDIX / peering",
  cdn: "CDN / cache",
  other: "Upstream provider",
};
const roleLabel: Record<string, string> = {
  core: "Core",
  aggregation: "Aggregation",
  access: "Access",
  other: "Other",
};
const siteTypeLabel: Record<string, string> = {
  noc: "Office / NOC",
  office: "Office",
  pop: "POP",
  data_center: "Data center",
  other: "Other",
};
const mediaName: Record<string, string> = {
  sfp: "SFP",
  sfp_plus: "SFP+",
  sfp28: "SFP28",
  qsfp: "QSFP",
  rj45: "RJ45",
};
const linkName: Record<string, string> = {
  fiber: "fiber",
  dac: "DAC cable",
  cat5e: "Cat5e cable",
  cat6: "Cat6 cable",
  cat6a: "Cat6a cable",
  other: "other cable",
};
function fiberWords(f: FiberRef | null) {
  if (!f) return null;
  const core =
    f.coreNo !== null ? `, core ${f.coreNo}${f.color ? ` (${f.color})` : ""}` : "";
  return `${f.cable}${core}`;
}
function linkWords(type: string | null, len: number | null) {
  if (!type) return null;
  const name = linkName[type] ?? type;
  return len !== null ? `${name}, ${len} m` : name;
}

const portStatusCls: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  faulty: "bg-red-50 text-red-700",
  disabled: "bg-slate-200 text-slate-700",
};

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
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatMbps(n: number) {
  if (n >= 1000) {
    const g = n / 1000;
    return `${Number.isInteger(g) ? g : g.toFixed(1)} Gbps`;
  }
  return `${n} Mbps`;
}
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* ---------- icons ---------- */

function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.2A4 4 0 0117 18H7z" />
    </svg>
  );
}
function IconSwitch() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 12h.01M11 12h.01M15 12h.01M19 12h.01" />
    </svg>
  );
}
function IconOlt() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </svg>
  );
}
function IconStore() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 9l1.5-5h13L20 9" />
      <path d="M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}
function IconSite() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V6l8-3 8 3v14" />
      <path d="M9 20v-5h6v5" />
      <path d="M9 9h.01M12 9h.01M15 9h.01M9 12h.01M12 12h.01M15 12h.01" />
    </svg>
  );
}

/* ---------- connectors ---------- */

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

function JoinFork({ kids }: { kids: Kid[] }) {
  return (
    <div className="flex flex-col">
      {kids.map((k, i) => (
        <div key={i} className="relative flex items-center justify-end py-1.5 pr-7">
          {k.node}
          <span
            className="absolute right-0 top-1/2 h-0.5 w-7 -translate-y-1/2"
            style={{ background: k.color }}
          />
          {kids.length > 1 && (
            <span
              className="absolute right-0 w-0.5"
              style={{
                background: k.color,
                top: i === 0 ? "50%" : 0,
                bottom: i === kids.length - 1 ? "50%" : 0,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- popup ---------- */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

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

function CoreModal({
  color,
  icon,
  title,
  subtitle,
  status,
  facts,
  href,
  canGoBack,
  onBack,
  onClose,
  children,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  status: string | null;
  facts: [string, string | null][];
  href: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  children?: ReactNode;
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
  }, [title]);

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
        aria-labelledby="core-detail-title"
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
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="core-detail-title" className="truncate text-lg font-semibold text-gray-900">
              {title}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{subtitle}</span>
              {status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChipCls(status)}`}
                >
                  {cap(status)}
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
          <section>
            <SectionTitle>Details</SectionTitle>
            <dl className="divide-y divide-gray-100 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  <dd
                    className={`break-words text-right ${
                      value ? "font-medium text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {value ?? "Not set"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {children}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <div>
            {canGoBack && (
              <button
                type="button"
                onClick={onBack}
                className={`text-sm text-gray-700 hover:underline ${focusRing}`}
              >
                Back
              </button>
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
              href={href}
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

/* ---------- the section ---------- */

type Sel =
  | { kind: "site"; node: CoreSite }
  | { kind: "upstream"; node: CoreUpstream }
  | { kind: "switch"; node: CoreSwitch }
  | { kind: "reseller"; node: CoreReseller };

function selKey(s: Sel) {
  if (s.kind === "reseller") return `reseller:${s.node.portId}`;
  if (s.kind === "upstream") return `upstream:${s.node.id}:${s.node.via?.portId ?? ""}`;
  return `${s.kind}:${s.node.id}`;
}

const chipBase =
  "block shrink-0 rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

export default function CoreNetwork({
  core,
  onOpenOlt,
}: {
  core: CoreData;
  onOpenOlt: (oltId: string) => void;
}) {
  const [stack, setStack] = useState<Sel[]>([]);
  const sel = stack.length > 0 ? stack[stack.length - 1] : null;
  const activeKey = sel ? selKey(sel) : "";

  const open = (s: Sel) => setStack([s]);
  const drill = (s: Sel) => setStack((h) => [...h, s]);
  const back = () => setStack((h) => h.slice(0, -1));
  const close = useCallback(() => setStack([]), []);
  const openOlt = (id: string) => {
    setStack([]);
    onOpenOlt(id);
  };

  const allSwitches = [...core.sites.flatMap((s) => s.switches), ...core.unplacedSwitches];
  const switchById = new Map(allSwitches.map((s) => [s.id, s]));

  /* ----- chips ----- */

  function upstreamChip(u: CoreUpstream) {
    const color = kindColor[u.kind] ?? kindColor.other;
    const key = selKey({ kind: "upstream", node: u });
    return (
      <button
        type="button"
        onClick={() => open({ kind: "upstream", node: u })}
        className={`${chipBase} w-64 ${
          activeKey === key ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
        }`}
        style={{ borderLeftColor: color, borderLeftWidth: 4 }}
      >
        <span className="flex items-center gap-2">
          <span style={{ color }}>
            <IconCloud />
          </span>
          <span className="truncate text-sm font-medium text-gray-900">{u.name}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            {kindShort[u.kind] ?? u.kind}
          </span>
          <span
            className="ml-auto h-2 w-2 shrink-0 rounded-full"
            style={{ background: statusColor(u.status) }}
            title={u.status}
          />
        </span>
        {u.service && (
          <span className="mt-0.5 block truncate text-xs text-gray-500">{u.service}</span>
        )}
        <span className="mt-1 block text-[11px] text-gray-500">
          {u.capacityMbps !== null ? formatMbps(u.capacityMbps) : "Capacity not set"}
          {u.via ? `, enters on ${u.via.portLabel} (${u.via.speed})` : ""}
          {u.via && linkWords(u.via.linkType, u.via.linkLengthM)
            ? `, ${linkWords(u.via.linkType, u.via.linkLengthM)}`
            : ""}
          {u.via?.fiber ? `, ${fiberWords(u.via.fiber)}` : ""}
        </span>
      </button>
    );
  }

  function switchCard(s: CoreSwitch) {
    const pct = s.portsTotal > 0 ? Math.min(100, (s.portsUsed / s.portsTotal) * 100) : 0;
    const key = selKey({ kind: "switch", node: s });
    return (
      <button
        type="button"
        onClick={() => open({ kind: "switch", node: s })}
        className={`${chipBase} w-56 ${
          activeKey === key ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
        }`}
        style={{ borderTopColor: NAVY, borderTopWidth: 3 }}
      >
        <span className="flex items-center gap-2">
          <span style={{ color: NAVY }}>
            <IconSwitch />
          </span>
          <span className="truncate text-sm font-medium text-gray-900">{s.name}</span>
          <span
            className="ml-auto h-2 w-2 shrink-0 rounded-full"
            style={{ background: statusColor(s.status) }}
            title={s.status}
          />
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {[s.vendor, s.model].filter(Boolean).join(" ") || "Device not set"}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
            {roleLabel[s.role] ?? s.role}
          </span>
          <span className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-gray-200">
            <span
              className="block h-full rounded-full bg-slate-600"
              style={{ width: `${pct}%` }}
            />
          </span>
          {s.portsUsed} of {s.portsTotal} ports
        </span>
      </button>
    );
  }

  function oltChip(o: CoreOlt) {
    return (
      <button
        type="button"
        onClick={() => openOlt(o.id)}
        className={`${chipBase} w-60 border-gray-200`}
        style={{ borderLeftColor: LINE.olt, borderLeftWidth: 4 }}
      >
        <span className="flex items-center gap-2">
          <span style={{ color: LINE.olt }}>
            <IconOlt />
          </span>
          <span className="truncate text-sm font-medium text-gray-900">{o.name}</span>
        </span>
        <span className="mt-1 block text-[11px] text-gray-500">
          {o.uplinkLabel ? `${o.uplinkLabel}, ` : ""}
          {o.speed} {mediaName[o.media] ?? o.media} on {o.portLabel}
          {o.sfp ? `, ${o.sfp}` : ""}
          {o.linkType ? `, via ${linkName[o.linkType] ?? o.linkType}` : ""}
        </span>
        {o.fiber && (
          <span className="mt-1 block text-[11px] text-gray-700">
            OLT end: {fiberWords(o.fiber)}
          </span>
        )}
        {o.farFiber && (
          <span className="block text-[11px] text-gray-700">
            Switch end: {fiberWords(o.farFiber)}
          </span>
        )}
      </button>
    );
  }

  function resellerChip(r: CoreReseller) {
    const key = selKey({ kind: "reseller", node: r });
    return (
      <button
        type="button"
        onClick={() => open({ kind: "reseller", node: r })}
        className={`${chipBase} w-60 ${
          activeKey === key ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
        }`}
        style={{ borderLeftColor: LINE.reseller, borderLeftWidth: 4 }}
      >
        <span className="flex items-center gap-2">
          <span style={{ color: LINE.reseller }}>
            <IconStore />
          </span>
          <span className="truncate text-sm font-medium text-gray-900">{r.name}</span>
          <span
            className="ml-auto h-2 w-2 shrink-0 rounded-full"
            style={{ background: statusColor(r.status) }}
            title={r.status}
          />
        </span>
        <span className="mt-1 block text-[11px] text-gray-500">
          {r.via.speed} on {r.via.portLabel}
          {r.via.vlan !== null ? `, VLAN ${r.via.vlan}` : ""}
          {r.bandwidthMbps !== null ? `, ${formatMbps(r.bandwidthMbps)}` : ""}
          {linkWords(r.via.linkType, r.via.linkLengthM)
            ? `, ${linkWords(r.via.linkType, r.via.linkLengthM)}`
            : ""}
          {r.via.fiber ? `, ${fiberWords(r.via.fiber)}` : ""}
        </span>
      </button>
    );
  }

  function switchRow(s: CoreSwitch) {
    const up: Kid[] = s.upstreams.map((u) => ({ color: LINE.upstream, node: upstreamChip(u) }));
    const down: Kid[] = [
      ...s.olts.map((o) => ({ color: LINE.olt, node: oltChip(o) })),
      ...s.resellers.map((r) => ({ color: LINE.reseller, node: resellerChip(r) })),
    ];
    return (
      <div key={s.id} className="flex items-center">
        {up.length > 0 && (
          <>
            <JoinFork kids={up} />
            <span className="h-0.5 w-7 shrink-0" style={{ background: up[0].color }} />
          </>
        )}
        {switchCard(s)}
        {down.length > 0 && (
          <>
            <span className="h-0.5 w-7 shrink-0" style={{ background: down[0].color }} />
            <Fork kids={down} />
          </>
        )}
        {up.length === 0 && down.length === 0 && (
          <span className="ml-4 text-xs text-gray-400">
            Nothing connected yet. Set an upstream, reseller or OLT uplink on one of its ports.
          </span>
        )}
      </div>
    );
  }

  function looseGroup(title: string, children: ReactNode) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-3">
        <p className="mb-2 text-xs text-gray-500">{title}</p>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    );
  }

  function sitePanel(site: CoreSite) {
    const upstreamCount =
      site.switches.reduce((n, s) => n + s.upstreams.length, 0) + site.looseUpstreams.length;
    const oltCount = site.switches.reduce((n, s) => n + s.olts.length, 0) + site.looseOlts.length;
    const resellerCount = site.switches.reduce((n, s) => n + s.resellers.length, 0);
    const empty =
      site.switches.length === 0 &&
      site.looseUpstreams.length === 0 &&
      site.looseOlts.length === 0;

    return (
      <section key={site.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
          style={{ background: NAVY }}
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full" style={{ background: statusColor(site.status) }} />
            <button
              type="button"
              onClick={() => open({ kind: "site", node: site })}
              className="text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-white"
            >
              {site.name}
            </button>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
              {siteTypeLabel[site.type] ?? site.type}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
            <span>{plural(upstreamCount, "upstream link")}</span>
            <span>{plural(site.switches.length, "switch")}</span>
            <span>{plural(oltCount, "OLT")}</span>
            <span>{plural(resellerCount, "reseller")}</span>
          </div>
        </div>

        <div
          className="space-y-4 overflow-x-auto bg-slate-50 p-5"
          style={{
            backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          {site.address && <p className="text-xs text-gray-500">{site.address}</p>}

          {site.switches.map((s) => switchRow(s))}

          {site.looseUpstreams.length > 0 &&
            looseGroup(
              "Upstream links that end here but are not on a switch port yet",
              site.looseUpstreams.map((u) => <span key={u.id}>{upstreamChip(u)}</span>)
            )}

          {site.looseOlts.length > 0 &&
            looseGroup(
              "OLTs placed here with no uplink recorded",
              site.looseOlts.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOlt(o.id)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 hover:border-gray-400"
                >
                  {o.name}
                </button>
              ))
            )}

          {empty && (
            <p className="text-sm text-gray-400">
              Nothing is placed at this site yet.{" "}
              <Link href={`/sites/${site.id}`} className="text-blue-600 hover:underline">
                Open the site
              </Link>{" "}
              to place OLTs and switches here.
            </p>
          )}
        </div>
      </section>
    );
  }

  /* ----- popups ----- */

  function connectionCell(s: CoreSwitch, c: CorePort["connection"]) {
    if (!c) return <span className="text-gray-400">Nothing connected</span>;
    const btn = "text-blue-600 hover:underline " + focusRing;
    if (c.kind === "upstream") {
      const u = s.upstreams.find((x) => x.id === c.id);
      if (u) {
        return (
          <button type="button" className={btn} onClick={() => drill({ kind: "upstream", node: u })}>
            {c.name}
          </button>
        );
      }
    }
    if (c.kind === "reseller") {
      const r = s.resellers.find((x) => x.id === c.id);
      if (r) {
        return (
          <button type="button" className={btn} onClick={() => drill({ kind: "reseller", node: r })}>
            {c.name}
          </button>
        );
      }
    }
    if (c.kind === "olt" && c.id) {
      const oltId = c.id;
      return (
        <button type="button" className={btn} onClick={() => openOlt(oltId)}>
          {c.name}
        </button>
      );
    }
    return <span className="text-gray-700">{c.name}</span>;
  }

  function renderModal() {
    if (!sel) return null;
    const common = { canGoBack: stack.length > 1, onBack: back, onClose: close };

    if (sel.kind === "upstream") {
      const u = sel.node;
      const sw = u.via ? switchById.get(u.via.switchId) : undefined;
      return (
        <CoreModal
          {...common}
          color={kindColor[u.kind] ?? kindColor.other}
          icon={<IconCloud />}
          title={u.name}
          subtitle={kindLong[u.kind] ?? u.kind}
          status={u.status}
          href={`/upstreams/${u.id}`}
          facts={[
            ["Service", u.service],
            ["Circuit ID", u.circuitId],
            ["Capacity", u.capacityMbps !== null ? formatMbps(u.capacityMbps) : null],
            ["Link ends at", u.siteName],
            [
              "Enters on",
              u.via
                ? `${u.via.switchName}, ${u.via.portLabel} (${u.via.speed} ${
                    mediaName[u.via.media] ?? u.via.media
                  })`
                : null,
            ],
            ["SFP module", u.via ? u.via.sfp : null],
            ["VLAN", u.via && u.via.vlan !== null ? String(u.via.vlan) : null],
            ["Connected with", u.via ? linkWords(u.via.linkType, u.via.linkLengthM) : null],
            ["Fiber", u.via ? fiberWords(u.via.fiber) : null],
            ["Contact", u.contactPerson],
            ["Phone", u.phone],
            ["Email", u.email],
          ]}
        >
          {sw && (
            <section className="mt-6">
              <SectionTitle>Handed over to</SectionTitle>
              <DrillRow
                color={NAVY}
                icon={<IconSwitch />}
                title={sw.name}
                meta={`${roleLabel[sw.role] ?? sw.role} switch, ${sw.portsUsed} of ${sw.portsTotal} ports in use`}
                onClick={() => drill({ kind: "switch", node: sw })}
              />
            </section>
          )}
        </CoreModal>
      );
    }

    if (sel.kind === "switch") {
      const s = sel.node;
      return (
        <CoreModal
          {...common}
          color={NAVY}
          icon={<IconSwitch />}
          title={s.name}
          subtitle={`${roleLabel[s.role] ?? s.role} switch`}
          status={s.status}
          href={`/switches/${s.id}`}
          facts={[
            ["Device", [s.vendor, s.model].filter(Boolean).join(" ") || null],
            ["Management IP", s.ip],
            ["Site", s.siteName],
            ["Ports in use", `${s.portsUsed} of ${s.portsTotal}`],
          ]}
        >
          {s.upstreams.length > 0 && (
            <section className="mt-6">
              <SectionTitle>Upstream links</SectionTitle>
              <div className="space-y-2">
                {s.upstreams.map((u) => (
                  <DrillRow
                    key={`${u.id}:${u.via?.portId ?? ""}`}
                    color={kindColor[u.kind] ?? kindColor.other}
                    icon={<IconCloud />}
                    title={u.name}
                    meta={`${kindShort[u.kind] ?? u.kind}, ${
                      u.capacityMbps !== null ? formatMbps(u.capacityMbps) : "capacity not set"
                    }${u.via ? `, on ${u.via.portLabel}` : ""}`}
                    onClick={() => drill({ kind: "upstream", node: u })}
                  />
                ))}
              </div>
            </section>
          )}

          {s.olts.length > 0 && (
            <section className="mt-6">
              <SectionTitle>OLTs on this switch</SectionTitle>
              <div className="space-y-2">
                {s.olts.map((o) => (
                  <DrillRow
                    key={`${o.id}:${o.portLabel}`}
                    color={LINE.olt}
                    icon={<IconOlt />}
                    title={o.name}
                    meta={`${o.uplinkLabel ? `${o.uplinkLabel}, ` : ""}${o.speed} ${
                      mediaName[o.media] ?? o.media
                    } on ${o.portLabel}${o.linkType ? `, via ${linkName[o.linkType] ?? o.linkType}` : ""}${
                      o.fiber ? `, ${fiberWords(o.fiber)}` : ""
                    }`}
                    onClick={() => openOlt(o.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {s.resellers.length > 0 && (
            <section className="mt-6">
              <SectionTitle>Resellers on this switch</SectionTitle>
              <div className="space-y-2">
                {s.resellers.map((r) => (
                  <DrillRow
                    key={r.portId}
                    color={LINE.reseller}
                    icon={<IconStore />}
                    title={r.name}
                    meta={`${r.via.speed} on ${r.via.portLabel}${
                      r.via.vlan !== null ? `, VLAN ${r.via.vlan}` : ""
                    }`}
                    onClick={() => drill({ kind: "reseller", node: r })}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <SectionTitle>Ports ({s.ports.length})</SectionTitle>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Port</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Connected to</th>
                    <th className="px-3 py-2 font-medium">SFP and service</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ports.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 font-medium text-gray-900">{p.label}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {p.speed} {mediaName[p.media] ?? p.media}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            portStatusCls[p.status] ?? portStatusCls.free
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{connectionCell(s, p.connection)}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {p.sfp ?? <span className="text-gray-400">SFP not set</span>}
                        {(p.vlan !== null || p.bandwidthMbps !== null) && (
                          <span className="block text-xs text-gray-500">
                            {[
                              p.vlan !== null ? `VLAN ${p.vlan}` : null,
                              p.bandwidthMbps !== null ? `${p.bandwidthMbps} Mbps` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {s.ports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                        This switch has no ports yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </CoreModal>
      );
    }

    if (sel.kind === "reseller") {
      const r = sel.node;
      const sw = switchById.get(r.via.switchId);
      return (
        <CoreModal
          {...common}
          color={LINE.reseller}
          icon={<IconStore />}
          title={r.name}
          subtitle="Reseller"
          status={r.status}
          href={`/resellers/${r.id}`}
          facts={[
            ["Contact", r.contactPerson],
            ["Phone", r.phone],
            ["Email", r.email],
            ["Address", r.address],
            ["Total bandwidth", r.bandwidthMbps !== null ? formatMbps(r.bandwidthMbps) : null],
            [
              "Handed off on",
              `${r.via.switchName}, ${r.via.portLabel} (${r.via.speed} ${
                mediaName[r.via.media] ?? r.via.media
              })`,
            ],
            ["SFP module", r.via.sfp],
            ["VLAN", r.via.vlan !== null ? String(r.via.vlan) : null],
            ["Connected with", linkWords(r.via.linkType, r.via.linkLengthM)],
            ["Fiber", fiberWords(r.via.fiber)],
            [
              "Port bandwidth",
              r.via.bandwidthMbps !== null ? formatMbps(r.via.bandwidthMbps) : null,
            ],
          ]}
        >
          {sw && (
            <section className="mt-6">
              <SectionTitle>Served from</SectionTitle>
              <DrillRow
                color={NAVY}
                icon={<IconSwitch />}
                title={sw.name}
                meta={`${roleLabel[sw.role] ?? sw.role} switch, ${sw.portsUsed} of ${sw.portsTotal} ports in use`}
                onClick={() => drill({ kind: "switch", node: sw })}
              />
            </section>
          )}
        </CoreModal>
      );
    }

    const site = sel.node;
    const siteUpstreams = [...site.switches.flatMap((s) => s.upstreams), ...site.looseUpstreams];
    const siteOlts = [
      ...site.switches.flatMap((s) => s.olts.map((o) => ({ id: o.id, name: o.name, via: s.name }))),
      ...site.looseOlts.map((o) => ({ id: o.id, name: o.name, via: null as string | null })),
    ];
    return (
      <CoreModal
        {...common}
        color={NAVY}
        icon={<IconSite />}
        title={site.name}
        subtitle={siteTypeLabel[site.type] ?? site.type}
        status={site.status}
        href={`/sites/${site.id}`}
        facts={[
          ["Address", site.address],
          ["Contact", site.contactPerson],
          ["Phone", site.phone],
          ["Switches", String(site.switches.length)],
          ["Upstream links", String(siteUpstreams.length)],
          ["OLTs", String(siteOlts.length)],
        ]}
      >
        {site.switches.length > 0 && (
          <section className="mt-6">
            <SectionTitle>Switches</SectionTitle>
            <div className="space-y-2">
              {site.switches.map((s) => (
                <DrillRow
                  key={s.id}
                  color={NAVY}
                  icon={<IconSwitch />}
                  title={s.name}
                  meta={`${roleLabel[s.role] ?? s.role}, ${s.portsUsed} of ${s.portsTotal} ports in use`}
                  onClick={() => drill({ kind: "switch", node: s })}
                />
              ))}
            </div>
          </section>
        )}
        {siteUpstreams.length > 0 && (
          <section className="mt-6">
            <SectionTitle>Upstream links</SectionTitle>
            <div className="space-y-2">
              {siteUpstreams.map((u) => (
                <DrillRow
                  key={`${u.id}:${u.via?.portId ?? ""}`}
                  color={kindColor[u.kind] ?? kindColor.other}
                  icon={<IconCloud />}
                  title={u.name}
                  meta={`${kindShort[u.kind] ?? u.kind}${u.service ? `, ${u.service}` : ""}`}
                  onClick={() => drill({ kind: "upstream", node: u })}
                />
              ))}
            </div>
          </section>
        )}
        {siteOlts.length > 0 && (
          <section className="mt-6">
            <SectionTitle>OLTs</SectionTitle>
            <div className="space-y-2">
              {siteOlts.map((o) => (
                <DrillRow
                  key={`${o.id}:${o.via ?? ""}`}
                  color={LINE.olt}
                  icon={<IconOlt />}
                  title={o.name}
                  meta={o.via ? `Uplink on ${o.via}` : "No uplink recorded"}
                  onClick={() => openOlt(o.id)}
                />
              ))}
            </div>
          </section>
        )}
      </CoreModal>
    );
  }

  /* ----- the section itself ----- */

  const nothing =
    core.sites.length === 0 &&
    core.unplacedSwitches.length === 0 &&
    core.unplacedUpstreams.length === 0;

  if (nothing) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Office, upstream and switches</h2>
        <p className="mt-1 text-sm text-gray-500">
          This part of the map is empty. Add your Office / NOC, the upstream ISPs you buy
          bandwidth from, and your switches to see how the internet reaches your OLTs.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/sites/new"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Add a site
          </Link>
          <Link
            href="/upstreams/new"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Add an upstream ISP
          </Link>
          <Link
            href="/switches/new"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Add a switch
          </Link>
        </div>
      </section>
    );
  }

  const legend = [
    { label: "Upstream link", color: LINE.upstream },
    { label: "OLT uplink", color: LINE.olt },
    { label: "Reseller handoff", color: LINE.reseller },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Office, upstream and switches</span>
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-0.5 w-5" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {core.sites.map((s) => sitePanel(s))}

      {(core.unplacedSwitches.length > 0 || core.unplacedUpstreams.length > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Not placed at a site yet</h2>
          <p className="mt-0.5 text-xs text-amber-800/80">
            Place these from a site page so they show under the right location.
          </p>
          <div className="mt-3 space-y-4 overflow-x-auto">
            {core.unplacedSwitches.map((s) => switchRow(s))}
            {core.unplacedUpstreams.length > 0 &&
              looseGroup(
                "Upstream links with no site and no switch port",
                core.unplacedUpstreams.map((u) => <span key={u.id}>{upstreamChip(u)}</span>)
              )}
          </div>
        </section>
      )}

      {renderModal()}
    </div>
  );
}
