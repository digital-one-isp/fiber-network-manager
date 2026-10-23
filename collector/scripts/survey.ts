// Reads an OLT over SNMP and writes two files: a short summary and the full list.
// Usage: npm run survey -- <host> <community> [port] [maxLines]
// Extra secrets to hide (passwords etc.):  REDACT="pass1,pass2" npm run survey -- ...
import snmp from "net-snmp";
import { writeFileSync } from "node:fs";

const [host, community, port = "161", maxArg = "30000"] = process.argv.slice(2);
if (!host || !community) {
  console.log("Usage: npm run survey -- <host> <community> [port] [maxLines]");
  process.exit(1);
}
const MAX = Number(maxArg) || 30000;
const secrets = [community, ...(process.env.REDACT ?? "").split(",").map((s) => s.trim())].filter(Boolean);

const session = snmp.createSession(host, community, {
  port: Number(port),
  version: snmp.Version2c,
  timeout: 5000,
  retries: 1,
});

function show(v: unknown): string {
  let s: string;
  if (Buffer.isBuffer(v)) {
    const t = v.toString("utf8");
    s = /^[\x20-\x7e\r\n\t]*$/.test(t) ? JSON.stringify(t) : "0x" + v.toString("hex");
  } else {
    s = String(v);
  }
  for (const w of secrets) if (s.includes(w)) s = s.split(w).join("***");
  return s;
}

function get(oids: string[]): Promise<any[]> {
  return new Promise((res, rej) =>
    session.get(oids, (e: Error | null, vbs: any[]) => (e ? rej(e) : res(vbs)))
  );
}
function bulk(oid: string, rep: number): Promise<any[]> {
  return new Promise((res, rej) =>
    session.getBulk([oid], 0, rep, (e: Error | null, vbs: any[]) => (e ? rej(e) : res(vbs)))
  );
}

type Line = { oid: string; value: string };

async function walk(base: string, max: number): Promise<Line[]> {
  const out: Line[] = [];
  let cur = base;
  while (out.length < max) {
    let vbs: any[];
    try {
      vbs = await bulk(cur, 25);
    } catch (e) {
      console.error(`\n${base}: stopped, ${(e as Error).message}`);
      break;
    }
    if (!vbs || vbs.length === 0) break;
    let done = false;
    const before = cur;
    for (const vb of vbs) {
      if (snmp.isVarbindError(vb) || !String(vb.oid).startsWith(base + ".")) {
        done = true;
        break;
      }
      out.push({ oid: vb.oid, value: show(vb.value) });
      cur = vb.oid;
      if (out.length >= max) break;
    }
    if (done || cur === before) break;
    if (out.length % 500 < 25) process.stdout.write(`\r${base}: ${out.length} lines   `);
  }
  process.stdout.write(`\r${base}: ${out.length} lines   \n`);
  return out;
}

async function main() {
  const sum: string[] = [];
  sum.push(`SURVEY of ${host}  (${new Date().toISOString()})`);

  try {
    const sys = await get([
      "1.3.6.1.2.1.1.1.0",
      "1.3.6.1.2.1.1.2.0",
      "1.3.6.1.2.1.1.3.0",
      "1.3.6.1.2.1.1.5.0",
    ]);
    const names = ["sysDescr", "sysObjectID", "sysUpTime", "sysName"];
    sys.forEach((vb, i) => sum.push(`${names[i]}: ${snmp.isVarbindError(vb) ? "(none)" : show(vb.value)}`));
  } catch (e) {
    console.error("The OLT did not answer over SNMP:", (e as Error).message);
    console.error("Check the IP, the community, that SNMP is on, and that this PC is allowed.");
    session.close();
    process.exit(1);
  }

  sum.push("", "INTERFACES (index, name, state 1=up 2=down)");
  const names = await walk("1.3.6.1.2.1.2.2.1.2", 600);
  const states = await walk("1.3.6.1.2.1.2.2.1.8", 600);
  const stateBy = new Map(states.map((l) => [l.oid.split(".").pop(), l.value]));
  for (const l of names) {
    const idx = l.oid.split(".").pop();
    sum.push(`  ${idx}  ${l.value}  state=${stateBy.get(idx) ?? "?"}`);
  }

  console.log("Reading the vendor part of the SNMP tree. This can take a few minutes...");
  const ent = await walk("1.3.6.1.4.1", MAX);

  const groups = new Map<string, { n: number; first: Line; second?: Line; last: Line }>();
  for (const l of ent) {
    const parts = l.oid.split(".");
    const key = parts.slice(0, Math.max(8, parts.length - 2)).join(".");
    const g = groups.get(key);
    if (!g) groups.set(key, { n: 1, first: l, last: l });
    else {
      g.n++;
      if (!g.second) g.second = l;
      g.last = l;
    }
  }
  sum.push("", `VENDOR TREE (${ent.length} lines in ${groups.size} groups; group = OID without its last 2 numbers)`);
  for (const [key, g] of groups) {
    sum.push(`${key}.*   ${g.n} entries`);
    sum.push(`    ${g.first.oid} = ${g.first.value}`);
    if (g.second) sum.push(`    ${g.second.oid} = ${g.second.value}`);
    if (g.n > 2) sum.push(`    ${g.last.oid} = ${g.last.value}`);
  }

  const base = `survey-${host.replace(/[^0-9a-zA-Z.-]/g, "_")}`;
  writeFileSync(`${base}-summary.txt`, sum.join("\n"));
  writeFileSync(`${base}-full.txt`, ent.map((l) => `${l.oid} = ${l.value}`).join("\n"));
  console.log(`\nWrote ${base}-summary.txt (${sum.length} lines) and ${base}-full.txt (${ent.length} lines)`);
  session.close();
}

main();
