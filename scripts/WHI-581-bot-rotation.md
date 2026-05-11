# WHI-581 — Rotar token de bot Telegram + propuestas de mensajes

## 1. Rotación del token (manual — 5 min)

El token nuevo está en Linear WHI-581. **No lo commitees al repo.**

### Paso A: actualizar Vercel env

```
Vercel dashboard → alertaincendios project → Settings → Environment Variables
  TELEGRAM_BOT_TOKEN  →  pegar el token nuevo
  (Environment: Production + Preview + Development)
```

Después de actualizar, **redeploy producción** desde Deployments → última → Redeploy.
(Vercel no aplica env nuevos a deployments existentes automáticamente.)

### Paso B: resetear webhook

Telegram apunta el webhook al bot anterior. Hay que decirle al bot nuevo dónde
recibir actualizaciones. Una vez actualizado el token:

```bash
curl -F "url=https://alertaincendios.vercel.app/api/bot/telegram" \
  "https://api.telegram.org/bot<NEW_TOKEN>/setWebhook"
```

Esperás `{"ok":true,"result":true,"description":"Webhook was set"}`.

### Paso C: validar

Mandale `/start` al bot nuevo. Si responde el mensaje de bienvenida, listo.

### Paso D (opcional pero recomendado): rotar el token expuesto

El token del bot **anterior** quedó en el commit history del repo (si está) y
posiblemente en Linear. Conviene **revocar el viejo** desde @BotFather:
`/mybots` → bot viejo → API Token → Revoke. Eso invalida el token expuesto.

---

## 2. Propuestas de optimización de mensajes

Anclajes para decidir cuáles aplicar. **Ninguna implementada todavía** —
pickeá las que te gusten y las implemento en un commit aparte.

### 2.1 — Mensaje de bienvenida (`/start`): hook más fuerte

**Actual (line 101-110 de `bot/telegram/route.ts`):**
> 🔥 CLARA — Alerta de Incendios
>
> Detectamos focos de calor en toda Argentina con satélites de la NASA y te
> alertamos por Telegram. También avisamos cuando hay tormenta eléctrica seca
> cerca tuyo.
>
> Suscribite: ...

**Problema:** Empieza con la solución, no con el problema del usuario. Y mezcla
dos features al toque.

**Propuesta:**
> 🔥 *CLARA — para que no te agarre desprevenido*
>
> Cada año los incendios arrasan miles de hectáreas en Argentina. Cuando el
> humo llega a tu casa, ya es tarde.
>
> CLARA escanea Argentina cada 10 minutos con satélites de NASA y NOAA. Si
> hay un foco que puede afectarte, te avisamos *antes* que el humo llegue.
>
> 📍 Tocá "Compartir ubicación" abajo o escribí `/ciudad Bariloche`
> (o tu ciudad).

Razón: empieza con dolor + escala (miles de hectáreas), no con tech. "Antes
que llegue el humo" es el valor, no "satélites de la NASA" (que es el cómo).

### 2.2 — Confirmación de suscripción (handleLocation, line 171)

**Actual:**
> 🔥 CLARA — Suscripcion activada
>
> 📍 Ubicacion: Bariloche, Río Negro
>
> Vas a recibir alertas cuando se detecten focos de calor en un radio de 100 km
> de tu ubicacion.

**Problema:** No establece expectativas claras de qué pasa después. ¿Cuántas
alertas voy a recibir? ¿Con qué frecuencia?

**Propuesta:**
> ✅ *Listo, vecino de Bariloche*
>
> Te voy a avisar cuando se detecte fuego dentro de 100 km de vos.
>
> *Qué esperar:*
> • Si el viento empuja humo hacia vos → alerta inmediata 🚨
> • Si hay tormenta seca cerca → aviso preventivo ⚡
> • Si no pasa nada → silencio. No spam.
>
> En temporada baja (otoño/invierno) podés no recibir nada por semanas.
> En temporada alta (oct-mar) puede haber varios por día.
>
> Probá `/estado` para ver focos activos ahora.

### 2.3 — Alerta de foco (en `/api/alerts`, formatAlert line 179-198)

**Actual:**
```
🚨 ALERTA: Foco detectado

📍 A 23.5 km de Bariloche
🧭 Dirección: NO
💨 Viento: hacia tu posición (ETA humo ~45 min)
🟧🟧🟧⬛⬛ 12.4 MW — Moderada
🛰️ Fuente: NASA FIRMS
⏱️ Detectado hace 35 min

<interpretación AI>

📌 Ver en Google Maps
```

**Cosas que mejoraría:**

- **Línea 1 más accionable**: "🚨 ALERTA" es genérico. Mejor "🚨 Foco activo a 23km
  — humo en ~45min" todo en el header, así se lee en la notificación previa
  (preview de Telegram solo muestra primera línea).
- **Reorden por importancia**: lo MÁS importante para el usuario es "¿el humo
  me llega?" (ETA). Hoy está en línea 4.
- **Acción explícita**: hoy termina en "Ver en Google Maps". Para alertas de
  nivel `danger` debería sugerir acciones (cerrar ventanas, etc.).

**Propuesta:**
```
🚨 Foco a 23km — humo en ~45 min

💨 Viento NO empuja el humo hacia Bariloche.
🔥 Potencia 12.4 MW (moderada · incendio activo)
⏱️ Detectado hace 35 min por NASA FIRMS

<interpretación AI>

📌 Ubicación: https://maps.google.com/...

🟧 Si vas a salir, evitá la zona.
🟧 Mantené cerradas las ventanas si el humo entra.
🟧 Más info: <link a la página del foco en clara.app>
```

### 2.4 — Alerta preliminar GOES (recién implementada en goes-alerts)

Lo que armé hoy en `formatPreliminary` ya es bueno pero capaz se beneficia de
ser **más corto**. Las primeras alertas son interrumpiendo a alguien — menos
es más:

**Actual (que acabo de escribir):**
> ⚠️ POSIBLE foco detectado (preliminar)
>
> 📍 A 23.5 km de Bariloche
> 🛰️ Fuente: NOAA GOES-19 — escaneo cada 10 min
> ⏱️ Detectado hace ~10 min
> 🔥 Potencia estimada: 12.4 MW
>
> Esta detección viene de un satélite geoestacionario y es rápida, pero
> menos precisa. NASA FIRMS suele confirmar en 1-3 horas. Si vas a tomar
> acción, validá visualmente o esperá la confirmación.

**Propuesta más corta:**
> ⚠️ *Posible foco a 23km de Bariloche*
>
> NOAA GOES detectó actividad térmica hace 10 min. Aún no confirmado por NASA.
>
> Si vas a actuar: validá visualmente. Te aviso cuando confirme (o si fue
> falsa alarma).
>
> 📌 https://maps.google.com/...

### 2.5 — Comando `/estado` cuando no hay focos

**Actual** (asumido — no lo leí completo): probablemente "No hay focos activos cerca tuyo."

**Propuesta:**
> ✅ Sin focos activos a 100km de Bariloche.
>
> Última verificación: hace 8 min.
> Próximo scan: en 7 min (NOAA GOES cada 10 min).
>
> Si llega a haber un foco, te aviso al toque.

Razón: re-confirma que el sistema está vivo y vigilando. Sin esto, "no hay focos"
puede sonar a "el bot no funciona".

### 2.6 — Footer corto

**Actual:**
> —
> Central de Localizacion y Alerta de Riesgo Ambiental (CLARA)
> Datos: NOAA GOES-19 ABI-L2-FDCF

**Propuesta:** El acronym completo en CADA mensaje es ruidoso. Reservarlo solo
para `/about`. En alertas:

> —
> CLARA · NASA + NOAA · clara.app

### 2.7 — Botones inline

Hoy las alertas son texto plano. Telegram soporta inline keyboards. Para
alertas de nivel `danger` podríamos agregar:
- [📍 Ver mapa] → abre Google Maps
- [🔇 Silenciar 1h] → marca subscriber.muted_until
- [📊 Estado] → callback al bot

Esfuerzo: 30 min implementación. Beneficio: UX mucho más profesional.

---

## Recomendación de prioridad

Si tengo que pickear 3 mejoras de mayor impacto:
1. **2.3** — Header con valor inmediato ("Foco a 23km — humo en ~45 min") — mejora
   el preview de notificación de Telegram, que es lo único que la mayoría ve.
2. **2.5** — `/estado` confirma vida del sistema (reduce churn).
3. **2.2** — Confirmación de suscripción set expectativas → reduce ansiedad.

Las demás son nice-to-have.
