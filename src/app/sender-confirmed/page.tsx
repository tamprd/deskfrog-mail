import Link from "next/link";
import { Frog } from "@/components/frog";

export const metadata = { title: "Sender confirmed · Desk Frog Mail", robots: "noindex" };

/** Where Amazon sends people after they click the link in our "Confirm your sending address" email. */
export default async function Page({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const { failed } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-soft px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
        <Frog className="mx-auto h-16 w-16" />
        {failed ? (
          <>
            <h1 className="mt-4 text-xl font-bold text-ink">That link didn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted">It may have expired (links last 24 hours). Go to Settings → Domains and press Resend to get a fresh one.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold text-forest">Address confirmed ✓</h1>
            <p className="mt-2 text-sm text-muted">You can now send campaigns from this address. You can close this page.</p>
          </>
        )}
        <Link href="/app/settings/domains" className="btn-primary mt-6 inline-flex">Back to Desk Frog Mail</Link>
      </div>
    </main>
  );
}
