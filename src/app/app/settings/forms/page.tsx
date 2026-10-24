import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { ActionForm, Submit } from "@/components/action-form";
import { createForm, deleteForm, toggleForm, updateForm } from "./actions";

export const metadata = { title: "Signup forms · Desk Frog Mail" };

const d = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric" }) : "Never");

function embedHtml(endpoint: string, doubleOptIn: boolean) {
  return `<form action="${endpoint}" method="post">
  <input type="text" name="first_name" placeholder="First name">
  <input type="email" name="email" placeholder="Email" required>
  <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <label><input type="checkbox" required> I'd like to receive emails</label>
  <button type="submit">Subscribe</button>
</form>${doubleOptIn ? "\n<!-- New subscribers get an email to confirm before they're added. -->" : ""}`;
}

function embedJs(endpoint: string) {
  return `fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, first_name, fields: { car: "HQ Monaro" } })
}).then(r => r.json()); // { data: { status: "pending" | "subscribed" } }`;
}

export default async function Forms() {
  const { workspace } = await requireSession();
  const db = admin();
  const [{ data: forms }, { data: lists }] = await Promise.all([
    db
      .from("signup_forms")
      .select("id, name, public_key, allowed_origins, tags, double_opt_in, redirect_url, enabled, submissions, last_submitted_at, created_at, list:lists(name)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    db.from("lists").select("id, name").eq("workspace_id", workspace.id).order("name"),
  ]);

  return (
    <>
      <section className="card p-6">
        <h2 className="font-semibold">Signup forms</h2>
        <p className="mt-1 text-sm text-muted">
          Put a mailing list signup on any website. No API key goes in the page: each form has its own public address that can only add signups,
          only from the websites you list.
        </p>
        <ActionForm action={createForm} className="mt-5 grid max-w-2xl gap-4">
          <div>
            <label className="label" htmlFor="f-name">Form name</label>
            <input id="f-name" className="input" name="name" placeholder="e.g. Lap the Lake website" required maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="f-list">Add signups to</label>
            <select id="f-list" name="list_id" className="input" defaultValue="new">
              <option value="new">A new list with the form&apos;s name</option>
              <option value="">No list (contacts only)</option>
              {lists?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-origins">Websites allowed to use it</label>
            <input id="f-origins" className="input" name="origins" placeholder="lapthelake.com.au" />
            <p className="mt-1 text-xs text-muted">Separate several with commas. www is included automatically. Leave blank to allow any site.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="f-tags">Tags (optional)</label>
              <input id="f-tags" className="input" name="tags" placeholder="cruise-night, website" />
            </div>
            <div>
              <label className="label" htmlFor="f-redirect">Thank-you page (optional)</label>
              <input id="f-redirect" className="input" name="redirect_url" type="url" placeholder="https://lapthelake.com.au/#join" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="double_opt_in" defaultChecked className="mt-1 accent-frog-700" />
            <span><strong>Double opt-in</strong> (recommended). New signups get an email and must click to confirm. Keeps fake and mistyped addresses off your list.</span>
          </label>
          <div><Submit className="btn-primary">Create form</Submit></div>
        </ActionForm>
      </section>

      {forms?.map((f) => {
        const endpoint = `${env.appUrl}/api/forms/${f.public_key}`;
        const list = (f.list as unknown as { name: string } | null)?.name;
        return (
          <section key={f.id} className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{f.name}</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {list ? <>Adds to <strong>{list}</strong></> : "No list"} · {f.submissions.toLocaleString("en-AU")} signups · last {d(f.last_submitted_at)}
                  {f.tags.length > 0 && <> · tags {f.tags.join(", ")}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {f.enabled ? <span className="pill bg-frog-100 text-forest">Live</span> : <span className="pill bg-soft text-muted">Off</span>}
                <form action={toggleForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="enabled" value={String(!f.enabled)} />
                  <button className="btn-secondary py-1 text-xs">{f.enabled ? "Switch off" : "Switch on"}</button>
                </form>
                <form action={deleteForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn-secondary border-danger py-1 text-xs text-danger">Delete</button>
                </form>
              </div>
            </div>

            <div className="mt-4">
              <p className="label">Form address</p>
              <code className="block break-all rounded-lg bg-soft p-3 font-mono text-xs">{endpoint}</code>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-frog-700">Embed code</summary>
              <p className="mt-3 text-sm text-muted">Paste into any web page:</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs">{embedHtml(endpoint, f.double_opt_in)}</pre>
              <p className="mt-3 text-sm text-muted">Or post from your own form with JavaScript (any extra details go in <code className="text-xs">fields</code> for merge tags):</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs">{embedJs(endpoint)}</pre>
            </details>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-frog-700">Settings</summary>
              <ActionForm action={updateForm} className="mt-3 grid max-w-2xl gap-3">
                <input type="hidden" name="id" value={f.id} />
                <div>
                  <label className="label" htmlFor={`o-${f.id}`}>Websites allowed</label>
                  <input id={`o-${f.id}`} className="input" name="origins" defaultValue={f.allowed_origins.map((o: string) => o.replace(/^https:\/\//, "")).join(", ")} placeholder="Any website" />
                </div>
                <div>
                  <label className="label" htmlFor={`r-${f.id}`}>Thank-you page</label>
                  <input id={`r-${f.id}`} className="input" name="redirect_url" type="url" defaultValue={f.redirect_url ?? ""} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="double_opt_in" defaultChecked={f.double_opt_in} className="accent-frog-700" /> Double opt-in
                </label>
                <div><Submit className="btn-secondary">Save</Submit></div>
              </ActionForm>
            </details>
          </section>
        );
      })}
    </>
  );
}
