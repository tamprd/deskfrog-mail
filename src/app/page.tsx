import Link from "next/link";
import { Frog, Logo } from "@/components/frog";

const tiers = [
  { name: "Free", price: "$0", items: ["500 contacts", "1,000 sends / month", "Desk Frog badge on emails", "Shared sending domain"] },
  { name: "Starter", price: "$15", items: ["2,500 contacts", "15,000 sends / month", "No badge", "Your own domain"] },
  { name: "Growth", price: "$39", items: ["10,000 contacts", "60,000 sends / month", "Automations", "Your own domain"] },
  { name: "Pro", price: "$79", items: ["50,000 contacts", "300,000 sends / month", "Automations", "Priority support"] },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-semibold text-ink hover:underline">Sign in</Link>
          <Link href="/login?mode=signup" className="btn-primary">Start for free</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-2 lg:py-20">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-forest sm:text-6xl">
            Email marketing <span className="text-frog-700">made simple.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted">
            Newsletters, announcements and transactional email with an API your apps can talk to. Built in Queensland by Desk Frog.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login?mode=signup" className="btn-primary px-6 py-3 text-base">Start for free →</Link>
            <a href="#pricing" className="btn-secondary px-6 py-3 text-base">See pricing</a>
          </div>
        </div>
        <div className="relative mx-auto">
          <div className="absolute inset-x-6 bottom-2 h-16 rounded-[50%] bg-frog-200/70 blur-sm" aria-hidden />
          <Frog className="relative h-72 w-72 sm:h-96 sm:w-96" />
        </div>
      </section>

      <section id="pricing" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight">Simple pricing</h2>
          <p className="mt-2 text-muted">AUD per month. Start free, upgrade when you outgrow it.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t, i) => (
              <div key={t.name} className={`card p-6 ${i === 1 ? "ring-2 ring-frog" : ""}`}>
                <p className="font-semibold">{t.name}</p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">{t.price}<span className="text-sm font-medium text-muted">/mo</span></p>
                <ul className="mt-4 space-y-2 text-sm">
                  {t.items.map((it) => <li key={it} className="flex gap-2"><span className="text-frog-700" aria-hidden>✓</span>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted sm:px-8">
        © {new Date().getFullYear()} Desk Frog · <a className="hover:underline" href="https://deskfrog.studio">deskfrog.studio</a> · Less croak. More code.
      </footer>
    </main>
  );
}
