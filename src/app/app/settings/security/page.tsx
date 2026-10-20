import { requireSession } from "@/lib/session";
import { ActionForm, Submit } from "@/components/action-form";
import { changePassword, signOutEverywhere } from "../../actions";

export const metadata = { title: "Security · Desk Frog Mail" };

export default async function Security() {
  const { user } = await requireSession();
  return (
        <>
          <section className="card p-6">
            <h2 className="font-semibold">Password</h2>
            <p className="mt-1 text-sm text-muted">Signed in as <strong className="text-ink">{user.email}</strong>.</p>
            <ActionForm action={changePassword} className="mt-4 grid max-w-md gap-3">
              <input name="password" type="password" minLength={10} required autoComplete="new-password" className="input" placeholder="New password (10+ characters)" aria-label="New password" />
              <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className="input" placeholder="Repeat new password" aria-label="Repeat new password" />
              <Submit className="btn-secondary w-fit" pending="Saving…">Change password</Submit>
            </ActionForm>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">Sessions</h2>
            <p className="mt-1 text-sm text-muted">Lost a device or shared your login? Sign out everywhere, including this browser.</p>
            <form action={signOutEverywhere} className="mt-4"><button className="btn-secondary">Sign out of all devices</button></form>
          </section>
          <section className="card p-6">
            <h2 className="font-semibold">2-factor authentication</h2>
            <p className="mt-1 text-sm text-muted">Authenticator-app codes at sign-in are coming next.</p>
          </section>
        </>
  );
}
