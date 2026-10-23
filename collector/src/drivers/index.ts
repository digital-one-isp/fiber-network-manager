import type { OltDriver } from "./types.js";
import { simulatorDriver } from "./simulator.js";
import { snmpGenericDriver } from "./snmp-generic.js";

// Brand drivers that read ONU power are added here one by one.
// Until then every real OLT is checked with the generic SNMP driver (online or offline, uptime).
const drivers: Record<string, OltDriver> = {
  simulator: simulatorDriver,
  vsol: snmpGenericDriver,
  bdcom: snmpGenericDriver,
  huawei: snmpGenericDriver,
  zte: snmpGenericDriver,
  airmedia: snmpGenericDriver,
  other: snmpGenericDriver,
};

export function getDriver(name: string): OltDriver {
  const d = drivers[name];
  if (!d) throw new Error(`There is no driver for "${name}" yet`);
  return d;
}
