import { db } from "./db.js";
import type { OltSnapshot, OnuSnapshot } from "./drivers/types.js";

const POWER_STEP = 0.3; // dB change that updates the ONU row
const HISTORY_STEP = 0.5; // dB change that adds a history point
const HISTORY_EVERY_MS = 15 * 60 * 1000;
const WEAK = -25;
const BAD = -27;

type Row = {
  id: string;
  ident: string;
  pon_port: string;
  onu_no: number | null;
  name: string | null;
  model: string | null;
  status: string;
  rx_power_dbm: number | null;
  olt_rx_power_dbm: number | null;
  temperature_c: number | null;
  distance_m: number | null;
  offline_reason: string | null;
  last_online_at: string | null;
  last_offline_at: string | null;
};

const lastHistory = new Map<string, number>();

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function differs(a: number | null, b: number | null | undefined, step: number) {
  const y = b ?? null;
  if (a === null && y === null) return false;
  if (a === null || y === null) return true;
  return Math.abs(a - y) >= step;
}

async function loadExisting(oltId: string): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("olt_onus")
      .select(
        "id, ident, pon_port, onu_no, name, model, status, rx_power_dbm, olt_rx_power_dbm, temperature_c, distance_m, offline_reason, last_online_at, last_offline_at"
      )
      .eq("olt_id", oltId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Row[]) {
      out.set(r.ident, {
        ...r,
        rx_power_dbm: num(r.rx_power_dbm),
        olt_rx_power_dbm: num(r.olt_rx_power_dbm),
        temperature_c: num(r.temperature_c),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function insertChunks(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function applySnapshot(oltId: string, snap: OltSnapshot) {
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  const existing = await loadExisting(oltId);
  const firstImport = existing.size === 0;

  // 1. Rows that are new or have really changed
  const upserts: Record<string, unknown>[] = [];
  for (const n of snap.onus) {
    const prev = existing.get(n.id);
    const changed =
      !prev ||
      prev.status !== n.status ||
      prev.pon_port !== n.ponPort ||
      prev.onu_no !== (n.onuNo ?? null) ||
      (prev.name ?? null) !== (n.name ?? null) ||
      (prev.model ?? null) !== (n.model ?? null) ||
      (prev.offline_reason ?? null) !== (n.offlineReason ?? null) ||
      (prev.distance_m ?? null) !== (n.distanceM ?? null) ||
      differs(prev.rx_power_dbm, n.rxPowerDbm, POWER_STEP) ||
      differs(prev.olt_rx_power_dbm, n.oltRxPowerDbm, POWER_STEP);
    if (!changed) continue;

    const wasOnline = prev?.status === "online";
    const isOnline = n.status === "online";
    upserts.push({
      olt_id: oltId,
      ident: n.id,
      pon_port: n.ponPort,
      onu_no: n.onuNo ?? null,
      name: n.name ?? null,
      model: n.model ?? null,
      status: n.status,
      rx_power_dbm: n.rxPowerDbm ?? null,
      olt_rx_power_dbm: n.oltRxPowerDbm ?? null,
      temperature_c: n.temperatureC ?? null,
      distance_m: n.distanceM ?? null,
      offline_reason: n.offlineReason ?? null,
      last_online_at: isOnline && !wasOnline ? nowIso : prev?.last_online_at ?? null,
      last_offline_at: prev && wasOnline && !isOnline ? nowIso : prev?.last_offline_at ?? null,
    });
  }

  const idByIdent = new Map<string, string>();
  existing.forEach((r, k) => idByIdent.set(k, r.id));
  for (let i = 0; i < upserts.length; i += 500) {
    const { data, error } = await db
      .from("olt_onus")
      .upsert(upserts.slice(i, i + 500), { onConflict: "olt_id,ident" })
      .select("id, ident");
    if (error) throw new Error(`olt_onus: ${error.message}`);
    for (const r of (data ?? []) as { id: string; ident: string }[]) idByIdent.set(r.ident, r.id);
  }

  // 2. History points and events
  const history: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const label = (n: OnuSnapshot) => n.name || n.id;

  for (const n of snap.onus) {
    const id = idByIdent.get(n.id);
    if (!id) continue;
    const prev = existing.get(n.id);
    const statusChanged = !prev || prev.status !== n.status;
    const moved =
      prev &&
      n.rxPowerDbm != null &&
      prev.rx_power_dbm != null &&
      Math.abs(prev.rx_power_dbm - n.rxPowerDbm) >= HISTORY_STEP;

    if (statusChanged || moved || nowMs - (lastHistory.get(id) ?? 0) >= HISTORY_EVERY_MS) {
      history.push({
        onu_id: id,
        at: nowIso,
        status: n.status,
        rx_power_dbm: n.rxPowerDbm ?? null,
        olt_rx_power_dbm: n.oltRxPowerDbm ?? null,
      });
      lastHistory.set(id, nowMs);
    }

    if (!prev) {
      if (!firstImport) {
        events.push({ olt_id: oltId, onu_id: id, kind: "new_onu", severity: "info", detail: `${label(n)} appeared on ${n.ponPort}` });
      }
    } else if (prev.status !== n.status) {
      if (n.status === "online") {
        events.push({ olt_id: oltId, onu_id: id, kind: "online", severity: "info", detail: label(n) });
      } else {
        events.push({
          olt_id: oltId,
          onu_id: id,
          kind: n.status === "los" ? "los" : "offline",
          severity: n.status === "los" ? "critical" : "warning",
          detail: `${label(n)}${n.offlineReason ? `: ${n.offlineReason}` : ""}`,
        });
      }
    }

    if (prev && n.status === "online" && n.rxPowerDbm != null) {
      const before = prev.rx_power_dbm;
      if (n.rxPowerDbm < BAD && (before === null || before >= BAD)) {
        events.push({ olt_id: oltId, onu_id: id, kind: "power_low", severity: "warning", detail: `${label(n)} receives ${n.rxPowerDbm} dBm` });
      } else if (n.rxPowerDbm >= WEAK && before !== null && before < WEAK) {
        events.push({ olt_id: oltId, onu_id: id, kind: "power_ok", severity: "info", detail: `${label(n)} is back to ${n.rxPowerDbm} dBm` });
      }
    }
  }

  await insertChunks("onu_power_history", history);
  await insertChunks("onu_events", events);

  return { onus: snap.onus.length, changed: upserts.length, events: events.length };
}
