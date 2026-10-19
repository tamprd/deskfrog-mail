import { admin } from "@/lib/supabase/admin";
import { unsubscribeByToken } from "@/lib/suppress";
import { Frog } from "@/components/frog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe · Desk Frog Mail", robots: "noindex" };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (token) await unsubscribeByToken(token, "link");
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: contact } = await admin()
    .from("contacts")
    .select("email, status, workspace:workspaces(name)")
    .eq("unsub_token", token)
    .maybeSingle();

  const sender = (contact?.workspace as unknown as { name: string } | null)?.name ?? "this sender";
  const done = contact?.status === "unsubscribed";

  return (
    <main className="min-h-screen grid place-items-center bg-soft px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card text-center">
        <Frog className="mx-auto h-16 w-16" />
        {!contact ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted">This unsubscribe link is invalid or has expired.</p>
          </>
        ) : done ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">
              <strong>{contact.email}</strong> won&apos;t receive marketing email from {sender} again.
            </p>
          </>
        ) : (
          <form action={unsubscribe}>
            <input type="hidden" name="token" value={token} />
            <h1 className="mt-4 text-xl font-bold text-ink">Unsubscribe from {sender}?</h1>
            <p className="mt-2 text-sm text-muted">
              We&apos;ll stop sending marketing email to <strong>{contact.email}</strong>.
            </p>
            <button className="btn-primary mt-6 w-full">Unsubscribe</button>
          </form>
        )}
        <p className="mt-8 text-xs text-muted">Powered by Desk Frog Mail</p>
      </div>
    </main>
  );
}
