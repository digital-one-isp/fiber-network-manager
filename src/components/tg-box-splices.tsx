"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Side = "input" | "output";

const colorHex: Record<string, string> = {
  Blue: "#2563eb", Orange: "#ea580c", Green: "#16a34a", Brown: "#78350f",
  Slate: "#64748b", White: "#e5e7eb", Red: "#dc2626", Black: "#111827",
  Yellow: "#eab308", Violet: "#7c3aed", Rose: "#f43f5e", Aqua: "#06b6d4",
};

type LinkRow = {
  id: string;
  cable_id: string;
  direction: Side;
  cables: { id: string; name: string } | null;
};
type CoreRow = { id: string; cable_id: string; core_number: number; color: string };
type SpliceRow = {
  id: string;
  splice_point_id: string;
  core_a_id: string;
  side_a: Side;
  core_b_id: string;
  side_b: Side;
  splice_loss_db: number | null;
  description: string | null;
};
type End = {
  key: string;
  coreId: string;
  side: Side;
  cableId: string;
  cableName: string;
  coreNumber: number;
  color: string;
};

function EndView({ end }: { end: End | undefined }) {
  if (!end) return <span className="text-gray-400">Unknown fiber end</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-full border border-gray-300"
        style={{ backgroundColor: colorHex[end.color] ?? "#999" }}
      />
      <span className="font-medium text-gray-900">{end.cableName}</span>
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-600">
        {end.side === "input" ? "in" : "out"}
      </span>
      <span className="text-gray-600">
        Core {end.coreNumber} ({end.color})
      </span>
    </span>
  );
}

export default function TgBoxSplices({ tgBoxId }: { tgBoxId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [cores, setCores] = useState<CoreRow[]>([]);
  const [splices, setSplices] = useState<SpliceRow[]>([]);
  const [pointIds, setPointIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [endA, setEndA] = useState("");
  const [endB, setEndB] = useState("");
  const [loss, setLoss] = useState("");
  const [desc, setDesc] = useState("");

  const [fromGroup, setFromGroup] = useState("");
  const [toGroup, setToGroup] = useState("");
  const [bulkDesc, setBulkDesc] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editLoss, setEditLoss] = useState("");

  const load = useCallback(async () => {
    const { data: linkData } = await supabase
      .from("tg_box_cables")
      .select("id, cable_id, direction, cables:fiber_cables(id, name)")
      .eq("tg_box_id", tgBoxId);
    const linkRows = (linkData ?? []) as unknown as LinkRow[];
    setLinks(linkRows);

    const cableIds = Array.from(new Set(linkRows.map((l) => l.cable_id)));
    if (cableIds.length > 0) {
      const { data: coreData } = await supabase
        .from("fiber_cores")
        .select("id, cable_id, core_number, color")
        .in("cable_id", cableIds)
        .order("core_number");
      setCores((coreData ?? []) as unknown as CoreRow[]);
    } else {
      setCores([]);
    }

    const { data: pointData } = await supabase
      .from("splice_points")
      .select("id")
      .eq("tg_box_id", tgBoxId)
      .order("tray_number");
    const ids = ((pointData ?? []) as unknown as { id: string }[]).map((p) => p.id);
    setPointIds(ids);

    if (ids.length > 0) {
      const { data: spliceData } = await supabase
        .from("splices")
        .select(
          "id, splice_point_id, core_a_id, side_a, core_b_id, side_b, splice_loss_db, description"
        )
        .in("splice_point_id", ids);
      setSplices((spliceData ?? []) as unknown as SpliceRow[]);
    } else {
      setSplices([]);
    }
  }, [supabase, tgBoxId]);

  useEffect(() => {
    load();
  }, [load]);

  const ends = useMemo(() => {
    const list: End[] = [];
    for (const l of links) {
      const cableName = l.cables?.name ?? "Cable";
      for (const c of cores) {
        if (c.cable_id !== l.cable_id) continue;
        list.push({
          key: `${c.id}:${l.direction}`,
          coreId: c.id,
          side: l.direction,
          cableId: l.cable_id,
          cableName,
          coreNumber: c.core_number,
          color: c.color,
        });
      }
    }
    return list;
  }, [links, cores]);

  const endByKey = useMemo(() => new Map(ends.map((e) => [e.key, e])), [ends]);

  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sp of splices) {
      s.add(`${sp.core_a_id}:${sp.side_a}`);
      s.add(`${sp.core_b_id}:${sp.side_b}`);
    }
    return s;
  }, [splices]);

  const groups = useMemo(
    () =>
      links.map((l) => ({
        key: `${l.cable_id}:${l.direction}`,
        label: `${l.cables?.name ?? "Cable"} (${l.direction})`,
        cableId: l.cable_id,
        side: l.direction,
      })),
    [links]
  );

  const bulk = useMemo(() => {
    const pairs: [End, End][] = [];
    let alreadySpliced = 0;
    if (!fromGroup || !toGroup || fromGroup === toGroup) {
      return { pairs, alreadySpliced };
    }
    const from = ends.filter((e) => `${e.cableId}:${e.side}` === fromGroup);
    const to = ends.filter((e) => `${e.cableId}:${e.side}` === toGroup);
    for (const f of from) {
      const t = to.find((x) => x.coreNumber === f.coreNumber && x.color === f.color);
      if (!t) continue;
      if (usedKeys.has(f.key) || usedKeys.has(t.key)) {
        alreadySpliced++;
        continue;
      }
      pairs.push([f, t]);
    }
    return { pairs, alreadySpliced };
  }, [fromGroup, toGroup, ends, usedKeys]);

  async function ensurePointId(): Promise<string | null> {
    if (pointIds.length > 0) return pointIds[0];
    const { data, error } = await supabase
      .from("splice_points")
      .insert({ tg_box_id: tgBoxId, tray_number: 1 })
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "Could not create the splice tray.");
      return null;
    }
    const newId = data.id as string;
    setPointIds([newId]);
    return newId;
  }

  async function addSplice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const a = endByKey.get(endA);
    const b = endByKey.get(endB);
    if (!a || !b) {
      setError("Choose both fiber ends.");
      return;
    }
    if (a.key === b.key) {
      setError("Choose two different fiber ends.");
      return;
    }
    setBusy(true);
    const pointId = await ensurePointId();
    if (!pointId) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("splices").insert({
      splice_point_id: pointId,
      core_a_id: a.coreId,
      side_a: a.side,
      core_b_id: b.coreId,
      side_b: b.side,
      splice_loss_db: loss !== "" ? Number(loss) : null,
      description: desc || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEndA("");
    setEndB("");
    setLoss("");
    setDesc("");
    await load();
  }

  async function addBulk() {
    if (bulk.pairs.length === 0) return;
    setError(null);
    setBusy(true);
    const pointId = await ensurePointId();
    if (!pointId) {
      setBusy(false);
      return;
    }
    const rows = bulk.pairs.map(([f, t]) => ({
      splice_point_id: pointId,
      core_a_id: f.coreId,
      side_a: f.side,
      core_b_id: t.coreId,
      side_b: t.side,
      description: bulkDesc || null,
    }));
    const { error } = await supabase.from("splices").insert(rows);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setBulkDesc("");
    await load();
  }

  function startEdit(sp: SpliceRow) {
    setEditingId(sp.id);
    setEditDesc(sp.description ?? "");
    setEditLoss(sp.splice_loss_db !== null ? String(sp.splice_loss_db) : "");
  }

  async function saveEdit(id: string) {
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("splices")
      .update({
        description: editDesc || null,
        splice_loss_db: editLoss !== "" ? Number(editLoss) : null,
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    await load();
  }

  async function removeSplice(id: string) {
    if (!confirm("Remove this splice?")) return;
    setError(null);
    const { error } = await supabase.from("splices").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  function endSelect(value: string, onChange: (v: string) => void) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-64 rounded border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select a fiber end...</option>
        {groups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {ends
              .filter((e) => e.cableId === g.cableId && e.side === g.side)
              .map((e) => (
                <option key={e.key} value={e.key} disabled={usedKeys.has(e.key)}>
                  Core {e.coreNumber} ({e.color})
                  {usedKeys.has(e.key) ? " - already spliced" : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    );
  }

  const rows = splices
    .map((sp) => ({
      sp,
      a: endByKey.get(`${sp.core_a_id}:${sp.side_a}`),
      b: endByKey.get(`${sp.core_b_id}:${sp.side_b}`),
    }))
    .sort((x, y) => {
      const nx = `${x.a?.cableName ?? ""} ${String(x.a?.coreNumber ?? 0).padStart(4, "0")}`;
      const ny = `${y.a?.cableName ?? ""} ${String(y.a?.coreNumber ?? 0).padStart(4, "0")}`;
      return nx.localeCompare(ny);
    });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Splices ({splices.length})
        </h2>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        Join one fiber end to another. To pass a cable through this box, link the same cable as
        both input and output above. Then you can splice its cores to each other, same color to
        same color or any core to any core.
      </p>

      {links.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          Link at least one cable to this box in Input / Output Cables above, then come back to
          record splices.
        </p>
      ) : (
        <>
          <form onSubmit={addSplice} className="mb-4 rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Splice two fiber ends
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Fiber end A</label>
                {endSelect(endA, setEndA)}
              </div>
              <span className="pb-2 text-gray-400">↔</span>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Fiber end B</label>
                {endSelect(endB, setEndB)}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Loss (dB)</label>
                <input
                  type="number"
                  step="any"
                  value={loss}
                  onChange={(e) => setLoss(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Description (optional)
              </label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Feeder core to Dhanmondi branch, fusion splice"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Add splice
            </button>
          </form>

          <div className="mb-5 rounded-lg border border-dashed border-gray-300 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Join same colors
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
                <select
                  value={fromGroup}
                  onChange={(e) => setFromGroup(e.target.value)}
                  className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select cable and side...</option>
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="pb-2 text-gray-400">↔</span>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
                <select
                  value={toGroup}
                  onChange={(e) => setToGroup(e.target.value)}
                  className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select cable and side...</option>
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[12rem] flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Description for all (optional)
                </label>
                <input
                  value={bulkDesc}
                  onChange={(e) => setBulkDesc(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={addBulk}
                disabled={busy || bulk.pairs.length === 0}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Join {bulk.pairs.length} pair{bulk.pairs.length === 1 ? "" : "s"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Pairs cores with the same number and the same color that are not spliced yet.
              {bulk.alreadySpliced > 0 ? ` ${bulk.alreadySpliced} matching pair(s) skipped because a core is already spliced.` : ""}
            </p>
          </div>
        </>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <ul className="space-y-2">
        {rows.map(({ sp, a, b }) => {
          const straight =
            !!a && !!b && a.cableId === b.cableId && a.coreNumber === b.coreNumber;
          const sameColor = !!a && !!b && a.color === b.color;
          return (
            <li key={sp.id} className="rounded-lg border border-gray-100 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <EndView end={a} />
                  <span className="text-gray-400">↔</span>
                  <EndView end={b} />
                  {straight && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      Straight through
                    </span>
                  )}
                  {a && b && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        sameColor ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {sameColor ? "Same color" : "Color changes"}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => (editingId === sp.id ? setEditingId(null) : startEdit(sp))}
                    className="text-blue-600 hover:underline"
                  >
                    {editingId === sp.id ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSplice(sp.id)}
                    className="text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {editingId === sp.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description"
                    className="min-w-[14rem] flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    value={editLoss}
                    onChange={(e) => setEditLoss(e.target.value)}
                    placeholder="Loss dB"
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(sp.id)}
                    disabled={busy}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              ) : (
                (sp.description || sp.splice_loss_db !== null) && (
                  <p className="mt-1 text-xs text-gray-500">
                    {sp.description}
                    {sp.description && sp.splice_loss_db !== null ? " " : ""}
                    {sp.splice_loss_db !== null ? `(loss ${sp.splice_loss_db} dB)` : ""}
                  </p>
                )
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-xs text-gray-400">No splices recorded in this box yet.</li>
        )}
      </ul>
    </div>
  );
}
