import Link from "next/link";
import { requireSession } from "@/lib/session";
import { usage } from "@/lib/workspace";
import { PlanIcon } from "@/components/plan-icon";
import { admin } from "@/lib/supabase/admin";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { ActionForm, Submit } from "@/components/action-form";
import { addDomain, addSender, checkDomain, checkSender, removeSender, resendSender, changePassword, createApiKey, createWebhook, deleteWebhook, removeDomain, revokeApiKey, saveBrand, signOutEverywhere, updateWorkspace } from "../actions";
import { DEFAULT_BRAND, FONTS, type Brand } from "@/lib/email/design";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Desk Frog Mail" };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : "never");

const TABS = [
  ["overview", "Overview"],
  ["details", "Details"],
  ["users", "Users"],
  ["security", "Security"],
  ["plan", "Plan & billing"],
  ["domains", "Senders & domains"],
  ["integrations", "Integrations"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { workspace, user } = await requireSession();
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;
  const db = admin();
  const [{ data: keys }, { data: hooks }, { data: domains }, { data: senders }] = await Promise.all([
    db.from("api_keys").select("id, name, prefix, last_used_at, revoked_at, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
    db.from("webhook_endpoints").select("id, url, events, active").eq("workspace_id", workspace.id),
    db.from("sending_domains").select("id, domain, status, dns_records").eq("workspace_id", workspace.id),
    db.from("sender_addresses").select("id, email, name, verified_at, ses_verified_at, sent_at").eq("workspace_id", workspace.id).order("created_at"),
  ]);
  const { data: wsRow } = await db.from("workspaces").select("brand").eq("id", workspace.id).single();
  const brand = { ...DEFAULT_BRAND, ...((wsRow?.brand ?? {}) as Partial<Brand>) };
  const [use, { data: plans }, { data: memberRows }] = await Promise.all([
    tab === "overview" || tab === "plan" ? usage(workspace.id) : Promise.resolve(null),
    tab === "plan" ? db.from("plans").select("id, name, price_cents, contact_limit, monthly_send_limit, badge_required, custom_domain, automations, sort").lt("sort", 90).order("sort") : Promise.resolve({ data: null }),
    tab === "users" ? db.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", workspace.id).order("created_at") : Promise.resolve({ data: null }),
  ]);
  const members = memberRows
    ? await Promise.all(memberRows.map(async (m) => ({ ...m, email: (await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? "unknown" })))
    : [];
  const readySenders = (senders ?? []).filter((x) => x.ses_verified_at).length;
  const verifiedDomains = (domains ?? []).filter((d) => d.status === "verified").length;
  const bar = (n: number, max: number) => (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-frog-50"><div className="h-full rounded-full bg-frog" style={{ width: `${Math.min(100, max ? (n / max) * 100 : 0)}%` }} /></div>
  );

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Settings">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/app/settings?tab=${k}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === k ? "border-frog-700 text-frog-700" : "border-transparent text-ink hover:text-frog-700"}`}
              aria-current={tab === k ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {tab === "overview" && use && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="card flex items-center gap-4 p-5">
              <PlanIcon plan={workspace.plan.name} className="h-14 w-14" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Plan</p>
                <p className="text-xl font-bold">{workspace.plan.name}</p>
                <Link href="/app/settings?tab=plan" className="text-xs font-semibold text-frog-700 hover:underline">Change plan</Link>
              </div>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contacts</p>
              <p className="text-xl font-bold tabular-nums">{use.contacts.toLocaleString("en-AU")} <span className="text-sm font-medium text-muted">/ {workspace.plan.contact_limit.toLocaleString("en-AU")}</span></p>
              {bar(use.contacts, workspace.plan.contact_limit)}
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sends this month</p>
              <p className="text-xl font-bold tabular-nums">{use.sentThisMonth.toLocaleString("en-AU")} <span className="text-sm font-medium text-muted">/ {workspace.plan.monthly_send_limit.toLocaleString("en-AU")}</span></p>
              {bar(use.sentThisMonth, workspace.plan.monthly_send_limit)}
            </div>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">Getting set up</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                [readySenders > 0, "Confirm the email address you send from", "domains"],
                [Boolean(workspace.sender_address), "Add your postal address (shown in email footers)", "details"],
                [Boolean(brand.logoUrl), "Upload your logo and colours", "details"],
                [verifiedDomains > 0, "Connect your domain (optional, better inbox placement)", "domains"],
              ].map(([done, label, t]) => (
                <li key={String(label)} className="flex items-center gap-3">
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${done ? "bg-frog-700 text-white" : "border border-line text-transparent"}`}>✓</span>
                  {done ? <span className="text-muted line-through">{label}</span> : <Link href={`/app/settings?tab=${t}`} className="font-medium hover:underline">{label}</Link>}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {tab === "users" && (
        <section className="card p-6">
          <h2 className="font-semibold">Users in {workspace.name}</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-frog-100 font-bold text-forest">{m.email[0]?.toUpperCase()}</span>
                  <span><span className="font-medium">{m.email}</span>{m.user_id === user.id && <span className="pill ml-2 bg-soft text-muted">You</span>}</span>
                </span>
                <span className="pill bg-teal/10 capitalize text-teal-700">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Inviting teammates is coming next.</p>
        </section>
      )}

      {tab === "security" && (
        <>
          <section className="card p-6">
            <h2 className="font-semibold">Password</h2>
            <p className="mt-1 text-sm text-muted">Signed in as <strong className="text-ink">{user.email}</strong>.</p>
            <ActionForm action={changePassword} className="mt-4 grid max-w-md gap-3">
              <input name="password" type="password" minLength={10} required autoComplete="new-password" className="input" placeholder="New password (10+ characters)" aria-label="New password" />
              <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className="input" placeholder="Repeat new password" aria-label="Repeat new password" />
              <Submit className="btn-secondary w-fit" pending="Saving…">Change password</Submit>
            </ActionForm>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">Sessions</h2>
            <p className="mt-1 text-sm text-muted">Lost a device or shared your login? Sign out everywhere, including this browser.</p>
            <form action={signOutEverywhere} className="mt-4"><button className="btn-secondary">Sign out of all devices</button></form>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">2-factor authentication</h2>
            <p className="mt-1 text-sm text-muted">Authenticator-app codes at sign-in are coming next.</p>
          </section>
        </>
      )}

      {tab === "plan" && use && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(plans ?? []).map((p) => {
              const current = p.id === workspace.plan.id;
              const fits = use.contacts <= p.contact_limit;
              return (
                <div key={p.id} className={`card p-5 ${current ? "ring-2 ring-frog" : ""}`}>
                  <PlanIcon plan={p.name} className="h-12 w-12" />
                  <p className="mt-2 font-semibold">{p.name}</p>
                  <p className="text-2xl font-extrabold tabular-nums">${p.price_cents / 100}<span className="text-sm font-medium text-muted">/mo</span></p>
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    <li>{p.contact_limit.toLocaleString("en-AU")} contacts</li>
                    <li>{p.monthly_send_limit.toLocaleString("en-AU")} sends / month</li>
                    <li>{p.badge_required ? "Desk Frog badge" : "No badge"}</li>
                    {p.automations && <li>Automations</li>}
                  </ul>
                  <div className="mt-4">
                    {current ? (
                      <span className="pill bg-frog-100 text-forest">Current plan</span>
                    ) : (
                      <a href={`mailto:hello@deskfrog.studio?subject=${encodeURIComponent(`Change ${workspace.name} to ${p.name}`)}`} className={`text-sm font-semibold ${fits ? "text-frog-700 hover:underline" : "text-muted"}`}>
                        {fits ? `Switch to ${p.name}` : `Too small for ${use.contacts.toLocaleString("en-AU")} contacts`}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">Billing</h2>
            <p className="mt-1 text-sm text-muted">AUD, GST included. Card payments and invoices are coming soon; for now, plan changes are done by the Desk Frog team.</p>
          </section>
        </>
      )}

      {tab === "details" && (
      <section className="card p-6">
        <h2 className="font-semibold">Account details</h2>
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
      )}

      {tab === "details" && (
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
      )}



      {tab === "integrations" && (
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
      )}

      {tab === "integrations" && (
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
      )}

      {tab === "domains" && (
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
      )}

      {tab === "domains" && (
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
      )}
    </div>
  );
}
