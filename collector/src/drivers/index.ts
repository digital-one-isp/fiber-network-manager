import type { OltDriver } from "./types.js";
import { simulatorDriver } from "./simulator.js";

// Real drivers (BDCOM, VSOL, Huawei, ZTE, Air Media) are added here one by one.
const drivers: Record<string, OltDriver> = {
  simulator: simulatorDriver,
};

export function getDriver(name: string): OltDriver {
  const d = drivers[name];
  if (!d) throw new Error(`There is no driver for "${name}" yet`);
  return d;
}
