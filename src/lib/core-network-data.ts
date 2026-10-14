import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type CoreUpstream = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  capacityMbps: number | null;
  status: string;
  portLabel: string;
  speed: string;
};
export type CoreOlt = {
  id: string;
  name: string;
  uplinkLabel: string | null;
  portLabel: string;
  speed: string;
  sfp: string | null;
};
export type CoreReseller = {
  id: string;
  name: string;
  status: string;
  bandwidthMbps: number | null;
  portLabel: string;
  speed: string;
  sfp: string | null;
  vlan: number | null;
};
export type CoreSwitch = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  role: string;
  status: string;
  portsTotal: number;
  portsUsed: number;
  upstreams: CoreUpstream[];
  olts: CoreOlt[];
  resellers: CoreReseller[];
};
export type LooseUpstream = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  capacityMbps: number | null;
  status: string;
};
export type CoreSite = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  status: string;
  switches: CoreSwitch[];
  looseUpstreams: LooseUpstream[];
  looseOlts: { id: string; name: string }[];
};
export type CoreData = {
  sites: CoreSite[];
  unplacedSwitches: CoreSwitch[];
  unplacedUpstreams: LooseUpstream[];
};

type SiteRow = {
  id: string;
  name: string;
  site_type: string;
  address: string | null;
  status: string;
};
type UpstreamRow = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  capacity_mbps: number | null;
  site_id: string | null;
  status: string;
};
type SwitchRow = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  role: string;
  status: string;
  site_id: string | null;
};
type PortRow = {
  id: string;
  switch_id: string;
  port_number: number;
  label: string | null;
  speed: string;
  status: string;
  upstream_id: string | null;
  reseller_id: string | null;
  sfp_module: string | null;
  vlan: number | null;
};
type ResellerRow = {
  id: string;
  name: string;
  status: string;
  bandwidth_mbps: number | null;
};
type UplinkRow = {
  id: string;
  olt_id: string;
  label: string | null;
  speed: string;
  sfp_module: string | null;
  switch_port_id: string | null;
};
type OltRow = { id: string; name: string; site_id: string | null };

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await build(from, from + size - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

const roleOrder: Record<string, number> = { core: 0, aggregation: 1, access: 2, other: 3 };

export async function loadCoreNetwork(supabase: Supa): Promise<CoreData> {
  const [siteRows, upstreamRows, switchRows, portRows, resellerRows, uplinkRows, oltRows] =
    await Promise.all([
      fetchAll<SiteRow>((a, b) =>
        supabase
          .from("sites")
          .select("id, name, site_type, address, status")
          .order("id")
          .range(a, b)
      ),
      fetchAll<UpstreamRow>((a, b) =>
        supabase
          .from("upstream_providers")
          .select("id, name, kind, service, capacity_mbps, site_id, status")
          .order("id")
          .range(a, b)
      ),
      fetchAll<SwitchRow>((a, b) =>
        supabase
          .from("network_switches")
          .select("id, name, vendor, model, role, status, site_id")
          .order("id")
          .range(a, b)
      ),
      fetchAll<PortRow>((a, b) =>
        supabase
          .from("switch_ports")
          .select(
            "id, switch_id, port_number, label, speed, status, upstream_id, reseller_id, sfp_module, vlan"
          )
          .order("id")
          .range(a, b)
      ),
      fetchAll<ResellerRow>((a, b) =>
        supabase
          .from("resellers")
          .select("id, name, status, bandwidth_mbps")
          .order("id")
          .range(a, b)
      ),
      fetchAll<UplinkRow>((a, b) =>
        supabase
          .from("olt_uplinks")
          .select("id, olt_id, label, speed, sfp_module, switch_port_id")
          .order("id")
          .range(a, b)
      ),
      fetchAll<OltRow>((a, b) =>
        supabase.from("olts").select("id, name, site_id").order("id").range(a, b)
      ),
    ]);

  const portLabel = (p: PortRow) => p.label || `Port ${p.port_number}`;
  const upstreamById = new Map(upstreamRows.map((u) => [u.id, u]));
  const resellerById = new Map(resellerRows.map((r) => [r.id, r]));
  const oltById = new Map(oltRows.map((o) => [o.id, o]));
  const portById = new Map(portRows.map((p) => [p.id, p]));

  const portsBySwitch = new Map<string, PortRow[]>();
  for (const p of portRows) {
    const list = portsBySwitch.get(p.switch_id) ?? [];
    list.push(p);
    portsBySwitch.set(p.switch_id, list);
  }

  const switchNodes = new Map<string, CoreSwitch>();
  for (const s of switchRows) {
    const ports = portsBySwitch.get(s.id) ?? [];
    switchNodes.set(s.id, {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      model: s.model,
      role: s.role,
      status: s.status,
      portsTotal: ports.length,
      portsUsed: ports.filter((p) => p.status === "active").length,
      upstreams: [],
      olts: [],
      resellers: [],
    });
  }

  const attachedUpstreams = new Set<string>();
  for (const p of portRows) {
    const node = switchNodes.get(p.switch_id);
    if (!node) continue;
    if (p.upstream_id) {
      const u = upstreamById.get(p.upstream_id);
      if (u) {
        attachedUpstreams.add(u.id);
        node.upstreams.push({
          id: u.id,
          name: u.name,
          kind: u.kind,
          service: u.service,
          capacityMbps: u.capacity_mbps,
          status: u.status,
          portLabel: portLabel(p),
          speed: p.speed,
        });
      }
    }
    if (p.reseller_id) {
      const r = resellerById.get(p.reseller_id);
      if (r) {
        node.resellers.push({
          id: r.id,
          name: r.name,
          status: r.status,
          bandwidthMbps: p.vlan !== null || r.bandwidth_mbps !== null ? r.bandwidth_mbps : null,
          portLabel: portLabel(p),
          speed: p.speed,
          sfp: p.sfp_module,
          vlan: p.vlan,
        });
      }
    }
  }

  const oltsWithUplink = new Set<string>();
  for (const u of uplinkRows) {
    if (!u.switch_port_id) continue;
    const port = portById.get(u.switch_port_id);
    const olt = oltById.get(u.olt_id);
    if (!port || !olt) continue;
    const node = switchNodes.get(port.switch_id);
    if (!node) continue;
    oltsWithUplink.add(olt.id);
    node.olts.push({
      id: olt.id,
      name: olt.name,
      uplinkLabel: u.label,
      portLabel: portLabel(port),
      speed: u.speed,
      sfp: u.sfp_module,
    });
  }

  const byRole = (a: CoreSwitch, b: CoreSwitch) =>
    (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name);

  const loose = (u: UpstreamRow): LooseUpstream => ({
    id: u.id,
    name: u.name,
    kind: u.kind,
    service: u.service,
    capacityMbps: u.capacity_mbps,
    status: u.status,
  });

  const siteIds = new Set(siteRows.map((s) => s.id));

  const sites: CoreSite[] = [...siteRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      type: s.site_type,
      address: s.address,
      status: s.status,
      switches: switchRows
        .filter((sw) => sw.site_id === s.id)
        .map((sw) => switchNodes.get(sw.id))
        .filter((n): n is CoreSwitch => !!n)
        .sort(byRole),
      looseUpstreams: upstreamRows
        .filter((u) => u.site_id === s.id && !attachedUpstreams.has(u.id))
        .map(loose),
      looseOlts: oltRows
        .filter((o) => o.site_id === s.id && !oltsWithUplink.has(o.id))
        .map((o) => ({ id: o.id, name: o.name })),
    }));

  const unplacedSwitches = switchRows
    .filter((sw) => !sw.site_id || !siteIds.has(sw.site_id))
    .map((sw) => switchNodes.get(sw.id))
    .filter((n): n is CoreSwitch => !!n)
    .sort(byRole);

  const unplacedUpstreams = upstreamRows
    .filter((u) => (!u.site_id || !siteIds.has(u.site_id)) && !attachedUpstreams.has(u.id))
    .map(loose);

  return { sites, unplacedSwitches, unplacedUpstreams };
}
