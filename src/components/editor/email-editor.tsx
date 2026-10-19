"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { BLOCK_LABELS, newBlock, type Block, type BlockType, type Brand, type ChildBlock, type Design, type DesignSettings } from "@/lib/email/design";
import { addToColumn, duplicateBlock, findBlock, insertBlock, moveBlock, removeBlock, updateBlock } from "@/lib/email/tree";
import { Canvas, type CanvasApi } from "./canvas";
import { BlockPanel, SettingsPanel, resizeColumns } from "./panel";

type Actions = {
  save: (design: Design, meta: { subject?: string }) => Promise<{ ok?: boolean; error?: string; savedAt?: string }>;
  preview: (design: Design, fromName: string) => Promise<{ html?: string; error?: string }>;
  sendTest: (design: Design, subject: string) => Promise<{ ok?: string; error?: string }>;
  upload: (fd: FormData) => Promise<{ url?: string; error?: string }>;
  saveTemplate: (name: string, design: Design, subject: string) => Promise<{ ok?: string; error?: string }>;
};

type State = { past: Design[]; present: Design; future: Design[] };
type Act = { type: "set"; design: Design; merge?: boolean } | { type: "undo" } | { type: "redo" };

function reducer(s: State, a: Act): State {
  switch (a.type) {
    case "set":
      if (a.merge) return { ...s, present: a.design }; // typing: coalesce into one history step
      return { past: [...s.past, s.present].slice(-60), present: a.design, future: [] };
    case "undo":
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
    case "redo":
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
  }
}

const PALETTE: { type: BlockType; icon: string }[] = [
  { type: "logo", icon: "🐸" },
  { type: "hero", icon: "★" },
  { type: "heading", icon: "H" },
  { type: "text", icon: "¶" },
  { type: "image", icon: "🖼" },
  { type: "button", icon: "▭" },
  { type: "columns", icon: "▥" },
  { type: "divider", icon: "—" },
  { type: "spacer", icon: "↕" },
  { type: "social", icon: "♥" },
  { type: "html", icon: "</>" },
];

export function EmailEditor({
  initial,
  brand,
  campaign,
  actions,
}: {
  initial: Design;
  brand: Partial<Brand>;
  campaign: { id: string; name: string; subject: string; fromName: string };
  actions: Actions;
}) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [] });
  const design = state.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState(campaign.subject);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ html: string; width: number } | null>(null);
  const [pending, start] = useTransition();
  const [mobile, setMobile] = useState(false);
  const [sheet, setSheet] = useState(false);
  const lastTyped = useRef<string | null>(null);

  const set = useCallback((d: Design, mergeKey?: string) => {
    const merge = !!mergeKey && lastTyped.current === mergeKey;
    lastTyped.current = mergeKey ?? null;
    dispatch({ type: "set", design: d, merge });
    setDirty(true);
  }, []);

  const setBlocks = useCallback((blocks: Block[], mergeKey?: string) => set({ ...design, blocks }, mergeKey), [design, set]);

  const api: CanvasApi = useMemo(
    () => ({
      selected,
      select: setSelected,
      update: (id, patch) => setBlocks(updateBlock(design.blocks, id, (b) => ({ ...b, ...patch }) as typeof b), `edit:${id}`),
      setBlocks: (blocks) => setBlocks(blocks),
      move: (id, dir) => setBlocks(moveBlock(design.blocks, id, dir)),
      duplicate: (id) => {
        const r = duplicateBlock(design.blocks, id);
        setBlocks(r.blocks);
        setSelected(r.newId);
      },
      remove: (id) => {
        setBlocks(removeBlock(design.blocks, id));
        setSelected(null);
      },
      addChild: (columnsId, col, type) => {
        const child = newBlock(type) as ChildBlock;
        setBlocks(addToColumn(design.blocks, columnsId, col, child));
        setSelected(child.id);
      },
    }),
    [design.blocks, selected, setBlocks],
  );

  const add = (type: BlockType) => {
    const b = newBlock(type);
    setBlocks(insertBlock(design.blocks, b, selected));
    setSelected(b.id);
  };

  const save = useCallback(
    (quiet = false) =>
      new Promise<boolean>((resolve) => {
        start(async () => {
          const r = await actions.save(design, { subject });
          if (r.ok) {
            setDirty(false);
            setSavedAt(r.savedAt ?? new Date().toISOString());
            if (!quiet) setStatus({ kind: "ok", text: "Saved" });
            resolve(true);
          } else {
            setStatus({ kind: "error", text: r.error ?? "Couldn't save" });
            resolve(false);
          }
        });
      }),
    [actions, design, subject],
  );

  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(true), 4000);
    return () => clearTimeout(t);
  }, [dirty, design, subject, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Keyboard: undo/redo, delete, escape.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (!typing && mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        setDirty(true);
      } else if (!typing && mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
        setDirty(true);
      } else if (!typing && selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        api.remove(selected);
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [api, save, selected]);

  const openPreview = (width: number) =>
    start(async () => {
      const r = await actions.preview(design, campaign.fromName);
      if (r.html) setPreview({ html: r.html, width });
      else setStatus({ kind: "error", text: r.error ?? "Preview failed" });
    });

  const saveTemplate = () => {
    const name = window.prompt("Template name", campaign.name);
    if (!name) return;
    start(async () => {
      const r = await actions.saveTemplate(name, design, subject);
      setStatus(r.ok ? { kind: "ok", text: r.ok } : { kind: "error", text: r.error ?? "Failed" });
    });
  };

  const test = () =>
    start(async () => {
      setStatus({ kind: "info", text: "Sending test…" });
      const r = await actions.sendTest(design, subject);
      setStatus(r.ok ? { kind: "ok", text: r.ok } : { kind: "error", text: r.error ?? "Failed" });
    });

  const loc = findBlock(design.blocks, selected);
  const columnsParent = loc?.block.type === "columns" ? loc.block : null;

  const panel = (
    <>
          {loc ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{BLOCK_LABELS[loc.block.type]}</h2>
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted underline">Email settings</button>
          </div>
          {loc.parentId && <p className="text-xs text-muted">Inside column {loc.col + 1}</p>}
          <BlockPanel
            block={loc.block}
            defaults={design.settings}
            upload={actions.upload}
            update={(patch) => api.update(loc.block.id, patch)}
            sectionBg={!loc.parentId && loc.block.type !== "hero" ? (v) => api.update(loc.block.id, { sectionBg: v }) : undefined}
            columnCount={columnsParent ? (n) => setBlocks(updateBlock(design.blocks, columnsParent.id, (b) => ({ ...b, columns: resizeColumns(columnsParent, n) }) as typeof b)) : undefined}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-semibold">Email settings</h2>
          <SettingsPanel settings={design.settings} update={(p: Partial<DesignSettings>) => set({ ...design, settings: { ...design.settings, ...p } }, "settings")} />
          <p className="border-t border-line pt-3 text-xs text-muted">
            Tip: click any block to edit it. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, <kbd>Del</kbd> removes, <kbd>Ctrl</kbd>+<kbd>S</kbd> saves.
          </p>
        </div>
      )}
      <p className="mt-6 text-[11px] text-muted">{dirty ? "Unsaved changes" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}` : "All changes saved"}</p>
    </>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-soft">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Link href={`/app/campaigns/${campaign.id}`} className="text-sm text-muted hover:text-ink" onClick={(e) => { if (dirty && !confirm("You have unsaved changes. Leave anyway?")) e.preventDefault(); }}>
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{campaign.name}</p>
          <input
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
            className="w-full max-w-xl truncate rounded border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-line focus:border-frog focus:outline-none"
            aria-label="Subject line"
            placeholder="Subject line"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="History">
          <button type="button" className="btn-secondary px-2.5" disabled={!state.past.length} onClick={() => { dispatch({ type: "undo" }); setDirty(true); }} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
          <button type="button" className="btn-secondary px-2.5" disabled={!state.future.length} onClick={() => { dispatch({ type: "redo" }); setDirty(true); }} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
        </div>
        <div className="hidden items-center overflow-hidden rounded-lg border border-line sm:flex" role="group" aria-label="Canvas width">
          <button type="button" onClick={() => setMobile(false)} className={`px-2.5 py-1.5 text-sm ${!mobile ? "bg-frog-700 text-white" : "bg-white"}`} title="Desktop" aria-pressed={!mobile}>🖥</button>
          <button type="button" onClick={() => setMobile(true)} className={`px-2.5 py-1.5 text-sm ${mobile ? "bg-frog-700 text-white" : "bg-white"}`} title="Mobile" aria-pressed={mobile}>📱</button>
        </div>
        <button type="button" className="btn-secondary" onClick={() => openPreview(mobile ? 375 : 680)} disabled={pending}>Preview</button>
        <button type="button" className="btn-secondary hidden md:inline-flex" onClick={saveTemplate} disabled={pending} title="Save this design to reuse later">Save as template</button>
        <button type="button" className="btn-secondary" onClick={test} disabled={pending}>Send test</button>
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={pending}>
          {dirty ? "Save" : "Saved ✓"}
        </button>
      </header>
      {status && (
        <div role="status" className={`px-4 py-1.5 text-sm ${status.kind === "error" ? "bg-red-50 text-danger" : status.kind === "ok" ? "bg-frog-50 text-forest" : "bg-soft text-muted"}`}>
          {status.text}
          <button type="button" onClick={() => setStatus(null)} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <aside className="w-24 shrink-0 overflow-y-auto border-r border-line bg-white p-2 sm:w-32" aria-label="Add blocks">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Add</p>
          <div className="grid gap-1.5">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => add(p.type)}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-line bg-white px-1 py-2 text-xs font-medium hover:border-frog hover:bg-frog-50"
              >
                <span className="text-base leading-none" aria-hidden>{p.icon}</span>
                {BLOCK_LABELS[p.type]}
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <main className="min-w-0 flex-1 overflow-y-auto pl-8">
          <Canvas design={design} api={api} brand={brand} width={mobile ? 375 : 600} />
        </main>

        {/* Properties */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-white p-4 lg:block" aria-label="Properties">
          {panel}
        </aside>
      </div>

      {/* Small screens: properties as a bottom sheet */}
      <div className="lg:hidden">
        {loc || sheet ? (
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[55dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-white p-4 pt-10 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]" role="dialog" aria-label="Properties">
            <button type="button" onClick={() => { setSelected(null); setSheet(false); }} className="absolute right-3 top-3 text-sm text-muted" aria-label="Close properties">✕</button>
            {panel}
          </div>
        ) : (
          <button type="button" onClick={() => setSheet(true)} className="btn-secondary fixed bottom-4 right-4 z-40 shadow-card">⚙ Email settings</button>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/60 p-4" role="dialog" aria-modal aria-label="Email preview" onClick={() => setPreview(null)}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-t-xl bg-white px-4 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{subject}</p>
              <p className="truncate text-xs text-muted">{design.settings.preheader || "No preview text"} · sample data: Alex Sample</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={`btn-secondary px-2.5 ${preview.width > 400 ? "bg-frog-50" : ""}`} onClick={() => setPreview({ ...preview, width: 680 })}>🖥</button>
              <button type="button" className={`btn-secondary px-2.5 ${preview.width < 400 ? "bg-frog-50" : ""}`} onClick={() => setPreview({ ...preview, width: 375 })}>📱</button>
              <button type="button" className="btn-primary" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-4xl flex-1 justify-center overflow-auto rounded-b-xl bg-soft py-4" onClick={(e) => e.stopPropagation()}>
            <iframe title="Rendered email" srcDoc={preview.html} sandbox="" className="h-full min-h-[70vh] rounded bg-white shadow-card" style={{ width: preview.width }} />
          </div>
        </div>
      )}
    </div>
  );
}
