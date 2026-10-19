"use client";
import { useState } from "react";
import { TemplateThumb } from "@/components/template-thumb";

type Option = { key: string; name: string; category: string; previewHtml: string };
type Mode = "template" | "blank" | "html" | "text" | "ai";

const MODES: { id: Mode; icon: string; title: string; blurb: string }[] = [
  { id: "template", icon: "🎨", title: "Template", blurb: "Start from a ready-made design" },
  { id: "blank", icon: "🧱", title: "Drag & drop", blurb: "Build it block by block" },
  { id: "html", icon: "</>", title: "Paste HTML", blurb: "Your own code, sent as-is" },
  { id: "text", icon: "✉️", title: "Plain text", blurb: "Simple, personal, no images" },
  { id: "ai", icon: "✨", title: "Write with AI", blurb: "Describe it, get a design" },
];

/** The "Start with" section of the New campaign form. All inputs post with the form. */
export function ContentChooser({ options, preset, ai }: { options: Option[]; preset: string; ai: { used: number; limit: number } }) {
  const [mode, setMode] = useState<Mode>("template");
  const left = Math.max(0, ai.limit - ai.used);

  return (
    <fieldset className="space-y-4">
      <legend className="label">Start with</legend>
      <input type="hidden" name="mode" value={mode} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="How do you want to build this email?">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-xl border-2 p-3 text-left transition-colors ${mode === m.id ? "border-frog-700 bg-frog-50" : "border-line bg-white hover:border-frog"}`}
          >
            <span className="block text-lg leading-none" aria-hidden>{m.icon}</span>
            <span className="mt-1.5 block text-sm font-semibold">{m.title}</span>
            <span className="block text-[11px] leading-snug text-muted">{m.blurb}</span>
          </button>
        ))}
      </div>

      {mode === "template" && (
        <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto rounded-xl border border-line bg-soft p-3 sm:grid-cols-3">
          {options.map((t) => (
            <label key={t.key} className="cursor-pointer">
              <input type="radio" name="template" value={t.key} defaultChecked={t.key === preset} className="peer sr-only" />
              <span className="block h-full rounded-xl border-2 border-transparent bg-white p-2 transition-colors peer-checked:border-frog-700 peer-checked:bg-frog-50 peer-focus-visible:ring-2 peer-focus-visible:ring-frog hover:border-frog">
                <TemplateThumb html={t.previewHtml} title={t.name} />
                <span className="mt-2 block truncate text-sm font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-muted">{t.category === "Yours" ? "Your template" : t.category}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {mode === "blank" && (
        <p className="rounded-xl border border-line bg-soft p-4 text-sm text-muted">
          Opens the drag-and-drop editor with an empty email (your logo at the top). Add headings, text, images, buttons and columns from the left-hand panel.
        </p>
      )}

      {mode === "html" && (
        <div>
          <label className="label" htmlFor="html_paste">Paste your HTML <span className="font-normal text-muted">(a full email or a snippet)</span></label>
          <textarea
            id="html_paste"
            name="html_paste"
            rows={14}
            required
            spellCheck={false}
            className="input font-mono text-[13px] leading-relaxed"
            placeholder={'<!doctype html>\n<html>\n  <body>\n    <table role="presentation" width="100%">…</table>\n  </body>\n</html>'}
          />
          <p className="mt-1 text-xs text-muted">Sent exactly as written. We add the unsubscribe footer just before <code>&lt;/body&gt;</code>. You can keep editing it in a full-screen code editor next.</p>
        </div>
      )}

      {mode === "text" && (
        <div>
          <label className="label" htmlFor="plain_text">Your message</label>
          <textarea
            id="plain_text"
            name="plain_text"
            rows={12}
            className="input font-mono text-sm leading-relaxed"
            placeholder={"Hi {{first_name|there}},\n\nQuick one from me…\n\nCheers,\nAdam"}
          />
          <p className="mt-1 text-xs text-muted">No images or formatting — just words. Great for personal notes; often lands in the main inbox. You can leave this empty and write it in the next step.</p>
        </div>
      )}

      {mode === "ai" && (
        <div className="rounded-xl border border-frog-200 bg-frog-50 p-4">
          <label className="label flex items-center justify-between" htmlFor="ai_brief">
            <span>Describe the email</span>
            <span className="text-xs font-normal text-muted">{left} of {ai.limit} AI credits left this month</span>
          </label>
          <textarea
            id="ai_brief"
            name="ai_brief"
            rows={5}
            maxLength={3000}
            required
            className="input bg-white"
            placeholder="e.g. Entries open for Round 4 of Budget Enduro at Queensland Raceway on Sat 14 November. $450 per car, 6-hour race, gates 6:30am. Grids are limited — push people to enter early."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted" htmlFor="ai_tone">Tone</label>
            <select id="ai_tone" name="ai_tone" className="input w-auto bg-white py-1 text-xs" defaultValue="friendly">
              <option value="friendly">Friendly</option>
              <option value="excited, high energy">Excited</option>
              <option value="professional">Professional</option>
              <option value="short and to the point">Short &amp; sharp</option>
              <option value="laid-back Aussie">Laid-back Aussie</option>
            </select>
            <span className="text-xs text-muted">Takes about 20 seconds. You can edit everything afterwards.</span>
          </div>
        </div>
      )}
    </fieldset>
  );
}
