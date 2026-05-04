# SQL helpers

SQL para correr manualmente en Supabase (proyecto `qmzuwnilehldvobjsbcs`).

## WHI-378 — fires_cache acumula focos duplicados

1. **Inspeccionar** la función actual y confirmar el bug:
   ```
   scripts/sql/whi-378-inspect-fires-sync.sql
   ```
   Si `total_rows > unique_rows` o el `array_len` crece monotónicamente entre
   ciclos, el bug está activo.

2. **Aplicar el fix**:
   ```
   scripts/sql/whi-378-fix-fires-sync-step2.sql
   ```
   Antes de ejecutar, comparar el parsing CSV (orden de columnas) con la
   versión actual que devuelve la query del paso 1, por si NASA cambió el
   esquema.

3. **Verificar**: tras el siguiente ciclo de pg_cron (`fires-process` cada 15
   minutos), volver a correr el script de inspección — `duplicates` debe
   quedar en `0` y `array_len` estabilizarse en el orden de las decenas.

El código JS también dedupea defensivamente al leer y al escribir
(`src/lib/firms.ts#dedupFires`), así que el fix SQL es para sanear la fuente.
