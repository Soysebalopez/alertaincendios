interface TranslationInput {
  city: string;
  airQuality: Record<string, { value: number; unit: string; level: string }>;
  wind: {
    speed: number;
    directionEs: string;
    temperature: number;
    humidity: number;
  };
  fires?: {
    count: number;
  };
}

/**
 * Translates raw environmental data into a citizen-friendly summary.
 * Primary: Groq (llama-3.3-70b) → Fallback: template.
 */
export async function translateToCitizen(
  input: TranslationInput,
): Promise<string> {
  const prompt = buildPrompt(input);

  const groqResult = await tryGroq(prompt);
  if (groqResult) return groqResult;

  return buildTemplateSummary(input);
}

async function tryGroq(prompt: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function buildTemplateSummary(input: TranslationInput): string {
  const parts: string[] = [];

  // Determine overall air level
  const levels = Object.values(input.airQuality).map((p) => p.level);
  const priority = ["dangerous", "bad", "moderate", "good"];
  const worst = priority.find((p) => levels.includes(p)) || "good";

  const levelWord: Record<string, string> = {
    good: "BUENA",
    moderate: "MODERADA",
    bad: "MALA",
    dangerous: "PELIGROSA",
  };

  parts.push(
    `La calidad del aire en ${input.city} es ${levelWord[worst] || "BUENA"}.`,
  );

  if (input.wind.speed > 0) {
    parts.push(
      `Temperatura de ${input.wind.temperature} grados con viento del ${input.wind.directionEs.toLowerCase()} a ${input.wind.speed} km/h.`,
    );
  }

  if (input.fires && input.fires.count > 0) {
    parts.push(
      `Se detectaron ${input.fires.count} focos de calor en la zona.`,
    );
  }

  return parts.join(" ");
}

function buildPrompt(input: TranslationInput): string {
  const lines: string[] = [
    `Sos un traductor de datos ambientales para ciudadanos de ${input.city}, Argentina.`,
    "Traduci estos datos a un resumen de 2-3 oraciones en lenguaje simple, sin jerga cientifica.",
    "Usa el semaforo: BUENO, MODERADO, MALO o PELIGROSO. Se neutral, no acusatorio. Sin markdown.",
    "",
    "Datos actuales:",
  ];

  for (const [param, data] of Object.entries(input.airQuality)) {
    lines.push(`${param}: ${data.value} ${data.unit}`);
  }

  lines.push(
    `Viento: ${input.wind.speed} km/h del ${input.wind.directionEs}`,
  );
  lines.push(
    `Temperatura: ${input.wind.temperature}C, Humedad: ${input.wind.humidity}%`,
  );

  if (input.fires && input.fires.count > 0) {
    lines.push(`Focos de calor activos: ${input.fires.count}`);
  }

  lines.push("", "Resumen ciudadano:");
  return lines.join("\n");
}
