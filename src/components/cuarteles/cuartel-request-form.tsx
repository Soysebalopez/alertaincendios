"use client";

import { useState } from "react";
import { CheckCircle, PaperPlaneTilt, Warning } from "@phosphor-icons/react/dist/ssr";

/**
 * Form de alta de cuartel (Opción A del FIREMAN-ONBOARDING-PLAN). Manda los
 * datos a POST /api/cuarteles/request, que los reenvía por email al owner.
 * Incluye honeypot anti-spam (campo "website" oculto).
 */

type Status = "idle" | "submitting" | "success" | "error";

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--muted)",
  marginBottom: 6,
  display: "block",
};

const FIELD_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  background: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--foreground)",
  fontSize: 15,
  fontFamily: "var(--font-sans)",
  outline: "none",
};

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
  textarea,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={LABEL_STYLE}>
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={3}
          style={{ ...FIELD_STYLE, resize: "vertical" }}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          style={FIELD_STYLE}
        />
      )}
    </label>
  );
}

export function CuartelRequestForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    setStatus("submitting");
    try {
      const res = await fetch("/api/cuarteles/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        className="text-left"
        style={{
          background: "var(--background)",
          border: "1px solid var(--accent)",
          borderRadius: 14,
          padding: "28px 26px",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <CheckCircle size={26} weight="fill" className="text-accent shrink-0" />
        <div>
          <p
            className="text-foreground"
            style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}
          >
            ¡Recibido!
          </p>
          <p
            className="text-muted"
            style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}
          >
            Te vamos a contactar para coordinar el alta de tu cuartel. Estamos
            sumando cuarteles de a uno en esta etapa, así que puede tardar unos
            días.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="text-left"
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "26px",
        display: "grid",
        gap: 16,
      }}
    >
      {/* Honeypot anti-spam: oculto para humanos, los bots lo completan. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
      />

      <Field
        label="Nombre del cuartel"
        name="cuartel"
        required
        placeholder="Bomberos Voluntarios de El Bolsón"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
        }}
      >
        <Field label="Provincia" name="provincia" required placeholder="Río Negro" />
        <Field label="Localidad" name="localidad" required placeholder="El Bolsón" />
      </div>
      <Field
        label="Tu nombre y cargo"
        name="contacto"
        required
        placeholder="Juan Pérez, jefe de cuartel"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
        }}
      >
        <Field
          label="Teléfono / WhatsApp"
          name="telefono"
          required
          type="tel"
          placeholder="+54 9 294 ..."
        />
        <Field
          label="Email"
          name="email"
          type="email"
          placeholder="cuartel@ejemplo.com"
        />
      </div>
      <Field
        label="Mensaje"
        name="mensaje"
        textarea
        placeholder="Dotación, zona de cobertura, lo que quieras contarnos…"
      />

      {status === "error" && (
        <p
          className="flex items-center gap-2"
          style={{ fontSize: 14, color: "#e8a33c", margin: 0 }}
        >
          <Warning size={16} weight="fill" />
          No pudimos enviar tu solicitud. Probá de nuevo en un rato.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center gap-2.5 text-white font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
        style={{
          padding: "14px 22px",
          borderRadius: 12,
          background: "var(--accent)",
          fontSize: 16,
          border: "none",
          cursor: status === "submitting" ? "default" : "pointer",
          boxShadow: "0 18px 38px -18px var(--accent)",
        }}
      >
        {status === "submitting" ? (
          "Enviando…"
        ) : (
          <>
            <PaperPlaneTilt size={17} weight="fill" /> Pedir el alta de mi cuartel
          </>
        )}
      </button>
      <p className="text-muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
        Los campos con <span className="text-accent">*</span> son obligatorios.
      </p>
    </form>
  );
}
