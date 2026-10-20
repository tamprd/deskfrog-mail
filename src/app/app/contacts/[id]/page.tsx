import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { recipientState, type RecipientRow } from "@/lib/recipients";
import { StatusPill } from "@/components/status";
import { deleteContact, unsubscribeFromDashboard, updateContact } from "../../actions";
import { ActionForm, Submit } from "@/components/action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact · Desk Frog Mail" };

const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }) : "—";

type Row = RecipientRow & { kind: string; subject: string; campaign: { id: string; name: string } | null };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireSession();
  const db = admin();
  const { data: c } = await db
    .from("contacts")
    .select("id, email, first_name, last_name, external_id, fields, tags, status, consent_source, consented_at, unsubscribed_at, created_at, lists:list_members(status, list_id, list:lists(name))")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const [{ data: msgs }, { data: events }, { data: allLists }] = await Promise.all([
    db
      .from("messages")
      .select("id, to_email, status, kind, subject, sent_at, delivered_at, opened_at, clicked_at, open_count, click_count, last_error, campaign:campaigns(id, name)")
      .eq("contact_id", c.id)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("events").select("type, data, created_at, message_id").eq("contact_id", c.id).in("type", ["click", "unsubscribe", "complaint", "bounce"]).order("created_at", { ascending: false }).limit(300),
    db.from("lists").select("id, name").eq("workspace_id", workspace.id).order("created_at"),
  ]);
  const rows = (msgs ?? []) as unknown as Row[];
  const clicksByMsg = new Map<string, string[]>();
  (events ?? []).filter((e) => e.type === "click" && e.message_id).forEach((e) => {
    const link = (e.data as { link?: string })?.link;
    if (link) clicksByMsg.set(e.message_id!, [...new Set([...(clicksByMsg.get(e.message_id!) ?? []), link])]);
  });
  const unsub = (events ?? []).find((e) => e.type === "unsubscribe");

  const sent = rows.filter((r) => r.kind === "campaign" && ["sent", "delivered", "bounced", "complained"].includes(r.status));
  const opened = sent.filter((r) => r.opened_at || r.clicked_at).length;
  const clicked = sent.filter((r) => r.clicked_at).length;
  const last = rows.map((r) => r.clicked_at ?? r.opened_at).filter(Boolean).sort().pop() as string | undefined;
  const pct = (n: number) => (sent.length ? `${Math.round((n / sent.length) * 100)}%` : "—");
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  const lists = (c.lists as unknown as { status: string; list_id: string; list: { name: string } | null }[]) ?? [];
  const inList = new Set(lists.map((l) => l.list_id));
  const fields = Object.entries((c.fields ?? {}) as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/contacts" className="text-sm text-muted hover:underline">← Audience</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{name || c.email}</h1>
          {name && <p className="text-muted">{c.email}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusPill status={c.status} />
            {c.tags.map((t: string) => <span key={t} className="pill bg-teal/10 text-teal-700">{t}</span>)}
          </div>
        </div>
        {c.status === "subscribed" && (
          <form action={unsubscribeFromDashboard}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-danger">Unsubscribe</button>
          </form>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Campaigns received" value={sent.length} />
        <Stat label="Opened" value={`${opened} · ${pct(opened)}`} />
        <Stat label="Clicked" value={`${clicked} · ${pct(clicked)}`} />
        <Stat label="Last engaged" value={last ? new Date(last).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : "Never"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-semibold">Activity</h2>
          <ol className="divide-y divide-line">
            {rows.map((r) => {
              const s = recipientState(r);
              const links = clicksByMsg.get(r.id) ?? [];
              return (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {r.campaign ? (
                        <Link href={`/app/campaigns/${r.campaign.id}`} className="font-medium hover:underline">{r.campaign.name}</Link>
                      ) : (
                        <span className="font-medium">{r.subject}</span>
                      )}
                      <p className="text-xs text-muted">{r.kind === "transactional" ? "Transactional · " : ""}{r.subject} · sent {when(r.sent_at)}</p>
                    </div>
                    <span className={`pill ${s.tone}`}>{s.label}</span>
                  </div>
                  {(r.opened_at || r.clicked_at || links.length > 0) && (
                    <p className="mt-1 text-xs text-muted">
                      {r.opened_at && <>Opened {when(r.opened_at)}{r.open_count > 1 ? ` (${r.open_count}×)` : ""}. </>}
                      {r.clicked_at && <>Clicked {when(r.clicked_at)}{r.click_count > 1 ? ` (${r.click_count}×)` : ""}. </>}
                    </p>
                  )}
                  {links.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {links.map((l) => <li key={l} className="truncate text-xs"><a href={l} target="_blank" rel="noopener noreferrer" className="text-frog-700 hover:underline">↗ {l}</a></li>)}
                    </ul>
                  )}
                  {r.last_error && ["bounced", "failed", "complained"].includes(r.status) && <p className="mt-1 text-xs text-danger">{r.last_error}</p>}
                </li>
              );
            })}
            {!rows.length && <li className="px-5 py-10 text-center text-muted">No emails sent to this contact yet.</li>}
          </ol>
        </section>

        <aside className="space-y-4">
          <details className="card group p-5 text-sm" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              Edit details <span className="text-frog-700 group-open:hidden">✎ Edit</span><span className="hidden text-muted group-open:inline">Close</span>
            </summary>
            <ActionForm action={updateContact} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" defaultValue={c.email} required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="first_name">First name</label><input id="first_name" name="first_name" className="input" defaultValue={c.first_name ?? ""} /></div>
                <div><label className="label" htmlFor="last_name">Last name</label><input id="last_name" name="last_name" className="input" defaultValue={c.last_name ?? ""} /></div>
              </div>
              <div><label className="label" htmlFor="tags">Tags <span className="font-normal text-muted">(comma separated)</span></label><input id="tags" name="tags" className="input" defaultValue={c.tags.join(", ")} /></div>
              {!!allLists?.length && (
                <fieldset>
                  <legend className="label">Lists</legend>
                  <div className="space-y-1">
                    {allLists.map((l) => (
                      <label key={l.id} className="flex items-center gap-2"><input type="checkbox" name="lists" value={l.id} defaultChecked={inList.has(l.id)} className="accent-frog-700" /> {l.name}</label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div>
                <label className="label" htmlFor="fields">Custom fields <span className="font-normal text-muted">(one per line, name: value)</span></label>
                <textarea id="fields" name="fields" rows={3} className="input font-mono text-xs" placeholder={"car_number: 42\nclass: Outright"} defaultValue={fields.map(([k, v]) => `${k}: ${String(v)}`).join("\n")} />
                <p className="mt-1 text-xs text-muted">Use them in emails as {"{{car_number}}"}.</p>
              </div>
              <Submit pending="Saving…">Save changes</Submit>
            </ActionForm>
            <form action={deleteContact} className="mt-4 border-t border-line pt-3">
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-muted underline hover:text-danger">Delete this contact permanently</button>
            </form>
          </details>
          <section className="card space-y-2 p-5 text-sm">
            <h2 className="font-semibold">Details</h2>
            <p><span className="text-muted">Added:</span> {when(c.created_at)}</p>
            <p><span className="text-muted">Consent:</span> {c.consent_source ?? "—"} {c.consented_at ? `· ${when(c.consented_at)}` : ""}</p>
            {c.unsubscribed_at && <p><span className="text-muted">Unsubscribed:</span> {when(c.unsubscribed_at)}{unsub ? ` (${(unsub.data as { source?: string })?.source ?? "link"})` : ""}</p>}
            {c.external_id && <p><span className="text-muted">External ID:</span> <code className="text-xs">{c.external_id}</code></p>}
            <p><span className="text-muted">Lists:</span> {lists.length ? lists.map((l) => `${l.list?.name}${l.status !== "subscribed" ? ` (${l.status})` : ""}`).join(", ") : "None"}</p>
          </section>
          {fields.length > 0 && (
            <section className="card p-5 text-sm">
              <h2 className="mb-2 font-semibold">Custom fields</h2>
              <dl className="space-y-1">
                {fields.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="truncate font-medium">{String(v)}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
