export type OnuState = "online" | "offline" | "los" | "dying_gasp" | "power_off" | "unknown";

export type Connection = {
  olt_id: string;
  host: string;
  driver: string;
  tech: string;
  method: string;
  snmp_port: number;
  ssh_port: number;
  telnet_port: number;
  web_url: string | null;
  poll_interval_seconds: number;
  enabled: boolean;
};

export type Credentials = {
  username: string | null;
  password: string | null;
  snmp_community: string | null;
  enable_password: string | null;
};

export type OnuSnapshot = {
  id: string; // serial number (GPON) or MAC address (EPON)
  ponPort: string;
  onuNo?: number | null;
  name?: string | null;
  model?: string | null;
  status: OnuState;
  rxPowerDbm?: number | null; // power received at the ONU
  oltRxPowerDbm?: number | null; // power the OLT receives from the ONU
  temperatureC?: number | null;
  distanceM?: number | null;
  offlineReason?: string | null;
};

export type OltSnapshot = {
  responseMs: number;
  uptimeSeconds?: number | null;
  cpuPercent?: number | null;
  temperatureC?: number | null;
  onus: OnuSnapshot[];
};

export type OnuRef = {
  id: string;
  ident: string;
  pon_port: string;
  onu_no: number | null;
  name: string | null;
};

export type Command = {
  kind: string;
  params: Record<string, unknown>;
  onu: OnuRef | null;
};

export type CommandResult = { ok: boolean; message: string };

// One driver per OLT brand. poll() reads the OLT; execute() changes something on it.
export interface OltDriver {
  name: string;
  poll(conn: Connection, creds: Credentials): Promise<OltSnapshot>;
  execute?(conn: Connection, creds: Credentials, cmd: Command): Promise<CommandResult>;
}
