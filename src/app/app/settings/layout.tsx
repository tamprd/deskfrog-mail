import { requireSession } from "@/lib/session";
import { AccountNav } from "./account-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · Desk Frog Mail" };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireSession();
  return (
    <div className="max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
        {workspace.status !== "active" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-warn">
            Sending is {workspace.status}{workspace.status_reason ? `: ${workspace.status_reason}` : ""}.
          </p>
        )}
        <AccountNav />
      </header>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}
