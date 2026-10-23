// Reads part of an OLT's SNMP tree into a text file, so the right driver can be written.
// Usage: npm run discover -- <host> <community> [baseOid] [port]
// Examples:
//   npm run discover -- 203.0.113.10 mycommunity                  (identifies the device)
//   npm run discover -- 203.0.113.10 mycommunity 1.3.6.1.4.1 161  (vendor tree, can be large)
import snmp from "net-snmp";
import { writeFileSync } from "node:fs";

const [host, community, base = "1.3.6.1.2.1.1", port = "161"] = process.argv.slice(2);
if (!host || !community) {
  console.log("Usage: npm run discover -- <host> <community> [baseOid] [port]");
  process.exit(1);
}

const session = snmp.createSession(host, community, {
  port: Number(port),
  version: snmp.Version2c,
  timeout: 5000,
  retries: 1,
});

function show(v: unknown) {
  if (Buffer.isBuffer(v)) {
    const s = v.toString("utf8");
    return /^[\x20-\x7e\r\n\t]*$/.test(s) ? JSON.stringify(s) : "0x" + v.toString("hex");
  }
  return String(v);
}

const lines: string[] = [];
session.walk(
  base,
  20,
  (varbinds: any[]) => {
    for (const vb of varbinds) {
      if (snmp.isVarbindError(vb)) console.error(snmp.varbindError(vb));
      else lines.push(`${vb.oid} = ${show(vb.value)}`);
    }
  },
  (error: Error | null) => {
    if (error) console.error("The walk ended with an error:", error.message);
    const file = `discover-${host}-${base.replace(/\./g, "_")}.txt`;
    writeFileSync(file, lines.join("\n"));
    console.log(`Wrote ${lines.length} lines to ${file}`);
    session.close();
  }
);
