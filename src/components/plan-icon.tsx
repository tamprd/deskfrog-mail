/* eslint-disable @next/next/no-img-element */
/** Growth-story icons for the pricing plans: spawn → tadpole → bullfrog → king frog. */
export function PlanIcon({ plan, className = "h-12 w-12" }: { plan: string; className?: string }) {
  const slug = plan.toLowerCase().replace(/\s+/g, "-");
  return <img src={`/plans/${slug}.png`} alt="" aria-hidden className={`${className} object-contain`} />;
}
