import Link from "next/link";
import { RECIPIENT_FILTERS, filterCounts, recipientState, recipientsPage, type RecipientFilter } from "@/lib/recipients";

const when = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }) : "—";

export async function Recipients({ campaignId, filter, q, page }: { campaignId: string; filter: RecipientFilter; q?: string; page: number }) {
  const [counts, { rows, total }] = await Promise.all([filterCounts(campaignId), recipientsPage(campaignId, filter, q, page)]);
  const pages = Math.max(1, Math.ceil(total / 100));
  const href = (p: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams({ tab: "recipients", filter, ...(q ? { q } : {}) });
    Object.entries(p).forEach(([k, v]) => (v === undefined || v === "" ? sp.delete(k) : sp.set(k, String(v))));
    return `?${sp}`;
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap gap-1.5 border-b border-line p-3" role="tablist" aria-label="Filter recipients">
        {(Object.keys(RECIPIENT_FILTERS) as RecipientFilter[]).map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: undefined })}
            role="tab"
            aria-selected={filter === f}
            className={`pill border px-3 py-1 text-sm ${filter === f ? "border-frog-700 bg-frog-700 text-white" : "border-line bg-white text-ink hover:bg-frog-50"}`}
          >
            {RECIPIENT_FILTERS[f]} <span className={`tabular-nums ${filter === f ? "text-white/80" : "text-muted"}`}>{counts[f].toLocaleString("en-AU")}</span>
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" role="search">
        <input type="hidden" name="tab" value="recipients" />
        <input type="hidden" name="filter" value={filter} />
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="Search email…" aria-label="Search recipients" />
        <button className="btn-secondary">Search</button>
        <a href={`/app/campaigns/${campaignId}/export?filter=${filter}`} className="btn-secondary ml-auto" download>⬇ Export CSV</a>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-soft">
            <tr><th className="th">Recipient</th><th className="th">Status</th><th className="th">Opened</th><th className="th">Clicks</th><th className="th">Delivered</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = recipientState(r);
              const name = [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(" ");
              return (
                <tr key={r.id}>
                  <td className="td">
                    {r.contact ? <Link href={`/app/contacts/${r.contact.id}`} className="font-medium hover:underline">{r.to_email}</Link> : <span className="font-medium">{r.to_email}</span>}
                    {name && <span className="block text-xs text-muted">{name}</span>}
                    {r.contact?.status === "unsubscribed" && <span className="pill mt-1 bg-gray-100 text-muted">unsubscribed</span>}
                  </td>
                  <td className="td"><span className={`pill ${s.tone}`}>{s.label}</span>{r.last_error && s.label !== "Opened" && <span className="block text-[11px] text-muted">{r.last_error}</span>}</td>
                  <td className="td text-sm">{r.opened_at || r.clicked_at ? <>{when(r.opened_at ?? r.clicked_at)}{r.open_count > 1 && <span className="text-xs text-muted"> · {r.open_count}×</span>}</> : "—"}</td>
                  <td className="td tabular-nums">{r.click_count || "—"}</td>
                  <td className="td text-sm text-muted">{when(r.delivered_at ?? r.sent_at)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="td py-10 text-center text-muted">Nobody here{q ? " matching that search" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex justify-between border-t border-line p-4 text-sm">
          {page > 1 ? <Link className="font-semibold text-frog-700" href={href({ page: page - 1 })}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages} · {total.toLocaleString("en-AU")} people</span>
          {page < pages ? <Link className="font-semibold text-frog-700" href={href({ page: page + 1 })}>Next →</Link> : <span />}
        </nav>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Opens are approximate: Apple Mail and some privacy tools load images automatically, which counts as an open. Clicks are the reliable signal.
      </p>
    </section>
  );
}
