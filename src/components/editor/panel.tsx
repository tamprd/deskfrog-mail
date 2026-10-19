"use client";
import { useRef, useState } from "react";
import { BLOCK_LABELS, FONTS, SOCIAL_NETWORKS, uid, type Align, type Block, type ChildBlock, type Design, type DesignSettings, type SocialNetwork } from "@/lib/email/design";

type Any = Block | ChildBlock;

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function ColorField({ label, value, onChange, allowClear, fallback = "#000000" }: { label: string; value?: string; onChange: (v: string | undefined) => void; allowClear?: boolean; fallback?: string }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-10 cursor-pointer rounded border border-line bg-white p-0.5" aria-label={`${label} picker`} />
        <input className="input font-mono text-xs" value={value ?? ""} placeholder="Default" onChange={(e) => onChange(e.target.value || undefined)} aria-label={label} />
        {allowClear && value && <button type="button" onClick={() => onChange(undefined)} className="text-xs text-muted underline">Reset</button>}
      </div>
    </Field>
  );
}

function AlignField({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return (
    <Field label="Alignment">
      <div className="inline-flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label="Alignment">
        {(["left", "center", "right"] as Align[]).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value === a} onClick={() => onChange(a)} className={`px-3 py-1.5 text-xs capitalize ${value === a ? "bg-frog-700 text-white" : "bg-white hover:bg-frog-50"}`}>
            {a}
          </button>
        ))}
      </div>
    </Field>
  );
}

function ImageUpload({ onUploaded, upload }: { onUploaded: (url: string) => void; upload: (fd: FormData) => Promise<{ url?: string; error?: string }> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setErr(null);
          const fd = new FormData();
          fd.append("file", f);
          const r = await upload(fd);
          setBusy(false);
          if (r.url) onUploaded(r.url);
          else setErr(r.error ?? "Upload failed");
          e.target.value = "";
        }}
      />
      <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Uploading…" : "⬆ Upload image"}
      </button>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

function BlockFields({
  block,
  update,
  upload,
  columnCount,
  defaults,
  openHtml,
}: {
  openHtml?: (id: string) => void;
  defaults: DesignSettings;
  sectionBg?: (v: string | undefined) => void;
  block: Any;
  update: (patch: Partial<Any>) => void;
  upload: (fd: FormData) => Promise<{ url?: string; error?: string }>;
  columnCount?: (n: number) => void;
}) {
  const u = update as (p: Record<string, unknown>) => void;
  switch (block.type) {
    case "heading":
      return (
        <>
          <Field label="Text"><input className="input" value={block.text} onChange={(e) => u({ text: e.target.value })} /></Field>
          <Field label="Size">
            <select className="input" value={block.level} onChange={(e) => u({ level: Number(e.target.value) })}>
              <option value={1}>Large</option><option value={2}>Medium</option><option value={3}>Small</option>
            </select>
          </Field>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
          <ColorField label="Colour" value={block.color} onChange={(color) => u({ color })} allowClear fallback={defaults.textColor} />
        </>
      );
    case "text":
      return (
        <>
          <p className="text-xs text-muted">Click the text on the canvas to edit it. Use the toolbar for bold, links, lists, colours and merge tags.</p>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
        </>
      );
    case "image":
      return (
        <>
          <ImageUpload upload={upload} onUploaded={(src) => u({ src })} />
          <Field label="…or image URL"><input className="input text-xs" value={block.src} placeholder="https://" onChange={(e) => u({ src: e.target.value })} /></Field>
          <Field label="Alt text" hint="Describes the image for screen readers and when images are blocked."><input className="input" value={block.alt} onChange={(e) => u({ alt: e.target.value })} /></Field>
          <Field label="Link (optional)"><input className="input" value={block.href ?? ""} placeholder="https://" onChange={(e) => u({ href: e.target.value || undefined })} /></Field>
          <Field label={`Width · ${block.width}%`}><input type="range" min={10} max={100} step={5} value={block.width} onChange={(e) => u({ width: Number(e.target.value) })} className="w-full accent-frog-700" /></Field>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!block.rounded} onChange={(e) => u({ rounded: e.target.checked })} className="accent-frog-700" /> Rounded corners</label>
        </>
      );
    case "button":
      return (
        <>
          <Field label="Label"><input className="input" value={block.label} onChange={(e) => u({ label: e.target.value })} /></Field>
          <Field label="Link"><input className="input" value={block.href} placeholder="https://" onChange={(e) => u({ href: e.target.value })} /></Field>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
          <ColorField label="Button colour" value={block.bg} onChange={(bg) => u({ bg })} allowClear fallback={defaults.buttonColor} />
          <ColorField label="Text colour" value={block.color} onChange={(color) => u({ color })} allowClear fallback="#FFFFFF" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!block.fullWidth} onChange={(e) => u({ fullWidth: e.target.checked })} className="accent-frog-700" /> Full width</label>
        </>
      );
    case "divider":
      return (
        <>
          <ColorField label="Colour" value={block.color} onChange={(color) => u({ color })} allowClear fallback="#E5E7EB" />
          <Field label={`Thickness · ${block.thickness}px`}><input type="range" min={1} max={8} value={block.thickness} onChange={(e) => u({ thickness: Number(e.target.value) })} className="w-full accent-frog-700" /></Field>
        </>
      );
    case "spacer":
      return <Field label={`Height · ${block.height}px`}><input type="range" min={4} max={120} step={4} value={block.height} onChange={(e) => u({ height: Number(e.target.value) })} className="w-full accent-frog-700" /></Field>;
    case "logo":
      return (
        <>
          <p className="text-xs text-muted">Uses the logo from Settings → Brand.</p>
          <Field label={`Width · ${block.width}px`}><input type="range" min={40} max={300} step={10} value={block.width} onChange={(e) => u({ width: Number(e.target.value) })} className="w-full accent-frog-700" /></Field>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
        </>
      );
    case "social":
      return (
        <>
          {block.links.map((l, i) => (
            <div key={i} className="flex gap-1">
              <select className="input w-28" value={l.network} aria-label="Network" onChange={(e) => u({ links: block.links.map((x, j) => (j === i ? { ...x, network: e.target.value as SocialNetwork } : x)) })}>
                {SOCIAL_NETWORKS.map((n) => <option key={n} value={n}>{n === "x" ? "X" : n[0].toUpperCase() + n.slice(1)}</option>)}
              </select>
              <input className="input text-xs" value={l.url} aria-label="Profile URL" onChange={(e) => u({ links: block.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" aria-label="Remove" onClick={() => u({ links: block.links.filter((_, j) => j !== i) })} className="px-1 text-muted hover:text-danger">✕</button>
            </div>
          ))}
          <button type="button" className="btn-secondary w-full" onClick={() => u({ links: [...block.links, { network: "web", url: "https://" }] })}>+ Add link</button>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
        </>
      );
    case "hero":
      return (
        <>
          <Field label="Small label above (optional)"><input className="input" value={block.eyebrow ?? ""} placeholder="ROUND 4 · NOVEMBER" onChange={(e) => u({ eyebrow: e.target.value })} /></Field>
          <Field label="Headline"><input className="input" value={block.heading} onChange={(e) => u({ heading: e.target.value })} /></Field>
          <Field label="Text"><textarea className="input min-h-[80px]" value={block.text} onChange={(e) => u({ text: e.target.value })} /></Field>
          <Field label="Button label" hint="Leave empty for no button."><input className="input" value={block.buttonLabel} onChange={(e) => u({ buttonLabel: e.target.value })} /></Field>
          <Field label="Button link"><input className="input" value={block.buttonHref} placeholder="https://" onChange={(e) => u({ buttonHref: e.target.value })} /></Field>
          <AlignField value={block.align} onChange={(align) => u({ align })} />
          <ColorField label="Background" value={block.bg} onChange={(bg) => bg && u({ bg })} />
          <ColorField label="Text colour" value={block.textColor} onChange={(textColor) => textColor && u({ textColor })} />
          <ColorField label="Button colour" value={block.buttonBg} onChange={(buttonBg) => u({ buttonBg })} allowClear fallback="#FFFFFF" />
          <ColorField label="Button text" value={block.buttonColor} onChange={(buttonColor) => u({ buttonColor })} allowClear fallback={defaults.buttonColor} />
          <Field label="Background photo (optional)" hint="Shown behind the text in Apple Mail, Gmail and most phones; Outlook shows the colour instead. Pick a dark photo so the text stays readable.">
            <ImageUpload upload={upload} onUploaded={(image) => u({ image })} />
          </Field>
          {block.image && <button type="button" className="text-xs text-danger underline" onClick={() => u({ image: undefined })}>Remove photo</button>}
        </>
      );
    case "html":
      return (
        <>
          <button type="button" className="btn-primary w-full" onClick={() => openHtml?.(block.id)}>{"</>"} Open code editor</button>
          <p className="text-xs text-muted">
            {block.html.split("\n").length} lines · {block.html.length.toLocaleString("en-AU")} chars. Full-screen editor with syntax highlighting and a live preview. You can also double-click the block on the canvas.
          </p>
          <p className="text-[11px] text-muted">Use tables and inline styles — email clients ignore most modern CSS.</p>
        </>
      );
    case "columns":
      return (
        <>
          <Field label="Columns">
            <div className="inline-flex overflow-hidden rounded-lg border border-line">
              {[2, 3].map((n) => (
                <button key={n} type="button" onClick={() => columnCount?.(n)} className={`px-4 py-1.5 text-sm ${block.columns.length === n ? "bg-frog-700 text-white" : "bg-white hover:bg-frog-50"}`}>{n}</button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.stackOnMobile} onChange={(e) => u({ stackOnMobile: e.target.checked })} className="accent-frog-700" /> Stack on mobile</label>
          <p className="text-xs text-muted">Hover a column on the canvas and use “+ Add” to put blocks in it. Click a block inside to edit it.</p>
        </>
      );
  }
}

export function BlockPanel(props: Parameters<typeof BlockFields>[0]) {
  return (
    <>
      <BlockFields {...props} />
      {props.sectionBg && (
        <div className="border-t border-line pt-4">
          <ColorField label="Section background" value={props.block.sectionBg} onChange={props.sectionBg} allowClear fallback={props.defaults.contentBackground} />
        </div>
      )}
    </>
  );
}

export function SettingsPanel({ settings, update }: { settings: DesignSettings; update: (p: Partial<DesignSettings>) => void }) {
  return (
    <>
      <Field label="Preview text" hint="Shown after the subject line in most inboxes.">
        <input className="input" value={settings.preheader} maxLength={150} onChange={(e) => update({ preheader: e.target.value })} placeholder="A quick summary…" />
      </Field>
      <Field label="Font">
        <select className="input" value={settings.font} onChange={(e) => update({ font: e.target.value })}>
          {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
      </Field>
      <ColorField label="Background" value={settings.background} onChange={(v) => v && update({ background: v })} />
      <ColorField label="Email body" value={settings.contentBackground} onChange={(v) => v && update({ contentBackground: v })} />
      <ColorField label="Text" value={settings.textColor} onChange={(v) => v && update({ textColor: v })} />
      <ColorField label="Links" value={settings.linkColor} onChange={(v) => v && update({ linkColor: v })} />
      <ColorField label="Buttons" value={settings.buttonColor} onChange={(v) => v && update({ buttonColor: v })} />
    </>
  );
}

export function resizeColumns(b: Extract<Block, { type: "columns" }>, n: number) {
  const cols = b.columns.slice(0, n);
  while (cols.length < n) cols.push([{ id: uid(), type: "text", html: "<p>New column</p>", align: "left" }]);
  // Fold content from removed columns into the last remaining one so nothing is lost.
  const dropped = b.columns.slice(n).flat();
  if (dropped.length) cols[n - 1] = [...cols[n - 1], ...dropped];
  return cols;
}

export const labelFor = (b: Any) => BLOCK_LABELS[b.type];
export type { Design };
