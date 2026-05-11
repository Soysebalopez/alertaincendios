"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  async function handle() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={handle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 500,
        background: "transparent",
        color: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        cursor: "pointer",
        marginLeft: 8,
      }}
    >
      {children}
    </button>
  );
}
