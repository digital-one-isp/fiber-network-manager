"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { driverLabel } from "@/lib/monitoring";

type Form = {
  enabled: boolean;
  host: string;
  driver: string;
  tech: string;
  method: string;
  snmp_port: string;
  ssh_port: string;
  telnet_port: string;
  web_url: string;
  poll_interval_seconds: string;
  username: string;
  password: string;
  snmp_community: string;
  enable_password: string;
};

const empty: Form = {
  enabled: true,
  host: "",
  driver: "simulator",
  tech: "gpon",
  method: "snmp",
  snmp_port: "161",
  ssh_port: "22",
  telnet_port: "23",
  web_url: "",
  poll_interval_seconds: "60",
  username: "",
  password: "",
  snmp_community: "",
  enable_password: "",
};

const input = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-medium text-gray-600";

export default function OltConnectionForm({ oltId }: { oltId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<Form>(empty);
  const [exists, setExists] = useState(false);
  const [saved, setSaved] = useState({ password: false, snmp: false, enable: false });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: c } = await supabase
      .from("olt_connections")
      .select("*")
      .eq("olt_id", oltId)
      .maybeSingle();
    const { data: cred } = await supabase.rpc("get_olt_credential_status", { p_olt_id: oltId });
    const cs = (cred as { username: string | null; has_password: boolean; has_snmp: boolean; has_enable: boolean }[] | null)?.[0];
    setExists(!!c);
    setOpen(!c);
    setSaved({ password: !!cs?.has_password, snmp: !!cs?.has_snmp, enable: !!cs?.has_enable });
    if (c) {
      setForm({
        enabled: c.enabled,
        host: c.host ?? "",
        driver: c.driver,
        tech: c.tech,
        method: c.method,
        snmp_port: String(c.snmp_port),
        ssh_port: String(c.ssh_port),
        telnet_port: String(c.telnet_port),
        web_url: c.web_url ?? "",
        poll_interval_seconds: String(c.poll_interval_seconds),
        username: cs?.username ?? "",
        password: "",
        snmp_community: "",
        enable_password: "",
      });
    }
  }, [supabase, oltId]);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const { error: err } = await supabase.from("olt_connections").upsert(
      {
        olt_id: oltId,
        host: form.host.trim(),
        driver: form.driver,
        tech: form.tech,
        method: form.method,
        snmp_port: Number(form.snmp_port) || 161,
        ssh_port: Number(form.ssh_port) || 22,
        telnet_port: Number(form.telnet_port) || 23,
        web_url: form.web_url.trim() || null,
        poll_interval_seconds: Math.max(15, Number(form.poll_interval_seconds) || 60),
        enabled: form.enabled,
      },
      { onConflict: "olt_id" }
    );
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }

    const touchedLogin =
      form.username || form.password || form.snmp_community || form.enable_password;
    if (touchedLogin) {
      const { error: err2 } = await supabase.rpc("set_olt_credentials", {
        p_olt_id: oltId,
        p_username: form.username,
        p_password: form.password || null,
        p_snmp_community: form.snmp_community || null,
        p_enable_password: form.enable_password || null,
      });
      if (err2) {
        setBusy(false);
        setError(`The connection was saved, but the login was not: ${err2.message}`);
        return;
      }
    }

    setBusy(false);
    setNotice("Saved. The collector picks it up within a few seconds.");
    await load();
  }

  async function clearLogin() {
    if (!confirm("Remove the saved login of this OLT?")) return;
    const { error: err } = await supabase.rpc("clear_olt_credentials", { p_olt_id: oltId });
    if (err) setError(err.message);
    else await load();
  }

  async function removeConnection() {
    if (!confirm("Stop monitoring this OLT? The ONU history stays.")) return;
    const { error: err } = await supabase.from("olt_connections").delete().eq("olt_id", oltId);
    if (err) setError(err.message);
    else {
      setForm(empty);
      await load();
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="block text-sm font-semibold text-gray-900">Connection and login</span>
          <span className="block text-xs text-gray-500">
            {exists ? `${form.host}, ${driverLabel[form.driver] ?? form.driver}` : "Not connected yet"}
          </span>
        </span>
        <span className="text-xs text-blue-600">{open ? "Hide" : exists ? "Edit" : "Set up"}</span>
      </button>

      {open && (
        <form onSubmit={save} className="space-y-4 border-t border-gray-100 px-5 py-5">
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Monitor this OLT
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={label}>IP address or host name *</label>
              <input
                required
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                placeholder="e.g. 203.0.113.10"
                className={input}
              />
            </div>
            <div>
              <label className={label}>OLT brand (driver)</label>
              <select value={form.driver} onChange={(e) => set("driver", e.target.value)} className={input}>
                {Object.entries(driverLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>PON type</label>
              <select value={form.tech} onChange={(e) => set("tech", e.target.value)} className={input}>
                <option value="gpon">GPON</option>
                <option value="epon">EPON</option>
                <option value="xgspon">XGS-PON</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className={label}>How to talk to the OLT</label>
              <select value={form.method} onChange={(e) => set("method", e.target.value)} className={input}>
                <option value="snmp">SNMP (best for monitoring)</option>
                <option value="ssh">SSH</option>
                <option value="telnet">Telnet</option>
                <option value="web">Web page</option>
              </select>
            </div>
            <div>
              <label className={label}>SNMP port</label>
              <input type="number" value={form.snmp_port} onChange={(e) => set("snmp_port", e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>SSH port</label>
              <input type="number" value={form.ssh_port} onChange={(e) => set("ssh_port", e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Telnet port</label>
              <input type="number" value={form.telnet_port} onChange={(e) => set("telnet_port", e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Web address (if it uses the web page)</label>
              <input value={form.web_url} onChange={(e) => set("web_url", e.target.value)} placeholder="https://..." className={input} />
            </div>
            <div>
              <label className={label}>Check every (seconds, at least 15)</label>
              <input type="number" min={15} value={form.poll_interval_seconds} onChange={(e) => set("poll_interval_seconds", e.target.value)} className={input} />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <p className="mb-3 text-sm font-medium text-gray-800">Login of the OLT</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={label}>User name</label>
                <input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" className={input} />
              </div>
              <div>
                <label className={label}>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={saved.password ? "Saved. Leave empty to keep it" : ""}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>SNMP community (read only)</label>
                <input
                  type="password"
                  value={form.snmp_community}
                  onChange={(e) => set("snmp_community", e.target.value)}
                  autoComplete="new-password"
                  placeholder={saved.snmp ? "Saved. Leave empty to keep it" : ""}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Enable password (if the OLT asks)</label>
                <input
                  type="password"
                  value={form.enable_password}
                  onChange={(e) => set("enable_password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={saved.enable ? "Saved. Leave empty to keep it" : ""}
                  className={input}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Logins are stored encrypted and are never shown again. Only an admin can change them.
              Use a read-only account for watching, and allow the OLT to be reached only from the
              collector&rsquo;s IP address.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
            {saved.password || saved.snmp || saved.enable ? (
              <button type="button" onClick={clearLogin} className="text-sm text-red-600 hover:underline">
                Remove saved login
              </button>
            ) : null}
            {exists && (
              <button type="button" onClick={removeConnection} className="ml-auto text-sm text-red-600 hover:underline">
                Stop monitoring
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
