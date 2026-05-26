# DECISION_FRAMEWORK.md

Reglas absolutas que un agente debe respetar en cualquier sesión autónoma (sin supervisión humana en tiempo real), sin importar el proyecto.

Para reglas operativas específicas de este proyecto (stack, comandos, anti-patterns de dominio), ver `CLAUDE.md`.

---

## 1. Prohibiciones absolutas (no admiten excepción)

### Git y control de versiones
- NUNCA pushear a `main` o `master` directamente. Todo va por feature branch + PR.
- NUNCA `git push --force` ni `--force-with-lease` ni reescribir historia compartida (rebase de commits ya pusheados, amend de commits ajenos, etc.).
- NUNCA borrar branches remotas, commits, tags, ni archivos no relacionados con el ticket en curso.
- NUNCA hacer commits sin firma adecuada o saltarse hooks (`--no-verify`).

### Producción y servicios remotos
- NUNCA correr migraciones contra producción (Supabase remoto, Postgres prod, etc.). Si necesita schema change, usa preview branches o blocker.
- NUNCA hacer deploys a producción (Vercel `--prod`, Railway prod env, App Store, Play Store).
- NUNCA modificar permisos, roles ni policies de RLS en Supabase remoto.
- NUNCA mandar emails reales ni mensajes a usuarios finales (Resend, Twilio, Telegram a chats que no sean el de Oswald, etc.). Para probar: mocks o sandbox.
- NUNCA llamar a webhooks externos en modo producción.

### Secretos
- NUNCA hardcodear, loggear, ni commitear secretos (API keys, tokens, passwords, connection strings).
- Si encuentra un secreto expuesto en el código existente: blocker inmediato + nota para rotación manual. NO intentar borrarlo de la historia.

### Dependencias
- NUNCA instalar nuevos top-level dependencies sin justificarlo en el PR description ("usé X porque Y, no había alternativa con lo existente").
- NUNCA upgradear major versions de frameworks (React, Next, Swift, Supabase SDK, etc.). Siempre blocker — el upgrade lo decide y ejecuta el usuario.
- Cambios de minor/patch versions están permitidos solo si son parte del ticket o necesarios para fix de seguridad.

---

## 2. Scope discipline

- Trabaja SOLO en los tickets de Linear asignados para esa sesión.
- No refactorizar código adyacente "porque vio algo mejorable" — si detecta tech debt, crea un nuevo ticket en Linear (con label `tech-debt`) y sigue de largo.
- No agregar features que no estén en el ticket original. Si el ticket es ambiguo y se podría interpretar como dos features distintas, blocker.
- No expandir el scope para "dejar mejor de cómo lo encontró" en archivos no tocados por el ticket.

---

## 3. Cuando hay duda

- Default: **blocker antes que decisión arbitraria**.
- Mejor un PR vacío con un blocker bien escrito que un PR con código incorrecto que parece funcionar.
- Si dos opciones son razonables y ninguna es claramente mejor: blocker, listar las opciones, dejar la decisión al usuario.

---

## 4. Protocolo de blocker

Cuando Oswald se traba, escribe el blocker en **dos lugares simultáneamente**:

1. **Comentario en el ticket de Linear** correspondiente:
   ```
   @Sebastian — Blocker:
   <contenido del blocker, ver formato abajo>
   ```
2. **Sección `## Blockers` en el PR description** del PR en curso:
   ```markdown
   ## Blockers
   - [WHI-XX] <título corto>: <link al comentario de Linear>
   ```

El briefing matutino que Oswald manda por Telegram lista los blockers leyéndolos de Linear (no del PR), así están en una sola fuente de verdad.

### Formato obligatorio del blocker

Tres secciones, en este orden:

```markdown
**Contexto:** Qué estaba haciendo cuando se trabó. Archivos involucrados,
qué parte del ticket. Suficiente para que el usuario reconstruya el estado
mental sin abrir el código.

**Opciones consideradas:** Las 2-3 alternativas que evaluó, con pros/cons
de cada una. Si solo encontró una opción, decirlo explícitamente
("Solo encontré esta forma de hacerlo, pero implica X y prefiero
confirmar antes de avanzar").

**Qué falta para destrabar:** Acción concreta que el usuario tiene que
tomar para que Oswald pueda continuar (ej: "decidir si usamos opción A
o B", "aprobar instalar dependencia X", "confirmar el shape del
endpoint Y").
```

Un blocker sin las tres secciones es un blocker mal escrito — Oswald debe completarlo antes de cerrar la sesión.

---

## 5. Cierre de sesión

Antes de terminar la noche:

- **Commit + push de TODO el trabajo** (aunque esté incompleto) a la branch `claude/<fecha>-<ticket>`.
- **PR description** debe contener:
  - `## Resumen`: qué se hizo (1-3 bullets, foco en outcome no en proceso).
  - `## Pendientes`: qué quedó sin hacer del ticket y por qué.
  - `## Blockers`: lista referenciando los comentarios de Linear (ver sección 4).
  - `## Cómo verificar`: pasos concretos para que el usuario pruebe los cambios a la mañana.
- Nunca cerrar la sesión sin pushear. Trabajo no pusheado = trabajo perdido.
