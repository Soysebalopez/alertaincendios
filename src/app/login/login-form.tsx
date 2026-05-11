"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({
  nextPath,
  errorParam,
}: {
  nextPath: string;
  errorParam?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorParam === "forbidden"
      ? "Tu cuenta no está autorizada para este dashboard."
      : null
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setSubmitting(false);
      setError(authError.message ?? "Credenciales inválidas.");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="font-mono text-[10px] text-muted tracking-wide uppercase">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: "10px 12px",
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 14,
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="font-mono text-[10px] text-muted tracking-wide uppercase">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: "10px 12px",
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
            fontSize: 14,
          }}
        />
      </label>
      {error ? (
        <div
          style={{
            padding: "8px 12px",
            background: "color-mix(in oklab, var(--danger) 12%, transparent)",
            border: "1px solid color-mix(in oklab, var(--danger) 35%, transparent)",
            borderRadius: 8,
            color: "var(--danger, #ff6b6b)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "12px 16px",
          background: submitting ? "var(--muted)" : "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          cursor: submitting ? "wait" : "pointer",
          marginTop: 4,
        }}
      >
        {submitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
