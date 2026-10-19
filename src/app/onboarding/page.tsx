import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { Logo } from "@/components/frog";

async function createWorkspace(formData: FormData) {
  "use server";
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) redirect("/onboarding?error=Name+required");

  const db = admin();
  const { data: existing } = await db.from("workspace_members").select("workspace_id").eq("user_id", user.id).limit(1);
  if (existing?.length) redirect("/app");

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
  const slug = `${base.slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: ws, error } = await db.from("workspaces").insert({ name, slug }).select("id").single();
  if (error || !ws) redirect(`/onboarding?error=${encodeURIComponent(error?.message ?? "Failed")}`);
  await db.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  redirect("/app");
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={createWorkspace} className="card w-full max-w-md p-8">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold">Name your workspace</h1>
        <p className="mt-1 text-sm text-muted">Usually your business or club name. Subscribers see it in your emails.</p>
        <label className="label mt-6" htmlFor="name">Workspace name</label>
        <input className="input" id="name" name="name" required maxLength={80} placeholder="Budget Enduro" />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary mt-6 w-full">Create workspace</button>
      </form>
    </main>
  );
}
