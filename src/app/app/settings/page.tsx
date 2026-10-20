import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { ActionForm, Submit } from "@/components/action-form";
import { addDomain, addSender, checkDomain, checkSender, removeSender, resendSender, createApiKey, createWebhook, deleteWebhook, removeDomain, revokeApiKey, saveBrand, updateWorkspace } from "../actions";
import { DEFAULT_BRAND, FONTS, type Brand } from "@/lib/email/design";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Desk Frog Mail" };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : "never");

export default async function Settings() {
  const { workspace, user } = await requireSession();
  const db = admin();
  const [{ data: keys }, { data: hooks }, { data: domains }, { data: senders }] = await Promise.all([
    db.from("api_keys").select("id, name, prefix, last_used_at, revoked_at, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    db.from("webhook_endpoints").select("id, url, events, active").eq("workspace_id", workspace.id),
    db.from("sending_domains").select("id, domain, status, dns_records").eq("workspace_id", workspace.id),
    db.from("sender_addresses").select("id, email, name, verified_at, ses_verified_at, sent_at").eq("workspace_id", workspace.id).order("created_at"),
  ]);
  const { data: wsRow } = await db.from("workspaces").select("brand").eq("id", workspace.id).single();
  const brand = { ...DEFAULT_BRAND, ...((wsRow?.brand ?? {}) as Partial<Brand>) };

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

      <section id="brand" className="card scroll-mt-6 p-6">
        <h2 className="font-semibold">Brand</h2>
        <p className="mt-1 text-sm text-muted">Set once — new emails start with your logo, colours and font.</p>
        <ActionForm action={saveBrand} className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-40 place-items-center rounded-lg border border-line bg-soft p-2">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="Current logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted">No logo yet</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="label" htmlFor="logo">Logo</label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="text-sm" />
              {brand.logoUrl && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove_logo" className="accent-frog-700" /> Remove logo</label>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["primary", "Buttons & links", brand.primary],
              ["text", "Text", brand.text],
              ["background", "Background", brand.background],
              ["content", "Email body", brand.content],
            ] as const).map(([name, label, value]) => (
              <div key={name}>
                <label className="label" htmlFor={`brand-${name}`}>{label}</label>
                <input id={`brand-${name}`} name={name} type="color" defaultValue={value} className="h-10 w-full cursor-pointer rounded-lg border border-line bg-white p-1" />
              </div>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="font">Font</label>
            <select id="font" name="font" defaultValue={brand.font} className="input">
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </div>
          <Submit className="btn-secondary" pending="Saving…">Save brand</Submit>
        </ActionForm>
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

      <section className="card p-6" id="senders">
        <h2 className="font-semibold">Sender addresses</h2>
        <p className="mt-1 text-sm text-muted">
          Add the address you want emails to come from. Amazon Web Services emails it a confirmation link; click it and you&apos;re ready.
          No DNS or technical setup needed.
        </p>
        <ActionForm action={addSender} className="mt-4 grid max-w-2xl gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
          <input name="name" className="input" placeholder="Name, e.g. Tampered Motorsport" aria-label="Sender name" />
          <input name="email" type="email" required className="input" placeholder="entries@tamperedmotorsport.com.au" aria-label="Sender email" />
          <Submit className="btn-primary" pending="Sending…">Add &amp; verify</Submit>
        </ActionForm>
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
          <li className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate"><span className="font-medium">{user.email}</span> <span className="text-muted">· your login</span></span>
            <span className="pill bg-frog-100 text-forest">verified</span>
          </li>
          {senders?.filter((x) => x.email !== user.email?.toLowerCase()).map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate">{x.name && <span className="text-muted">{x.name} · </span>}<span className="font-medium">{x.email}</span></span>
              <span className="flex flex-wrap items-center gap-3">
                {x.ses_verified_at ? (
                  <span className="pill bg-frog-100 text-forest">ready ✓</span>
                ) : (
                  <>
                    <span className="pill bg-amber-50 text-warn">{x.sent_at ? "check your inbox" : "not confirmed"}</span>
                    <ActionForm action={checkSender}>
                      <input type="hidden" name="id" value={x.id} />
                      <Submit className="btn-secondary py-1 text-xs" pending="Checking…">Check</Submit>
                    </ActionForm>
                    <ActionForm action={resendSender}>
                      <input type="hidden" name="id" value={x.id} />
                      <Submit className="text-xs font-semibold text-frog-700 hover:underline" pending="Sending…">{x.sent_at ? "Resend" : "Send confirmation"}</Submit>
                    </ActionForm>
                  </>
                )}
                <form action={removeSender}><input type="hidden" name="id" value={x.id} /><button className="text-xs text-muted underline hover:text-danger">Remove</button></form>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6" id="domains">
        <h2 className="font-semibold">Sending domain <span className="ml-1 text-xs font-normal text-muted">optional</span></h2>
        {workspace.plan.custom_domain ? (
          <>
            <p className="mt-1 text-sm text-muted">
              You can send straight away: without a domain, emails go out from Desk Frog&apos;s address with replies coming to you.
              Connecting your domain lets you send as <span className="font-medium text-ink">news@yourclub.com.au</span> and gets you into more inboxes. Add your domain, then add the records below
              wherever your domain&apos;s DNS is managed (GoDaddy, Crazy Domains, Cloudflare, VentraIP…). It usually verifies within an hour.
            </p>
            <ActionForm action={addDomain} className="mt-4 flex max-w-lg flex-wrap gap-2">
              <input name="domain" className="input flex-1" placeholder="tamperedmotorsport.com.au" required aria-label="Domain" />
              <Submit className="btn-primary" pending="Adding…">Add domain</Submit>
            </ActionForm>
            <ul className="mt-5 space-y-4 text-sm">
              {domains?.map((d) => (
                <li key={d.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {d.domain}
                      <span className={`pill ml-2 ${d.status === "verified" ? "bg-frog-100 text-forest" : d.status === "failed" ? "bg-red-50 text-danger" : "bg-amber-50 text-warn"}`}>
                        {d.status === "pending" ? "waiting for DNS" : d.status}
                      </span>
                    </p>
                    <div className="flex gap-3">
                      {d.status !== "verified" && (
                        <form action={checkDomain}><input type="hidden" name="id" value={d.id} /><button className="btn-secondary py-1 text-xs">Check now</button></form>
                      )}
                      <form action={removeDomain}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-muted underline hover:text-danger">Remove</button></form>
                    </div>
                  </div>
                  {d.status === "verified" ? (
                    <p className="mt-1 text-muted">Ready. Use any address <span className="font-medium text-ink">@{d.domain}</span> as the From email on your campaigns.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead><tr className="text-left text-muted"><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Name / Host</th><th className="py-1">Value / Points to</th></tr></thead>
                        <tbody className="font-mono">
                          {(d.dns_records as { type: string; name: string; value: string }[]).map((r) => (
                            <tr key={`${r.type}:${r.name}`} className="border-t border-line align-top">
                              <td className="py-2 pr-3">{r.type}</td>
                              <td className="select-all break-all py-2 pr-3">{r.name}</td>
                              <td className="select-all break-all py-2">{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-muted">Some DNS hosts add your domain automatically. If so, enter only the part before <span className="font-mono">.{d.domain}</span> as the name.
                        Skip the <span className="font-mono">_dmarc</span> record if your domain already has one; two DMARC records break each other.</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">The free plan sends from Desk Frog&apos;s shared address, with replies coming to you. Upgrade to send from your own domain.</p>
        )}
      </section>
    </div>
  );
}
