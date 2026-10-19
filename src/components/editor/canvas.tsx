"use client";
/* eslint-disable @next/next/no-img-element */
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BLOCK_LABELS, CHILD_TYPES, FONTS, newBlock, type Block, type Brand, type ChildBlock, type Design } from "@/lib/email/design";
import { RichText } from "./rich-text";

export type CanvasApi = {
  selected: string | null;
  select: (id: string | null) => void;
  update: (id: string, patch: Partial<Block> | Partial<ChildBlock>) => void;
  setBlocks: (blocks: Block[]) => void;
  move: (id: string, dir: -1 | 1) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  addChild: (columnsId: string, col: number, type: ChildBlock["type"]) => void;
};

const HEADING_SIZE = { 1: 32, 2: 24, 3: 20 } as const;
const justify = { left: "flex-start", center: "center", right: "flex-end" } as const;

function ActionBar({ id, api, label }: { id: string; api: CanvasApi; label: string }) {
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div className="absolute -top-3 right-2 z-30 flex items-center gap-0.5 rounded-md bg-forest px-1 py-0.5 text-[11px] font-semibold text-white shadow">
      <span className="px-1">{label}</span>
      <button type="button" aria-label="Move up" title="Move up" onClick={act(() => api.move(id, -1))} className="rounded px-1 hover:bg-white/20">↑</button>
      <button type="button" aria-label="Move down" title="Move down" onClick={act(() => api.move(id, 1))} className="rounded px-1 hover:bg-white/20">↓</button>
      <button type="button" aria-label="Duplicate" title="Duplicate" onClick={act(() => api.duplicate(id))} className="rounded px-1 hover:bg-white/20">⧉</button>
      <button type="button" aria-label="Delete" title="Delete" onClick={act(() => api.remove(id))} className="rounded px-1 hover:bg-red-500">✕</button>
    </div>
  );
}

function ChildView({ b, d, api, brand }: { b: ChildBlock; d: Design; api: CanvasApi; brand: Partial<Brand> }) {
  const s = d.settings;
  const active = api.selected === b.id;
  switch (b.type) {
    case "heading":
      return (
        <div style={{ padding: "8px 24px", textAlign: b.align, color: b.color ?? s.textColor, fontSize: HEADING_SIZE[b.level], fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {active ? (
            <input
              autoFocus
              value={b.text}
              onChange={(e) => api.update(b.id, { text: e.target.value })}
              className="w-full bg-transparent outline-none"
              style={{ textAlign: b.align, font: "inherit", color: "inherit" }}
              aria-label="Heading text"
            />
          ) : (
            b.text || <span className="opacity-40">Heading</span>
          )}
        </div>
      );
    case "text":
      return (
        <RichText
          html={b.html}
          active={active}
          onChange={(html) => api.update(b.id, { html })}
          swatches={[s.textColor, s.linkColor, "#6B7280", "#B91C1C", "#0F766E"]}
          style={{ padding: "8px 24px", textAlign: b.align, color: s.textColor, fontSize: 16, lineHeight: 1.6, ["--df-link" as string]: s.linkColor }}
        />
      );
    case "image":
      return (
        <div style={{ padding: "8px 24px", display: "flex", justifyContent: justify[b.align] }}>
          {b.src ? (
            <img src={b.src} alt={b.alt} style={{ width: `${b.width}%`, borderRadius: b.rounded ? 12 : 0, display: "block" }} />
          ) : (
            <div className="grid w-full place-items-center rounded-lg border-2 border-dashed border-frog-200 bg-frog-50 py-10 text-sm text-forest" style={{ width: `${b.width}%` }}>
              🖼️ Add an image
            </div>
          )}
        </div>
      );
    case "button":
      return (
        <div style={{ padding: "12px 24px", display: "flex", justifyContent: justify[b.align] }}>
          <span
            style={{ background: b.bg ?? s.buttonColor, color: b.color ?? "#fff", padding: "12px 24px", borderRadius: 8, fontWeight: 700, display: "inline-block", width: b.fullWidth ? "100%" : undefined, textAlign: "center" }}
          >
            {b.label || "Button"}
          </span>
        </div>
      );
    case "divider":
      return <div style={{ padding: "12px 24px" }}><div style={{ borderTop: `${b.thickness}px solid ${b.color ?? "#E5E7EB"}` }} /></div>;
    case "spacer":
      return <div style={{ height: b.height }} className={active ? "bg-frog-50" : ""} />;
  }
  void brand;
}

function BlockView({ b, d, api, brand }: { b: Block; d: Design; api: CanvasApi; brand: Partial<Brand> }) {
  const s = d.settings;
  switch (b.type) {
    case "logo":
      return (
        <div style={{ padding: "24px 24px 8px", display: "flex", justifyContent: justify[b.align] }}>
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="Logo" style={{ width: b.width, maxWidth: "100%" }} />
          ) : (
            <div className="rounded-lg border-2 border-dashed border-frog-200 bg-frog-50 px-6 py-4 text-sm text-forest">Add your logo in Settings → Brand</div>
          )}
        </div>
      );
    case "social":
      return (
        <div style={{ padding: "12px 24px", display: "flex", gap: 8, justifyContent: justify[b.align] }}>
          {b.links.map((l, i) => (
            <span key={i} title={l.network} style={{ background: s.buttonColor }} className="grid h-7 w-7 place-items-center rounded text-[10px] font-bold uppercase text-white">
              {l.network === "x" ? "𝕏" : l.network.slice(0, 2)}
            </span>
          ))}
        </div>
      );
    case "html":
      return (
        <div style={{ padding: "8px 24px" }}>
          <div className="rounded border border-dashed border-line bg-soft p-3 font-mono text-xs text-muted">
            {"</>"} Custom HTML · {b.html.length} chars <span className="text-[11px]">(shown in Preview)</span>
          </div>
        </div>
      );
    case "columns":
      return (
        <div style={{ padding: "0 12px", display: "grid", gridTemplateColumns: `repeat(${b.columns.length}, 1fr)` }}>
          {b.columns.map((col, ci) => (
            <div key={ci} className="min-h-12 border border-dashed border-transparent hover:border-frog-200">
              {col.map((c) => (
                <Selectable key={c.id} id={c.id} api={api} label={BLOCK_LABELS[c.type]}>
                  <ChildView b={c} d={d} api={api} brand={brand} />
                </Selectable>
              ))}
              <div className="flex justify-center py-1 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
                <select
                  aria-label={`Add block to column ${ci + 1}`}
                  className="rounded border border-frog-200 bg-white px-1 text-xs text-forest"
                  value=""
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => e.target.value && api.addChild(b.id, ci, e.target.value as ChildBlock["type"])}
                >
                  <option value="">+ Add</option>
                  {CHILD_TYPES.map((t) => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      );
    default:
      return <ChildView b={b} d={d} api={api} brand={brand} />;
  }
}

function Selectable({ id, api, label, children }: { id: string; api: CanvasApi; label: string; children: React.ReactNode }) {
  const active = api.selected === id;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        api.select(id);
      }}
      className={`relative cursor-pointer outline-offset-[-2px] ${active ? "outline-2 outline-frog-700 outline" : "hover:outline hover:outline-1 hover:outline-frog"}`}
    >
      {active && <ActionBar id={id} api={api} label={label} />}
      {children}
    </div>
  );
}

function SortableBlock({ b, d, api, brand }: { b: Block; d: Design; api: CanvasApi; brand: Partial<Brand> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 40 : undefined }} className="group relative">
      <button
        type="button"
        aria-label={`Drag to reorder ${BLOCK_LABELS[b.type]}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className="absolute -left-8 top-1/2 z-20 hidden -translate-y-1/2 cursor-grab rounded p-1 text-muted hover:bg-white hover:text-ink group-hover:block md:block md:opacity-0 md:group-hover:opacity-100"
      >
        ⠿
      </button>
      <Selectable id={b.id} api={api} label={BLOCK_LABELS[b.type]}>
        <BlockView b={b} d={d} api={api} brand={brand} />
      </Selectable>
    </div>
  );
}

export function Canvas({ design, api, brand, width }: { design: Design; api: CanvasApi; brand: Partial<Brand>; width: number }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const s = design.settings;
  const font = FONTS[s.font] ?? FONTS.inter;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = design.blocks.findIndex((b) => b.id === e.active.id);
    const to = design.blocks.findIndex((b) => b.id === e.over!.id);
    if (from >= 0 && to >= 0) api.setBlocks(arrayMove(design.blocks, from, to));
  };

  return (
    <div className="min-h-full px-4 py-8 sm:px-10" style={{ background: s.background }} onClick={() => api.select(null)}>
      {font.href && <link rel="stylesheet" href={font.href} />}
      <div
        className="mx-auto shadow-card transition-[max-width]"
        style={{ maxWidth: width, background: s.contentBackground, fontFamily: font.stack, color: s.textColor }}
      >
        {design.blocks.length === 0 && (
          <div className="px-6 py-20 text-center text-muted">
            <p className="text-lg font-semibold text-ink">Empty email</p>
            <p className="text-sm">Add blocks from the left to get started.</p>
          </div>
        )}
        <DndContext id="df-canvas" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={design.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {design.blocks.map((b) => <SortableBlock key={b.id} b={b} d={design} api={api} brand={brand} />)}
          </SortableContext>
        </DndContext>
        <div className="border-t border-line px-6 py-4 text-center text-xs text-muted">
          Unsubscribe link and sender details are added here automatically.
        </div>
      </div>
    </div>
  );
}

export { newBlock };
