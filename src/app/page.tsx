import Link from "next/link";
import { Frog, Logo } from "@/components/frog";

// AUD, GST inclusive. Annual = 10 × monthly (2 months free).
const tiers = [
  { name: "Tadpole", price: 0, items: ["250 contacts", "1,000 sends / month", "Drag-and-drop editor & templates", "Desk Frog badge on emails"] },
  { name: "Hopper", price: 15, items: ["2,500 contacts", "15,000 sends / month", "No badge", "Your own sending domain"] },
  { name: "Leaper", price: 25, popular: true, items: ["5,000 contacts", "30,000 sends / month", "No badge", "Your own sending domain"] },
  { name: "Bullfrog", price: 39, items: ["10,000 contacts", "60,000 sends / month", "Automations", "Your own sending domain"] },
  { name: "King Frog", price: 79, items: ["50,000 contacts", "200,000 sends / month", "Automations", "Priority support"] },
];

// Comparison with typical pricing elsewhere (entry-level paid plan, AUD per month).
const compare = [
  { contacts: "Free plan", them: "250 contacts, 500 sends", us: "250 contacts, 1,000 sends" },
  { contacts: "2,500 contacts", them: "about $70", us: "$15" },
  { contacts: "10,000 contacts", them: "$160", us: "$39" },
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
          <p className="mt-2 text-muted">AUD per month, GST included. Start free, upgrade when you outgrow it. Pay yearly and get 2 months free.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {tiers.map((t) => (
              <div key={t.name} className={`card relative p-6 ${t.popular ? "ring-2 ring-frog" : ""}`}>
                {t.popular && <span className="pill absolute -top-3 left-6 bg-frog-700 text-white">Most popular</span>}
                <p className="font-semibold">{t.name}</p>
                <p className="mt-2 text-3xl font-extrabold tabular-nums">${t.price}<span className="text-sm font-medium text-muted">/mo</span></p>
                <p className="text-xs text-muted">{t.price ? `or $${t.price * 10}/yr` : "free forever"}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {t.items.map((it) => <li key={it} className="flex gap-2"><span className="text-frog-700" aria-hidden>✓</span>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">Every paid plan includes custom HTML, full reporting (who opened and clicked), resend to non-openers and AI writing help.</p>

          <div className="mt-12 overflow-hidden rounded-xl border border-line">
            <div className="bg-frog-50 px-5 py-4">
              <h3 className="text-xl font-bold text-forest">How we compare</h3>
              <p className="text-sm text-muted">Same list, a fraction of the price.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="bg-soft">
                  <tr><th className="th">Your list</th><th className="th">Other providers</th><th className="th">Desk Frog Mail</th></tr>
                </thead>
                <tbody>
                  {compare.map((r) => (
                    <tr key={r.contacts}>
                      <td className="td font-medium">{r.contacts}</td>
                      <td className="td text-muted">{r.them}</td>
                      <td className="td font-bold text-forest">{r.us}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
              &ldquo;Other providers&rdquo; is the typical monthly price of an entry-level paid plan from leading email marketing services, in AUD, as at October 2026.
              Their prices and features change; check current pricing before deciding.
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted sm:px-8">
        © {new Date().getFullYear()} Desk Frog · <a className="hover:underline" href="https://deskfrog.studio">deskfrog.studio</a> · Less croak. More code.
      </footer>
    </main>
  );
}
