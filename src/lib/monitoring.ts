export const stateLabel: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  los: "Signal lost (LOS)",
  dying_gasp: "Power cut (dying gasp)",
  power_off: "Powered off",
  unknown: "Unknown",
};
export const stateColor: Record<string, string> = {
  online: "#16a34a",
  offline: "#9ca3af",
  los: "#dc2626",
  dying_gasp: "#f59e0b",
  power_off: "#6b7280",
  unknown: "#cbd5e1",
};
export const isAlarm = (s: string) => s === "los" || s === "dying_gasp" || s === "power_off";

export type PowerLevel = "none" | "strong" | "good" | "weak" | "bad";

// Power received at the ONU: -8 to -25 dBm is healthy, below -27 is very weak.
export function powerLevel(dbm: number | null | undefined): PowerLevel {
  if (dbm === null || dbm === undefined) return "none";
  if (dbm > -8) return "strong";
  if (dbm >= -25) return "good";
  if (dbm >= -27) return "weak";
  return "bad";
}
export const powerColor: Record<PowerLevel, string> = {
  none: "#cbd5e1",
  strong: "#2563eb",
  good: "#16a34a",
  weak: "#f59e0b",
  bad: "#dc2626",
};
export const powerWord: Record<PowerLevel, string> = {
  none: "No reading",
  strong: "Too strong",
  good: "Good",
  weak: "Weak",
  bad: "Very weak",
};
// bar from -35 dBm (empty) to -5 dBm (full)
export function powerPct(dbm: number | null | undefined) {
  if (dbm === null || dbm === undefined) return 0;
  return Math.max(0, Math.min(100, ((dbm + 35) / 30) * 100));
}

export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export type Health = "online" | "offline" | "stale" | "paused" | "none";
export function oltHealth(
  conn: { enabled: boolean; poll_interval_seconds: number } | null | undefined,
  st: { reachable: boolean; last_success_at: string | null } | null | undefined,
  now: number
): Health {
  if (!conn) return "none";
  if (!conn.enabled) return "paused";
  if (!st) return "stale";
  if (!st.reachable) return "offline";
  if (!st.last_success_at) return "stale";
  const limit = Math.max(conn.poll_interval_seconds * 3, 90) * 1000;
  return now - new Date(st.last_success_at).getTime() > limit ? "stale" : "online";
}
export const healthLabel: Record<Health, string> = {
  online: "Online",
  offline: "Offline",
  stale: "No fresh data",
  paused: "Paused",
  none: "Not connected",
};
export const healthColor: Record<Health, string> = {
  online: "#16a34a",
  offline: "#dc2626",
  stale: "#f59e0b",
  paused: "#9ca3af",
  none: "#cbd5e1",
};

export const eventLabel: Record<string, string> = {
  new_onu: "New ONU",
  online: "ONU online",
  offline: "ONU offline",
  los: "Signal lost",
  power_low: "Weak signal",
  power_ok: "Signal recovered",
  olt_unreachable: "OLT not reachable",
  olt_reachable: "OLT reachable again",
};
export const severityColor: Record<string, string> = {
  info: "#64748b",
  warning: "#f59e0b",
  critical: "#dc2626",
};
export const driverLabel: Record<string, string> = {
  simulator: "Simulator (not real data)",
  bdcom: "BDCOM",
  vsol: "VSOL / C-Data",
  huawei: "Huawei",
  zte: "ZTE",
  airmedia: "Air Media",
  other: "Other",
};
