// SIMULATOR: makes up ONUs and power readings so the whole pipeline can be
// tested without a real OLT. None of this data is real.
import type {
  Command,
  CommandResult,
  Connection,
  Credentials,
  OltDriver,
  OltSnapshot,
  OnuSnapshot,
  OnuState,
} from "./types.js";

type Sim = {
  ident: string;
  pon: string;
  no: number;
  name: string;
  base: number;
  rx: number;
  distance: number;
  offlineUntil: number;
  offlineState: OnuState;
  offlineReason: string;
  disabled: boolean;
};

const worlds = new Map<string, Sim[]>();

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function world(oltId: string): Sim[] {
  let w = worlds.get(oltId);
  if (w) return w;
  const r = rng(hash(oltId));
  const short = oltId.replace(/-/g, "").slice(0, 6).toUpperCase();
  w = [];
  for (let p = 1; p <= 4; p++) {
    for (let n = 1; n <= 16; n++) {
      const base = -17 - r() * 9;
      w.push({
        ident: `SIM${short}${p}${String(n).padStart(2, "0")}`,
        pon: `0/1/${p}`,
        no: n,
        name: `Simulated ONU ${p}-${n}`,
        base,
        rx: base,
        distance: Math.round(300 + r() * 5000),
        offlineUntil: 0,
        offlineState: "offline",
        offlineReason: "",
        disabled: false,
      });
    }
  }
  worlds.set(oltId, w);
  return w;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const simulatorDriver: OltDriver = {
  name: "simulator",

  async poll(conn: Connection, _creds: Credentials): Promise<OltSnapshot> {
    const w = world(conn.olt_id);
    const now = Date.now();
    const onus: OnuSnapshot[] = w.map((s) => {
      s.rx = Math.max(s.base - 2, Math.min(s.base + 2, s.rx + (Math.random() - 0.5) * 0.6));
      if (!s.disabled && now >= s.offlineUntil && Math.random() < 0.01) {
        s.offlineUntil = now + (20 + Math.random() * 100) * 1000;
        const pick = Math.random();
        s.offlineState = pick < 0.3 ? "los" : pick < 0.5 ? "dying_gasp" : "offline";
        s.offlineReason =
          s.offlineState === "los"
            ? "Fiber cut or signal lost"
            : s.offlineState === "dying_gasp"
            ? "Customer power failure"
            : "ONU not responding";
      }
      const down = s.disabled || now < s.offlineUntil;
      return {
        id: s.ident,
        ponPort: s.pon,
        onuNo: s.no,
        name: s.name,
        model: "SIM-ONU-1G",
        status: down ? (s.disabled ? "offline" : s.offlineState) : "online",
        rxPowerDbm: down ? null : round2(s.rx),
        oltRxPowerDbm: down ? null : round2(s.rx - 1.5 + (Math.random() - 0.5) * 0.2),
        distanceM: s.distance,
        offlineReason: down ? (s.disabled ? "Disabled by an operator" : s.offlineReason) : null,
      };
    });
    return {
      responseMs: Math.round(40 + Math.random() * 60),
      uptimeSeconds: Math.round(process.uptime()),
      cpuPercent: round2(8 + Math.random() * 10),
      temperatureC: round2(38 + Math.random() * 4),
      onus,
    };
  },

  async execute(conn: Connection, _creds: Credentials, cmd: Command): Promise<CommandResult> {
    const s = cmd.onu ? world(conn.olt_id).find((x) => x.ident === cmd.onu!.ident) : undefined;
    if (!s) return { ok: false, message: "ONU not found in the simulator" };
    switch (cmd.kind) {
      case "reboot_onu":
        s.offlineUntil = Date.now() + 20_000;
        s.offlineState = "offline";
        s.offlineReason = "Rebooting";
        return { ok: true, message: "Simulated reboot, back in about 20 seconds" };
      case "disable_onu":
        s.disabled = true;
        return { ok: true, message: "Simulated: ONU disabled" };
      case "enable_onu":
        s.disabled = false;
        s.offlineUntil = 0;
        return { ok: true, message: "Simulated: ONU enabled" };
      default:
        return { ok: false, message: `The simulator cannot run ${cmd.kind}` };
    }
  },
};
