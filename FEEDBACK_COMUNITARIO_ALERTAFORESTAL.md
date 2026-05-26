# AlertaForestal — Feedback Comunitario

> Documento de estrategia técnica. Captura el sistema de feedback comunitario para construir un dataset de validación propio, discutido en mayo 2026. Es una idea a implementar, en distintos horizontes temporales.

---

## Contexto y motivación

El valor central de AlertaForestal es la inmediatez: avisarle al vecino de un foco antes de que el fuego se propague. Hoy la detección depende de fuentes satelitales (NASA FIRMS, NOAA GOES) más datos meteorológicos y de rayos.

El gran activo defensable de competidores como Satellites On Fire no es la tecnología satelital en sí (los datos crudos son públicos), sino su **base de datos de eventos validados** (~90.000 eventos confirmados como fuego real o descartados como falso positivo). Esa base es lo que entrena su IA y la hace buena.

La conclusión estratégica es: AlertaForestal puede construir su propia base de validaciones, gratis, usando a su comunidad de usuarios B2C como validadores — del mismo modo us clientes B2B, pero con una base de personas mucho más amplia. Cada alerta enviada es una oportunidad de validación.

---

## Sistema de feedback comunitario

### Principio rector

**Ningún feedback individual decide nada.** El valor está en la agregación de múltiples observaciones y en el cruce con las fuentes satelitales. Un reporte aislado es un dato débil, no una verdad.

### Por qué el feedback humano es ruidoso

Un "no veo humo" individual no significa que no haya fuego. Puede haber muchas razones legítimas:

- El usuario mira hacia el lado equivocado
- El foco está a varios kilómetros, detrás de un accidente geográfico
- Es de noche o hay niebla
- El foco es real pero todavía es pequeño y no levanta columna visible
- El usuario está dentro de su casa o respondió de memoria sin mirar

Un "sí, veo humo" es más confiable, pero también puede confundirse con quema de basura, una parrilla, neblina, o el humo de un foco distinto al detectado.

### Recepción del feedback (en el bot)

**Diseño: no obligar al usuario a pensar.** Cuanto más simple, más respuestas y menos sesgo. Botones de un toque al pie de cada alerta:

- Veo humo
- Veo fuego
- Huelo a quemado
- No veo nada
- Estoy lejos de la zona

Notas:

- Separar "no veo nada" de "estoy lejos": el que está lejos no es un voto válido sobre ese foco y debe descartarse del cálculo.
- "Huelo a quemado" es valioso porque el olfato a veces llega antes o desde más lejos que la vista, sobre todo de noche.
- La ventana de respuesta debe quedar abierta un tiempo (no cerrarse al instante), porque una alerta puede confirmarse media hora después cuando el humo crece. Capturar feedback tardío.

### Análisis: los votos se pesan, no se cuentan

El peso de cada respuesta depende de qué tan creíble es como observación de ese foco puntual:

- **Distancia al foco.** Un voto desde 2 km vale mucho; desde 15 km, casi nada (es normal no ver humo a esa distancia). Un "no veo nada" desde lejos es prácticamente un voto nulo.
- **Hora del día.** Una las 3 AM vale poquísimo. A pleno mediodía con buena visibilidad, vale más.
- **Cantidad de observadores.** Una persona es anécdota. Diez personas distintas, todas cerca, todas de día, todas diciendo lo mismo durante un par de horas, eso sí es señal.

Se necesita un mínimo de observadores creíbles antes de sacar cualquier conclusión.

### Contraste con NASA: matriz de 4 cuadrantes

| Satélite | Humanos | Interpretación |
|---|---|---|
| Detecta | Confirman | **Verdadero positivo.** Etiqueta de oro para el dataset. Guardar con todo el contexto. |
| Detecta | Cercanos y creíbles dicen "nada" consistentemente | **Posible falso positivo** (ruido térmico: chapa caliente, industria, campo arado al sol). NUNCA apaga la alerta automáticamente; solo baja confianza y marca para revisión. |
| No detecta | Reportan humo | **El más valioso y delicado.** Posible foco que el satélite todavía no vio. Es el hueco que cubre una base B2C con ojos en el territorio. Alerta temprana potencial. |
| No detecta | No reportan | Normal. |

El tercer cuadrante es la ventaja real sobre sistemas puramente satelitales.

### Respuesta a "¿qué pasa si un usuario no ve humo?"

Por sí solo, **no pasa nada.** Un solo "no veo humo" jamás cancela una alerta ni marca un falso positivo. Se registra como voto débil que, sumado a muchos otros votos creíbles y contrastado con las siguientes pasadas satelitales, puede con el tiempo bajar la confianza de esa detección.

La confirmación de un falso positivo idealmente viene del propio satélite (si en pasadas siguientes el foco desaparece y nunca creció) más el respaldo humano, no de los humanos solos.

### La asimetría ética y de diseño

**Es muchísimo peor descartar un fuego real que tolerar un falso positivo.** Todo el sistema debe estar sesgado hacia "ante la duda, la alerta queda". El feedback negativo sirve para aprender y mejorar el modelo a futuro, no para silenciar alertas en el momento.

### Para qué sirve, en dos horizontes

- **Corto plazo:** ajustar la confianza mos ("foco detectado, sin confirmar" vs "confirmado por vecinos") y detectar zonas de falsos positivos recurrentes.
- **Largo plazo:** cada evento bien etiquetado se guarda y se convierte en dataset de entrenamiento. En 1-2 años, eso es el "SoF data" propio, construido por la comunidad, gratis — el verdadero moat.

### Nota de implementación

Al inicio NO requiere machine learning. Es un sistema de reglas y ponderaciones simple (distancia, hora, cantidad de votos). El ML viene mucho después, cuando haya volumen de datos etiquetados. Lo importante desde el día uno es **guardar bien los datos con un esquema pensado**, que es lo que permitirá entrenar algo más adelante.

---

## Horizontes temporales (resumen)

| Iniciativa | Horizonte | Requiere |
|---|---|---|
| Captura de feedback + esquema de datos | **Ya** | Botones en el bot + tabla bien diseñada |
| Ponderación por reglas | Corto | Lógica de distancia/hora/cantidad |
| Matriz de contraste con satélite | Corto-medio | Cruce con FIRMS/GOES |
| MLet | Largo | Volumen de datos etiquetados |

---

## Pendientes / decisiones abiertas

- Definir el esquema exacto de la tabla de feedback (campos: alerta_id, usuario_id, tipo_respuesta, distancia_al_foco, timestamp, hora_local, peso_calculado).
- Definir umbrales concretos de distancia y cantidad de votos para cambiar el estado de confianza de una alerta.
- Confirmar cómo se comunica al usuario el estado de confianza ("sin confirmar" vs "confirmado por vecinos") sin generar pánico ni falsa tranquilidad.