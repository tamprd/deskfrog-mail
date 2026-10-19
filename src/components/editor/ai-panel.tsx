"use client";
import { useState, useTransition } from "react";
import type { Design } from "@/lib/email/design";

type Usage = { used: number; limit: number };
export type AiActions = {
  aiRewrite: (design: Design, instruction: string, onlyBlockId: string | null) => Promise<{ design?: Design; applied?: number; usage?: Usage; error?: string }>;
  aiSubjects: (design: Design, current: string) => Promise<{ ideas?: { subject: string; preheader: string }[]; usage?: Usage; error?: string }>;
};

const QUICK = [
  "Make it shorter",
  "Make it friendlier",
  "Make it more exciting",
  "Make it more professional",
  "Add a sense of urgency",
  "Fix spelling and grammar",
];

export function AiPanel({
  design,
  subject,
  selected,
  usage: initialUsage,
  actions,
  onDesign,
  onSubject,
  onClose,
}: {
  design: Design;
  subject: string;
  selected: { id: string; label: string } | null;
  usage: Usage;
  actions: AiActions;
  onDesign: (d: Design) => void;
  onSubject: (subject: string, preheader: string) => void;
  onClose: () => void;
}) {
  const [usage, setUsage] = useState(initialUsage);
  const [scope, setScope] = useState<"email" | "block">(selected ? "block" : "email");
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [ideas, setIdeas] = useState<{ subject: string; preheader: string }[]>([]);
  const [busy, start] = useTransition();
  const left = Math.max(0, usage.limit - usage.used);
  const target = scope === "block" && selected ? selected : null;

  const rewrite = (instruction: string) =>
    start(async () => {
      setMsg(null);
      const r = await actions.aiRewrite(design, instruction, target?.id ?? null);
      if (r.usage) setUsage(r.usage);
      if (r.error) return setMsg({ kind: "error", text: r.error });
      if (r.design && r.applied) {
        onDesign(r.design);
        setMsg({ kind: "ok", text: `Updated ${r.applied} piece${r.applied === 1 ? "" : "s"} of text. Not right? Undo (Ctrl+Z).` });
      } else {
        setMsg({ kind: "ok", text: "No changes needed." });
      }
    });

  const suggest = () =>
    start(async () => {
      setMsg(null);
      const r = await actions.aiSubjects(design, subject);
      if (r.usage) setUsage(r.usage);
      if (r.error) return setMsg({ kind: "error", text: r.error });
      setIdeas(r.ideas ?? []);
    });

  return (
    <div className="space-y-5" aria-busy={busy}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">✨ AI assistant</h2>
        <button type="button" onClick={onClose} className="text-xs text-muted underline">Close</button>
      </div>
      <p className="text-xs text-muted">{left} of {usage.limit} AI credits left this month. Each request uses one.</p>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rewrite</h3>
        <div className="inline-flex overflow-hidden rounded-lg border border-line text-xs" role="radiogroup" aria-label="What to rewrite">
          <button type="button" role="radio" aria-checked={scope === "email"} onClick={() => setScope("email")} className={`px-3 py-1.5 ${scope === "email" ? "bg-frog-700 text-white" : "bg-white"}`}>Whole email</button>
          <button type="button" role="radio" aria-checked={scope === "block"} disabled={!selected} onClick={() => setScope("block")} className={`px-3 py-1.5 disabled:opacity-40 ${scope === "block" ? "bg-frog-700 text-white" : "bg-white"}`}>
            {selected ? `Selected ${selected.label.toLowerCase()}` : "Selected block"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" disabled={busy || !left} onClick={() => rewrite(q)} className="rounded-full border border-frog-200 bg-white px-2.5 py-1 text-xs text-forest hover:bg-frog-50 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) rewrite(custom);
          }}
          className="space-y-2"
        >
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={3}
            maxLength={1000}
            className="input text-sm"
            placeholder="Or say what you want, e.g. “mention the BBQ after the race” or “translate to Italian”"
            aria-label="Custom AI instruction"
          />
          <button className="btn-primary w-full" disabled={busy || !custom.trim() || !left}>{busy ? "Thinking…" : "Rewrite"}</button>
        </form>
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Subject lines</h3>
        <button type="button" className="btn-secondary w-full" onClick={suggest} disabled={busy || !left}>{busy ? "Thinking…" : "Suggest 5 subject lines"}</button>
        {ideas.length > 0 && (
          <ul className="space-y-2">
            {ideas.map((i, n) => (
              <li key={n}>
                <button type="button" onClick={() => { onSubject(i.subject, i.preheader); setMsg({ kind: "ok", text: "Subject and preview text updated." }); }} className="w-full rounded-lg border border-line bg-white p-2.5 text-left hover:border-frog hover:bg-frog-50">
                  <span className="block text-sm font-semibold">{i.subject}</span>
                  <span className="block text-xs text-muted">{i.preheader}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && <p role="status" className={`rounded-lg p-2.5 text-sm ${msg.kind === "error" ? "bg-red-50 text-danger" : "bg-frog-50 text-forest"}`}>{msg.text}</p>}
      <p className="text-[11px] text-muted">AI can get things wrong. Check names, dates and prices before sending.</p>
    </div>
  );
}
