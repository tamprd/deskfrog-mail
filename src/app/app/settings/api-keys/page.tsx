import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ActionForm, Submit } from "@/components/action-form";
import { createApiKey, renameApiKey, revokeApiKey } from "../../actions";

export const metadata = { title: "API keys · Desk Frog Mail" };

const d = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric" }) : null);

export default async function ApiKeys() {
  const { workspace } = await requireSession();
  const { data: keys } = await admin()
    .from("api_keys")
    .select("id, name, prefix, last_used_at, revoked_at, expires_at, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return (
    <>
      <section className="card p-6">
        <h2 className="font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-muted">
          Let ArgusIQ, your websites and other apps add contacts and send email. Send as <code className="text-xs">Authorization: Bearer dfm_live_…</code> to{" "}
          <code className="text-xs">/api/v1</code>. Give each app its own key so you can revoke one without breaking the others.
        </p>
        <ActionForm action={createApiKey} className="mt-4 grid max-w-2xl gap-2 sm:grid-cols-[1fr_170px_auto]">
          <input className="input" name="name" placeholder="Label, e.g. ArgusIQ" aria-label="Key label" required />
          <select name="expires" className="input" aria-label="Expiry">
            <option value="0">Never expires</option>
            <option value="30">Expires in 30 days</option>
            <option value="90">Expires in 90 days</option>
            <option value="365">Expires in 1 year</option>
          </select>
          <Submit className="btn-primary whitespace-nowrap">Create a key</Submit>
        </ActionForm>
      </section>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-soft"><tr><th className="th">Created</th><th className="th">Expires</th><th className="th">Label</th><th className="th">Key</th><th className="th">Last used</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {keys?.map((k) => {
                const expired = k.expires_at && new Date(k.expires_at).getTime() < now;
                return (
                  <tr key={k.id}>
                    <td className="td whitespace-nowrap">{d(k.created_at)}</td>
                    <td className="td whitespace-nowrap text-muted">{d(k.expires_at) ?? "Never"}</td>
                    <td className="td">
                      <form action={renameApiKey} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={k.id} />
                        <input name="name" defaultValue={k.name} className="w-36 rounded border border-transparent px-1 py-0.5 text-sm hover:border-line focus:border-frog focus:outline-none" aria-label="Key label" />
                        <button className="text-xs text-muted hover:text-frog-700" title="Save label">✎</button>
                      </form>
                    </td>
                    <td className="td font-mono text-xs">{k.prefix}…</td>
                    <td className="td text-muted">{d(k.last_used_at) ?? "Never"}</td>
                    <td className="td">
                      {k.revoked_at ? <span className="pill bg-red-50 text-danger">Revoked</span> : expired ? <span className="pill bg-amber-50 text-warn">Expired</span> : <span className="pill bg-frog-100 text-forest">Active</span>}
                    </td>
                    <td className="td text-right">
                      {!k.revoked_at && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="btn-secondary border-danger py-1 text-xs text-danger">Revoke</button></form>}
                    </td>
                  </tr>
                );
              })}
              {!keys?.length && <tr><td colSpan={7} className="td py-10 text-center text-muted">No API keys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
