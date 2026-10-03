"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ratioGroups = {
  "Symmetric (PON)": ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"],
  "Asymmetric (Tap)": ["5:95", "10:90", "15:85", "20:80", "30:70", "40:60", "50:50"],
};

const statusOptions = ["active", "inactive", "maintenance", "faulty"];

type FeedSource = "core" | "splitter_port";

export default function NewSplitterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tgBoxes, setTgBoxes] = useState<{ id: string; name: string }[]>([]);
  const [cables, setCables] = useState<{ id: string; name: string }[]>([]);
  const [selectedCableId, setSelectedCableId] = useState("");
  const [cores, setCores] = useState<{ id: string; core_number: number; color: string }[]>([]);

  const [feedSource, setFeedSource] = useState<FeedSource>("core");
  const [existingSplitters, setExistingSplitters] = useState<
    { id: string; name: string; ratio: string }[]
  >([]);
  const [selectedParentSplitterId, setSelectedParentSplitterId] = useState("");
  const [parentPorts, setParentPorts] = useState<
    { id: string; port_number: number; status: string; power_percent: number | null }[]
  >([]);

  const [form, setForm] = useState({
    name: "",
    ratio: "1:8",
    tg_box_id: "",
    input_core_id: "",
    parent_port_id: "",
    latitude: "",
    longitude: "",
    status: "active",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("tg_boxes")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTgBoxes(data ?? []));
    supabase
      .from("fiber_cables")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCables(data ?? []));
    supabase
      .from("splitters")
      .select("id, name, ratio")
      .order("name")
      .then(({ data }) => setExistingSplitters(data ?? []));
  }, [supabase]);

  useEffect(() => {
    if (!selectedCableId) {
      setCores([]);
      return;
    }
    supabase
      .from("fiber_cores")
      .select("id, core_number, color")
      .eq("cable_id", selectedCableId)
      .order("core_number")
      .then(({ data }) => setCores(data ?? []));
  }, [selectedCableId, supabase]);

  useEffect(() => {
    if (!selectedParentSplitterId) {
      setParentPorts([]);
      return;
    }
    supabase
      .from("splitter_ports")
      .select("id, port_number, status, power_percent")
      .eq("splitter_id", selectedParentSplitterId)
      .order("port_number")
      .then(({ data }) => setParentPorts(data ?? []));
  }, [selectedParentSplitterId, supabase]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.from("splitters").insert({
      name: form.name,
      ratio: form.ratio,
      tg_box_id: form.tg_box_id || null,
      input_core_id: feedSource === "core" ? form.input_core_id || null : null,
      parent_port_id:
        feedSource === "splitter_port" ? form.parent_port_id || null : null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      status: form.status,
      notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/splitters");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Add Splitter</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Name *
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Ratio *
          </label>
          <select
            value={form.ratio}
            onChange={(e) => update("ratio", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {Object.entries(ratioGroups).map(([group, ratios]) => (
              <optgroup key={group} label={group}>
                {ratios.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Ports will be auto-generated based on the ratio.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            TG / Joint Box
          </label>
          <select
            value={form.tg_box_id}
            onChange={(e) => update("tg_box_id", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">(standalone / in field)</option>
            {tgBoxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Feed Source *
          </label>
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={feedSource === "core"}
                onChange={() => setFeedSource("core")}
              />
              Fiber Core (e.g. main 1:8 input)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={feedSource === "splitter_port"}
                onChange={() => setFeedSource("splitter_port")}
              />
              Another Splitter&apos;s Port (cascaded)
            </label>
          </div>

          {feedSource === "core" ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Input Cable
                </label>
                <select
                  value={selectedCableId}
                  onChange={(e) => {
                    setSelectedCableId(e.target.value);
                    update("input_core_id", "");
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">(select a cable to list its cores)</option>
                  {cables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Input Core (PON Input)
                </label>
                <select
                  value={form.input_core_id}
                  onChange={(e) => update("input_core_id", e.target.value)}
                  disabled={!selectedCableId}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                >
                  <option value="">(none)</option>
                  {cores.map((c) => (
                    <option key={c.id} value={c.id}>
                      Core {c.core_number} ({c.color})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Parent Splitter
                </label>
                <select
                  value={selectedParentSplitterId}
                  onChange={(e) => {
                    setSelectedParentSplitterId(e.target.value);
                    update("parent_port_id", "");
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">(select a splitter)</option>
                  {existingSplitters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.ratio})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Parent Output Port
                </label>
                <select
                  value={form.parent_port_id}
                  onChange={(e) => update("parent_port_id", e.target.value)}
                  disabled={!selectedParentSplitterId}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                >
                  <option value="">(none)</option>
                  {parentPorts.map((p) => (
                    <option key={p.id} value={p.id}>
                      Port {p.port_number}
                      {p.power_percent !== null ? ` (${p.power_percent}%)` : ""} -{" "}
                      {p.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={form.latitude}
              onChange={(e) => update("latitude", e.target.value)}
              placeholder="23.8103"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={form.longitude}
              onChange={(e) => update("longitude", e.target.value)}
              placeholder="90.4125"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Splitter"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/splitters")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
