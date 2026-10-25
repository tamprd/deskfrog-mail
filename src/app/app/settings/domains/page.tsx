import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ActionForm, Submit } from "@/components/action-form";
import { hostPart } from "@/lib/dnscheck";
import { addDomain, addSender, checkDomain, checkSender, removeDomain, removeSender, resendSender } from "../../actions";

export const metadata = { title: "Domains · Desk Frog Mail" };

export default async function Domains() {
  const { workspace, user } = await requireSession();
  const db = admin();
  const [{ data: domains }, { data: senders }] = await Promise.all([
    db.from("sending_domains").select("id, domain, status, dns_records").eq("workspace_id", workspace.id),
    db.from("sender_addresses").select("id, email, name, verified_at, ses_verified_at, sent_at").eq("workspace_id", workspace.id).order("created_at"),
  ]);
  // Domains waiting on DNS: ask again on each visit so the page updates by itself.
  const waiting = (domains ?? []).filter((d) => d.status !== "verified").slice(0, 3);
  if (waiting.length) {
    try {
      const { domainStatus } = await import("@/lib/ses");
      await Promise.all(
        waiting.map(async (d) => {
          const s = await domainStatus(d.domain);
          if (!s.verified) return;
          await db.from("sending_domains").update({ status: "verified", verified_at: new Date().toISOString(), dns_records: s.records }).eq("id", d.id);
          d.status = "verified";
        }),
      );
    } catch {
      /* sending not reachable; show as is */
    }
  }
  // Anyone who clicked the link since last visit shows as ready without pressing Check.
  const pending = (senders ?? []).filter((x) => !x.ses_verified_at && x.sent_at).slice(0, 5);
  if (pending.length) {
    const { isEmailVerified } = await import("@/lib/ses");
    const done = (await Promise.all(pending.map(async (x) => ((await isEmailVerified(x.email)) ? x : null)))).filter((x) => x !== null);
    const now = new Date().toISOString();
    for (const x of done) {
      await db.from("sender_addresses").update({ ses_verified_at: now, verified_at: now }).eq("id", x.id);
      x.ses_verified_at = now;
    }
  }
  return (
    <>
      <section className="card p-6" id="senders">
        <h2 className="font-semibold">Sender addresses</h2>
        <p className="mt-1 text-sm text-muted">
          Add the address you want emails to come from. We email it a confirmation link; click it and you&apos;re ready.
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
                        <ActionForm action={checkDomain} className="flex max-w-md flex-col items-end gap-1 text-right text-xs"><input type="hidden" name="id" value={d.id} /><Submit className="btn-secondary py-1 text-xs" pending="Checking…">Check now</Submit></ActionForm>
                      )}
                      <form action={removeDomain}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-muted underline hover:text-danger">Remove</button></form>
                    </div>
                  </div>
                  {d.status === "verified" ? (
                    <p className="mt-1 text-muted">Ready. Add any address <span className="font-medium text-ink">@{d.domain}</span> under Sender addresses above (no confirmation needed) and pick it as the From email on your campaigns.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead><tr className="text-left text-muted"><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Name / Host</th><th className="py-1">Value / Points to</th></tr></thead>
                        <tbody className="font-mono">
                          {(d.dns_records as { type: string; name: string; value: string }[]).map((r) => (
                            <tr key={`${r.type}:${r.name}`} className="border-t border-line align-top">
                              <td className="py-2 pr-3">{r.type}</td>
                              <td className="break-all py-2 pr-3"><span className="select-all font-semibold text-ink">{hostPart(r.name, d.domain)}</span></td>
                              <td className="select-all break-all py-2">{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-muted">Copy the Name exactly as shown; your DNS host adds <span className="font-mono">.{d.domain}</span> on the end for you (GoDaddy, Crazy Domains, Cloudflare and most others do).
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
    </>
  );
}
