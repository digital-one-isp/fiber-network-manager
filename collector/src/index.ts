import { db } from "./db.js";
import { getDriver } from "./drivers/index.js";
import type { Connection, Credentials } from "./drivers/types.js";
import { applySnapshot } from "./sync.js";

const MAX_PARALLEL = 5;
const nextRun = new Map<string, number>();
const running = new Set<string>();
let lastPrune = 0;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function loadConnections(): Promise<Connection[]> {
  const { data, error } = await db.from("olt_connections").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as Connection[];
}

async function loadConnection(oltId: string): Promise<Connection | null> {
  const { data } = await db.from("olt_connections").select("*").eq("olt_id", oltId).maybeSingle();
  return (data as Connection | null) ?? null;
}

async function getCreds(oltId: string): Promise<Credentials> {
  const { data, error } = await db.rpc("collector_get_credentials", { p_olt_id: oltId });
  if (error) throw new Error(`Could not read the login: ${error.message}`);
  const row = (data as Credentials[] | null)?.[0];
  return row ?? { username: null, password: null, snmp_community: null, enable_password: null };
}

async function pollOlt(conn: Connection) {
  const started = Date.now();
  const { data: prev } = await db
    .from("olt_status")
    .select("reachable")
    .eq("olt_id", conn.olt_id)
    .maybeSingle();
  const nowIso = () => new Date().toISOString();

  try {
    const driver = getDriver(conn.driver);
    const creds = await getCreds(conn.olt_id);
    const snap = await withTimeout(driver.poll(conn, creds), 45_000, "The OLT did not answer in time");
    const res = await applySnapshot(conn.olt_id, snap);

    await db.from("olt_status").upsert({
      olt_id: conn.olt_id,
      reachable: true,
      last_poll_at: nowIso(),
      last_success_at: nowIso(),
      last_error: null,
      response_ms: snap.responseMs,
      uptime_seconds: snap.uptimeSeconds ?? null,
      cpu_percent: snap.cpuPercent ?? null,
      temperature_c: snap.temperatureC ?? null,
      updated_at: nowIso(),
    });
    if (prev && prev.reachable === false) {
      await db.from("onu_events").insert({ olt_id: conn.olt_id, kind: "olt_reachable", severity: "info", detail: "The OLT answers again" });
    }
    log(`polled ${conn.host} (${conn.driver}): ${res.onus} ONUs, ${res.changed} changed, ${res.events} events, ${Date.now() - started} ms`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("olt_status").upsert({
      olt_id: conn.olt_id,
      reachable: false,
      last_poll_at: nowIso(),
      last_error: message,
      updated_at: nowIso(),
    });
    if (!prev || prev.reachable !== false) {
      await db.from("onu_events").insert({ olt_id: conn.olt_id, kind: "olt_unreachable", severity: "critical", detail: message });
    }
    log(`poll failed for ${conn.host}: ${message}`);
  }
}

async function processCommands() {
  const { data } = await db
    .from("olt_commands")
    .select("*")
    .eq("status", "queued")
    .order("requested_at")
    .limit(10);

  for (const cmd of (data ?? []) as {
    id: string;
    olt_id: string;
    onu_id: string | null;
    kind: string;
    params: Record<string, unknown>;
  }[]) {
    const { data: claimed } = await db
      .from("olt_commands")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", cmd.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    let ok = false;
    let message = "";
    try {
      const conn = await loadConnection(cmd.olt_id);
      if (!conn) throw new Error("This OLT has no monitoring connection");

      if (cmd.kind === "refresh") {
        nextRun.set(conn.olt_id, 0);
        ok = true;
        message = "Refresh started";
      } else {
        const driver = getDriver(conn.driver);
        if (!driver.execute) throw new Error(`The ${conn.driver} driver cannot run ${cmd.kind} yet`);
        const creds = await getCreds(conn.olt_id);
        let onu = null;
        if (cmd.onu_id) {
          const { data: o } = await db
            .from("olt_onus")
            .select("id, ident, pon_port, onu_no, name")
            .eq("id", cmd.onu_id)
            .maybeSingle();
          onu = o;
        }
        const res = await withTimeout(
          driver.execute(conn, creds, { kind: cmd.kind, params: cmd.params, onu }),
          60_000,
          "The OLT did not answer in time"
        );
        ok = res.ok;
        message = res.message;
        nextRun.set(conn.olt_id, Date.now() + 5_000);
      }
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    await db
      .from("olt_commands")
      .update({ status: ok ? "done" : "failed", finished_at: new Date().toISOString(), result: message })
      .eq("id", cmd.id);
    log(`command ${cmd.kind} ${ok ? "done" : "failed"}: ${message}`);
  }
}

async function tick() {
  try {
    const conns = await loadConnections();
    const now = Date.now();
    for (const conn of conns) {
      if (running.size >= MAX_PARALLEL) break;
      if (running.has(conn.olt_id)) continue;
      if ((nextRun.get(conn.olt_id) ?? 0) > now) continue;
      running.add(conn.olt_id);
      nextRun.set(conn.olt_id, now + conn.poll_interval_seconds * 1000);
      pollOlt(conn).finally(() => running.delete(conn.olt_id));
    }
    await processCommands();

    if (now - lastPrune > 24 * 3600 * 1000) {
      lastPrune = now;
      const { error } = await db.rpc("prune_onu_history", { p_days: 90 });
      if (error) log("prune failed:", error.message);
    }
  } catch (e) {
    log("tick failed:", e instanceof Error ? e.message : e);
  }
}

log("OLT collector started");
setInterval(tick, 3000);
tick();
