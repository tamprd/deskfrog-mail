import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ActionForm, Submit } from "@/components/action-form";
import { saveNotifications } from "../../actions";

export const metadata = { title: "Notifications · Desk Frog Mail" };

const PREFS: [string, string, string, boolean][] = [
  ["campaign_sent", "Campaign finished", "A summary when a campaign finishes sending: delivered, opens, clicks, bounces.", true],
  ["bounce_alert", "Delivery problems (coming soon)", "When a campaign has a high bounce or complaint rate, or sending is paused.", true],
  ["draft_reminder", "Abandoned drafts", "A weekly nudge about drafts you haven't touched in 1–2 weeks.", true],
  ["import_reminder", "Imported but not emailed (coming soon)", "A reminder if you import contacts and don't email them within 7 days.", true],
  ["billing_alerts", "Billing alerts (coming soon)", "Receipts, failed payments and plan limits.", true],
  ["product_news", "Desk Frog news and tips (coming soon)", "New features and the occasional how-to. No more than monthly.", false],
];

export default async function Notifications() {
  const { workspace, user } = await requireSession();
  const { data } = await admin().from("workspaces").select("notify, contact_email").eq("id", workspace.id).single();
  const notify = (data?.notify ?? {}) as Record<string, boolean>;
  return (
    <section className="card p-6">
      <h2 className="font-semibold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted">Sent to <strong className="text-ink">{data?.contact_email || user.email}</strong> (change it under Details).</p>
      <ActionForm action={saveNotifications} className="mt-4">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {PREFS.map(([key, label, desc, def]) => (
            <li key={key}>
              <label className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted">{desc}</span>
                </span>
                <input type="checkbox" name={key} defaultChecked={notify[key] ?? def} className="mt-1 h-4 w-4 accent-frog-700" />
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4"><Submit className="btn-secondary" pending="Saving…">Save preferences</Submit></div>
      </ActionForm>
    </section>
  );
}
