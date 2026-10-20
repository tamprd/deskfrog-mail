"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SquareCard } from "@/components/square-card";
import { subscribe, updateCard } from "../actions";

type Props = { appId: string; locationId: string; sandbox: boolean; billingName?: string };

export function Checkout({ plan, price, ...sq }: Props & { plan: { id: string; name: string }; price: number }) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const amount = cycle === "annual" ? price * 10 : price;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {(["monthly", "annual"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCycle(c)} className={`rounded-lg border p-3 text-left text-sm ${cycle === c ? "border-frog-700 bg-frog-50 ring-1 ring-frog-700" : "border-line"}`}>
            <span className="block font-semibold">{c === "monthly" ? "Monthly" : "Yearly"}</span>
            <span className="text-muted">${c === "monthly" ? price : price * 10} {c === "monthly" ? "/ month" : "/ year (2 months free)"}</span>
          </button>
        ))}
      </div>
      <div className="mt-5">
        <SquareCard
          {...sq}
          buttonLabel={`Subscribe · $${amount.toLocaleString("en-AU")} ${cycle === "annual" ? "per year" : "per month"}`}
          onToken={async (token, verificationToken) => {
            const r = await subscribe({ planId: plan.id, cycle, sourceId: token, verificationToken });
            if (r.error) return r;
            router.push("/app/settings/billing?welcome=1");
          }}
        />
      </div>
    </>
  );
}

export function UpdateCard(props: Props) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  if (done) return <p className="text-sm text-forest">Card updated ✓</p>;
  return (
    <SquareCard
      {...props}
      buttonLabel="Save card"
      onToken={async (token, verificationToken) => {
        const r = await updateCard({ sourceId: token, verificationToken });
        if (r.error) return r;
        setDone(true);
        router.refresh();
      }}
    />
  );
}
