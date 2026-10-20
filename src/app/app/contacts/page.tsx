import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ActionForm, Submit } from "@/components/action-form";
import { StatusPill } from "@/components/status";
import { createList, importContacts, unsubscribeFromDashboard } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audience · Desk Frog Mail" };

const PAGE = 50;

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const { workspace } = await requireSession();
  const { q, page: pageStr, status } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const db = admin();

  let query = db
    .from("contacts")
    .select("id, email, first_name, last_name, tags, status, created_at", { count: "exact" })
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  if (status) query = query.eq("status", status);
  const [{ data: contacts, count }, { data: lists }] = await Promise.all([
    query,
    db.from("lists").select("id, name, members:list_members(count)").eq("workspace_id", workspace.id).order("created_at"),
  ]);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Audience</h1>
          <Link href="/app/contacts/import" className="btn-secondary">Import from Mailchimp</Link>
        </div>
        <p className="text-muted">{(count ?? 0).toLocaleString("en-AU")} contacts · {workspace.plan.contact_limit.toLocaleString("en-AU")} on your plan</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card p-5">
          <h2 className="font-semibold">Add contacts</h2>
          <p className="text-sm text-muted">One per line: <code className="text-xs">email, first name, last name</code>. Paste straight from a spreadsheet.</p>
          <ActionForm action={importContacts} className="mt-4 space-y-3">
            <textarea name="rows" rows={5} className="input font-mono text-xs" placeholder={"jess@example.com, Jess, Nguyen\nsam@example.com, Sam"} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="list_id">Add to list</label>
                <select id="list_id" name="list_id" className="input">
                  <option value="">No list</option>
                  {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="tags">Tags</label>
                <input id="tags" name="tags" className="input" placeholder="2026-season, competitor" />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="consent" className="mt-1 accent-frog-700" />
              <span>These people agreed to receive email from {workspace.name}. <span className="text-muted">(Required under the Spam Act — no bought or scraped lists.)</span></span>
            </label>
            <Submit pending="Importing…">Import contacts</Submit>
          </ActionForm>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Lists</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {lists?.length ? lists.map((l) => (
              <li key={l.id} className="flex justify-between py-2">
                <Link href={`/app/contacts/lists/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
                <span className="text-muted tabular-nums">{(l.members as { count: number }[])[0]?.count ?? 0}</span>
              </li>
            )) : <li className="py-2 text-muted">No lists yet.</li>}
          </ul>
          <form action={createList} className="mt-4 flex gap-2">
            <input name="name" className="input" placeholder="New list name" required aria-label="New list name" />
            <button className="btn-secondary">Add</button>
          </form>
        </section>
      </div>

      <section className="card overflow-hidden">
        <form className="flex flex-wrap gap-2 p-4" role="search">
          <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Search email…" aria-label="Search email" />
          <select name="status" defaultValue={status ?? ""} className="input max-w-[180px]" aria-label="Status">
            <option value="">All statuses</option>
            {["subscribed", "unsubscribed", "bounced", "complained"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-soft"><tr><th className="th">Email</th><th className="th">Name</th><th className="th">Tags</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {contacts?.map((c) => (
                <tr key={c.id}>
                  <td className="td font-medium"><Link href={`/app/contacts/${c.id}`} className="hover:underline">{c.email}</Link></td>
                  <td className="td text-muted">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="td">{c.tags.map((t: string) => <span key={t} className="pill mr-1 bg-teal/10 text-teal-700">{t}</span>)}</td>
                  <td className="td"><StatusPill status={c.status} /></td>
                  <td className="td text-right">
                    {c.status === "subscribed" && (
                      <form action={unsubscribeFromDashboard}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-muted hover:text-danger underline">Unsubscribe</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {!contacts?.length && <tr><td colSpan={5} className="td py-10 text-center text-muted">No contacts found.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="flex justify-between border-t border-line p-4 text-sm">
            {page > 1 ? <a className="font-semibold text-frog-700" href={`?page=${page - 1}&q=${q ?? ""}&status=${status ?? ""}`}>← Previous</a> : <span />}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <a className="font-semibold text-frog-700" href={`?page=${page + 1}&q=${q ?? ""}&status=${status ?? ""}`}>Next →</a> : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
