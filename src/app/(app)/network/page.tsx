import { createClient } from "@/lib/supabase/server";
import NetworkTopology from "@/components/network-topology";
import { loadCoreNetwork } from "@/lib/core-network-data";
import type {
  BoxNode,
  CableNode,
  CustomerLeaf,
  Fault,
  NetworkData,
  OltNode,
  OltOtherPort,
  OltPortNode,
  PonLink,
  PortNode,
  PortState,
  SplitterNode,
} from "@/components/network-topology";

type OltRow = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  management_ip: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  total_pon_ports: number;
  status: string;
};
type CableRow = {
  id: string;
  name: string;
  cable_type: string;
  core_count: number;
  length_meters: number | string | null;
  olt_id: string | null;
  status: string;
};
type CoreRow = { cable_id: string; status: string };
type BoxRow = {
  id: string;
  name: string;
  box_category: string | null;
  box_type: string;
  capacity: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
};
type BoxCableRow = {
  tg_box_id: string;
  cable_id: string;
  direction: "input" | "output";
};
type SplitterRow = {
  id: string;
  name: string;
  ratio: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  tg_box_id: string | null;
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
  onu_serial_number: string | null;
  customers: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    package_name: string | null;
  } | null;
};
type FaultRow = {
  entity_type: string;
  entity_id: string;
  severity: string;
  title: string;
};
type CustomerRow = { id: string; name: string; status: string };
type OltOtherRow = {
  id: string;
  olt_id: string;
  label: string | null;
  speed: string;
  media: string;
  role: string;
  status: string;
  sfp_module: string | null;
  description: string | null;
  switch_ports: {
    port_number: number;
    label: string | null;
    network_switches: { id: string; name: string } | null;
  } | null;
};
type OltPortRow = {
  id: string;
  olt_id: string;
  port_number: number;
  label: string | null;
  description: string | null;
  status: string;
  sfp_module: string | null;
  tx_power_dbm: number | string | null;
  cable_id: string | null;
  fiber_cores: { core_number: number; color: string } | null;
};

// Supabase returns at most 1000 rows per request, so read in pages.
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

function portState(p: PortRow, hasCustomer: boolean, hasChild: boolean): PortState {
  if (p.status === "damaged") return "damaged";
  if (hasCustomer) return "customer";
  if (hasChild) return "cascade";
  if (p.status === "used") return "used";
  if (p.status === "reserved") return "reserved";
  return "free";
}

export default async function NetworkOverviewPage() {
  const supabase = await createClient();

  const [
    oltsRes,
    faultRows,
    cableRows,
    coreRows,
    boxRows,
    boxCableRows,
    splitterRows,
    portRows,
    connRows,
    customerRows,
    oltPortRows,
  ] = await Promise.all([
    supabase
      .from("olts")
      .select(
        "id, name, vendor, model, management_ip, address, latitude, longitude, total_pon_ports, status"
      )
      .order("name"),
    fetchAll<FaultRow>((a, b) =>
      supabase
        .from("faults")
        .select("entity_type, entity_id, severity, title")
        .in("status", ["open", "in_progress"])
        .order("id")
        .range(a, b)
    ),
    fetchAll<CableRow>((a, b) =>
      supabase
        .from("fiber_cables")
        .select("id, name, cable_type, core_count, length_meters, olt_id, status")
        .order("id")
        .range(a, b)
    ),
    fetchAll<CoreRow>((a, b) =>
      supabase
        .from("fiber_cores")
        .select("cable_id, status")
        .in("status", ["used", "damaged"])
        .order("id")
        .range(a, b)
    ),
    fetchAll<BoxRow>((a, b) =>
      supabase
        .from("tg_boxes")
        .select(
          "id, name, box_category, box_type, capacity, address, latitude, longitude, status"
        )
        .order("id")
        .range(a, b)
    ),
    fetchAll<BoxCableRow>((a, b) =>
      supabase
        .from("tg_box_cables")
        .select("tg_box_id, cable_id, direction")
        .order("id")
        .range(a, b)
    ),
    fetchAll<SplitterRow>((a, b) =>
      supabase
        .from("splitters")
        .select(
          "id, name, ratio, status, latitude, longitude, tg_box_id, parent_port_id"
        )
        .order("id")
        .range(a, b)
    ),
    fetchAll<PortRow>((a, b) =>
      supabase
        .from("splitter_ports")
        .select("id, splitter_id, port_number, power_percent, status")
        .order("id")
        .range(a, b)
    ),
    fetchAll<ConnRow>((a, b) =>
      supabase
        .from("customer_connections")
        .select(
          "splitter_port_id, onu_serial_number, customers(id, name, phone, email, address, latitude, longitude, status, package_name)"
        )
        .order("id")
        .range(a, b)
    ),
    fetchAll<CustomerRow>((a, b) =>
      supabase
        .from("customers")
        .select("id, name, status")
        .order("id")
        .range(a, b)
    ),
    fetchAll<OltPortRow>((a, b) =>
      supabase
        .from("olt_ports")
        .select(
          "id, olt_id, port_number, label, description, status, sfp_module, tx_power_dbm, cable_id, fiber_cores(core_number, color)"
        )
        .order("id")
        .range(a, b)
    ),
  ]);

  const oltRows = (oltsRes.data ?? []) as unknown as OltRow[];
  const core = await loadCoreNetwork(supabase);

  const otherRows = await fetchAll<OltOtherRow>((a, b) =>
    supabase
      .from("olt_uplinks")
      .select(
        "id, olt_id, label, speed, media, role, status, sfp_module, description, switch_ports(port_number, label, network_switches(id, name))"
      )
      .order("created_at")
      .order("id")
      .range(a, b)
  );
  const otherByOlt = new Map<string, OltOtherPort[]>();
  for (const r of otherRows) {
    const sp = r.switch_ports;
    const list = otherByOlt.get(r.olt_id) ?? [];
    list.push({
      id: r.id,
      label: r.label || "Port",
      speed: r.speed,
      media: r.media,
      role: r.role,
      status: r.status,
      sfp: r.sfp_module,
      description: r.description,
      switchId: sp?.network_switches?.id ?? null,
      switchName: sp?.network_switches?.name ?? null,
      switchPortLabel: sp ? sp.label || `Port ${sp.port_number}` : null,
    });
    otherByOlt.set(r.olt_id, list);
  }

  /* ---- lookups ---- */

  const faultMap = new Map<string, Fault[]>();
  for (const f of faultRows) {
    const k = `${f.entity_type}:${f.entity_id}`;
    const list = faultMap.get(k) ?? [];
    list.push({ severity: f.severity, title: f.title });
    faultMap.set(k, list);
  }
  const faultsFor = (type: string, id: string): Fault[] =>
    faultMap.get(`${type}:${id}`) ?? [];

  const coreStats = new Map<string, { used: number; damaged: number }>();
  for (const c of coreRows) {
    const s = coreStats.get(c.cable_id) ?? { used: 0, damaged: 0 };
    if (c.status === "used") s.used++;
    if (c.status === "damaged") s.damaged++;
    coreStats.set(c.cable_id, s);
  }

  const cablesById = new Map(cableRows.map((c) => [c.id, c]));
  const boxesById = new Map(boxRows.map((b) => [b.id, b]));

  const ponPortsByOlt = new Map<string, OltPortNode[]>();
  const ponByCable = new Map<string, PonLink>();
  const sortedOltPorts = [...oltPortRows].sort(
    (a, b) => a.port_number - b.port_number
  );
  for (const p of sortedOltPorts) {
    const label = p.label || `PON-${String(p.port_number).padStart(2, "0")}`;
    const core = p.fiber_cores;
    const node: OltPortNode = {
      id: p.id,
      number: p.port_number,
      label,
      description: p.description,
      status: p.status,
      sfp: p.sfp_module,
      tx: p.tx_power_dbm !== null ? Number(p.tx_power_dbm) : null,
      cableId: p.cable_id,
      coreNumber: core ? core.core_number : null,
      coreColor: core ? core.color : null,
    };
    const list = ponPortsByOlt.get(p.olt_id) ?? [];
    list.push(node);
    ponPortsByOlt.set(p.olt_id, list);
    if (p.cable_id && !ponByCable.has(p.cable_id)) {
      ponByCable.set(p.cable_id, {
        number: p.port_number,
        label,
        description: p.description,
        coreNumber: node.coreNumber,
        coreColor: node.coreColor,
      });
    }
  }

  const inLinksByCable = new Map<string, BoxCableRow[]>();
  const outLinksByBox = new Map<string, BoxCableRow[]>();
  for (const l of boxCableRows) {
    const map = l.direction === "input" ? inLinksByCable : outLinksByBox;
    const key = l.direction === "input" ? l.cable_id : l.tg_box_id;
    const list = map.get(key) ?? [];
    list.push(l);
    map.set(key, list);
  }

  const splittersByBox = new Map<string, SplitterRow[]>();
  for (const s of splitterRows) {
    if (!s.tg_box_id) continue;
    const list = splittersByBox.get(s.tg_box_id) ?? [];
    list.push(s);
    splittersByBox.set(s.tg_box_id, list);
  }

  const childByParentPort = new Map<string, SplitterRow>();
  for (const s of splitterRows) {
    if (s.parent_port_id) childByParentPort.set(s.parent_port_id, s);
  }

  const portsBySplitter = new Map<string, PortRow[]>();
  for (const p of portRows) {
    const list = portsBySplitter.get(p.splitter_id) ?? [];
    list.push(p);
    portsBySplitter.set(p.splitter_id, list);
  }
  for (const list of portsBySplitter.values()) {
    list.sort((a, b) => a.port_number - b.port_number);
  }

  const connByPort = new Map<string, CustomerLeaf>();
  for (const c of connRows) {
    if (!c.splitter_port_id || !c.customers) continue;
    const cu = c.customers;
    connByPort.set(c.splitter_port_id, {
      id: cu.id,
      name: cu.name,
      phone: cu.phone,
      email: cu.email,
      address: cu.address,
      status: cu.status,
      pkg: cu.package_name,
      onu: c.onu_serial_number,
      lat: cu.latitude,
      lng: cu.longitude,
      faults: faultsFor("customer", cu.id),
    });
  }

  /* ---- build the tree ---- */

  const placed = {
    cables: new Set<string>(),
    boxes: new Set<string>(),
    splitters: new Set<string>(),
    customers: new Set<string>(),
  };

  function buildSplitter(row: SplitterRow): SplitterNode {
    placed.splitters.add(row.id);
    const ports: PortNode[] = (portsBySplitter.get(row.id) ?? []).map((p) => {
      const customer = connByPort.get(p.id) ?? null;
      if (customer) placed.customers.add(customer.id);
      const childRow = childByParentPort.get(p.id);
      const child =
        childRow && !placed.splitters.has(childRow.id)
          ? buildSplitter(childRow)
          : null;
      return {
        id: p.id,
        number: p.port_number,
        power: p.power_percent,
        state: portState(p, !!customer, !!child),
        customer,
        child,
      };
    });
    return {
      id: row.id,
      name: row.name,
      ratio: row.ratio,
      status: row.status,
      lat: row.latitude,
      lng: row.longitude,
      faults: faultsFor("splitter", row.id),
      ports,
    };
  }

  function buildBox(row: BoxRow): BoxNode {
    placed.boxes.add(row.id);
    const splitters: SplitterNode[] = [];
    for (const s of splittersByBox.get(row.id) ?? []) {
      if (!s.parent_port_id && !placed.splitters.has(s.id)) {
        splitters.push(buildSplitter(s));
      }
    }
    const outCables: CableNode[] = [];
    for (const l of outLinksByBox.get(row.id) ?? []) {
      const c = cablesById.get(l.cable_id);
      if (c && !placed.cables.has(c.id)) outCables.push(buildCable(c));
    }
    return {
      id: row.id,
      name: row.name,
      category: row.box_category,
      mount: row.box_type,
      status: row.status,
      capacity: row.capacity,
      address: row.address,
      lat: row.latitude,
      lng: row.longitude,
      faults: faultsFor("tg_box", row.id),
      splitters,
      outCables,
    };
  }

  function buildCable(row: CableRow): CableNode {
    placed.cables.add(row.id);
    const stats = coreStats.get(row.id) ?? { used: 0, damaged: 0 };
    const boxes: BoxNode[] = [];
    for (const l of inLinksByCable.get(row.id) ?? []) {
      const b = boxesById.get(l.tg_box_id);
      if (b && !placed.boxes.has(b.id)) boxes.push(buildBox(b));
    }
    return {
      id: row.id,
      name: row.name,
      type: row.cable_type,
      coreCount: row.core_count,
      usedCores: stats.used,
      damagedCores: stats.damaged,
      lengthM: row.length_meters !== null ? Number(row.length_meters) : null,
      status: row.status,
      faults: faultsFor("fiber_cable", row.id),
      pon: ponByCable.get(row.id) ?? null,
      boxes,
    };
  }

  const olts: OltNode[] = oltRows.map((o) => {
    const cables: CableNode[] = [];
    for (const c of cableRows) {
      if (c.olt_id === o.id && !placed.cables.has(c.id)) cables.push(buildCable(c));
    }
    return {
      id: o.id,
      name: o.name,
      vendor: o.vendor,
      model: o.model,
      ip: o.management_ip,
      address: o.address,
      lat: o.latitude,
      lng: o.longitude,
      ponPorts: o.total_pon_ports,
      status: o.status,
      faults: faultsFor("olt", o.id),
      ports: ponPortsByOlt.get(o.id) ?? [],
      otherPorts: otherByOlt.get(o.id) ?? [],
      cables,
    };
  });

  /* ---- totals and unlinked records ---- */

  const ports = { used: 0, reserved: 0, damaged: 0, free: 0, total: 0 };
  for (const p of portRows) {
    const state = portState(p, connByPort.has(p.id), childByParentPort.has(p.id));
    ports.total++;
    if (state === "damaged") ports.damaged++;
    else if (state === "reserved") ports.reserved++;
    else if (state === "free") ports.free++;
    else ports.used++;
  }

  const data: NetworkData = {
    olts,
    orphans: {
      cables: cableRows
        .filter((c) => !placed.cables.has(c.id))
        .map((c) => ({ id: c.id, name: c.name })),
      boxes: boxRows
        .filter((b) => !placed.boxes.has(b.id))
        .map((b) => ({ id: b.id, name: b.name })),
      splitters: splitterRows
        .filter((s) => !placed.splitters.has(s.id))
        .map((s) => ({ id: s.id, name: s.name })),
      customers: customerRows
        .filter((c) => !placed.customers.has(c.id))
        .map((c) => ({ id: c.id, name: c.name })),
    },
    totals: {
      olts: oltRows.length,
      cables: cableRows.length,
      coresTotal: cableRows.reduce((sum, c) => sum + c.core_count, 0),
      coresUsed: coreRows.filter((c) => c.status === "used").length,
      boxes: boxRows.length,
      splitters: splitterRows.length,
      customers: customerRows.length,
      customersActive: customerRows.filter((c) => c.status === "active").length,
      openFaults: faultRows.length,
      ponPorts: {
        total: oltPortRows.length,
        connected: oltPortRows.filter((p) => p.cable_id).length,
      },
      ports,
    },
  };

  return <NetworkTopology data={data} core={core} />;
}
