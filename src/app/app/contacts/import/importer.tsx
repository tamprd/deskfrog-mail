"use client";
import { useState } from "react";
import Link from "next/link";
import { overallStatus, parseMailchimpZip, type McExport, type McStatus } from "@/lib/import/mailchimp";
import { uploadMedia } from "@/lib/media";
import { finishImport, importChunk, importTemplate, startImport } from "./actions";

type Step = "pick" | "review" | "running" | "done";

/** Shrink big photos so they upload quickly and suit email (max 1600px wide). */
async function shrink(bytes: Uint8Array, type: string): Promise<Blob> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
  if (bytes.length < 1_500_000 || type === "image/gif") return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 1600 / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? blob), type === "image/png" ? "image/png" : "image/jpeg", 0.85));
  } catch {
    return blob;
  }
}

export function ProviderImporter({ plan, limit, current }: { plan: string; limit: number; current: number }) {
  const [step, setStep] = useState<Step>("pick");
  const [data, setData] = useState<McExport | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState({ images: true, templates: true });
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ label: "", done: 0, total: 1 });
  const [log, setLog] = useState<string[]>([]);

  const overall = (() => {
    const per = new Map<string, McStatus[]>();
    data?.lists.forEach((l) => l.members.forEach((m) => per.set(m.email, [...(per.get(m.email) ?? []), m.status])));
    const o = new Map<string, ReturnType<typeof overallStatus>>();
    per.forEach((s, e) => o.set(e, overallStatus(s)));
    return o;
  })();
  const subscribed = [...overall.values()].filter((s) => s === "subscribed").length;
  const tooBig = current + subscribed > limit;

  async function pick(file: File) {
    setError(null);
    try {
      const parsed = parseMailchimpZip(new Uint8Array(await file.arrayBuffer()));
      if (!parsed.lists.length) throw new Error("No audiences found in that zip. Export your account data from your current provider and try again.");
      setData(parsed);
      setNames(Object.fromEntries(parsed.lists.map((l) => [l.key, l.name.replace(/^Vip /, "VIP ")])));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  async function run() {
    if (!data) return;
    setStep("running");
    setError(null);
    const note = (s: string) => setLog((l) => [...l, s]);
    const start = await startImport(data.lists.map((l) => ({ key: l.key, name: names[l.key] ?? l.name, reminder: reminders[l.key] })), subscribed);
    if ("error" in start && start.error) { setError(start.error); setStep("review"); return; }
    const ids = (start as { ids: Record<string, string> }).ids;

    const total = data.lists.reduce((n, l) => n + l.members.length, 0);
    let done = 0;
    for (const l of data.lists) {
      const seen = new Set<string>();
      const rows = l.members.filter((m) => !seen.has(m.email) && seen.add(m.email)).map((m) => ({ ...m, overall: overall.get(m.email)! }));
      for (let i = 0; i < rows.length; i += 400) {
        setProgress({ label: `Contacts: ${names[l.key]}`, done, total });
        const res = await importChunk(ids[l.key], rows.slice(i, i + 400));
        if (res.error) { setError(`${names[l.key]}: ${res.error}`); setStep("review"); return; }
        done += Math.min(400, rows.length - i);
      }
      note(`✓ ${names[l.key]}: ${rows.length.toLocaleString("en-AU")} contacts`);
    }

    if (opts.images && data.images.length) {
      let ok = 0;
      for (let i = 0; i < data.images.length; i++) {
        const img = data.images[i];
        setProgress({ label: `Images: ${img.name}`, done: i, total: data.images.length });
        const blob = await shrink(img.bytes, img.type);
        const fd = new FormData();
        fd.append("file", new File([blob], img.name, { type: blob.type || img.type }));
        const r = await uploadMedia(fd).catch(() => ({ error: "failed" }));
        if (!r.error) ok++;
      }
      note(`✓ Media library: ${ok} of ${data.images.length} images`);
    }
    if (opts.templates) {
      for (const t of data.templates) {
        const r = await importTemplate(t.name, t.html);
        note(r.error ? `✗ Template ${t.name}: ${r.error}` : `✓ Template: ${t.name}`);
      }
    }
    await finishImport();
    setStep("done");
  }

  if (step === "pick")
    return (
      <section className="card p-6">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>In your current email provider, find the account data export (usually under <strong className="text-ink">Account → Settings → Manage my data</strong>).</li>
          <li>Tick <strong className="text-ink">Audiences</strong>, <strong className="text-ink">Templates</strong> and <strong className="text-ink">Gallery</strong>, choose <strong className="text-ink">All time</strong>, and export.</li>
          <li>When the zip arrives, drop it here. Nothing is imported until you confirm.</li>
        </ol>
        <label className="mt-5 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line p-10 text-center hover:border-frog hover:bg-frog-50">
          <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          <span className="text-3xl" aria-hidden>📦</span>
          <span className="mt-2 font-semibold">Choose your export (.zip)</span>
          <span className="text-xs text-muted">Read on your computer first; large exports are fine.</span>
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>
    );

  if (step === "review" && data)
    return (
      <>
        <section className="card p-6">
          <h2 className="font-semibold">Found in your export</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[[overall.size, "People"], [subscribed, "Subscribed"], [[...overall.values()].filter((s) => s === "unsubscribed").length, "Unsubscribed (kept, never emailed)"], [[...overall.values()].filter((s) => s === "bounced").length, "Bounced (kept, never emailed)"]].map(([n, l]) => (
              <div key={String(l)}><p className="text-2xl font-bold tabular-nums">{Number(n).toLocaleString("en-AU")}</p><p className="text-xs text-muted">{l}</p></div>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <h2 className="font-semibold">Lists</h2>
          <p className="mt-1 text-sm text-muted">Rename if you like. People on more than one list become one contact on each list.</p>
          <ul className="mt-4 space-y-3">
            {data.lists.map((l) => {
              const c = (s: McStatus) => l.members.filter((m) => m.status === s).length;
              return (
                <li key={l.key} className="rounded-lg border border-line p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <input className="input font-semibold" value={names[l.key] ?? ""} onChange={(e) => setNames({ ...names, [l.key]: e.target.value })} aria-label="List name" />
                    <p className="text-xs text-muted tabular-nums">{c("subscribed").toLocaleString("en-AU")} subscribed · {c("unsubscribed").toLocaleString("en-AU")} unsubscribed · {c("cleaned").toLocaleString("en-AU")} bounced</p>
                  </div>
                  <input className="input mt-2 text-sm" placeholder='Permission reminder, e.g. "You are receiving this because you enjoyed one of our track days"' value={reminders[l.key] ?? ""} onChange={(e) => setReminders({ ...reminders, [l.key]: e.target.value })} aria-label="Permission reminder" />
                  {l.fieldNames.length > 0 && <p className="mt-2 text-xs text-muted">Custom fields: {l.fieldNames.join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="font-semibold">Also import</h2>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-frog-700" checked={opts.images} onChange={(e) => setOpts({ ...opts, images: e.target.checked })} /> {data.images.length} images into your media library (big photos are resized for email)</label>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-frog-700" checked={opts.templates} onChange={(e) => setOpts({ ...opts, templates: e.target.checked })} /> {data.templates.length} template{data.templates.length === 1 ? "" : "s"}</label>
        </section>
        {tooBig && (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-warn">
            {subscribed.toLocaleString("en-AU")} subscribed contacts won&apos;t fit the {plan} plan ({limit.toLocaleString("en-AU")}). <Link href="/app/settings/plans" className="font-semibold underline">Change plan</Link> first.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 p-4 text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-primary" onClick={run} disabled={tooBig}>Import {overall.size.toLocaleString("en-AU")} contacts</button>
          <button className="btn-secondary" onClick={() => { setData(null); setStep("pick"); }}>Choose another file</button>
        </div>
      </>
    );

  return (
    <section className="card p-6">
      <h2 className="font-semibold">{step === "done" ? "Import complete 🐸" : "Importing…"}</h2>
      {step === "running" && (
        <>
          <p className="mt-2 text-sm text-muted">{progress.label}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-frog-50"><div className="h-full rounded-full bg-frog transition-all" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
          <p className="mt-2 text-xs text-muted">Keep this tab open.</p>
        </>
      )}
      <ul className="mt-4 space-y-1 text-sm">{log.map((l) => <li key={l}>{l}</li>)}</ul>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {step === "done" && (
        <div className="mt-5 flex gap-3">
          <Link href="/app/contacts" className="btn-primary">View audience</Link>
          <Link href="/app/media" className="btn-secondary">Media</Link>
          <Link href="/app/templates" className="btn-secondary">Templates</Link>
        </div>
      )}
    </section>
  );
}
