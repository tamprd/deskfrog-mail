import Link from "next/link";
import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";
import { ActionForm, Submit } from "@/components/action-form";
import { saveBrand, saveDetails } from "../../actions";
import { DEFAULT_BRAND, FONTS, type Brand } from "@/lib/email/design";

export const metadata = { title: "Details · Desk Frog Mail" };

export default async function Details() {
  const { workspace, user } = await requireSession();
  const db = admin();
  const { data: w } = await db.from("workspaces").select("brand, contact_name, company, contact_email, phone, abn").eq("id", workspace.id).single();
  const { data: lists } = await db.from("lists").select("id, name, from_name, from_email, postal_address, permission_reminder").eq("workspace_id", workspace.id).order("created_at");
  const brand = { ...DEFAULT_BRAND, ...((w?.brand ?? {}) as Partial<Brand>) };
  const field = (name: string, label: string, value: string | null | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} defaultValue={value ?? ""} {...props} />
    </div>
  );

  return (
    <>
      <section className="card p-6">
        <h2 className="font-semibold">Profile information</h2>
        <p className="mt-1 text-sm text-muted">You sign in as <strong className="text-ink">{user.email}</strong>. Password and sessions are under Security.</p>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Primary account contact</h2>
        <p className="mt-1 text-sm text-muted">Who we contact about this account, and the default sender details shown in email footers.</p>
        <ActionForm action={saveDetails} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Account name", workspace.name, { required: true })}
            {field("company", "Company / club", w?.company)}
            {field("contact_name", "Contact name", w?.contact_name)}
            {field("contact_email", "Contact email", w?.contact_email ?? user.email, { type: "email" })}
            {field("phone", "Phone", w?.phone, { type: "tel" })}
            {field("abn", "ABN", w?.abn, { inputMode: "numeric", placeholder: "11 digits" })}
          </div>
          <div>
            {field("sender_address", "Postal address", workspace.sender_address, { placeholder: "PO Box 3365, Darra QLD 4076" })}
            <p className="mt-1 text-xs text-muted">Shown in email footers (required by the Spam Act). Each list can override it below.</p>
          </div>
          <Submit className="btn-secondary" pending="Saving…">Save</Submit>
        </ActionForm>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Lists in this account</h2>
        <p className="mt-1 text-sm text-muted">Each list can have its own footer details and permission reminder, shown at the bottom of every email sent to it.</p>
        <ul className="mt-4 space-y-3">
          {lists?.map((l) => (
            <li key={l.id} className="rounded-lg border border-line p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-muted">{[l.from_name, l.from_email, l.postal_address].filter(Boolean).join(" · ") || "Uses account defaults"}</p>
                  {l.permission_reminder && <p className="mt-1 italic text-muted">&ldquo;{l.permission_reminder}&rdquo;</p>}
                </div>
                <Link href={`/app/contacts/lists/${l.id}`} className="btn-secondary py-1 text-xs">Edit</Link>
              </div>
            </li>
          ))}
          {!lists?.length && <li className="text-sm text-muted">No lists yet. Create one under Audience.</li>}
        </ul>
      </section>

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
    </>
  );
}
