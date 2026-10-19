"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MediaPickerModal, type MediaActions } from "@/components/media-library";
import { MERGE_TAGS } from "./rich-text";

const CodeEditor = dynamic(() => import("./code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading editor…</div>,
});

type Actions = {
  save: (content: string, subject: string) => Promise<{ ok?: boolean; error?: string; savedAt?: string }>;
  preview: (content: string, format: "html" | "text", fromName: string) => Promise<{ html?: string; text?: string }>;
  sendTest: (content: string, subject: string) => Promise<{ ok?: string; error?: string }>;
  media: MediaActions;
};

const PREFS_KEY = "df-code-prefs";

/** Full-page editor for campaigns authored as raw HTML or plain text (sent exactly as written). */
export function SourceEditor({
  format,
  initial,
  campaign,
  actions,
}: {
  format: "html" | "text";
  initial: string;
  campaign: { id: string; name: string; subject: string; fromName: string };
  actions: Actions;
}) {
  const [content, setContent] = useState(initial);
  const [subject, setSubject] = useState(campaign.subject);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [live, setLive] = useState(initial);
  const [full, setFull] = useState<{ html?: string; text?: string } | null>(null);
  const [width, setWidth] = useState(600);
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [prefs, setPrefs] = useState({ dark: true, wrap: true, fontSize: 14 });
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const insert = useRef<((t: string) => void) | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { setPrefs((p) => ({ ...p, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") })); } catch { /* ignore */ }
  }, []);
  const updatePrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const edit = (v: string) => { setContent(v); setDirty(true); };
  useEffect(() => { const t = setTimeout(() => setLive(content), 300); return () => clearTimeout(t); }, [content]);

  const save = useCallback((quiet = false) => start(async () => {
    const r = await actions.save(content, subject);
    if (r.ok) { setDirty(false); if (!quiet) setStatus({ kind: "ok", text: "Saved" }); }
    else setStatus({ kind: "error", text: r.error ?? "Couldn't save" });
  }), [actions, content, subject]);

  useEffect(() => { if (!dirty) return; const t = setTimeout(() => save(true), 4000); return () => clearTimeout(t); }, [dirty, save]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  useEffect(() => {
    if (format !== "text") return; // CodeMirror handles Ctrl+S itself
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [format, save]);

  const insertText = (t: string) => {
    if (format === "html") return insert.current?.(t);
    const el = textRef.current;
    if (!el) return edit(content + t);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    edit(content.slice(0, a) + t + content.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + t.length, a + t.length); });
  };

  const fullPreview = () => start(async () => setFull(await actions.preview(content, format, campaign.fromName)));
  const test = () => start(async () => {
    setStatus({ kind: "info", text: "Sending test…" });
    const r = await actions.sendTest(content, subject);
    setStatus(r.ok ? { kind: "ok", text: r.ok } : { kind: "error", text: r.error ?? "Failed" });
  });

  const lines = content.split("\n").length;

  return (
    <div className="flex h-[100dvh] flex-col bg-soft">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2.5">
        <Link href={`/app/campaigns/${campaign.id}`} className="text-sm text-muted hover:text-ink" onClick={(e) => { if (dirty && !confirm("You have unsaved changes. Leave anyway?")) e.preventDefault(); }}>← Back</Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{campaign.name} · <span className="font-semibold">{format === "html" ? "Custom HTML" : "Plain text"}</span></p>
          <input value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} className="w-full max-w-xl truncate rounded border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-line focus:border-frog focus:outline-none" aria-label="Subject line" placeholder="Subject line" />
        </div>
        <select aria-label="Insert merge tag" className="input w-auto py-1.5 text-xs" value="" onChange={(e) => e.target.value && insertText(e.target.value)}>
          <option value="">+ Merge tag</option>
          {MERGE_TAGS.map((m) => <option key={m.tag} value={m.tag}>{m.label}</option>)}
        </select>
        {format === "html" && (
          <>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setPicking(true)}>🖼 Insert image</button>
            <div className="hidden items-center overflow-hidden rounded-lg border border-line text-sm lg:flex" role="group" aria-label="Text size">
              <button type="button" className="px-2.5 py-1.5 hover:bg-frog-50" onClick={() => updatePrefs({ fontSize: Math.max(11, prefs.fontSize - 1) })} aria-label="Smaller code text">A−</button>
              <span className="px-1 text-xs tabular-nums text-muted">{prefs.fontSize}px</span>
              <button type="button" className="px-2.5 py-1.5 hover:bg-frog-50" onClick={() => updatePrefs({ fontSize: Math.min(22, prefs.fontSize + 1) })} aria-label="Larger code text">A+</button>
            </div>
            <button type="button" className="btn-secondary hidden px-3 py-1.5 lg:inline-flex" onClick={() => updatePrefs({ dark: !prefs.dark })}>{prefs.dark ? "☀︎" : "☾"}</button>
          </>
        )}
        <div className="flex overflow-hidden rounded-lg border border-line md:hidden" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")} className={`px-3 py-1.5 text-sm ${tab === "code" ? "bg-frog-700 text-white" : ""}`}>Edit</button>
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={`px-3 py-1.5 text-sm ${tab === "preview" ? "bg-frog-700 text-white" : ""}`}>Preview</button>
        </div>
        <button type="button" className="btn-secondary" onClick={fullPreview} disabled={pending}>Preview</button>
        <button type="button" className="btn-secondary" onClick={test} disabled={pending}>Send test</button>
        <button type="button" className="btn-primary" onClick={() => save()} disabled={pending}>{dirty ? "Save" : "Saved ✓"}</button>
      </header>
      {status && (
        <div role="status" className={`px-4 py-1.5 text-sm ${status.kind === "error" ? "bg-red-50 text-danger" : status.kind === "ok" ? "bg-frog-50 text-forest" : "bg-soft text-muted"}`}>
          {status.text} <button type="button" onClick={() => setStatus(null)} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={`min-w-0 flex-1 ${tab === "code" ? "block" : "hidden"} md:block md:basis-1/2 lg:basis-3/5`}>
          {format === "html" ? (
            <CodeEditor value={initial} onChange={edit} dark={prefs.dark} wrap={prefs.wrap} fontSize={prefs.fontSize} onSave={() => save()} onReady={(fn) => (insert.current = fn)} />
          ) : (
            <textarea
              ref={textRef}
              value={content}
              onChange={(e) => edit(e.target.value)}
              className="h-full w-full resize-none border-0 bg-white p-6 font-mono text-[15px] leading-relaxed text-ink focus:outline-none"
              placeholder={"Hi {{first_name|there}},\n\nWrite your email here. What you type is exactly what people receive.\n\nCheers,\nAdam"}
              aria-label="Plain text email"
              spellCheck
            />
          )}
        </div>
        <div className={`min-w-0 flex-1 flex-col border-l border-line ${tab === "preview" ? "flex" : "hidden"} md:flex md:basis-1/2 lg:basis-2/5`}>
          <div className="flex items-center justify-between border-b border-line bg-white px-3 py-1.5 text-xs text-muted">
            <span>{format === "html" ? "Live preview · sent exactly as written" : "How it reads in an inbox"} · {lines} lines</span>
            {format === "html" && (
              <span className="flex overflow-hidden rounded border border-line">
                <button type="button" onClick={() => setWidth(600)} className={`px-2 py-0.5 ${width === 600 ? "bg-frog-700 text-white" : ""}`} title="Desktop">🖥</button>
                <button type="button" onClick={() => setWidth(375)} className={`px-2 py-0.5 ${width === 375 ? "bg-frog-700 text-white" : ""}`} title="Mobile">📱</button>
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-soft p-3">
            {format === "html" ? (
              <iframe title="HTML preview" sandbox="" srcDoc={live} className="h-full min-h-[400px] rounded bg-white shadow-card" style={{ width, maxWidth: "100%" }} />
            ) : (
              <div className="w-full max-w-[640px] whitespace-pre-wrap break-words rounded bg-white p-6 font-mono text-sm leading-relaxed shadow-card">{live || <span className="text-muted">Nothing yet.</span>}</div>
            )}
          </div>
        </div>
      </div>
      <footer className="border-t border-line bg-white px-4 py-1.5 text-[11px] text-muted">
        {format === "html"
          ? "Your HTML is sent as-is. The unsubscribe footer is added just before </body>. Use tables and inline styles for best results."
          : "Plain-text emails have no images or formatting, and land in inboxes like a personal note. The unsubscribe line is added at the bottom."}
      </footer>

      {picking && (
        <MediaPickerModal
          actions={actions.media}
          pickLabel="Insert"
          onClose={() => setPicking(false)}
          onPick={(i) => insertText(`<img src="${i.url}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`)}
        />
      )}

      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/60 p-4" role="dialog" aria-modal aria-label="Email preview" onClick={() => setFull(null)}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between rounded-t-xl bg-white px-4 py-2" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-semibold">{subject} <span className="font-normal text-muted">· sample data: Alex Sample</span></p>
            <button type="button" className="btn-primary" onClick={() => setFull(null)}>Close</button>
          </div>
          <div className="mx-auto flex w-full max-w-4xl flex-1 justify-center overflow-auto rounded-b-xl bg-soft py-4" onClick={(e) => e.stopPropagation()}>
            {full.html !== undefined ? (
              <iframe title="Rendered email" sandbox="" srcDoc={full.html} className="h-full min-h-[70vh] w-full max-w-[680px] rounded bg-white shadow-card" />
            ) : (
              <pre className="h-fit w-full max-w-[640px] whitespace-pre-wrap rounded bg-white p-6 font-mono text-sm shadow-card">{full.text}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
