// Generic SNMP driver: reads only what every device offers (reachable, uptime).
// It does not read ONUs. That needs a driver written for the OLT brand.
import snmp from "net-snmp";
import type { Connection, Credentials, OltDriver, OltSnapshot } from "./types.js";

const OID_UPTIME = "1.3.6.1.2.1.1.3.0";

export const snmpGenericDriver: OltDriver = {
  name: "snmp-generic",

  async poll(conn: Connection, creds: Credentials): Promise<OltSnapshot> {
    if (!creds.snmp_community) throw new Error("No SNMP community is saved for this OLT");
    const session = snmp.createSession(conn.host, creds.snmp_community, {
      port: conn.snmp_port,
      version: snmp.Version2c,
      timeout: 4000,
      retries: 1,
    });
    const started = Date.now();
    try {
      const vbs: any[] = await new Promise((resolve, reject) => {
        session.get([OID_UPTIME], (err: Error | null, v: any[]) => (err ? reject(err) : resolve(v)));
      });
      const vb = vbs[0];
      if (!vb || snmp.isVarbindError(vb)) {
        throw new Error("The OLT answered but did not return its uptime");
      }
      return {
        responseMs: Date.now() - started,
        uptimeSeconds: Math.round(Number(vb.value) / 100),
        onus: [],
      };
    } finally {
      session.close();
    }
  },
};
