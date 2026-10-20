import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

export const metadata = { title: "Billing history · Desk Frog Mail" };

export default async function BillingHistory() {
  const { workspace } = await requireSession();
  const { data: rows } = await admin().from("invoices").select("id, description, amount_cents, status, paid_at, receipt_url, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(200);
  return (
    <section className="card overflow-hidden">
      <div className="p-6 pb-2"><h2 className="font-semibold">Billing history</h2><p className="mt-1 text-sm text-muted">Tax receipts (AUD, GST included). Square also emails each one.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-soft"><tr><th className="th">Receipt</th><th className="th">Date</th><th className="th">Amount</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="td font-medium">{r.description}</td>
                <td className="td text-muted">{new Date(r.paid_at ?? r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="td tabular-nums">${(r.amount_cents / 100).toFixed(2)}</td>
                <td className="td"><span className="pill bg-frog-100 capitalize text-forest">{r.status}</span></td>
                <td className="td text-right">{r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="btn-secondary py-1 text-xs">Download</a>}</td>
              </tr>
            ))}
            {!rows?.length && <tr><td colSpan={5} className="td py-10 text-center text-muted">No receipts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
