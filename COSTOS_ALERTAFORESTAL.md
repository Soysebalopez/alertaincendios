# Análisis de Costos - AlertaForestal

## 📊 Costos Operativos Actuales

### Stack Actual (2025)
| Componente | Proveedor | Costo Mensual | Notas |
|------------|-----------|---------------|-------|
| Hosting Frontend | Vercel Pro | $20 | Next.js, 100GB bandwidth |
| Base de Datos | Supabase Pro | $25 | PostgreSQL, 8GB RAM, 50GB storage |
| Bot Telegram | Telegram Bot API | $5 | ~500 mensajes/mes |
| Dominio | alertaforestal.org | $5 | Dominio .org |
| APIs Externas | NASA FIRMS | $0 | Gratis |
| APIs Externas | OpenWeather | $0 | Nivel gratuito |
| **TOTAL ACTUAL** | | **$55/mes** | |

### Costos Ocultos Actuales
- **Mantenimiento**: ~10-15 hs/mes (voluntario)
- **Sync externo**: Script local para FIRMS (requiere IP residencial)
- **Monitoreo**: Manual (no automatizado)

---

## 📈 Proyección de Costos por Fase

### Fase 1: Detección de Rayos + Riesgo (Mes 1-2)
| Componente | Costo Adicional | Justificación |
|------------|-----------------|---------------|
| OpenWeather API Pro | $20/mes | Fire Weather Index, 1M calls/mes |
| LightningMaps API | $0-10/mes | Blitzortung data (donation-based) |
| Vercel Pro (upgrade) | $0 | Incluido en plan actual |
| **Total Fase 1** | **$20-30/mes** | **Nuevo total: $75-85/mes** |

### Fase 2: WhatsApp + EUMETSAT (Mes 2-3)
| Componente | Costo Adicional | Justificación |
|------------|-----------------|---------------|
| WhatsApp Business API | $40/mes | Conversaciones iniciadas, ~800/mes |
| EUMETSAT Data Hub | $0 | Gratis para investigación |
| Número adicional WhatsApp | $5/mes | Número verified |
| **Total Fase 2** | **$45/mes** | **Nuevo total: $120-130/mes** |

### Fase 3: IA Clasificación (Mes 3-6)
| Componente | Costo Adicional | Justificación |
|------------|-----------------|---------------|
| Vercel Pro (compute) | $20/mes | Edge functions adicionales |
| Storage histórico | $10/mes | S3/R2 para datos procesados |
| Monitoring (DataDog) | $15/mes | Logs y métricas |
| **Total Fase 3** | **$45/mes** | **Nuevo total: $165-175/mes** |

### Fase 4: Super-Resolución (Mes 6-12)
| Componente | Costo Adicional | Justificación |
|------------|-----------------|---------------|
| GPU Serverless (Modal) | $50-200/mes | Según volumen de detecciones |
| Storage imágenes | $30/mes | S3 para tiles procesados |
| Model training | $100/mes (promedio) | A100 spot hours |
| **Total Fase 4** | **$180-330/mes** | **Nuevo total: $345-505/mes** |

---

## 💰 Análisis de Super-Resolución

### Costos de Infraestructura GPU

#### Opción 1: Serverless (Recomendado)
**Modal Labs + A10G**
- Costo: $0.000306/segundo = $1.10/hora
- Uso estimado: 100 detecciones/día × 5 seg = 500 seg/día
- Costo diario: $0.15
- **Costo mensual: ~$5**

**Cold starts**: 2-10 segundos (aceptable para batch)

#### Opción 2: Instance 24/7
**RunPod RTX 4090**
- Costo: $0.50/hora = $12/día = $360/mes
- Sin cold starts, siempre disponible
- Justificable solo para >2000 detecciones/día

#### Opción 3: Spot AWS
**g4dn.xlarge spot + autoscaling**
- Costo: $0.20/hora spot
- Utilización 5% efectiva = $7.2/mes
- Overhead operacional: +$50-100/mes

### Costos de Desarrollo SR

| Item | Costo USD | Duración | Notas |
|------|-----------|----------|-------|
| Dataset construcción | $15-40k | 2-3 meses | Pares GOES↔VIIRS co-registrados |
| Modelo base training | $2-5k | 1-2 semanas | GPU hours para entrenamiento |
| Fine-tuning Argentina | $0.5-1k | 1 semana | A100 spot hours |
| Validación y testing | $5-10k | 1-2 meses | Métricas radiométricas + detección |
| **Total desarrollo** | **$22.5-56k** | **4-6 meses** | |

### Costos Mantenimiento Anual SR
- Retraining: $5-15k (compute + personal)
- Monitoring drift: $2-5k
- Storage adicional: $360/mes
- **Total anual**: ~$10-20k

---

## 📊 Escalado por Volumen de Usuarios

### Costos Variables por Usuario

| Usuarios Activos | Mensajes/mes | Costo WhatsApp | Costo Compute | Costo Total/mes |
|------------------|--------------|----------------|---------------|-----------------|
| 1,000 (actual) | 500 | $25 | $20 | $95 |
| 5,000 | 2,500 | $125 | $30 | $205 |
| 10,000 | 5,000 | $250 | $40 | $340 |
| 25,000 | 12,500 | $625 | $60 | $735 |
| 50,000 | 25,000 | $1,250 | $100 | $1,410 |

### Costos Fijos vs Variables
- **Fijos**: $165/mes (base sin usuarios)
- **Variables**: ~$0.025 por usuario/mes (WhatsApp + compute)

---

## 🏛️ Propuesta Comercial para Provincias

### Modelo B2G (Business-to-Government)

#### Paquete BÁSICO - $500/mes
**Incluye:**
- Alertas para toda la provincia (todos los usuarios)
- Dashboard de monitoreo web
- Reportes semanales de actividad
- Integración con sistemas existentes (API)
- Soporte email 48hs

**Cobertura:** Hasta 50,000 habitantes
**SLA:** 95% uptime, latencia <15 min

#### Paquete PREMIUM - $1,500/mes
**Incluye todo BÁSICO +:**
- API dedicada con rate limits elevados
- Modelo predictivo customizado (zona específica)
- Soporte prioritario 24/7 (teléfono + WhatsApp)
- Capacitación a brigadas (2 sesiones/mes)
- Reportes personalizados para ministerios

**Cobertura:** Ilimitada
**SLA:** 99% uptime, latencia <10 min
**Dedicado:** Account manager

#### Paquete ENTERPRISE - $3,000/mes
**Incluye todo PREMIUM +:**
- Instancia on-premise (opcional)
- Integración con sistemas de emergencia
- Modelo de IA entrenado con datos históricos provincia
- Ejercicios simulados mensuales
- KPIs y métricas avanzadas

**Cobertura:** Provincial + regional
**SLA:** 99.5% uptime, latencia <5 min
**Personal:** Technical account manager

---

## 💡 Análisis ROI para Provincias

### Costos Actuales de Incendios (Estimados)
| Tipo de Incendio | Daño Promedio | Frecuencia Anual | Costo Anual |
|------------------|---------------|------------------|-------------|
| Pequeño (<100 ha) | $50,000 | 10-20 | $500k-1M |
| Mediano (100-1000 ha) | $500,000 | 3-8 | $1.5-4M |
| Grande (>1000 ha) | $5,000,000 | 1-3 | $5-15M |
| **Total** | | | **$7-20M** |

### Impacto de AlertaForestal
- **Detección temprana**: 30-50% reducción en daños
- **Respuesta más rápida**: 20-30% mejora en contención
- **Coordinación**: 15-25% eficiencia operativa

### ROI Calculado
**Inversión AlertaForestal**: $6,000-36,000/año
**Ahorro potencial**: $2-10M/año (30% de $7-20M)
**ROI**: 300-1500% en primer año

### Caso de Uso: Provincia Tipo
- **Población**: 1M habitantes
- **Superficie**: 200,000 km²
- **Incendios/año**: 15 promedio
- **Daño anual**: $3M
- **Inversión AlertaForestal**: $18,000/año (Premium)
- **Ahorro con 30% mejora**: $900,000/año
- **ROI**: 4900%

---

## 📈 Modelo de Escalado Financiero

### Proyección 3 Años

#### Año 1: Consolidación
- **Usuarios**: 5,000
- **Provincias**: 2 (pilot)
- **Ingresos**: $12,000 (provincias)
- **Costos**: $2,400 (ops) + $30,000 (desarrollo SR)
- **Resultado**: -$20,400 (inversión)

#### Año 2: Expansión
- **Usuarios**: 25,000
- **Provincias**: 8
- **Ingresos**: $48,000 (provincias)
- **Costos**: $7,200 (ops) + $15,000 (mantenimiento)
- **Resultado**: $25,800 (positivo)

#### Año 3: Madurez
- **Usuarios**: 100,000
- **Provincias**: 15
- **Ingresos**: $90,000 (provincias)
- **Costos**: $20,000 (ops) + $20,000 (mejoras)
- **Resultado**: $50,000 (sostenible)

### Break-Even Point
- **Mes 18**: Acumulado ingresos = acumulado costos
- **Factor clave**: 5 provincias en plan Premium

---

## 🎯 Recomendaciones Estratégicas

### Prioridades de Inversión
1. **Fase 1-2**: Inversión propia ($50-100/mes adicionales)
2. **Fase 3**: Buscar primera provincia piloto
3. **Fase 4**: Solo con 2+ provincias pagando

### Estructura Legal Sugerida
- **Entidad sin fines de lucro** para mantener gratuidad usuarios
- **Servicios profesionales** para facturar a provincias
- **Mix**: Misión social + sostenibilidad financiera

### Precios Psicológicos
- **Básico $500**: "Un sueldo de bombero"
- **Premium $1,500**: "El costo de una hectárea salvada"
- **Enterprise $3,000**: "Menos que el combustible de un día"

---

## 📋 Checklist de Decisión

### Antes de invertir en Super-Resolución:
- [ ] ¿Ya optimizamos fusión multi-sensor clásica?
- [ ] ¿Tenemos gaps específicos identificados?
- [ ] ¿Hay presupuesto para desarrollo ($30k+)? 
- [ ] ¿Hay provincia interesada en financiarlo?

### Para cerrar provincia:
- [ ] Caso de uso concreto con ROI medible
- [ ] Demo funcional con datos reales
- [ ] SLA claros y métricas de éxito
- [ ] Contrato multianual (3 años mínimo)

---

*Este análisis se basa en precios públicos 2026 y estimados conservadores. Los costos reales pueden variar según el proveedor, volumen y negociaciones.*