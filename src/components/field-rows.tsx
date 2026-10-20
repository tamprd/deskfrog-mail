"use client";
import { useState } from "react";

type Row = { k: string; v: string; id: number };

/** Editable name/value rows for contact custom fields. Posts field_key[] / field_value[]. */
export function FieldRows({ initial, suggestions = [] }: { initial: [string, string][]; suggestions?: string[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [["", ""]]).map(([k, v], i) => ({ k, v, id: i })),
  );
  const set = (id: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => [...r, { k: "", v: "", id: Date.now() }]);
  const remove = (id: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : [{ k: "", v: "", id: Date.now() }]));

  return (
    <div className="space-y-2">
      <datalist id="df-field-names">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <input name="field_key" list="df-field-names" value={r.k} onChange={(e) => set(r.id, { k: e.target.value })} placeholder="Field" aria-label="Field name" className="input w-[42%] py-1.5 text-xs" />
          <input name="field_value" value={r.v} onChange={(e) => set(r.id, { v: e.target.value })} placeholder="Value" aria-label="Field value" className="input flex-1 py-1.5 text-xs" />
          <button type="button" onClick={() => remove(r.id)} aria-label="Remove field" className="rounded px-1.5 text-lg leading-none text-muted hover:text-danger">×</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs font-semibold text-frog-700 hover:underline">+ Add field</button>
    </div>
  );
}
