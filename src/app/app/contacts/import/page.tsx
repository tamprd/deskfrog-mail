import Link from "next/link";
import { requireSession } from "@/lib/session";
import { usage } from "@/lib/workspace";
import { MailchimpImporter } from "./importer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import from Mailchimp · Desk Frog Mail" };

export default async function ImportPage() {
  const { workspace } = await requireSession();
  const u = await usage(workspace.id);
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link href="/app/contacts" className="text-sm text-muted hover:underline">← Audience</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Import from Mailchimp</h1>
        <p className="text-muted">Bring your audiences, unsubscribes, bounces, tags, custom fields, images and templates across in one go.</p>
      </header>
      <MailchimpImporter plan={workspace.plan.name} limit={workspace.plan.contact_limit} current={u.contacts} />
    </div>
  );
}
