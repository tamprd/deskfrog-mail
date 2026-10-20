import "server-only";
import { promises as dns } from "node:dns";

const cache = new Map<string, { policy: string; at: number }>();

/** DMARC policy for a domain ("none" | "quarantine" | "reject"), checking the parent domain if the exact one has none. Cached for an hour. */
export async function dmarcPolicy(domain: string): Promise<string> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.policy;
  const lookup = async (d: string) => {
    try {
      const rows = (await dns.resolveTxt(`_dmarc.${d}`)).map((r) => r.join(""));
      const rec = rows.find((r) => /^v=DMARC1/i.test(r.trim()));
      return rec ? (/(?:^|;)\s*p\s*=\s*(\w+)/i.exec(rec)?.[1]?.toLowerCase() ?? "none") : null;
    } catch {
      return null;
    }
  };
  let policy = await lookup(domain);
  if (policy === null && domain.split(".").length > 2) policy = await lookup(domain.split(".").slice(1).join("."));
  const result = policy ?? "none";
  cache.set(domain, { policy: result, at: Date.now() });
  return result;
}

/** Can we put this address in From without the receiver treating it as spoofed? */
export async function canSendAs(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return (await dmarcPolicy(domain)) === "none";
}
