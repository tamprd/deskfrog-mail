import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

export const metadata = { title: "Manage my data · Desk Frog Mail" };

export default async function Data() {
  const { workspace } = await requireSession();
  const { data } = await admin().from("workspaces").select("last_export_at").eq("id", workspace.id).single();
  const last = data?.last_export_at ? new Date(data.last_export_at) : null;
  const wait = last ? Math.max(0, 60 - Math.floor((Date.now() - last.getTime()) / 60_000)) : 0;
  return (
    <>
      <section className="card p-6">
        <h2 className="font-semibold">Export data</h2>
        <p className="mt-1 text-sm text-muted">Download your account data as CSV files in a single zip. It&apos;s yours; take it anywhere.</p>
        <form action="/app/settings/data/export" method="get" className="mt-4 space-y-4">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            {[
              ["contacts", "Contacts (all statuses, tags, custom fields)"],
              ["lists", "Lists and memberships"],
              ["campaigns", "Campaigns (subject, content, status)"],
              ["reports", "Reports (every email sent, opens, clicks)"],
              ["templates", "Templates"],
              ["media", "Media library (image links)"],
              ["unsubscribes", "Unsubscribes and suppressions"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="include" value={k} defaultChecked className="accent-frog-700" /> {label}</label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <select name="range" className="input max-w-[200px]" aria-label="Date range for reports">
              <option value="30">Reports: last 30 days</option>
              <option value="90">Reports: last 90 days</option>
              <option value="365">Reports: last 12 months</option>
              <option value="0">Reports: all time</option>
            </select>
            <button className="btn-primary" disabled={wait > 0}>Export data</button>
            {wait > 0 && <span className="text-xs text-muted">One export per hour. Try again in {wait} min.</span>}
          </div>
        </form>
      </section>
      <section className="card p-6">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Desk Frog never sells or shares your contacts, and doesn&apos;t use them for anything except sending your emails. Data is stored in Sydney.</p>
      </section>
    </>
  );
}
