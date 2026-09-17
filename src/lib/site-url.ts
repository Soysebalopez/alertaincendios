/**
 * LA DIRECCIÓN CANÓNICA DEL SITIO, EN UN SOLO LUGAR.
 *
 * 🔴 EL HOST CANÓNICO ES **www**, Y HASTA EL 16/9 DECÍA OTRA COSA.
 *
 * El sitio responde en `www.alertaforestal.org`, pero el valor de respaldo era
 * `alertaforestal.org` — y de acá salen el `<link rel="canonical">`, las 83 URLs
 * del sitemap, el `robots.txt` y todos los bloques de datos estructurados. O
 * sea: todas las señales apuntaban a un host distinto del que entrega el
 * contenido, que es la forma de repartir la autoridad entre dos versiones del
 * mismo sitio en vez de sumarla en una.
 *
 * Decisión de Seba (16/9): queda **www**, que es el que ya sirve.
 *
 * ⚠️ El otro host tiene que redirigir 301 acá, y eso vive en la configuración de
 * dominios de Vercel, no en el código.
 *
 * ⚠️ Y esta línea estaba COPIADA EN SIETE ARCHIVOS. Por eso está acá: siete
 * copias significan que la octava se escribe distinta, y una sola que quede en
 * el host viejo alcanza para que las señales vuelvan a contradecirse.
 *
 * ⚠️ `NEXT_PUBLIC_*` se incrusta al compilar, no se lee en cada visita: si se
 * cambia la variable en Vercel hay que volver a desplegar para que tenga efecto.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.alertaforestal.org";
