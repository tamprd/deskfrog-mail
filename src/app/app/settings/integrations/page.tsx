import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { ActionForm, Submit } from "@/components/action-form";
import { createWebhook, deleteWebhook } from "../../actions";

export const metadata = { title: "Integrations · Desk Frog Mail" };

export default async function Integrations() {
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: hooks }, { data: keys }] = await Promise.all([
    db.from("webhook_endpoints").select("id, url, events, active").eq("workspace_id", workspace.id),
    db.from("api_keys").select("id, name, last_used_at").eq("workspace_id", workspace.id).is("revoked_at", null).order("last_used_at", { ascending: false, nullsFirst: false }),
  ]);
  return (
    <>
      <section className="card p-6">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Connected apps</h2><Link href="/app/settings/api-keys" className="text-sm font-semibold text-frog-700 hover:underline">Manage API keys</Link></div>
        <ul className="mt-4 divide-y divide-line text-sm">
          {keys?.map((k) => (
            <li key={k.id} className="flex items-center justify-between py-2.5">
              <span className="font-medium">{k.name}</span>
              <span className={`pill ${k.last_used_at ? "bg-frog-100 text-forest" : "bg-soft text-muted"}`}>
                {k.last_used_at ? `Connected · last used ${new Date(k.last_used_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}` : "Not used yet"}
              </span>
            </li>
          ))}
          {!keys?.length && <li className="py-2 text-muted">No apps connected. Create an API key to connect ArgusIQ, your website or a form.</li>}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="font-semibold">Webhooks</h2>
        <p className="mt-1 text-sm text-muted">We POST events to your app, signed with a <code className="text-xs">DeskFrog-Signature</code> header.</p>
        <ul className="mt-4 divide-y divide-line text-sm">
          {hooks?.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{h.url}</span>
                <span className="text-xs text-muted">{h.events.length ? h.events.join(", ") : "all events"}</span>
              </span>
              <form action={deleteWebhook}><input type="hidden" name="id" value={h.id} /><button className="text-xs text-danger underline">Remove</button></form>
            </li>
          ))}
        </ul>
        <ActionForm action={createWebhook} className="mt-4 space-y-3">
          <input className="input" name="url" type="url" placeholder="https://argusiq.app/api/hooks/deskfrog" aria-label="Webhook URL" required />
          <fieldset className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
            <legend className="mb-1 text-xs text-muted">Events (none = all)</legend>
            {WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-1.5"><input type="checkbox" name="events" value={e} className="accent-frog-700" /> {e}</label>
            ))}
          </fieldset>
          <Submit className="btn-secondary">Add webhook</Submit>
        </ActionForm>
      </section>
      <section className="card p-6">
        <h2 className="font-semibold">Coming soon</h2>
        <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {[["WordPress", "Signup form plugin for your site"], ["Zapier", "Connect thousands of apps without code"], ["Canva", "Pull designs straight into the editor"]].map(([n, d]) => (
            <li key={n} className="rounded-lg border border-line p-4"><p className="font-semibold">{n}</p><p className="text-xs text-muted">{d}</p></li>
          ))}
        </ul>
      </section>
    </>
  );
}
