/** Little growth-story icons for the pricing plans: spawn → tadpole → bullfrog → king frog. */
const G = "#22c55e", D = "#15803d", F = "#0f5132", L = "#dcfce7";

function Face() {
  return (
    <>
      <ellipse cx="24" cy="31" rx="15" ry="11" fill={G} />
      <circle cx="16" cy="21" r="6" fill={G} />
      <circle cx="32" cy="21" r="6" fill={G} />
      <circle cx="16" cy="21" r="3.6" fill="#fff" />
      <circle cx="32" cy="21" r="3.6" fill="#fff" />
      <circle cx="16.8" cy="21.6" r="1.8" fill={F} />
      <circle cx="32.8" cy="21.6" r="1.8" fill={F} />
      <path d="M17 33q7 5 14 0" stroke={F} strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="24" cy="36" rx="8" ry="3" fill={L} opacity=".6" />
    </>
  );
}

export function PlanIcon({ plan, className = "h-12 w-12" }: { plan: string; className?: string }) {
  const p = plan.toLowerCase();
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="23" fill="#f0fdf4" />
      {p === "free" && (
        <>
          {[[17, 19], [29, 18], [23, 29], [13, 30], [33, 30]].map(([x, y]) => (
            <g key={`${x}${y}`}>
              <circle cx={x} cy={y} r="6.5" fill={L} stroke={G} strokeWidth="1.5" />
              <circle cx={x + 0.8} cy={y + 0.6} r="2.2" fill={F} />
            </g>
          ))}
        </>
      )}
      {p === "tadpole" && (
        <>
          <path d="M26 24c6-1 9 4 15 1-3 6-10 5-15 3" fill={D} />
          <ellipse cx="20" cy="24" rx="10" ry="8" fill={G} />
          <circle cx="16" cy="21.5" r="2.6" fill="#fff" />
          <circle cx="16.6" cy="22" r="1.3" fill={F} />
          <circle cx="13" cy="33" r="1.6" fill={L} stroke={G} />
          <circle cx="9" cy="28" r="1" fill={L} stroke={G} />
        </>
      )}
      {(p === "bullfrog" || p === "king frog") && <Face />}
      {p === "king frog" && (
        <path d="M14 15l2-9 5 5 3-7 3 7 5-5 2 9z" fill="#facc15" stroke="#b45309" strokeWidth="1.2" strokeLinejoin="round" />
      )}
    </svg>
  );
}
