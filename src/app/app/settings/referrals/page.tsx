import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { badgeHtml } from "@/lib/render";

export const metadata = { title: "Referral program · Desk Frog Mail" };

export default async function Referrals() {
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: credits }, { count: signups }] = await Promise.all([
    db.from("referral_credits").select("amount_cents, status").eq("workspace_id", workspace.id),
    db.from("workspaces").select("id", { count: "exact", head: true }).eq("referred_by", workspace.id),
  ]);
  const sum = (s?: string) => (credits ?? []).filter((c) => !s || c.status === s).reduce((n, c) => n + c.amount_cents, 0) / 100;
  const link = `${env.appUrl}/?ref=${workspace.referral_code}`;
  return (
    <>
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Referral program</h2>
        <p className="mt-2 text-sm text-muted">
          Share Desk Frog Mail and you both get <strong className="text-ink">$20 credit</strong> when someone you refer starts a paid plan.
          Free-plan emails already carry the &ldquo;Sent with Desk Frog Mail&rdquo; badge with your referral link, so every email you send can earn credit.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div><p className="text-2xl font-bold tabular-nums">{signups ?? 0}</p><p className="text-xs text-muted">Sign-ups from your link</p></div>
          <div><p className="text-2xl font-bold tabular-nums">${sum().toFixed(2)}</p><p className="text-xs text-muted">Credit earned in total</p></div>
          <div><p className="text-2xl font-bold tabular-nums">${sum("earned").toFixed(2)}</p><p className="text-xs text-muted">Credit left to use</p></div>
        </div>
      </section>
      <section className="card p-6">
        <h2 className="font-semibold">Your referral link</h2>
        <p className="mt-2 select-all rounded-lg bg-soft p-3 font-mono text-sm">{link}</p>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <p className="label">Email badge</p>
            <div className="rounded-lg border border-line p-4" dangerouslySetInnerHTML={{ __html: badgeHtml(workspace.referral_code) }} />
            <p className="mt-2 text-xs text-muted">{workspace.plan.badge_required ? "Shown on all your emails on the Free plan." : "Paid plans don't show the badge."}</p>
          </div>
          <div>
            <p className="label">Text link for your website</p>
            <pre className="overflow-x-auto rounded-lg bg-soft p-3 text-xs">{`<a href="${link}">Email by Desk Frog Mail</a>`}</pre>
          </div>
        </div>
      </section>
    </>
  );
}
