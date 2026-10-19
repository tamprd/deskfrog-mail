"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MediaItem } from "@/lib/media";

export type MediaActions = {
  list: () => Promise<{ items?: MediaItem[]; error?: string }>;
  upload: (fd: FormData) => Promise<{ items?: MediaItem[]; error?: string }>;
  remove: (path: string) => Promise<{ ok?: boolean; error?: string }>;
};

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const date = (s: string) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }) : "");

/**
 * Grid of the workspace's uploaded images.
 * - `onPick` set → picker mode (click selects).
 * - otherwise → library mode (copy link / open / delete).
 */
export function MediaLibrary({
  actions,
  initial,
  onPick,
  pickLabel = "Use image",
}: {
  actions: MediaActions;
  initial?: MediaItem[];
  onPick?: (item: MediaItem) => void;
  pickLabel?: string;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    start(async () => {
      const r = await actions.list();
      if (r.error) setMsg({ kind: "error", text: r.error });
      else setItems(r.items ?? []);
    });
  }, [actions]);

  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  const upload = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("file", f));
    start(async () => {
      setMsg(null);
      const r = await actions.upload(fd);
      if (r.items?.length) {
        setItems((cur) => [...r.items!, ...(cur ?? [])]);
        if (onPick && r.items.length === 1) setSelected(r.items[0]);
      }
      setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: `Uploaded ${r.items?.length ?? 0} image${r.items?.length === 1 ? "" : "s"}.` });
    });
  };

  const copy = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(item.path);
      setTimeout(() => setCopied((c) => (c === item.path ? null : c)), 1800);
    } catch {
      window.prompt("Copy this link:", item.url);
    }
  };

  const remove = (item: MediaItem) => {
    if (!confirm(`Delete ${item.name}?\n\nAny email that already uses this image (including ones already sent) will show a broken image.`)) return;
    start(async () => {
      const r = await actions.remove(item.path);
      if (r.error) return setMsg({ kind: "error", text: r.error });
      setItems((cur) => (cur ?? []).filter((i) => i.path !== item.path));
      if (selected?.path === item.path) setSelected(null);
    });
  };

  const shown = useMemo(() => (items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())), [items, q]);

  return (
    <div
      className={`relative ${drag ? "ring-2 ring-frog ring-offset-2 rounded-xl" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input max-w-xs" placeholder="Search by name…" aria-label="Search images" />
        <span className="text-sm text-muted">{items ? `${shown.length} image${shown.length === 1 ? "" : "s"}` : "Loading…"}</span>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn-primary ml-auto" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Working…" : "⬆ Upload images"}</button>
      </div>
      <p className="-mt-2 mb-4 text-xs text-muted">Drag and drop files here. PNG, JPG, GIF or WebP up to 5 MB. Tip: 1200px wide is plenty for email.</p>
      {msg && <p role="status" className={`mb-4 rounded-lg p-2.5 text-sm ${msg.kind === "error" ? "bg-red-50 text-danger" : "bg-frog-50 text-forest"}`}>{msg.text}</p>}

      {items && !shown.length ? (
        <div className="grid place-items-center rounded-xl border-2 border-dashed border-frog-200 bg-frog-50 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-forest">{q ? "No images match that search" : "No images yet"}</p>
          <p className="text-sm text-muted">Upload logos, banners and photos to use in your emails.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((item) => {
            const active = selected?.path === item.path;
            return (
              <li
                key={item.path}
                onClick={onPick ? () => setSelected(item) : undefined}
                onDoubleClick={onPick ? () => onPick(item) : undefined}
                className={`group overflow-hidden rounded-xl border bg-white ${onPick ? "cursor-pointer" : ""} ${active ? "border-frog-700 ring-2 ring-frog-700" : "border-line"}`}
              >
                <button
                  type="button"
                  className="block aspect-[4/3] w-full bg-[repeating-conic-gradient(#F3F4F6_0%_25%,#FFFFFF_0%_50%)] bg-[length:16px_16px]"
                  onClick={() => (onPick ? undefined : window.open(item.url, "_blank", "noopener"))}
                  title={onPick ? "Click to select, double-click to use" : "Open full size"}
                >
                  <img src={item.url} alt={item.name} loading="lazy" className="h-full w-full object-contain" />
                </button>
                <div className="space-y-1.5 p-2.5">
                  <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
                  <p className="text-[11px] text-muted">{kb(item.size)} · {date(item.createdAt)}</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => copy(item)} className="btn-secondary flex-1 px-2 py-1 text-xs">{copied === item.path ? "✓ Copied" : "Copy link"}</button>
                    {!onPick && <button type="button" onClick={() => remove(item)} className="btn-danger px-2 py-1 text-xs" aria-label={`Delete ${item.name}`} title="Delete">✕</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {onPick && (
        <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-line bg-white py-3">
          {selected ? (
            <>
              <img src={selected.url} alt="" className="h-10 w-10 rounded object-cover" />
              <input readOnly value={selected.url} className="input flex-1 font-mono text-xs" aria-label="Image link" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn-secondary" onClick={() => copy(selected)}>{copied === selected.path ? "✓ Copied" : "Copy link"}</button>
              <button type="button" className="btn-primary" onClick={() => onPick(selected)}>{pickLabel}</button>
            </>
          ) : (
            <p className="text-sm text-muted">Select an image.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Modal wrapper for picking an image from inside the editor. */
export function MediaPickerModal({ actions, onPick, onClose, pickLabel }: { actions: MediaActions; onPick: (item: MediaItem) => void; onClose: () => void; pickLabel?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-ink/60 sm:p-6" role="dialog" aria-modal aria-label="Media library" onClick={onClose}>
      <div className="flex w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Media library</h2>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5">Close</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">
          <MediaLibrary actions={actions} onPick={(i) => { onPick(i); onClose(); }} pickLabel={pickLabel} />
        </div>
      </div>
    </div>
  );
}
