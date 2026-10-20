export const metadata = { title: "Billing history · Desk Frog Mail" };

export default function BillingHistory() {
  return (
    <section className="card p-6">
      <h2 className="font-semibold">Billing history</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead className="bg-soft"><tr><th className="th">Receipt</th><th className="th">Date</th><th className="th">Amount</th><th className="th" /></tr></thead>
          <tbody><tr><td colSpan={4} className="td py-10 text-center text-muted">No receipts yet. Tax invoices (with your ABN and GST) will appear here once card billing starts.</td></tr></tbody>
        </table>
      </div>
    </section>
  );
}
