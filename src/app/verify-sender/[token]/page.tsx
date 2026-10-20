import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase/admin";
import { Frog } from "@/components/frog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm sender · Desk Frog Mail", robots: "noindex" };

async function confirm(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (!/^[a-f0-9]{48}$/.test(token)) return;
  await admin().from("sender_addresses").update({ verified_at: new Date().toISOString() }).eq("token", token).is("verified_at", null);
  redirect(`/verify-sender/${token}`);
}

// Confirmation is a button press (POST), so link scanners that pre-open emails can't verify an address by themselves.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: s } = /^[a-f0-9]{48}$/.test(token)
    ? await admin().from("sender_addresses").select("email, verified_at, workspace:workspaces(name)").eq("token", token).maybeSingle()
    : { data: null };
  const ws = (s?.workspace as unknown as { name: string } | null)?.name ?? "your workspace";

  return (
    <main className="grid min-h-screen place-items-center bg-soft px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
        <Frog className="mx-auto h-16 w-16" />
        {!s ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted">This link is invalid, or the address was removed.</p>
          </>
        ) : s.verified_at ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-forest">Address confirmed ✓</h1>
            <p className="mt-2 text-sm text-muted"><strong className="text-ink">{s.email}</strong> can now be used to send emails from {ws}. You can close this page.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">Confirm your sender address</h1>
            <p className="mt-2 text-sm text-muted"><strong className="text-ink">{ws}</strong> wants to send emails using <strong className="text-ink">{s.email}</strong>.</p>
            <form action={confirm} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button className="btn-primary w-full py-3">Yes, this is my address</button>
            </form>
            <p className="mt-3 text-xs text-muted">Didn&apos;t ask for this? Just close this page.</p>
          </>
        )}
      </div>
    </main>
  );
}
