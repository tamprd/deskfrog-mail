/* eslint-disable @next/next/no-img-element */
export function Frog({ className = "h-10 w-10" }: { className?: string }) {
  return <img src="/frog.png" alt="" aria-hidden className={className} />;
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: ["h-7 w-7", "text-base"], md: ["h-9 w-9", "text-lg"], lg: ["h-14 w-14", "text-3xl"] }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <Frog className={s[0]} />
      <span className={`${s[1]} font-extrabold tracking-tight text-forest`}>
        Desk Frog <span className="text-frog-700">Mail</span>
      </span>
    </span>
  );
}
