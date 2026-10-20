import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { allowedSenders } from "@/lib/senders";
import { ActionForm, Submit } from "@/components/action-form";
import { saveListDetails } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function ListSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, user } = await requireSession();
  const db = admin();
  const { data: l } = await db.from("lists").select("id, name, from_name, from_email, postal_address, permission_reminder, members:list_members(count)").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!l) notFound();
  const { senders } = await allowedSenders(workspace.id, user.email);
  const count = (l.members as { count: number }[])[0]?.count ?? 0;
  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <Link href="/app/contacts" className="text-sm text-muted hover:underline">← Audience</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{l.name}</h1>
        <p className="text-muted">{count.toLocaleString("en-AU")} members</p>
      </header>
      <section className="card p-6">
        <h2 className="font-semibold">List name and defaults</h2>
        <p className="mt-1 text-sm text-muted">Used for campaigns sent to this list. Leave blank to use your account details.</p>
        <ActionForm action={saveListDetails} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={l.id} />
          <div><label className="label" htmlFor="name">List name</label><input id="name" name="name" className="input" defaultValue={l.name} required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="from_name">Default from name</label><input id="from_name" name="from_name" className="input" defaultValue={l.from_name ?? ""} placeholder={workspace.name} /></div>
            <div>
              <label className="label" htmlFor="from_email">Default from email</label>
              <select id="from_email" name="from_email" className="input" defaultValue={l.from_email ?? ""}>
                <option value="">Account default</option>
                {senders.map((s) => <option key={s.email} value={s.email}>{s.email}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="postal_address">Postal address in footer</label>
            <input id="postal_address" name="postal_address" className="input" defaultValue={l.postal_address ?? ""} placeholder={workspace.sender_address ?? "PO Box 3365, Darra QLD 4076"} />
          </div>
          <div>
            <label className="label" htmlFor="permission_reminder">Permission reminder</label>
            <textarea id="permission_reminder" name="permission_reminder" rows={2} className="input" defaultValue={l.permission_reminder ?? ""} placeholder="You are receiving this email because you have enjoyed one of our track days." />
            <p className="mt-1 text-xs text-muted">Shown at the top of the footer. Reminding people why they&apos;re hearing from you cuts spam complaints.</p>
          </div>
          <Submit className="btn-primary" pending="Saving…">Save list</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
