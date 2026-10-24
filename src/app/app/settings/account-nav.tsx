"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { label: string; href?: string; children?: { label: string; href: string }[] };

const ITEMS: Item[] = [
  { label: "Overview", href: "/app/settings" },
  {
    label: "Settings",
    children: [
      { label: "Details", href: "/app/settings/details" },
      { label: "Users", href: "/app/settings/users" },
      { label: "Security", href: "/app/settings/security" },
      { label: "Notifications", href: "/app/settings/notifications" },
      { label: "Manage my data", href: "/app/settings/data" },
    ],
  },
  {
    label: "Billing",
    children: [
      { label: "Plan", href: "/app/settings/billing" },
      { label: "Billing history", href: "/app/settings/billing/history" },
      { label: "Manage my plan", href: "/app/settings/billing/manage" },
    ],
  },
  { label: "Domains", href: "/app/settings/domains" },
  {
    label: "Extras",
    children: [
      { label: "Signup forms", href: "/app/settings/forms" },
      { label: "API keys", href: "/app/settings/api-keys" },
      { label: "Referral program", href: "/app/settings/referrals" },
    ],
  },
  { label: "Integrations", href: "/app/settings/integrations" },
  { label: "Plans", href: "/app/settings/plans" },
];

export function AccountNav() {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  useEffect(() => setOpen(null), [path]);

  const active = (i: Item) => (i.href ? path === i.href : i.children!.some((c) => path === c.href));
  const cls = (on: boolean) =>
    `flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${on ? "border-frog-700 text-frog-700" : "border-transparent text-ink hover:text-frog-700"}`;

  return (
    <nav ref={ref} className="mt-5 flex flex-wrap gap-1 border-b border-line" aria-label="Account">
      {ITEMS.map((i) =>
        i.href ? (
          <Link key={i.label} href={i.href} className={cls(active(i))} aria-current={active(i) ? "page" : undefined}>
            {i.label}
          </Link>
        ) : (
          <div key={i.label} className="relative">
            <button type="button" className={cls(active(i))} aria-expanded={open === i.label} onClick={() => setOpen(open === i.label ? null : i.label)}>
              {i.label}
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
            </button>
            {open === i.label && (
              <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-line bg-white py-1 shadow-card">
                {i.children!.map((c) => (
                  <Link key={c.href} href={c.href} className={`block px-4 py-2 text-sm hover:bg-frog-50 ${path === c.href ? "font-semibold text-frog-700" : "text-ink"}`}>
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </nav>
  );
}
