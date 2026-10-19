import Link from "next/link";
import { requireSession } from "@/lib/session";
import { Logo } from "@/components/frog";
import { Nav } from "./nav";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace, user } = await requireSession();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-line bg-white px-4 py-4 md:py-6 flex md:flex-col gap-4 md:gap-6 items-center md:items-stretch">
        <Link href="/app" className="shrink-0"><Logo size="sm" /></Link>
        <div className="flex-1 min-w-0"><Nav /></div>
        <div className="hidden md:block rounded-lg bg-frog-50 p-3 text-xs">
          <p className="font-semibold text-forest truncate">{workspace.name}</p>
          <p className="text-muted truncate">{user.email}</p>
          <p className="mt-1"><span className="pill bg-white text-forest border border-frog-200">{workspace.plan.name} plan</span></p>
          <form action={signOut}><button className="mt-2 text-muted hover:text-ink underline">Sign out</button></form>
        </div>
      </aside>
      <main className="px-4 py-6 sm:px-8 sm:py-8 max-w-6xl w-full">
        {workspace.status !== "active" && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger" role="alert">
            <strong>Sending is {workspace.status}.</strong> {workspace.status_reason} — contact hello@deskfrog.studio.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
