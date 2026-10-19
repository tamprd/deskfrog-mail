import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { StatusPill } from "@/components/status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · Desk Frog Mail" };

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Brisbane" }) : "—";

export default async function Campaigns() {
  const { workspace } = await requireSession();
  const { data } = await admin()
    .from("campaigns")
    .select("id, name, subject, status, recipient_count, started_at, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted">Newsletters and announcements to your audience.</p>
        </div>
        <Link href="/app/campaigns/new" className="btn-primary">+ Create campaign</Link>
      </header>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-soft"><tr><th className="th">Campaign</th><th className="th">Status</th><th className="th">Recipients</th><th className="th">Sent</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td className="td">
                  <Link href={`/app/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  <p className="text-xs text-muted truncate max-w-md">{c.subject}</p>
                </td>
                <td className="td"><StatusPill status={c.status} /></td>
                <td className="td tabular-nums">{c.recipient_count ? c.recipient_count.toLocaleString("en-AU") : "—"}</td>
                <td className="td text-muted">{fmt(c.started_at)}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={4} className="td py-12 text-center text-muted">No campaigns yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
