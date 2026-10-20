import { admin } from "@/lib/supabase/admin";

export async function Links({ campaignId }: { campaignId: string }) {
  const { data } = await admin().rpc("campaign_links", { cid: campaignId });
  const rows = (data ?? []) as { link: string; clicks: number; people: number }[];
  const max = Math.max(1, ...rows.map((r) => r.clicks));
  return (
    <section className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-soft"><tr><th className="th">Link</th><th className="th w-28 text-right">People</th><th className="th w-28 text-right">Clicks</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.link}>
              <td className="td">
                <a href={r.link} target="_blank" rel="noopener noreferrer" className="block max-w-[52ch] truncate font-medium text-frog-700 hover:underline" title={r.link}>{r.link}</a>
                <div className="mt-1.5 h-1.5 rounded-full bg-frog-100"><div className="h-1.5 rounded-full bg-frog" style={{ width: `${(r.clicks / max) * 100}%` }} /></div>
              </td>
              <td className="td text-right tabular-nums">{Number(r.people).toLocaleString("en-AU")}</td>
              <td className="td text-right tabular-nums">{Number(r.clicks).toLocaleString("en-AU")}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="td py-10 text-center text-muted">No clicks yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
