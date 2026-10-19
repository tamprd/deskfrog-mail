import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";

/** Signed-in user + their workspace (first membership). Redirects as needed. */
export const requireSession = cache(async () => {
  const supabase = await userClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await admin()
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const workspace = await getWorkspace(membership.workspace_id);
  return { user, role: membership.role as string, workspace, supabase };
});
