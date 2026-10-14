import Link from "next/link";
import type { ReactNode } from "react";
import type {
  CoreData,
  CoreOlt,
  CoreReseller,
  CoreSite,
  CoreSwitch,
  CoreUpstream,
  LooseUpstream,
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

/* ---------- connectors ---------- */

type Kid = { color: string; node: ReactNode };

// Children on the right, joined by a vertical rail on their left
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

// The mirror image: items on the left, rail on their right
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

/* ---------- nodes ---------- */

const chipBase =
  "block shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

function UpstreamChip({ u }: { u: CoreUpstream | LooseUpstream }) {
  const color = kindColor[u.kind] ?? kindColor.other;
  const port = "portLabel" in u ? u : null;
  return (
    <Link
      href={`/upstreams/${u.id}`}
      className={`${chipBase} w-64`}
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
        {port ? `, enters on ${port.portLabel} (${port.speed})` : ""}
      </span>
    </Link>
  );
}

function SwitchCard({ s }: { s: CoreSwitch }) {
  const pct = s.portsTotal > 0 ? Math.min(100, (s.portsUsed / s.portsTotal) * 100) : 0;
  return (
    <Link
      href={`/switches/${s.id}`}
      className={`${chipBase} w-56`}
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
          <span className="block h-full rounded-full bg-slate-600" style={{ width: `${pct}%` }} />
        </span>
        {s.portsUsed} of {s.portsTotal} ports
      </span>
    </Link>
  );
}

function OltChip({ o }: { o: CoreOlt }) {
  return (
    <Link
      href={`/olts/${o.id}`}
      className={`${chipBase} w-60`}
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
        {o.speed} on {o.portLabel}
        {o.sfp ? `, ${o.sfp}` : ""}
      </span>
    </Link>
  );
}

function ResellerChip({ r }: { r: CoreReseller }) {
  return (
    <Link
      href={`/resellers/${r.id}`}
      className={`${chipBase} w-60`}
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
        {r.speed} on {r.portLabel}
        {r.vlan !== null ? `, VLAN ${r.vlan}` : ""}
        {r.bandwidthMbps !== null ? `, ${formatMbps(r.bandwidthMbps)}` : ""}
      </span>
    </Link>
  );
}

function SwitchRow({ s }: { s: CoreSwitch }) {
  const up: Kid[] = s.upstreams.map((u) => ({
    color: LINE.upstream,
    node: <UpstreamChip u={u} />,
  }));
  const down: Kid[] = [
    ...s.olts.map((o) => ({ color: LINE.olt, node: <OltChip o={o} /> })),
    ...s.resellers.map((r) => ({ color: LINE.reseller, node: <ResellerChip r={r} /> })),
  ];
  return (
    <div className="flex items-center">
      {up.length > 0 && (
        <>
          <JoinFork kids={up} />
          <span className="h-0.5 w-7 shrink-0" style={{ background: up[0].color }} />
        </>
      )}
      <SwitchCard s={s} />
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

function LooseGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3">
      <p className="mb-2 text-xs text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SitePanel({ site }: { site: CoreSite }) {
  const upstreamCount =
    site.switches.reduce((n, s) => n + s.upstreams.length, 0) + site.looseUpstreams.length;
  const oltCount = site.switches.reduce((n, s) => n + s.olts.length, 0) + site.looseOlts.length;
  const resellerCount = site.switches.reduce((n, s) => n + s.resellers.length, 0);
  const empty =
    site.switches.length === 0 && site.looseUpstreams.length === 0 && site.looseOlts.length === 0;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
        style={{ background: NAVY }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: statusColor(site.status) }}
          />
          <Link href={`/sites/${site.id}`} className="text-sm font-semibold hover:underline">
            {site.name}
          </Link>
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

      <div className="space-y-4 overflow-x-auto p-5">
        {site.address && <p className="text-xs text-gray-500">{site.address}</p>}

        {site.switches.map((s) => (
          <SwitchRow key={s.id} s={s} />
        ))}

        {site.looseUpstreams.length > 0 && (
          <LooseGroup title="Upstream links that end here but are not on a switch port yet">
            {site.looseUpstreams.map((u) => (
              <UpstreamChip key={u.id} u={u} />
            ))}
          </LooseGroup>
        )}

        {site.looseOlts.length > 0 && (
          <LooseGroup title="OLTs placed here with no uplink recorded">
            {site.looseOlts.map((o) => (
              <Link
                key={o.id}
                href={`/olts/${o.id}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 hover:border-gray-400"
              >
                {o.name}
              </Link>
            ))}
          </LooseGroup>
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

export default function CoreNetwork({ core }: { core: CoreData }) {
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

      {core.sites.map((s) => (
        <SitePanel key={s.id} site={s} />
      ))}

      {(core.unplacedSwitches.length > 0 || core.unplacedUpstreams.length > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Not placed at a site yet</h2>
          <p className="mt-0.5 text-xs text-amber-800/80">
            Place these from a site page so they show under the right location.
          </p>
          <div className="mt-3 space-y-4 overflow-x-auto">
            {core.unplacedSwitches.map((s) => (
              <SwitchRow key={s.id} s={s} />
            ))}
            {core.unplacedUpstreams.length > 0 && (
              <LooseGroup title="Upstream links with no site and no switch port">
                {core.unplacedUpstreams.map((u) => (
                  <UpstreamChip key={u.id} u={u} />
                ))}
              </LooseGroup>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
