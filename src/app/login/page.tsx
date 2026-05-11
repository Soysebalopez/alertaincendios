import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--background)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "32px 28px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            CLARA — Dashboard interno
          </h1>
          <p
            className="text-muted"
            style={{ fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}
          >
            Solo el owner del proyecto puede entrar acá.
          </p>
        </div>
        <LoginForm nextPath={params.next ?? "/dashboard"} errorParam={params.error} />
      </div>
    </main>
  );
}
