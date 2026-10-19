"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { MediaPickerModal } from "@/components/media-library";
import { MediaContext } from "./panel";
import dynamic from "next/dynamic";
import { FONTS, type DesignSettings } from "@/lib/email/design";

// CodeMirror touches `window`; load it client-side only.
const CodeEditor = dynamic(() => import("./code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading editor…</div>,
});

/** Wrap an HTML snippet in a page that looks like the email body around it. */
export function snippetDoc(html: string, s: DesignSettings, width = 600) {
  const font = FONTS[s.font] ?? FONTS.inter;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
${font.href ? `<link rel="stylesheet" href="${font.href}">` : ""}
<style>html,body{margin:0;background:${s.background}}body{padding:16px 0;font-family:${font.stack};color:${s.textColor};font-size:16px;line-height:1.6}
.df-wrap{max-width:${width}px;margin:0 auto;background:${s.contentBackground};padding:8px 24px}a{color:${s.linkColor}}img{max-width:100%}</style>
</head><body><div class="df-wrap">${html}</div></body></html>`;
}

const PREFS_KEY = "df-code-prefs";
type Prefs = { dark: boolean; wrap: boolean; fontSize: number };

function loadPrefs(): Prefs {
  try {
    return { dark: true, wrap: true, fontSize: 14, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { dark: true, wrap: true, fontSize: 14 };
  }
}

export function HtmlModal({
  initial,
  settings,
  onApply,
  onClose,
}: {
  initial: string;
  settings: DesignSettings;
  onApply: (html: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initial);
  const [prefs, setPrefs] = useState<Prefs>({ dark: true, wrap: true, fontSize: 14 });
  const [width, setWidth] = useState(600);
  const [tab, setTab] = useState<"code" | "preview">("code"); // small screens only
  const [preview, setPreview] = useState(initial);
  const media = useContext(MediaContext);
  const [picking, setPicking] = useState(false);
  const insert = useRef<((text: string) => void) | null>(null);
  const dirty = code !== initial;

  useEffect(() => setPrefs(loadPrefs()), []);
  const updatePrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Debounce the live preview so typing stays smooth.
  useEffect(() => {
    const t = setTimeout(() => setPreview(code), 300);
    return () => clearTimeout(t);
  }, [code]);

  const cancel = () => {
    if (dirty && !confirm("Discard your HTML changes?")) return;
    onClose();
  };
  const apply = () => {
    onApply(code);
    onClose();
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !picking) {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const lines = code.split("\n").length;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink/70 sm:p-4" role="dialog" aria-modal aria-label="Edit HTML">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-2xl sm:rounded-xl">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="font-semibold">Edit HTML</h2>
          <span className="text-xs text-muted">{lines} lines · {code.length.toLocaleString("en-AU")} chars{dirty ? " · edited" : ""}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-line md:hidden" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")} className={`px-3 py-1.5 text-sm ${tab === "code" ? "bg-frog-700 text-white" : ""}`}>Code</button>
              <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={`px-3 py-1.5 text-sm ${tab === "preview" ? "bg-frog-700 text-white" : ""}`}>Preview</button>
            </div>
            <div className="flex items-center overflow-hidden rounded-lg border border-line text-sm" role="group" aria-label="Text size">
              <button type="button" className="px-2.5 py-1.5 hover:bg-frog-50" onClick={() => updatePrefs({ fontSize: Math.max(11, prefs.fontSize - 1) })} aria-label="Smaller code text">A−</button>
              <span className="px-1 text-xs tabular-nums text-muted">{prefs.fontSize}px</span>
              <button type="button" className="px-2.5 py-1.5 hover:bg-frog-50" onClick={() => updatePrefs({ fontSize: Math.min(22, prefs.fontSize + 1) })} aria-label="Larger code text">A+</button>
            </div>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => updatePrefs({ wrap: !prefs.wrap })} aria-pressed={prefs.wrap}>{prefs.wrap ? "Wrap: on" : "Wrap: off"}</button>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => updatePrefs({ dark: !prefs.dark })} aria-label="Toggle dark theme">{prefs.dark ? "☀︎ Light" : "☾ Dark"}</button>
            <div className="hidden overflow-hidden rounded-lg border border-line md:flex" role="group" aria-label="Preview width">
              <button type="button" onClick={() => setWidth(600)} className={`px-2.5 py-1.5 text-sm ${width === 600 ? "bg-frog-700 text-white" : ""}`} title="Desktop preview">🖥</button>
              <button type="button" onClick={() => setWidth(375)} className={`px-2.5 py-1.5 text-sm ${width === 375 ? "bg-frog-700 text-white" : ""}`} title="Mobile preview">📱</button>
            </div>
            {media && <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setPicking(true)} title="Insert an image from your media library">🖼 Insert image</button>}
            <button type="button" className="btn-secondary" onClick={cancel}>Cancel</button>
            <button type="button" className="btn-primary" onClick={apply} title="Apply (Ctrl+S)">Apply</button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className={`min-w-0 flex-1 ${tab === "code" ? "block" : "hidden"} md:block md:basis-1/2 lg:basis-3/5`}>
            <CodeEditor value={initial} onChange={setCode} dark={prefs.dark} wrap={prefs.wrap} fontSize={prefs.fontSize} onSave={apply} onReady={(fn) => (insert.current = fn)} />
          </div>
          <div className={`min-w-0 flex-1 flex-col border-l border-line bg-soft ${tab === "preview" ? "flex" : "hidden"} md:flex md:basis-1/2 lg:basis-2/5`}>
            <p className="border-b border-line px-3 py-1.5 text-xs text-muted">Live preview · scripts are blocked, as in real inboxes</p>
            <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3">
              <iframe title="HTML preview" sandbox="" srcDoc={snippetDoc(preview, settings, width)} className="h-full min-h-[400px] rounded bg-white shadow-card" style={{ width: Math.min(width + 32, 2000), maxWidth: "100%" }} />
            </div>
          </div>
        </div>
        {picking && media && (
          <MediaPickerModal
            actions={media}
            pickLabel="Insert"
            onClose={() => setPicking(false)}
            onPick={(i) => {
              const tag = `<img src="${i.url}" alt="" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:0">`;
              if (insert.current) insert.current(tag);
              else setCode((c) => c + "\n" + tag);
            }}
          />
        )}
        <footer className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Tip: email clients ignore most modern CSS — use tables and inline styles. <kbd>Ctrl</kbd>+<kbd>S</kbd> applies, <kbd>Esc</kbd> cancels, <kbd>Ctrl</kbd>+<kbd>F</kbd> finds.
        </footer>
      </div>
    </div>
  );
}
