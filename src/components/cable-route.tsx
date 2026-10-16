"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const kindOptions = [
  { value: "pole", label: "Pole" },
  { value: "handhole", label: "Handhole" },
  { value: "manhole", label: "Manhole" },
  { value: "building", label: "Building" },
  { value: "junction", label: "Road junction" },
  { value: "tg_box", label: "TG / joint box" },
  { value: "olt", label: "OLT" },
  { value: "customer", label: "Customer premises" },
  { value: "other", label: "Other" },
];
const kindLabel: Record<string, string> = {};
for (const k of kindOptions) kindLabel[k.value] = k.label;

type Row = {
  id: string;
  sort_order: number;
  length_mark_m: number | string | null;
  place: string | null;
  kind: string;
  tg_box_id: string | null;
  olt_id: string | null;
  route_note: string | null;
  latitude: number | null;
  longitude: number | null;
  tg_boxes: { id: string; name: string } | null;
  olts: { id: string; name: string } | null;
};
type Point = {
  id: string;
  position: number;
  mark: number | null;
  place: string | null;
  kind: string;
  tg_box_id: string | null;
  olt_id: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  boxName: string | null;
  oltName: string | null;
};
type Form = {
  mark: string;
  place: string;
  kind: string;
  tg_box_id: string;
  olt_id: string;
  note: string;
  lat: string;
  lng: string;
};
type Opt = { id: string; name: string };

const emptyForm: Form = {
  mark: "",
  place: "",
  kind: "pole",
  tg_box_id: "",
  olt_id: "",
  note: "",
  lat: "",
  lng: "",
};

function toPoint(r: Row): Point {
  return {
    id: r.id,
    position: Number(r.sort_order),
    mark: r.length_mark_m === null ? null : Number(r.length_mark_m),
    place: r.place,
    kind: r.kind,
    tg_box_id: r.tg_box_id,
    olt_id: r.olt_id,
    note: r.route_note,
    lat: r.latitude,
    lng: r.longitude,
    boxName: r.tg_boxes?.name ?? null,
    oltName: r.olts?.name ?? null,
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function CableRoute({
  cableId,
  onLengthUpdated,
}: {
  cableId: string;
  onLengthUpdated?: (meters: number) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [points, setPoints] = useState<Point[]>([]);
  const [boxes, setBoxes] = useState<Opt[]>([]);
  const [olts, setOlts] = useState<Opt[]>([]);
  const [cableLength, setCableLength] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: pts }, { data: cable }] = await Promise.all([
      supabase
        .from("cable_route_points")
        .select(
          "id, sort_order, length_mark_m, place, kind, tg_box_id, olt_id, route_note, latitude, longitude, tg_boxes(id, name), olts(id, name)"
        )
        .eq("cable_id", cableId)
        .order("sort_order")
        .order("id"),
      supabase.from("fiber_cables").select("length_meters").eq("id", cableId).single(),
    ]);
    setPoints(((pts ?? []) as unknown as Row[]).map(toPoint));
    const len = cable
      ? (cable as unknown as { length_meters: number | string | null }).length_meters
      : null;
    setCableLength(len === null || len === undefined ? null : Number(len));
    setLoaded(true);
  }, [supabase, cableId]);

  useEffect(() => {
    load();
    supabase
      .from("tg_boxes")
      .select("id, name")
      .order("name")
      .then(({ data }) => setBoxes((data ?? []) as unknown as Opt[]));
    supabase
      .from("olts")
      .select("id, name")
      .order("name")
      .then(({ data }) => setOlts((data ?? []) as unknown as Opt[]));
  }, [load, supabase]);

  const calc = useMemo(() => {
    const legs: (number | null)[] = [];
    const cum: number[] = [];
    let total = 0;
    let up = 0;
    let down = 0;
    let missing = 0;
    points.forEach((p, i) => {
      if (p.mark === null) missing++;
      if (i === 0) {
        legs.push(null);
        cum.push(0);
        return;
      }
      const prev = points[i - 1];
      if (p.mark !== null && prev.mark !== null) {
        const d = p.mark - prev.mark;
        if (d > 0) up++;
        else if (d < 0) down++;
        const leg = Math.abs(d);
        legs.push(leg);
        total += leg;
      } else {
        legs.push(null);
      }
      cum.push(total);
    });
    return { legs, cum, total, mixed: up > 0 && down > 0, missing };
  }, [points]);

  const startMark = points.length > 0 ? points[0].mark : null;
  const endMark = points.length > 1 ? points[points.length - 1].mark : null;
  const roundedTotal = Math.round(calc.total * 100) / 100;
  const diff = cableLength !== null ? Math.round((cableLength - calc.total) * 100) / 100 : null;

  function pointLabel(p: Point, i: number) {
    return (
      p.place ||
      p.boxName ||
      p.oltName ||
      (p.mark !== null ? `Mark ${fmt(p.mark)}` : `Point ${i + 1}`)
    );
  }
  const glance = points.map((p, i) => pointLabel(p, i)).join("  →  ");

  function setF<K extends keyof Form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openNew(slot: string) {
    setError(null);
    setForm(emptyForm);
    setOpenForm(slot);
  }

  function openEdit(p: Point) {
    setError(null);
    setForm({
      mark: p.mark !== null ? String(p.mark) : "",
      place: p.place ?? "",
      kind: p.kind,
      tg_box_id: p.tg_box_id ?? "",
      olt_id: p.olt_id ?? "",
      note: p.note ?? "",
      lat: p.lat !== null ? String(p.lat) : "",
      lng: p.lng !== null ? String(p.lng) : "",
    });
    setOpenForm("edit:" + p.id);
  }

  function closeForm() {
    setOpenForm("none");
    setError(null);
  }

  function positionFor(slot: string): number {
    if (slot === "start") {
      return points.length > 0 ? points[0].position - 1024 : 1024;
    }
    if (slot.startsWith("after:")) {
      const id = slot.slice(6);
      const i = points.findIndex((p) => p.id === id);
      if (i === -1) {
        return (points.length > 0 ? points[points.length - 1].position : 0) + 1024;
      }
      const next = points[i + 1];
      return next ? (points[i].position + next.position) / 2 : points[i].position + 1024;
    }
    return points.length > 0 ? points[points.length - 1].position + 1024 : 1024;
  }

  async function submit(slot: string) {
    setError(null);
    const mark = form.mark.trim() === "" ? null : Number(form.mark);
    const lat = form.lat.trim() === "" ? null : Number(form.lat);
    const lng = form.lng.trim() === "" ? null : Number(form.lng);

    if (mark !== null && (Number.isNaN(mark) || mark < 0)) {
      setError("The length mark must be a number, 0 or more.");
      return;
    }
    if ((lat === null) !== (lng === null)) {
      setError("Give both latitude and longitude, or leave both empty.");
      return;
    }
    if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
      setError("Latitude and longitude must be numbers.");
      return;
    }
    const linked =
      form.kind === "tg_box" ? form.tg_box_id : form.kind === "olt" ? form.olt_id : "";
    if (mark === null && !form.place.trim() && !linked) {
      setError("Give the point a length mark, a place, or link a box or an OLT.");
      return;
    }

    const payload = {
      length_mark_m: mark,
      place: form.place.trim() || null,
      kind: form.kind,
      tg_box_id: form.kind === "tg_box" && form.tg_box_id ? form.tg_box_id : null,
      olt_id: form.kind === "olt" && form.olt_id ? form.olt_id : null,
      route_note: form.note.trim() || null,
      latitude: lat,
      longitude: lng,
    };

    setBusy(true);
    let err: { message: string } | null = null;
    if (slot.startsWith("edit:")) {
      const res = await supabase
        .from("cable_route_points")
        .update(payload)
        .eq("id", slot.slice(5));
      err = res.error;
    } else {
      const res = await supabase
        .from("cable_route_points")
        .insert({ cable_id: cableId, sort_order: positionFor(slot), ...payload });
      err = res.error;
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpenForm("none");
    await load();
  }

  async function removePoint(p: Point) {
    if (!confirm("Remove this point from the route? The legs around it will be joined.")) return;
    setError(null);
    const { error } = await supabase.from("cable_route_points").delete().eq("id", p.id);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  async function move(i: number, dir: -1 | 1) {
    const a = points[i];
    const b = points[i + dir];
    if (!a || !b) return;
    setError(null);
    setBusy(true);
    const r1 = await supabase
      .from("cable_route_points")
      .update({ sort_order: b.position })
      .eq("id", a.id);
    const r2 = await supabase
      .from("cable_route_points")
      .update({ sort_order: a.position })
      .eq("id", b.id);
    setBusy(false);
    if (r1.error || r2.error) {
      setError((r1.error ?? r2.error)?.message ?? "Could not move the point.");
    }
    await load();
  }

  async function applyLength() {
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("fiber_cables")
      .update({ length_meters: roundedTotal })
      .eq("id", cableId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onLengthUpdated?.(roundedTotal);
    await load();
  }

  function renderForm(slot: string) {
    const isEdit = slot.startsWith("edit:");
    const editIdx = isEdit ? points.findIndex((p) => "edit:" + p.id === slot) : -1;
    const isFirst =
      slot === "start" || (slot === "end" && points.length === 0) || (isEdit && editIdx === 0);
    const title = isEdit
      ? "Edit this point"
      : isFirst
      ? "Start point"
      : slot === "end"
      ? "Next point at the end"
      : "New point on the route";

    return (
      <div className="my-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">{title}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Cable length mark (m)
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={form.mark}
              onChange={(e) => setF("mark", e.target.value)}
              placeholder="e.g. 1245"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              The meter number printed on the cable at this point.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Place or pole number
            </label>
            <input
              value={form.place}
              onChange={(e) => setF("place", e.target.value)}
              placeholder="e.g. Pole 14, Road 27 mosque corner"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <select
              value={form.kind}
              onChange={(e) => setF("kind", e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {kindOptions.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          {form.kind === "tg_box" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">TG box</label>
              <select
                value={form.tg_box_id}
                onChange={(e) => setF("tg_box_id", e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">(choose a box)</option>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.kind === "olt" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">OLT</label>
              <select
                value={form.olt_id}
                onChange={(e) => setF("olt_id", e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">(choose an OLT)</option>
                {olts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {isFirst
                ? "Where the cable starts from"
                : "Direction, how the cable goes from the previous point"}
            </label>
            <input
              value={form.note}
              onChange={(e) => setF("note", e.target.value)}
              placeholder={
                isFirst
                  ? "e.g. Leaves the NOC rack 2 through the south duct"
                  : "e.g. Along Mirpur Road, heading north towards Mirpur-10"
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Latitude (optional)
            </label>
            <input
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => setF("lat", e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Longitude (optional)
            </label>
            <input
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => setF("lng", e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => submit(slot)}
            disabled={busy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save point"}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const showEndForm = openForm === "end" || (points.length === 0 && openForm === null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Route and length</h2>
      <p className="mb-4 mt-1 text-xs text-gray-400">
        Write the length mark printed on the cable at the start, at each point along the way, and
        at the end. The distance between points and the total length are worked out from the marks.
      </p>

      {!loaded ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Start and end marks</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {startMark !== null ? fmt(startMark) : "-"}
                {points.length > 1 ? ` to ${endMark !== null ? fmt(endMark) : "-"}` : ""}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Route length from marks</dt>
              <dd className="text-sm font-semibold text-gray-900">{fmt(calc.total)} m</dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Cable length recorded</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {cableLength !== null ? `${fmt(cableLength)} m` : "Not set"}
              </dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Difference</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {diff === null
                  ? "-"
                  : diff === 0
                  ? "Matches"
                  : diff > 0
                  ? `${fmt(diff)} m spare`
                  : `${fmt(-diff)} m short`}
              </dd>
            </div>
          </dl>

          {calc.total > 0 && cableLength !== roundedTotal && (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={applyLength}
                disabled={busy}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Set cable length to {fmt(roundedTotal)} m
              </button>
              <span className="text-xs text-gray-500">
                {diff !== null && diff > 0
                  ? "The recorded length is more than the route uses, which usually means slack, loops or joints."
                  : diff !== null && diff < 0
                  ? "The route uses more than the recorded length. Check the marks or the recorded length."
                  : ""}
              </span>
            </div>
          )}

          {calc.mixed && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The length marks go up and down along this route. Check the numbers you entered.
            </p>
          )}
          {calc.missing > 0 && points.length > 0 && (
            <p className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              {calc.missing} of {points.length} points have no length mark, so only the legs between
              marked points are counted.
            </p>
          )}

          {points.length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span className="whitespace-nowrap">{glance}</span>
            </div>
          )}

          {points.length === 0 && (
            <p className="mb-2 text-sm text-gray-500">
              No route recorded yet. Start with the point where the cable begins.
            </p>
          )}

          {points.length > 0 && (
            <div className="mb-2">
              {openForm === "start" ? (
                renderForm("start")
              ) : (
                <button
                  type="button"
                  onClick={() => openNew("start")}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Add a point before the start
                </button>
              )}
            </div>
          )}

          <ol>
            {points.map((p, i) => {
              const last = i === points.length - 1;
              const isStart = i === 0;
              const isEnd = last && points.length > 1;
              const nextLeg = !last ? calc.legs[i + 1] : null;
              const next = !last ? points[i + 1] : null;
              const slotAfter = "after:" + p.id;
              const coords =
                p.lat !== null && p.lng !== null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : null;
              return (
                <li key={p.id} className="flex gap-3">
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white ${
                        isStart ? "bg-emerald-600" : isEnd ? "bg-red-600" : "bg-slate-600"
                      }`}
                    >
                      {isStart ? "S" : isEnd ? "E" : i}
                    </span>
                    {!last && <span className="mt-1 w-0.5 flex-1 bg-gray-200" />}
                  </div>

                  <div className="min-w-0 flex-1 pb-4">
                    {openForm === "edit:" + p.id ? (
                      renderForm("edit:" + p.id)
                    ) : (
                      <div className="rounded-lg border border-gray-200 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.mark !== null && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-white">
                              Mark {fmt(p.mark)}
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {p.place || p.boxName || p.oltName || "Unnamed point"}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                            {kindLabel[p.kind] ?? p.kind}
                          </span>
                          {p.tg_box_id && p.boxName && (
                            <Link
                              href={`/tg-boxes/${p.tg_box_id}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {p.boxName}
                            </Link>
                          )}
                          {p.olt_id && p.oltName && (
                            <Link
                              href={`/olts/${p.olt_id}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {p.oltName}
                            </Link>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {i === 0 ? "Start of the route" : `${fmt(calc.cum[i])} m from the start`}
                          {coords ? `, ${coords}` : ""}
                          {coords && (
                            <>
                              {" "}
                              <a
                                href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Maps
                              </a>
                            </>
                          )}
                        </p>
                        {p.note && i === 0 && (
                          <p className="mt-1 text-xs text-gray-600">{p.note}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => move(i, -1)}
                              disabled={busy}
                              className="text-gray-600 hover:underline"
                            >
                              Move up
                            </button>
                          )}
                          {!last && (
                            <button
                              type="button"
                              onClick={() => move(i, 1)}
                              disabled={busy}
                              className="text-gray-600 hover:underline"
                            >
                              Move down
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removePoint(p)}
                            className="text-red-500 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}

                    {next && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                          {nextLeg !== null ? `${fmt(nextLeg)} m` : "length unknown"}
                        </span>
                        {next.note && <span>{next.note}</span>}
                        <button
                          type="button"
                          onClick={() => openNew(slotAfter)}
                          className="ml-auto text-blue-600 hover:underline"
                        >
                          Add a point here
                        </button>
                      </div>
                    )}

                    {openForm === slotAfter && renderForm(slotAfter)}
                  </div>
                </li>
              );
            })}
          </ol>

          {showEndForm ? (
            renderForm("end")
          ) : (
            <button
              type="button"
              onClick={() => openNew("end")}
              className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              + Add a point at the end
            </button>
          )}

          {error && !openForm?.startsWith("edit:") && !showEndForm && openForm === "none" && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
