# Plan de Acción - AlertaForestal 2025

## 🎯 Visión Estratégica
Transformar AlertaForestal en el sistema de detección de incendios más rápido y relevante para el ciudadano común, manteniendo el servicio gratuito para los usuarios.

## 📊 Estado Actual

### Fuentes de Datos
- **NASA FIRMS (VIIRS)**: Latencia 2-4 horas, resolución 375m
- **GOES-19**: Latencia 10-20 min, resolución 2km, ya implementado
- **OpenWeather Lightning**: Latencia ~10 min, parcialmente integrado

### Stack Técnico
- Frontend: Next.js (Vercel)
- Backend: Supabase (PostgreSQL + Edge Functions)
- Bot: Telegram Bot API
- Dominio: alertaforestal.org

## 🚀 Plan de Mejoras por Fases

### Fase 1: Reducción Drástica de Latencia (Meses 1-2)

#### 1.1 Detección de Rayos en Tiempo Real
**Implementación**: Blitzortung.org via LightningMaps.org
```typescript
// src/lib/lightning-blitzortung.ts
export async function fetchLightningStrikes(
  bbox: BoundingBox,
  lastMinutes: number = 30
): Promise<LightningStrike[]> {
  // API: https://api.lightningmaps.org/v2/strikes
  // Latencia: <1 minuto
  // Costo: Gratis
}
```

**Impacto**:
- Alertas preventivas: "Cayeron rayos en zona seca"
- Reducción de falsos positivos al correlacionar con GOES
- Latencia total: <5 minutos para detección por rayos

#### 1.2 Índice de Riesgo Meteorológico
**Implementación**: OpenWeather Fire Weather Index
```typescript
// src/lib/fire-risk.ts
export async function fetchFireRiskIndex(
  lat: number, 
  lng: number
): Promise<{
  risk: 'low' | 'moderate' | 'high' | 'extreme';
  factors: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    drought: number;
  };
}> {
  // OpenWeather One Call API 3.0
  // Actualización: cada 3 horas
}
```

**Mensajes**:
- "Hoy tu zona tiene ALTO riesgo de incendio"
- "Condiciones favorables para propagación"

### Fase 2: Expansión de Cobertura (Meses 2-3)

#### 2.1 WhatsApp Integration
**Implementación**: WhatsApp Business API
```typescript
// src/lib/whatsapp.ts
export async function sendWhatsAppAlert(
  to: string,
  message: string
): Promise<void> {
  // WhatsApp Cloud API
  // Costo: ~$0.05/mensaje
}
```

**Impacto**:
- Penetración: 90% rural Argentina vs 20% Telegram
- Multiplicación de alcance real por 4-5x

#### 2.2 EUMETSAT Meteosat Third Generation
**Implementación**: Datos via EUMETSAT Data Hub
```typescript
// src/lib/mtg.ts
export async function fetchMTGDetections(
  bbox: BoundingBox
): Promise<MTGDetection[]> {
  // WMS/WFS services
  // Resolución: 1km (vs 2km GOES)
  // Cobertura: Mejor en sur de Argentina
}
```

### Fase 3: Inteligencia Artificial y Feedback Comunitario (Meses 3-6)

#### 3.1 Sistema de Feedback Comunitario
**Ver documento completo**: `FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md`

**Implementación**: Botones de feedback en el bot
```typescript
// src/lib/feedback.ts
export async function captureFeedback(
  alertId: string,
  userId: string,
  responseType: 'veo_humo' | 'veo_fuego' | 'huelo_quemado' | 'no_veo_nada' | 'estoy_lejos'
): Promise<void> {
  // Guardar en tabla de feedback
  // Calcular peso basado en distancia, hora, cantidad de observadores
}
```

**Impacto**:
- Dataset propio de validaciones (ventaja competitiva)
- Reducción de falsos positivos mediante validación humana
- Detección temprana de focos no detectados por satélites

#### 3.2 Modelo de Clasificación Multi-fuente
**Arquitectura**: Random Forest + Features híbridos
```python
# api/classify/model.py
def classify_fire_probability(
  goes_detection: GOESDetection,
  lightning_nearby: bool,
  fire_risk_index: float,
  historical_fires: List[FirePoint],
  forest_zone: ForestZone
) -> ConfidenceScore:
    """
    Retorna score 0-100 con factores ponderados
    """
    features = extract_features(...)
    return model.predict_proba(features)
```

**Features**:
- Detección GOES (confianza, FRP)
- Rayos cercanos (<5km, <30min)
- Índice de riesgo meteorológico
- Histórico de incendios en zona
- Tipo de vegetación
- Distancia a zonas urbanas
- **Feedback comunitario validado** (nuevo)

#### 3.3 Reducción de Falsos Positivos
**Implementación**: Pipeline de validación
```typescript
// src/lib/validation.ts
export async function validateDetection(
  detection: FireDetection,
  context: ValidationContext
): Promise<{
  isValid: boolean;
  confidence: number;
  reasons: string[];
}> {
  // 1. Correlación con rayos
  // 2. Consistencia GOES multi-frame
  // 3. Factor de riesgo meteorológico
  // 4. Histórico de falsos positivos en zona
}
```

### Fase 4: Super-Resolución Selectiva (Meses 6-12)

#### 4.1 Modelo ESRGAN Fine-tuned
**Implementación**: Solo en zonas críticas
```python
# ml/super_resolution.py
class FireSuperResolution:
    def __init__(self):
        self.model = load_esrgan_model()
        self.model.load_state_dict(
            load_fine_tuned_weights('fire_esrgan.pt')
        )
    
    def enhance(self, low_res_image: np.ndarray) -> np.ndarray:
        # 2km → 500m (4x improvement)
        return self.model(low_res_image)
```

**Estrategia**:
- Procesar solo zonas con detecciones de alto interés
- GPU bajo demanda (RunPod/Vast.ai)
- Cache de resultados por zona

## 📈 Métricas de Éxito

### KPIs Técnicos
- **Latencia promedio**: Actual 60-90min → Objetivo <15min
- **Precisión**: Actual 70% → Objetivo 90%
- **Cobertura**: Actual 70% Argentina → Objetivo 95%

### KPIs de Usuario
- **Usuarios activos**: Actual ~1,000 → Objetivo 10,000
- **Alertas enviadas/mes**: Actual ~500 → Objetivo 5,000
- **WhatsApp adoption**: Objetivo 60% de usuarios

## 🛠️ Arquitectura Técnica Propuesta

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Sources  │    │   Processing     │    │   Delivery      │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ • FIRMS (VIIRS) │───▶│ • Supabase       │───▶│ • Telegram      │
│ • GOES-19       │    │   - PostgreSQL   │    │ • WhatsApp      │
│ • Blitzortung   │    │   - Edge Functions│   │ • Web App       │
│ • EUMETSAT MTG  │    │ • Vercel         │    │ • API Pública   │
│ • OpenWeather   │    │ • GPU Cloud      │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 💰 Modelo de Costos

### Costos Actuales (~$50/mes)
- Supabase Pro: $25
- Vercel Pro: $20
- Telegram: $5
- Dominio: $5

### Costos Proyectados
- **Fase 1**: +$20 (OpenWeather API)
- **Fase 2**: +$50 (WhatsApp API + EUMETSAT)
- **Fase 3**: +$30 (Vercel Pro + compute)
- **Fase 4**: +$100-200 (GPU bajo demanda)

**Total escalado**: ~$250-300/mes para 10k usuarios

## 🎯 Propuesta de Valor para Provincias

### Modelo B2G (Business-to-Government)

#### Paquete Básico: $500/mes
- Alertas para toda la provincia
- Dashboard de monitoreo
- Reportes semanales
- Integración con sistemas existentes

#### Paquete Premium: $1,500/mes
- Todo lo básico +
- API dedicada
- Modelo predictivo customizado
- Soporte prioritario
- Capacitación a brigadas

#### ROI para Provincia
- **Costo actual**: $50,000-100,000 por incendio grande
- **Detección temprana**: Reducción 30% daños
- **Ahorro potencial**: $15,000-30,000/incendio evitado
- **ROI**: 10-20x en primer temporada

## 📋 Próximos Pasos

### Inmediato (Semana 1-2)
1. Setup Blitzortung API
2. Implementar detección de rayos
3. Configurar índice de riesgo OpenWeather

### Corto Plazo (Mes 1)
1. Diseñar UI/UX para nuevos features
2. Setup WhatsApp Business API
3. Integrar EUMETSAT MTG
4. **Implementar captura de feedback comunitario** (nuevo)

### Mediano Plazo (Mes 2-3)
1. Entrenar modelo de clasificación
2. Implementar pipeline de validación
3. Testing con usuarios piloto
4. **Desarrollar sistema de ponderación de feedback** (nuevo)

### Largo Plazo (Mes 6+)
1. Desarrollo modelo super-resolución
2. Optimización de costos GPU
3. Escalado a nivel nacional

## 🔄 Ciclo de Mejora Continua

1. **Monitoreo**: Latencia, precisión, satisfacción usuario
2. **Feedback**: Encuestas, métricas de uso
3. **Iteración**: Mejora mensual basada en datos
4. **Evaluación**: Revisión trimestral de KPIs

---

*Este documento es vivo y se actualizará según el progreso y feedback del equipo.*