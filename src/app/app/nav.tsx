"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Dashboard", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/app/campaigns", label: "Campaigns", icon: "M22 2 11 13M22 2l-7 20-4-9-9-4z" },
  { href: "/app/contacts", label: "Audience", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { href: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 2z" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col overflow-x-auto">
      {items.map((i) => {
        const active = i.href === "/app" ? path === "/app" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
              active ? "bg-frog-700 text-white" : "text-ink hover:bg-frog-50"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={i.icon} />
            </svg>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
