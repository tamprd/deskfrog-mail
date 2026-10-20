"use client";
import { useEffect, useRef, useState } from "react";

/* Minimal typings for Square's Web Payments SDK. Card details go straight to Square; we only see a token. */
type Card = { attach: (sel: string) => Promise<void>; tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>; destroy: () => Promise<void> };
type Payments = {
  card: (opts?: unknown) => Promise<Card>;
  verifyBuyer: (token: string, details: unknown) => Promise<{ token?: string }>;
};
declare global {
  interface Window { Square?: { payments: (appId: string, locationId: string) => Payments } }
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return window.Square ? resolve() : document.querySelector(`script[src="${src}"]`)!.addEventListener("load", () => resolve());
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the secure card form."));
    document.head.appendChild(s);
  });

export function SquareCard({
  appId,
  locationId,
  sandbox,
  buttonLabel,
  billingName,
  onToken,
}: {
  appId: string;
  locationId: string;
  sandbox: boolean;
  buttonLabel: string;
  billingName?: string;
  onToken: (token: string, verificationToken?: string) => Promise<{ error?: string } | void>;
}) {
  const card = useRef<Card | null>(null);
  const payments = useRef<Payments | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!appId || !locationId) throw new Error("Card payments aren't switched on yet.");
        await loadScript(sandbox ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js");
        if (cancelled || !window.Square) return;
        payments.current = window.Square.payments(appId, locationId);
        card.current = await payments.current.card();
        await card.current.attach("#df-card");
        if (!cancelled) setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      card.current?.destroy().catch(() => {});
    };
  }, [appId, locationId, sandbox]);

  async function pay() {
    if (!card.current || !payments.current) return;
    setBusy(true);
    setError(null);
    try {
      const r = await card.current.tokenize();
      if (r.status !== "OK" || !r.token) throw new Error(r.errors?.[0]?.message ?? "Check your card details.");
      let verification: string | undefined;
      try {
        const [givenName, ...rest] = (billingName ?? "").split(" ");
        verification = (await payments.current.verifyBuyer(r.token, { intent: "STORE", billingContact: { givenName, familyName: rest.join(" "), countryCode: "AU" } })).token;
      } catch {
        /* 3-D Secure isn't required for most Australian cards */
      }
      const res = await onToken(r.token, verification);
      if (res && res.error) setError(res.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div id="df-card" className="min-h-[90px]" />
      {!ready && !error && <p className="text-sm text-muted">Loading secure card form…</p>}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      <button type="button" className="btn-primary mt-3 w-full py-3" onClick={pay} disabled={!ready || busy}>
        {busy ? "Processing…" : buttonLabel}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted">🔒 Card details go directly to Square. Desk Frog never sees your card number.</p>
    </div>
  );
}
