"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  driverLabel,
  healthColor,
  healthLabel,
  isAlarm,
  oltHealth,
  powerColor,
  powerLevel,
  powerPct,
  powerWord,
  stateColor,
  stateLabel,
  timeAgo,
} from "@/lib/monitoring";

type Onu = {
  id: string;
  pon_port: string;
  onu_no: number | null;
  ident: string;
  name: string | null;
  model: string | null;
  status: string;
  rx_power_dbm: number | null;
  olt_rx_power_dbm: number | null;
  distance_m: number | null;
  offline_reason: string | null;
  last_online_at: string | null;
  last_offline_at: string | null;
  customers: { id: string; name: string } | null;
};
type Conn = { driver: string; host: string; enabled: boolean; poll_interval_seconds: number };
type Status = {
  reachable: boolean;
  last_poll_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  response_ms: number | null;
  uptime_seconds: number | null;
  cpu_percent: number | string | null;
  temperature_c: number | string | null;
};
type Cmd = {
  id: string;
  kind: string;
  status: string;
  requested_at: string;
  result: string | null;
  olt_onus: { name: string | null; ident: string } | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const sel = "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm";

export default function OltOnuMonitor({ oltId }: { oltId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [conn, setConn] = useState<Conn | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [cmds, setCmds] = useState<Cmd[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [pon, setPon] = useState("all");
  const [powerFilter, setPowerFilter] = useState("all");
  const [sort, setSort] = useState("port");
  const [limit, setLimit] = useState(100);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [c, s, m] = await Promise.all([
      supabase.from("olt_connections").select("driver, host, enabled, poll_interval_seconds").eq("olt_id", oltId).maybeSingle(),
      supabase.from("olt_status").select("*").eq("olt_id", oltId).maybeSingle(),
      supabase
        .from("olt_commands")
        .select("id, kind, status, requested_at, result, olt_onus(name, ident)")
        .eq("olt_id", oltId)
        .order("requested_at", { ascending: false })
        .limit(5),
    ]);
    setConn((c.data as Conn | null) ?? null);
    setStatus((s.data as Status | null) ?? null);
    setCmds((m.data ?? []) as unknown as Cmd[]);

    const all: Onu[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("olt_onus")
        .select(
          "id, pon_port, onu_no, ident, name, model, status, rx_power_dbm, olt_rx_power_dbm, distance_m, offline_reason, last_online_at, last_offline_at, customers(id, name)"
        )
        .eq("olt_id", oltId)
        .order("id")
        .range(from, from + 999);
      const rows = (data ?? []) as unknown as Onu[];
      all.push(
        ...rows.map((r) => ({
          ...r,
          rx_power_dbm: num(r.rx_power_dbm),
          olt_rx_power_dbm: num(r.olt_rx_power_dbm),
        }))
      );
      if (rows.length < 1000) break;
    }
    setOnus(all);
    setLoaded(true);
  }, [supabase, oltId]);

  useEffect(() => {
    load();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 1500);
    };
    const channel = supabase
      .channel(`olt-monitor-${oltId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "olt_onus", filter: `olt_id=eq.${oltId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "olt_status", filter: `olt_id=eq.${oltId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "olt_commands", filter: `olt_id=eq.${oltId}` }, schedule)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [load, supabase, oltId]);

  const ports = useMemo(
    () => Array.from(new Set(onus.map((o) => o.pon_port))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [onus]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = onus.filter((o) => {
      if (stateFilter === "online" && o.status !== "online") return false;
      if (stateFilter === "offline" && o.status === "online") return false;
      if (stateFilter === "alarm" && !isAlarm(o.status)) return false;
      if (pon !== "all" && o.pon_port !== pon) return false;
      const lv = powerLevel(o.rx_power_dbm);
      if (powerFilter === "weak" && lv !== "weak" && lv !== "bad") return false;
      if (powerFilter === "bad" && lv !== "bad") return false;
      if (powerFilter === "strong" && lv !== "strong") return false;
      if (term) {
        const hay = `${o.ident} ${o.name ?? ""} ${o.customers?.name ?? ""} ${o.pon_port}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "power") {
        const x = a.rx_power_dbm ?? 99;
        const y = b.rx_power_dbm ?? 99;
        return x - y;
      }
      const p = a.pon_port.localeCompare(b.pon_port, undefined, { numeric: true });
      return p !== 0 ? p : (a.onu_no ?? 0) - (b.onu_no ?? 0);
    });
    return list;
  }, [onus, q, stateFilter, pon, powerFilter, sort]);

  const total = onus.length;
  const online = onus.filter((o) => o.status === "online").length;
  const alarm = onus.filter((o) => isAlarm(o.status)).length;
  const weak = onus.filter((o) => ["weak", "bad"].includes(powerLevel(o.rx_power_dbm))).length;
  const health = oltHealth(conn, status, now);

  async function send(kind: string, onu?: Onu) {
    setError(null);
    setNotice(null);
    const { error: err } = await supabase
      .from("olt_commands")
      .insert({ olt_id: oltId, onu_id: onu?.id ?? null, kind });
    if (err) setError(err.message);
    else setNotice(kind === "refresh" ? "Refresh requested." : "Command sent to the collector.");
  }

  async function reboot(o: Onu) {
    if (!confirm(`Reboot ${o.name || o.ident}? The customer's internet drops for about a minute.`)) return;
    await send("reboot_onu", o);
  }

  if (!loaded) return <p className="text-sm text-gray-400">Loading...</p>;

  if (!conn) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        This OLT is not connected for monitoring yet. Fill in the connection above and save.
      </p>
    );
  }

  const chips = [
    { label: "ONUs", value: total, color: "#111827" },
    { label: "Online", value: online, color: "#16a34a" },
    { label: "Offline", value: total - online, color: "#6b7280" },
    { label: "Alarm", value: alarm, color: alarm > 0 ? "#dc2626" : "#6b7280" },
    { label: "Weak signal", value: weak, color: weak > 0 ? "#b45309" : "#6b7280" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: healthColor[health] }} />
          {healthLabel[health]}
        </span>
        <span className="text-xs text-gray-500">
          Updated {timeAgo(status?.last_success_at, now)}
          {status?.response_ms != null ? `, answers in ${status.response_ms} ms` : ""}
          {status?.temperature_c != null ? `, ${num(status.temperature_c)} °C` : ""}
          {status?.cpu_percent != null ? `, CPU ${num(status.cpu_percent)}%` : ""}
        </span>
        {conn.driver === "simulator" && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {driverLabel.simulator}
          </span>
        )}
        <button
          type="button"
          onClick={() => send("refresh")}
          className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
        >
          Refresh now
        </button>
      </div>
      {health === "offline" && status?.last_error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{status.last_error}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {chips.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-xl font-semibold tabular-nums" style={{ color: c.color }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search serial, MAC, name or customer"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm sm:w-72"
        />
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className={sel}>
          <option value="all">All states</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="alarm">Alarm</option>
        </select>
        <select value={pon} onChange={(e) => setPon(e.target.value)} className={sel}>
          <option value="all">All PON ports</option>
          {ports.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={powerFilter} onChange={(e) => setPowerFilter(e.target.value)} className={sel}>
          <option value="all">Any power</option>
          <option value="weak">Weak or worse</option>
          <option value="bad">Very weak</option>
          <option value="strong">Too strong</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}>
          <option value="port">Sort by port</option>
          <option value="power">Weakest power first</option>
        </select>
        <span className="text-xs text-gray-500">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Port</th>
              <th className="px-4 py-3 font-medium">ONU</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">ONU receives</th>
              <th className="px-4 py-3 font-medium">OLT receives</th>
              <th className="px-4 py-3 font-medium">Distance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((o) => {
              const lv = powerLevel(o.rx_power_dbm);
              const lv2 = powerLevel(o.olt_rx_power_dbm);
              return (
                <tr key={o.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-4 py-3 tabular-nums text-gray-700">
                    {o.pon_port}
                    {o.onu_no !== null ? ` : ${o.onu_no}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-gray-900">{o.name || o.ident}</span>
                    <span className="block text-xs text-gray-500">
                      {o.name ? o.ident : ""}
                      {o.model ? ` ${o.model}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {o.customers ? (
                      <Link href={`/customers/${o.customers.id}`} className="text-blue-600 hover:underline">
                        {o.customers.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-gray-800">
                      <span className="h-2 w-2 rounded-full" style={{ background: stateColor[o.status] ?? "#cbd5e1" }} />
                      {stateLabel[o.status] ?? o.status}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {o.status === "online"
                        ? `since ${timeAgo(o.last_online_at, now)}`
                        : `${o.offline_reason ?? "No reason given"}${
                            o.last_offline_at ? `, ${timeAgo(o.last_offline_at, now)}` : ""
                          }`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {o.rx_power_dbm !== null ? (
                      <>
                        <span className="font-medium tabular-nums" style={{ color: powerColor[lv] }}>
                          {o.rx_power_dbm} dBm
                        </span>
                        <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${powerPct(o.rx_power_dbm)}%`, background: powerColor[lv] }}
                          />
                        </span>
                        <span className="text-[11px] text-gray-500">{powerWord[lv]}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {o.olt_rx_power_dbm !== null ? (
                      <span style={{ color: powerColor[lv2] }}>{o.olt_rx_power_dbm} dBm</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">
                    {o.distance_m !== null ? `${(o.distance_m / 1000).toFixed(2)} km` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => reboot(o)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Reboot
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {total === 0
                    ? "No ONU yet. The list fills in after the collector polls this OLT."
                    : "No ONU matches these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 200)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50"
        >
          Show more ({rows.length - limit} left)
        </button>
      )}

      {cmds.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Recent commands</h3>
          <ul className="space-y-1 text-sm">
            {cmds.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{c.status}</span>
                <span className="text-gray-900">{c.kind.replace("_", " ")}</span>
                {c.olt_onus && <span className="text-gray-500">{c.olt_onus.name || c.olt_onus.ident}</span>}
                {c.result && <span className="text-xs text-gray-500">{c.result}</span>}
                <span className="ml-auto text-xs text-gray-400">{timeAgo(c.requested_at, now)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
