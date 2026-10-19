const STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-ink",
  scheduled: "bg-teal/10 text-teal-700",
  sending: "bg-frog-100 text-forest",
  sent: "bg-frog-100 text-forest",
  subscribed: "bg-frog-100 text-forest",
  failed: "bg-red-50 text-danger",
  bounced: "bg-red-50 text-danger",
  complained: "bg-red-50 text-danger",
  cancelled: "bg-gray-100 text-muted",
  unsubscribed: "bg-gray-100 text-muted",
  paused: "bg-amber-50 text-warn",
  pending: "bg-amber-50 text-warn",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${STATUS[status] ?? "bg-gray-100 text-ink"}`}>{status}</span>;
}
