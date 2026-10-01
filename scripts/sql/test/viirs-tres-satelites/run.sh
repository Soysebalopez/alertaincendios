#!/usr/bin/env bash
# Prueba de scripts/sql/whi-viirs-tres-satelites.sql contra un Postgres LOCAL
# y descartable. pg_net se reemplaza por un doble (stub.sql): net.http_get anota
# el pedido y la prueba escribe a mano la respuesta de NASA. Nunca toca
# producción.
#
# Uso: PGHOST=/ruta/al/socket PGPORT=5432 PGUSER=postgres scripts/sql/test/viirs-tres-satelites/run.sh
# Sale con error en el primer chequeo que falle ("FALLA: ...").
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="$DIR/../../whi-viirs-tres-satelites.sql"
DB="viirs_tres_satelites_test"
P="psql -X -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f "$DIR/stub.sql"
# cron.schedule (sección 4) se reemplaza por un doble que corre el comando una vez.
$P -d "$DB" -c "create schema cron; create function cron.schedule(n text, s text, c text) returns bigint language plpgsql as \$\$ begin execute c; return 1; end \$\$;
  create table fires_daily_history (date date primary key, count int, avg_frp real, high_conf int);"
$P -d "$DB" -f "$SQL"
$P -d "$DB" -f "$DIR/test.sql" 2>&1 | grep -E "ok:|FALLA" | sed 's/^.*NOTICE:  //'
$P -d postgres -c "drop database $DB"
echo "todo en verde"
