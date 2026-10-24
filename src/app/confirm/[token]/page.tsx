import { redirect } from "next/navigation";
import { Frog } from "@/components/frog";
import { confirmSubscription, getConfirmation } from "@/lib/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm subscription · Desk Frog Mail", robots: "noindex" };

/**
 * Double opt-in landing page. Confirming takes a button press (not just the GET)
 * so email security scanners that open links don't subscribe people.
 */
async function confirm(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const result = await confirmSubscription(token);
  const c = await getConfirmation(token);
  if (result === "ok" && c?.form?.redirect_url) {
    const u = new URL(c.form.redirect_url);
    u.searchParams.set("signup", "confirmed");
    redirect(u.toString());
  }
  redirect(`/confirm/${token}${result === "expired" ? "?expired=1" : ""}`);
}

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ expired?: string }> }) {
  const { token } = await params;
  const { expired } = await searchParams;
  const c = await getConfirmation(token);
  const sender = c?.workspace?.name ?? "this sender";

  return (
    <main className="grid min-h-screen place-items-center bg-soft px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
        <Frog className="mx-auto h-16 w-16" />
        {!c ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted">This confirmation link is invalid. Try signing up again.</p>
          </>
        ) : expired ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">This link has expired</h1>
            <p className="mt-2 text-sm text-muted">Confirmation links last 7 days. Sign up again and we&apos;ll send a fresh one.</p>
          </>
        ) : c.confirmed_at ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-forest">You&apos;re subscribed ✓</h1>
            <p className="mt-2 text-sm text-muted">
              <strong>{c.contact?.email}</strong> will now get emails from {sender}. You can close this page.
            </p>
          </>
        ) : (
          <form action={confirm}>
            <input type="hidden" name="token" value={token} />
            <h1 className="mt-4 text-xl font-bold text-ink">Confirm your subscription</h1>
            <p className="mt-2 text-sm text-muted">
              Get emails from <strong>{sender}</strong> at <strong>{c.contact?.email}</strong>?
            </p>
            <button className="btn-primary mt-6 w-full">Yes, subscribe me</button>
          </form>
        )}
        <p className="mt-8 text-xs text-muted">Powered by Desk Frog Mail</p>
      </div>
    </main>
  );
}
