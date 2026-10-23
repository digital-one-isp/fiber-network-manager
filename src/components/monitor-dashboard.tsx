"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  driverLabel,
  eventLabel,
  healthColor,
  healthLabel,
  oltHealth,
  powerColor,
  powerLevel,
  severityColor,
  timeAgo,
} from "@/lib/monitoring";

type OltRow = { id: string; name: string; vendor: string | null; model: string | null };
type ConnRow = {
  olt_id: string;
  host: string;
  driver: string;
  enabled: boolean;
  poll_interval_seconds: number;
};
type StatusRow = {
  olt_id: string;
  reachable: boolean;
  last_poll_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  response_ms: number | null;
};
type SumRow = {
  olt_id: string;
  total: number;
  online: number;
  offline: number;
  alarm: number;
  weak: number;
  avg_rx: number | string | null;
  worst_rx: number | string | null;
};
type EventRow = {
  id: number;
  at: string;
  kind: string;
  severity: string;
  detail: string | null;
  olts: { name: string } | null;
};

export default function MonitorDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [olts, setOlts] = useState<OltRow[]>([]);
  const [conns, setConns] = useState<ConnRow[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [sums, setSums] = useState<SumRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [o, c, s, m, e] = await Promise.all([
      supabase.from("olts").select("id, name, vendor, model").order("name"),
      supabase.from("olt_connections").select("olt_id, host, driver, enabled, poll_interval_seconds"),
      supabase
        .from("olt_status")
        .select("olt_id, reachable, last_poll_at, last_success_at, last_error, response_ms"),
      supabase.from("olt_onu_summary").select("*"),
      supabase
        .from("onu_events")
        .select("id, at, kind, severity, detail, olts(name)")
        .order("at", { ascending: false })
        .limit(15),
    ]);
    setOlts((o.data ?? []) as unknown as OltRow[]);
    setConns((c.data ?? []) as unknown as ConnRow[]);
    setStatuses((s.data ?? []) as unknown as StatusRow[]);
    setSums((m.data ?? []) as unknown as SumRow[]);
    setEvents((e.data ?? []) as unknown as EventRow[]);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 1500);
    };
    const channel = supabase
      .channel("monitor-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "olt_status" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "olt_onus" }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "onu_events" }, schedule)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const connBy = new Map(conns.map((c) => [c.olt_id, c]));
  const statusBy = new Map(statuses.map((s) => [s.olt_id, s]));
  const sumBy = new Map(sums.map((s) => [s.olt_id, s]));

  let oltsOnline = 0;
  let oltsMonitored = 0;
  for (const o of olts) {
    const h = oltHealth(connBy.get(o.id), statusBy.get(o.id), now);
    if (h !== "none") oltsMonitored++;
    if (h === "online") oltsOnline++;
  }
  const total = sums.reduce((n, s) => n + s.total, 0);
  const online = sums.reduce((n, s) => n + s.online, 0);
  const offline = sums.reduce((n, s) => n + s.offline + s.alarm, 0);
  const weak = sums.reduce((n, s) => n + s.weak, 0);

  const tiles = [
    { label: "OLTs online", value: `${oltsOnline} of ${oltsMonitored}`, color: "#16a34a" },
    { label: "ONUs online", value: `${online} of ${total}`, color: "#16a34a" },
    { label: "ONUs offline", value: String(offline), color: offline > 0 ? "#dc2626" : "#9ca3af" },
    { label: "Weak signal", value: String(weak), color: weak > 0 ? "#f59e0b" : "#9ca3af" },
  ];

  if (!loaded) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: t.color }}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {olts.map((o) => {
          const c = connBy.get(o.id);
          const st = statusBy.get(o.id);
          const sm = sumBy.get(o.id);
          const h = oltHealth(c, st, now);
          const avg = sm && sm.avg_rx !== null ? Number(sm.avg_rx) : null;
          const pct = sm && sm.total > 0 ? (sm.online / sm.total) * 100 : 0;
          return (
            <Link
              key={o.id}
              href={`/monitoring/${o.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{o.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {c ? c.host : [o.vendor, o.model].filter(Boolean).join(" ") || "No connection yet"}
                  </p>
                </div>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: healthColor[h] }} />
                  {healthLabel[h]}
                </span>
              </div>

              {c?.driver === "simulator" && (
                <p className="mt-2 inline-block rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {driverLabel.simulator}
                </p>
              )}

              {!c ? (
                <p className="mt-3 text-sm text-blue-600">Set up monitoring</p>
              ) : (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <dt className="text-[11px] text-gray-500">ONUs</dt>
                      <dd className="text-sm font-semibold tabular-nums text-gray-900">{sm?.total ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Online</dt>
                      <dd className="text-sm font-semibold tabular-nums text-emerald-700">{sm?.online ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Offline</dt>
                      <dd className="text-sm font-semibold tabular-nums text-gray-700">
                        {(sm?.offline ?? 0) + (sm?.alarm ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Weak</dt>
                      <dd
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: (sm?.weak ?? 0) > 0 ? "#b45309" : "#374151" }}
                      >
                        {sm?.weak ?? 0}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Average power{" "}
                      <b style={{ color: powerColor[powerLevel(avg)] }}>
                        {avg !== null ? `${avg} dBm` : "-"}
                      </b>
                    </span>
                    <span>Updated {timeAgo(st?.last_success_at, now)}</span>
                  </p>
                  {h === "offline" && st?.last_error && (
                    <p className="mt-2 text-xs text-red-600">{st.last_error}</p>
                  )}
                </>
              )}
            </Link>
          );
        })}
        {olts.length === 0 && (
          <p className="text-sm text-gray-500">There are no OLTs yet. Add one on the OLTs page.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: severityColor[e.severity] ?? "#64748b" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-900">
                    {eventLabel[e.kind] ?? e.kind}
                    <span className="text-gray-500"> on {e.olts?.name ?? "an OLT"}</span>
                  </p>
                  {e.detail && <p className="truncate text-xs text-gray-500">{e.detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-gray-400">{timeAgo(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
