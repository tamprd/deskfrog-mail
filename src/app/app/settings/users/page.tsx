import { requireSession } from "@/lib/session";
import { admin } from "@/lib/supabase/admin";

export const metadata = { title: "Users · Desk Frog Mail" };

export default async function Users() {
  const { workspace, user } = await requireSession();
  const db = admin();
  const { data: memberRows } = await db.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", workspace.id).order("created_at");
  const members = await Promise.all((memberRows ?? []).map(async (m) => ({ ...m, email: (await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? "unknown" })));
  return (
        <section className="card p-6">
          <h2 className="font-semibold">Users in {workspace.name}</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-frog-100 font-bold text-forest">{m.email[0]?.toUpperCase()}</span>
                  <span><span className="font-medium">{m.email}</span>{m.user_id === user.id && <span className="pill ml-2 bg-soft text-muted">You</span>}</span>
                </span>
                <span className="pill bg-teal/10 capitalize text-teal-700">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Inviting teammates is coming next.</p>
        </section>
  );
}
