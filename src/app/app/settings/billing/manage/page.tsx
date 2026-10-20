import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { usage } from "@/lib/workspace";
import { ActionForm, Submit } from "@/components/action-form";
import { deleteAccount, pausePlan, resumePlan } from "../../../actions";

export const metadata = { title: "Manage my plan · Desk Frog Mail" };

export default async function ManagePlan() {
  const { workspace, role } = await requireSession();
  const db = admin();
  const [use, sent, templates, lists] = await Promise.all([
    usage(workspace.id),
    db.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).in("status", ["sending", "sent"]),
    db.from("templates").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    db.from("lists").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
  ]);
  const ownerPaused = workspace.status === "paused" && workspace.status_reason === "Paused by owner";
  const owner = role === "owner";
  return (
    <>
      <section className="card p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Here&apos;s what you&apos;ve built with Desk Frog Mail</h2><Link href="/app" className="btn-secondary text-xs">Dashboard →</Link></div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[[use.contacts, "Subscribed contacts", "/app/contacts"], [sent.count ?? 0, "Emails", "/app/campaigns"], [templates.count ?? 0, "Templates", "/app/templates"], [lists.count ?? 0, "Lists", "/app/contacts"]].map(([n, l, h]) => (
            <div key={String(l)}><p className="text-xs text-muted underline decoration-dotted">{l}</p><p className="text-2xl font-bold tabular-nums">{Number(n).toLocaleString("en-AU")}</p><Link href={String(h)} className="text-xs text-frog-700 hover:underline">View</Link></div>
          ))}
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">{ownerPaused ? "Your plan is paused" : "Temporarily pause my plan"}</h2>
          <p className="mt-2 text-sm text-muted">
            {ownerPaused
              ? "You still have access to everything, but nothing will send until you resume."
              : "Keep your account, contacts and reports, but stop all sending. Scheduled campaigns won't go out. Billing pauses too once card billing starts."}
          </p>
          {owner && (
            <form action={ownerPaused ? resumePlan : pausePlan} className="mt-4">
              <button className="btn-secondary">{ownerPaused ? "Resume my plan" : "Pause my plan"}</button>
            </form>
          )}
        </section>
        <section className="card p-6">
          <h2 className="font-semibold text-danger">Permanently delete my account</h2>
          <p className="mt-2 text-sm text-muted">Deletes this account and all its contacts, campaigns, reports and templates, effective immediately. This can&apos;t be undone. Export your data first.</p>
          {owner ? (
            <ActionForm action={deleteAccount} className="mt-4 space-y-2">
              <label className="label" htmlFor="confirm">Type <strong>{workspace.name}</strong> to confirm</label>
              <input id="confirm" name="confirm" className="input" autoComplete="off" required />
              <Submit className="btn-secondary border-danger text-danger" pending="Deleting…">Delete my account</Submit>
            </ActionForm>
          ) : (
            <p className="mt-3 text-sm text-muted">Only the account owner can do this.</p>
          )}
        </section>
      </div>
    </>
  );
}
