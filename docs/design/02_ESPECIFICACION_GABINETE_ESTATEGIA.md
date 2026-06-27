
---

## 📄 Documento 2: `02_ESPECIFICACION_GABINETE_ESTATEGIA.md`
**Objetivo:** Documentar la funcionalidad "Feature Creep" convertida en feature oficial (HC-03, DD-01). Define cómo funciona el modal, los límites y el flujo de datos.

### Contenido Sugerido:

```markdown
# Especificación Funcional: Gabinete de Estrategia (Strategy Cabinet)

## 1. Visión General
El Gabinete es la interfaz primaria para la gestión macroeconómica y geopolítica a largo plazo. Permite asignar presupuestos a estrategias pasivas que generan efectos acumulativos por turno.

## 2. Reglas de Negocio
- **Límite de Activos:** Máximo **2** estrategias activas simultáneamente.
- **Exclusividad:** No se pueden activar estrategias de la misma categoría (ej: dos tipos de expansión económica agresiva) si compiten por el mismo recurso base.
- **Costo de Oportunidad:** Cambiar una estrategia activa antes de su completitud (100%) resulta en la pérdida del 50% del presupuesto invertido.

## 3. Flujo de Datos (Data Flow)
1. **Input:** Jugador ajusta slider de presupuesto en `StrategyCabinet.js`.
2. **Validación Cliente:** Verifica límites UI (min/max visual).
3. **Intent:** Se dispara `ws.send({ type: 'player_set_objective', ... })`.
4. **Procesamiento Servidor:** `ObjectiveManager` valida recursos reales y aplica curvas de eficiencia.
5. **Feedback:** El servidor responde con `state_update` confirmando la asignación o rechazándola por fondos insuficientes.

## 4. Componentes UI
- **Selector de Objetivos:** Modal con grid de tarjetas.
- **Sliders de Presupuesto:** Input range con feedback numérico en tiempo real.
- **Indicadores de Eficiencia:** Gráfico de barra que muestra el multiplicador esperado según el presupuesto asignado.
- **Barra de Progreso de Turno:** Overlay visual que indica el avance del tick actual (implementado en `SyncClient`).

## 5. Estados Visuales
- `IDLE`: Sin estrategias activas.
- `RUNNING`: Estrategias procesándose (barra de progreso animada).
- `INSUFFICIENT_FUNDS`: Feedback visual rojo en sliders.
- `MAX_CAPACITY`: Bloqueo de selección de nuevos objetivos.