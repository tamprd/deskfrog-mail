import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { Frog, Logo } from "@/components/frog";

export const metadata = { title: "Sign in · Desk Frog Mail" };

async function sendReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (email) await (await userClient()).auth.resetPasswordForEmail(email);
  // Same answer whether or not the account exists.
  redirect("/login?notice=If+that+email+has+an+account%2C+a+reset+link+is+on+its+way.");
}

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const next = String(formData.get("next") || "/app");
  const mode = String(formData.get("mode"));
  const supabase = await userClient();
  const { error } =
    mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&mode=${mode}`);
  if (mode === "signup") {
    const { data } = await supabase.auth.getSession();
    if (!data.session) redirect("/login?notice=Check+your+email+to+confirm+your+account");
  }
  redirect(next.startsWith("/app") ? next : "/app");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string; mode?: string }>;
}) {
  const { error, notice, next, mode } = await searchParams;
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <Logo />
        <h1 className="mt-10 text-3xl font-bold tracking-tight text-ink">
          {forgot ? "Reset your password" : signup ? "Start sending for free" : "Welcome back"}
        </h1>
        <p className="mt-2 text-muted">
          {forgot ? "We'll email you a link to set a new one." : signup ? "Free for up to 500 contacts. No card needed." : "Sign in to your workspace."}
        </p>
        {forgot ? (
          <form action={sendReset} className="mt-8 max-w-sm space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <button className="btn-primary w-full">Email me a reset link</button>
            <p className="text-sm text-muted"><a className="font-semibold text-frog-700 hover:underline" href="/login">Back to sign in</a></p>
          </form>
        ) : (
        <form action={signIn} className="mt-8 max-w-sm space-y-4">
          <input type="hidden" name="next" value={next ?? "/app"} />
          <input type="hidden" name="mode" value={signup ? "signup" : "signin"} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required minLength={8}
              autoComplete={signup ? "new-password" : "current-password"} />
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          {notice && <p className="text-sm text-forest" role="status">{notice}</p>}
          <button className="btn-primary w-full">{signup ? "Create account" : "Sign in"}</button>
          <p className="text-sm text-muted">
            {signup ? "Already have an account? " : "New here? "}
            <a className="font-semibold text-frog-700 hover:underline" href={signup ? "/login" : "/login?mode=signup"}>
              {signup ? "Sign in" : "Create a free account"}
            </a>
          </p>
          {!signup && <p className="text-sm"><a className="text-muted hover:underline" href="/login?mode=forgot">Forgot your password?</a></p>}
        </form>
        )}
      </section>
      <section className="hidden lg:flex flex-col items-center justify-center bg-frog-50 p-12">
        <Frog className="h-72 w-72" />
        <p className="mt-6 text-2xl font-bold text-forest">Less croak. More inbox.</p>
        <p className="mt-2 text-muted">Email marketing made simple.</p>
      </section>
    </main>
  );
}
