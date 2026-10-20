import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type FiberRef = { cable: string; coreNo: number | null; color: string | null };
export type LinkEnd = {
  portId: string;
  switchId: string;
  switchName: string;
  portLabel: string;
  speed: string;
  media: string;
  sfp: string | null;
  vlan: number | null;
  bandwidthMbps: number | null;
  linkType: string | null;
  linkLengthM: number | null;
  fiber: FiberRef | null;
};
export type CoreUpstream = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  circuitId: string | null;
  capacityMbps: number | null;
  status: string;
  siteName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  via: LinkEnd | null;
};
export type CoreOlt = {
  id: string;
  name: string;
  uplinkLabel: string | null;
  portLabel: string;
  speed: string;
  media: string;
  role: string;
  sfp: string | null;
  linkType: string | null;
  linkLengthM: number | null;
  fiber: FiberRef | null;
  farFiber: FiberRef | null;
};
export type CoreReseller = {
  id: string;
  portId: string;
  name: string;
  status: string;
  bandwidthMbps: number | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  via: LinkEnd;
};
export type CorePort = {
  id: string;
  number: number;
  label: string;
  speed: string;
  media: string;
  status: string;
  sfp: string | null;
  vlan: number | null;
  bandwidthMbps: number | null;
  description: string | null;
  connection: {
    kind: "upstream" | "reseller" | "olt" | "fiber";
    id: string | null;
    name: string;
  } | null;
};
export type CoreSwitch = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  ip: string | null;
  role: string;
  status: string;
  siteName: string | null;
  portsTotal: number;
  portsUsed: number;
  upstreams: CoreUpstream[];
  olts: CoreOlt[];
  resellers: CoreReseller[];
  ports: CorePort[];
};
export type CoreSite = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  status: string;
  switches: CoreSwitch[];
  looseUpstreams: CoreUpstream[];
  looseOlts: { id: string; name: string }[];
};
export type CoreData = {
  sites: CoreSite[];
  unplacedSwitches: CoreSwitch[];
  unplacedUpstreams: CoreUpstream[];
};

type SiteRow = {
  id: string;
  name: string;
  site_type: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  status: string;
};
type UpstreamRow = {
  id: string;
  name: string;
  kind: string;
  service: string | null;
  circuit_id: string | null;
  capacity_mbps: number | null;
  site_id: string | null;
  status: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
};
type SwitchRow = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  management_ip: string | null;
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
  media: string;
  status: string;
  upstream_id: string | null;
  reseller_id: string | null;
  sfp_module: string | null;
  vlan: number | null;
  bandwidth_mbps: number | null;
  link_type: string | null;
  link_length_m: number | string | null;
  description: string | null;
  fiber_cables: { name: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
};
type ResellerRow = {
  id: string;
  name: string;
  status: string;
  bandwidth_mbps: number | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};
type UplinkRow = {
  id: string;
  olt_id: string;
  label: string | null;
  speed: string;
  media: string;
  role: string;
  sfp_module: string | null;
  switch_port_id: string | null;
  link_type: string | null;
  link_length_m: number | string | null;
  fiber_cables: { name: string } | null;
  fiber_cores: { core_number: number; color: string } | null;
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
          .select("id, name, site_type, address, contact_person, phone, status")
          .order("id")
          .range(a, b)
      ),
      fetchAll<UpstreamRow>((a, b) =>
        supabase
          .from("upstream_providers")
          .select(
            "id, name, kind, service, circuit_id, capacity_mbps, site_id, status, contact_person, phone, email"
          )
          .order("id")
          .range(a, b)
      ),
      fetchAll<SwitchRow>((a, b) =>
        supabase
          .from("network_switches")
          .select("id, name, vendor, model, management_ip, role, status, site_id")
          .order("id")
          .range(a, b)
      ),
      fetchAll<PortRow>((a, b) =>
        supabase
          .from("switch_ports")
          .select(
            "id, switch_id, port_number, label, speed, media, status, upstream_id, reseller_id, sfp_module, vlan, bandwidth_mbps, link_type, link_length_m, description, fiber_cables(name), fiber_cores(core_number, color)"
          )
          .order("id")
          .range(a, b)
      ),
      fetchAll<ResellerRow>((a, b) =>
        supabase
          .from("resellers")
          .select("id, name, status, bandwidth_mbps, contact_person, phone, email, address")
          .order("id")
          .range(a, b)
      ),
      fetchAll<UplinkRow>((a, b) =>
        supabase
          .from("olt_uplinks")
          .select("id, olt_id, label, speed, media, role, sfp_module, switch_port_id, link_type, link_length_m, fiber_cables(name), fiber_cores(core_number, color)")
          .order("id")
          .range(a, b)
      ),
      fetchAll<OltRow>((a, b) =>
        supabase.from("olts").select("id, name, site_id").order("id").range(a, b)
      ),
    ]);

  const siteById = new Map(siteRows.map((s) => [s.id, s]));
  const switchRowById = new Map(switchRows.map((s) => [s.id, s]));
  const upstreamById = new Map(upstreamRows.map((u) => [u.id, u]));
  const resellerById = new Map(resellerRows.map((r) => [r.id, r]));
  const oltById = new Map(oltRows.map((o) => [o.id, o]));
  const portById = new Map(portRows.map((p) => [p.id, p]));

  const portLabel = (p: PortRow) => p.label || `Port ${p.port_number}`;
  const siteName = (id: string | null) => (id ? siteById.get(id)?.name ?? null : null);

  const fiberOf = (
    cable: string | null | undefined,
    core: { core_number: number; color: string } | null | undefined
  ): FiberRef | null =>
    cable
      ? { cable, coreNo: core ? core.core_number : null, color: core ? core.color : null }
      : null;

  const linkEnd = (p: PortRow): LinkEnd => ({
    portId: p.id,
    switchId: p.switch_id,
    switchName: switchRowById.get(p.switch_id)?.name ?? "Switch",
    portLabel: portLabel(p),
    speed: p.speed,
    media: p.media,
    sfp: p.sfp_module,
    vlan: p.vlan,
    bandwidthMbps: p.bandwidth_mbps,
    linkType: p.link_type,
    linkLengthM: p.link_length_m === null ? null : Number(p.link_length_m),
    fiber: fiberOf(p.fiber_cables?.name, p.fiber_cores),
  });

  const upstreamNode = (u: UpstreamRow, via: LinkEnd | null): CoreUpstream => ({
    id: u.id,
    name: u.name,
    kind: u.kind,
    service: u.service,
    circuitId: u.circuit_id,
    capacityMbps: u.capacity_mbps,
    status: u.status,
    siteName: siteName(u.site_id),
    contactPerson: u.contact_person,
    phone: u.phone,
    email: u.email,
    via,
  });

  const uplinkByPort = new Map<string, { olt: OltRow; uplink: UplinkRow }>();
  for (const u of uplinkRows) {
    if (!u.switch_port_id) continue;
    const olt = oltById.get(u.olt_id);
    if (olt) uplinkByPort.set(u.switch_port_id, { olt, uplink: u });
  }

  const portsBySwitch = new Map<string, PortRow[]>();
  for (const p of portRows) {
    const list = portsBySwitch.get(p.switch_id) ?? [];
    list.push(p);
    portsBySwitch.set(p.switch_id, list);
  }

  const switchNodes = new Map<string, CoreSwitch>();
  for (const s of switchRows) {
    const ports = [...(portsBySwitch.get(s.id) ?? [])].sort(
      (a, b) => a.port_number - b.port_number
    );
    switchNodes.set(s.id, {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      model: s.model,
      ip: s.management_ip,
      role: s.role,
      status: s.status,
      siteName: siteName(s.site_id),
      portsTotal: ports.length,
      portsUsed: ports.filter((p) => p.status === "active").length,
      upstreams: [],
      olts: [],
      resellers: [],
      ports: ports.map((p): CorePort => {
        let connection: CorePort["connection"] = null;
        if (p.upstream_id) {
          const u = upstreamById.get(p.upstream_id);
          if (u) connection = { kind: "upstream", id: u.id, name: u.name };
        } else if (p.reseller_id) {
          const r = resellerById.get(p.reseller_id);
          if (r) connection = { kind: "reseller", id: r.id, name: r.name };
        } else {
          const up = uplinkByPort.get(p.id);
          if (up) connection = { kind: "olt", id: up.olt.id, name: up.olt.name };
          else if (p.fiber_cables) {
            connection = { kind: "fiber", id: null, name: p.fiber_cables.name };
          }
        }
        return {
          id: p.id,
          number: p.port_number,
          label: portLabel(p),
          speed: p.speed,
          media: p.media,
          status: p.status,
          sfp: p.sfp_module,
          vlan: p.vlan,
          bandwidthMbps: p.bandwidth_mbps,
          description: p.description,
          connection,
        };
      }),
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
        node.upstreams.push(upstreamNode(u, linkEnd(p)));
      }
    }
    if (p.reseller_id) {
      const r = resellerById.get(p.reseller_id);
      if (r) {
        node.resellers.push({
          id: r.id,
          portId: p.id,
          name: r.name,
          status: r.status,
          bandwidthMbps: r.bandwidth_mbps,
          contactPerson: r.contact_person,
          phone: r.phone,
          email: r.email,
          address: r.address,
          via: linkEnd(p),
        });
      }
    }
  }

  const oltsWithUplink = new Set<string>();
  for (const [portId, entry] of uplinkByPort) {
    const port = portById.get(portId);
    const node = port ? switchNodes.get(port.switch_id) : undefined;
    if (!port || !node) continue;
    oltsWithUplink.add(entry.olt.id);
    node.olts.push({
      id: entry.olt.id,
      name: entry.olt.name,
      uplinkLabel: entry.uplink.label,
      portLabel: portLabel(port),
      speed: entry.uplink.speed,
      media: entry.uplink.media,
      role: entry.uplink.role,
      sfp: entry.uplink.sfp_module,
      linkType: entry.uplink.link_type,
      linkLengthM:
        entry.uplink.link_length_m === null ? null : Number(entry.uplink.link_length_m),
      fiber: fiberOf(entry.uplink.fiber_cables?.name, entry.uplink.fiber_cores),
      farFiber: fiberOf(port.fiber_cables?.name, port.fiber_cores),
    });
  }

  const byRole = (a: CoreSwitch, b: CoreSwitch) =>
    (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name);

  const siteIds = new Set(siteRows.map((s) => s.id));

  const sites: CoreSite[] = [...siteRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      type: s.site_type,
      address: s.address,
      contactPerson: s.contact_person,
      phone: s.phone,
      status: s.status,
      switches: switchRows
        .filter((sw) => sw.site_id === s.id)
        .map((sw) => switchNodes.get(sw.id))
        .filter((n): n is CoreSwitch => !!n)
        .sort(byRole),
      looseUpstreams: upstreamRows
        .filter((u) => u.site_id === s.id && !attachedUpstreams.has(u.id))
        .map((u) => upstreamNode(u, null)),
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
    .map((u) => upstreamNode(u, null));

  return { sites, unplacedSwitches, unplacedUpstreams };
}
