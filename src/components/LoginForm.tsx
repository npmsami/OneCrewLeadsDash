"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";

const initial: LoginState = { error: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-7">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white shadow-lg shadow-accent/20">
          OC
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">One Crew</div>
          <div className="text-[11px] text-faint">Leads Hub</div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
        />
        <input type="hidden" name="next" value={next} />
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
