import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { ActionForm, Submit } from "@/components/action-form";
import { createApiKey, createWebhook, deleteWebhook, revokeApiKey, updateWorkspace } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Desk Frog Mail" };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : "never");

export default async function Settings() {
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: keys }, { data: hooks }, { data: domains }] = await Promise.all([
    db.from("api_keys").select("id, name, prefix, last_used_at, revoked_at, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    db.from("webhook_endpoints").select("id, url, events, active").eq("workspace_id", workspace.id),
    db.from("sending_domains").select("id, domain, status, dns_records").eq("workspace_id", workspace.id),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section className="card p-6">
        <h2 className="font-semibold">Workspace</h2>
        <form action={updateWorkspace} className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" defaultValue={workspace.name} required />
          </div>
          <div>
            <label className="label" htmlFor="sender_address">Postal address</label>
            <input className="input" id="sender_address" name="sender_address" defaultValue={workspace.sender_address ?? ""} placeholder="123 Example St, Ipswich QLD 4305" />
            <p className="mt-1 text-xs text-muted">Shown in every email footer so subscribers know who you are. Required on paid plans.</p>
          </div>
          <button className="btn-secondary">Save</button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Plan</h2>
        <p className="mt-1 text-sm text-muted">
          <strong className="text-ink">{workspace.plan.name}</strong> · {workspace.plan.contact_limit.toLocaleString("en-AU")} contacts ·{" "}
          {workspace.plan.monthly_send_limit.toLocaleString("en-AU")} sends/month
          {workspace.plan.badge_required ? " · Desk Frog badge on emails" : ""}
        </p>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-muted">For ArgusIQ, your website or any app. Send as <code className="text-xs">Authorization: Bearer dfm_live_…</code></p>
        <ul className="mt-4 divide-y divide-line text-sm">
          {keys?.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{k.name}</strong> <code className="text-xs text-muted">{k.prefix}…</code>
                <span className="block text-xs text-muted">Last used {fmt(k.last_used_at)}</span>
              </span>
              {k.revoked_at ? (
                <span className="pill bg-gray-100 text-muted">revoked</span>
              ) : (
                <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-danger underline">Revoke</button></form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={createApiKey} className="mt-4">
          <div className="flex gap-2">
            <input className="input" name="name" placeholder="e.g. ArgusIQ production" aria-label="Key name" required />
            <Submit className="btn-primary whitespace-nowrap">Create key</Submit>
          </div>
        </ActionForm>
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
        <h2 className="font-semibold">Sending domains</h2>
        {workspace.plan.custom_domain ? (
          <>
            <p className="mt-1 text-sm text-muted">Add domains with <code className="text-xs">POST /api/v1/domains</code>, then add the DNS records shown.</p>
            <ul className="mt-4 space-y-3 text-sm">
              {domains?.map((d) => (
                <li key={d.id} className="rounded-lg border border-line p-3">
                  <p className="font-medium">{d.domain} <span className="pill ml-2 bg-frog-100 text-forest">{d.status}</span></p>
                  {d.status !== "verified" && (
                    <ul className="mt-2 space-y-1 font-mono text-xs break-all text-muted">
                      {(d.dns_records as { type: string; name: string; value: string }[]).map((r) => <li key={r.name}>{r.type} {r.name} → {r.value}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Free plan sends from Desk Frog&apos;s shared domain. Upgrade to send from your own domain.</p>
        )}
      </section>
    </div>
  );
}
