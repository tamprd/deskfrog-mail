import "server-only";
import { Resolver } from "node:dns/promises";

type Rec = { type: string; name: string; value: string };
export type RecordCheck = Rec & { state: "ok" | "missing" | "doubled" | "wrong" };

const resolver = () => {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["8.8.8.8", "1.1.1.1"]);
  return r;
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\.$/, "").replace(/^"|"$/g, "");

async function lookup(r: Resolver, type: string, name: string): Promise<string[]> {
  try {
    if (type === "CNAME") return (await r.resolveCname(name)).map(norm);
    if (type === "MX") return (await r.resolveMx(name)).map((m) => `${m.priority} ${norm(m.exchange)}`);
    if (type === "TXT") return (await r.resolveTxt(name)).map((t) => norm(t.join("")));
  } catch {
    /* not found */
  }
  return [];
}

/** Look up each record the customer was asked to add, and spot the common "domain added twice" mistake. */
export async function checkRecords(domain: string, records: Rec[]): Promise<RecordCheck[]> {
  const r = resolver();
  return Promise.all(
    records.map(async (rec): Promise<RecordCheck> => {
      const want = norm(rec.value);
      const match = (vals: string[]) => vals.some((v) => (rec.type === "TXT" ? v.startsWith(want.split(";")[0]) : v === want));
      const found = await lookup(r, rec.type, rec.name);
      if (match(found)) return { ...rec, state: "ok" };
      // _dmarc: any existing DMARC record is fine; don't ask for a second one.
      if (rec.name.startsWith("_dmarc.") && found.some((v) => v.startsWith("v=dmarc1"))) return { ...rec, state: "ok" };
      if (match(await lookup(r, rec.type, `${rec.name}.${domain}`))) return { ...rec, state: "doubled" };
      return { ...rec, state: found.length ? "wrong" : "missing" };
    }),
  );
}

/** The host part DNS panels want, e.g. "abc._domainkey" for "abc._domainkey.example.com". */
export const hostPart = (name: string, domain: string) => (name === domain ? "@" : name.endsWith(`.${domain}`) ? name.slice(0, -(domain.length + 1)) : name);
