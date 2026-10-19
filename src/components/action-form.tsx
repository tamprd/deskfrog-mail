"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type State = { error?: string; ok?: string; key?: string; secret?: string } | undefined | null;

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, run] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      {state?.error && <p className="mt-3 text-sm text-danger" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-3 text-sm text-forest" role="status">{state.ok}</p>}
      {(state?.key || state?.secret) && (
        <div className="mt-3 rounded-lg border border-frog-200 bg-frog-50 p-3 text-sm">
          <p className="font-semibold text-forest">Copy this now — it won&apos;t be shown again.</p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs">{state.key ?? state.secret}</code>
        </div>
      )}
    </form>
  );
}

export function Submit({ children, className = "btn-primary", pending }: { children: React.ReactNode; className?: string; pending?: string }) {
  const s = useFormStatus();
  return (
    <button className={className} disabled={s.pending}>
      {s.pending ? pending ?? "Working…" : children}
    </button>
  );
}
