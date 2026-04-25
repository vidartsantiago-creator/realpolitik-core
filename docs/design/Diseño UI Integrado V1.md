\### Distribución de Pantalla (Estado Estable)



| Zona | Componente UI | Datos Visibles (Según v5 §1.1.2) |

|---|---|---|

| \*\*Izquierda\*\* | 📊 \*\*Tablero de Mando\*\* | Métricas vitales (PIB, Presupuesto, Estabilidad, Apoyo, Militar, Recursos). Barras con gradiente verde→amarillo→rojo y tendencia ▲▼. |

| \*\*Centro\*\* | 🌍 \*\*Mapa Geopolítico\*\* | Arcos de relación diplomática, pulsos de estabilidad por nación y zonas de crisis (indicadores de Fase 1-2). Sin grilla ni unidades. |

| \*\*Derecha Superior\*\* | 🎴 \*\*Centro de Decisiones\*\* | Tarjeta de Política activa con \*countdown\*. 3 opciones con Costo/Riesgo/Beneficio. La opción conservadora está pre-seleccionada y resaltada. |

| \*\*Derecha Inferior\*\* | 📡 \*\*Feed de Inteligencia\*\* | Flujo vertical. Etiquetas: Interna (Facciones), Externa (Global), Pública (Prensa). Muestra % de Confianza y origen. |

| \*\*Inferior\*\* | 🏛️ \*\*Panel Rápido\*\* | Barras de lealtad de facciones (simplificadas) e indicadores de relaciones bilaterales. Colapsable para maximizar el mapa. |



\### Comportamiento en Estado Estable (90% del tiempo)

\* \*\*Jerarquía de Alertas (§4.6):\*\* Ningún nivel `critical` bloquea la vista. El flujo es continuo. Las alertas `informational` se acumulan en el Feed sin interrumpir la toma de decisiones.

\* \*\*Niebla de Guerra (§1.1.1 Regla 1):\*\* El mapa y el Feed solo muestran datos filtrados por el nivel de espionaje y alianzas del jugador. El estado crudo del mundo nunca se expone directamente.

\* \*\*Ritmo de Juego:\*\* El jugador interpreta tendencias, ajusta la configuración del Feed y gestiona la \*\*Tarjeta de Política\*\* antes de que expire el temporizador (se aplica la conservadora por defecto).



\### 💡 Principio de Diseño Clave

Esta disposición elimina la microgestión táctica y fuerza al jugador a operar como \*\*estratega de alto nivel\*\*: observar señales débiles en el Feed, equilibrar métricas en el Dashboard y actuar solo cuando la información justifica el costo político. Cumple exactamente con la tensión descrita en \*v5 §1.1.1 Propósito\*.



\## Análisis de Ideas para Pantalla Principal



\### 1) Panel de Control de Capas del Mapa ✅ \*\*ALTAMENTE COMPATIBLE\*\*



\*\*Alineación con Documentación:\*\*

El \*Descriptivo v5 §1.1.2\* ya especifica que el Mapa Geopolítico debe tener \*\*capas superponibles\*\*:

> "Capas: Relaciones Diplomáticas (verdes/rojas), Flujos Comerciales, Zonas de Crisis (pulsos rojos con fase indicada), Frentes Militares, Coaliciones en formación"



\*\*Propuesta de Implementación:\*\*



| Capa | Visualización | Datos (según contratos) |

|------|---------------|-------------------------|

| \*\*📈 Comercial\*\* | Arcos animados (verde→amarillo→rojo según volumen) | `diplomacy.relations\[]`, tratados activos, flujos de recursos |

| \*\*⚔️ Militar\*\* | Iconos de bases, líneas de movimiento, ejercicios | Operaciones activas, alianzas defensivas, `military` stat |

| \*\*🏛️ Gobernanza\*\* | Nodos de poder, cumbres programadas | Afinidades políticas, `faction.loyaltyLevel`, summits |

| \*\*🌍 Amenazas Globales\*\* | Overlay semitransparente por región | `global\_crisis\_phase`, affectedRegions, severity |



\*\*Control de Capas:\*\*

\- Toggle buttons en esquina superior del mapa

\- Slider de opacidad por capa

\- \*\*Principio de Niebla de Guerra\*\* (\*Contractual v2 §4.5\*): Las capas solo muestran datos filtrados por `InformationLayer.filter()`



\---



\### 2) Dos Ventanas Permanentes de Comunicación ⚠️ \*\*REQUIERE AJUSTE\*\*



\*\*Análisis de Compatibilidad:\*\*



| Propuesta | Estado Actual (v5 §1.1.2) | Evaluación |

|-----------|---------------------------|------------|

| \*\*Comunicación con IA propia (Ministro)\*\* | No existe como ventana permanente. La IA aparece en \*Centro de Decisiones\* (Tarjetas de Política) y \*Panel de Configuración\* (Mayordomía) | 🔶 \*\*Nueva función\*\* - Podría integrarse |

| \*\*Mensajes de IA extranjeras/jugadores\*\* | Existe \*Feed de Inteligencia\* (Externa/Pública) pero es unidireccional. Los canales diplomáticos son temporales (10 min) | 🔶 \*\*Extensión\*\* - Requiere persistencia |



\*\*Propuesta de Integración (sin romper arquitectura):\*\*



En lugar de \*\*dos ventanas nuevas\*\* (que saturarían la UI), sugiero:



\*\*A) Panel Lateral Derecho Reorganizado:\*\*

```

┌─────────────────────────┐

│ 🎴 CENTRO DE DECISIONES │ ← Prioridad máxima (Policy Cards activas)

├─────────────────────────┤

│ 💬 MINISTRO IA          │ ← Nuevo: Chat contextual con advisor

│    "Sugerencia: Basado  │    - Muestra justificaciones de IA

│    en estabilidad 45%,  │    - Permite preguntar "¿por qué?"

│    recomiendo..."       │    - Historial de 5 mensajes

├─────────────────────────┤

│ 📡 FEED INTELIGENCIA    │ ← Existente, pero expandido

│    \[Interna] \[Externa]  │    - Pestaña nueva: "Diplomático"

│    \[Prensa] \[Diplomático]│    - Mensajes persistentes de naciones

└─────────────────────────┘

```



\*\*B) Sistema de Mensajería Diplomática Persistente:\*\*

\- \*\*Contrato nuevo:\*\* `event.diplomatic\_message` (extensión de `diplomatic\_channel`)

\- \*\*Diferencia con canal directo:\*\* 

&#x20; - Canal directo: 10 min, tiempo real, negociación activa

&#x20; - Mensaje diplomático: Asincrónico, notas formales, recordatorios

\- \*\*Ejemplo:\*\* "Chile propone reunión cumbre sobre recursos hídricos. Responder antes de tick 45"



\*\*Ventaja:\*\* No rompe el \*Principio de Minimalismo\* (v5 §1.1.2) y mantiene el foco en \*\*estrategia de alto nivel\*\*, no en microgestión de comunicaciones.



\---



\### 3) Imagen Propuesta - Pantalla Principal Estado Estable



\[Image ID: 1]

\*\*Cambios Clave Respecto a la Imagen Anterior:\*\*



1\. \*\*Mapa con Capas Activas:\*\*

&#x20;  - Arcos verdes brillantes = Flujos comerciales (capa Comercial activada)

&#x20;  - Pulsos rojos = Zonas de crisis climática Fase 2-3 (capa Amenazas Globales)

&#x20;  - Iconos de ancla = Bases militares propias y aliadas (capa Militar)



2\. \*\*Panel de Control de Capas\*\* (esquina superior izquierda del mapa):

&#x20;  - 4 toggles con iconos: 📈 ⚔️ ️ 🌍

&#x20;  - Slider de opacidad general

&#x20;  - Indicador "Capa Activa: Comercial + Amenazas"



3\. \*\*Ministro IA\*\* (panel derecho, debajo de Decisiones):

&#x20;  - Avatar minimalista + mensaje contextual

&#x20;  - "Basado en lealtad Militarista 45%, sugiero aumentar presupuesto defensivo antes de tick 30"

&#x20;  - Botón "Ver Análisis" → expande justificación



4\. \*\*Feed Diplomático\*\* (pestaña nueva en Feed de Inteligencia):

&#x20;  - "🇧 Brasil: Propone tratado de cooperación energética. Deadline: 8 ticks"

&#x20;  - "🇨🇱 Chile: Acepta canal directo sobre recursos hídricos. Iniciar en 2 ticks"



5\. \*\*Indicadores de Capa en Mapa:\*\*

&#x20;  - Leyenda flotante: "🟢 Aliados Comerciales | 🔴 Crisis Fase 3 | ⚓ Bases Propias"



\*\*Principios de Diseño Aplicados:\*\*

\- ✅ \*\*Niebla de Guerra\*\* (\*Contractual v2 §4.5\*): Solo se ven datos filtrados por nivel de espionaje

\- ✅ \*\*Jerarquía de Alertas\*\* (\*v5 §1.1.1 Regla 2\*): Las capas no bloquean; las alertas críticas sí interrumpen

\- ✅ \*\*Información como Recurso\*\* (\*v5 §1.1.1 Regla 1\*): Activar/desactivar capas tiene costo cognitivo pero no diegético



\---



\### Recomendación Final



\*\*Priorizar implementación en este orden:\*\*

1\. ✅ \*\*Panel de capas del mapa\*\* (ya está en specs, solo requiere UI controls)

2\. 🔶 \*\*Ministro IA contextual\*\* (nuevo, pero alto valor para UX)

3\. 🔶 \*\*Pestaña Diplomática en Feed\*\* (extensión natural del sistema existente)



\*\*No implementar:\*\* Ventanas flotantes independientes → violaría principio de \*UI minimalista centrada en decisiones\*.


--------------------

# Especificación Formal: Ministro IA V2 (AI Advisor & Diplomatic Orchestrator)

Esta versión actualizada formaliza el rol del **Ministro IA** no solo como un asesor pasivo, sino como el orquestador activo de la diplomacia y la inteligencia estratégica. Integra las correcciones arquitectónicas solicitadas para garantizar determinismo, seguridad contra abusos de simulación y coherencia temporal basada en ticks.

---

## 1. Arquitectura de Despliegue: Cliente-Only vs. Server-Contract

### Veredicto: **Híbrido (Server-Authoritative Logic / Client-Side Presentation)**

El Ministro IA opera bajo un modelo de **"Cerebro en Servidor, Voz en Cliente"**.

| Componente | Ubicación | Responsabilidad | Justificación |
| :--- | :--- | :--- | :--- |
| **AdvisorEngine.js** | **Servidor** (`/ai/`) | Analiza el **Estado Crudo Global**, calcula riesgos, genera sugerencias y gestiona la lógica de negociación diplomática. | Requiere acceso a datos no filtrados para evaluar amenazas reales. Garantiza que la "inteligencia" de la IA no dependa de la niebla de guerra del jugador. |
| **DiplomacyOrchestrator** | **Servidor** (`/ai/` o `/modules/DiplomacyRule.js`) | Valida solicitudes de extensión de tiempo, gestiona el countdown en ticks y enforcea la regla de "quién puede extender". | El tiempo es una variable de estado del servidor. El cliente solo renderiza la conversión visual. |
| **AdvisorRenderer** | **Cliente** (`/client/UI.js`) | Recibe paquetes estructurados, convierte `ticks` a formato HH:MM:SS, y renderiza la UI. | Desacopla la lógica de negocio de la presentación visual. |
| **Contrato de Servidor** | **WebSocket** | Emite eventos `event.advisor_suggestion`, `event.diplomatic_update`. | Mantiene la arquitectura *Server-Authoritative*. |

> **Nota Crítica:** `AdvisorEngine.js` consume el estado crudo (`StateManager.getState()`) pero **emite** sugerencias basadas en lo que el jugador *podría* saber o debería priorizar, aplicando su propio filtro de "relevancia estratégica" antes de enviar al cliente.

---

## 2. Eventos de Activación (Triggers)

### A. Activación Pasiva (Reactiva a Eventos del Sistema)
El servidor emite `event.advisor_suggestion` automáticamente.

| Evento Disparador | Condición | Tipo de Sugerencia | Prioridad UI |
| :--- | :--- | :--- | :--- |
| `state_updated` | Métricas críticas (`stability < 30`, etc.) | **Alerta Preventiva** | 🟠 Urgent |
| `faction_signal` | Complot detectado (`confidence > 70%`) | **Inteligencia Acción** | 🔴 Critical/Urgent |
| `diplomatic_request` | Solicitud entrante de otra nación | **Decisión Diplomática** | 🟠 Urgent |
| `global_crisis_phase` | Escalada de fase | **Estratégico** | 🟠 Urgent |

### B. Activación Activa (Consulta del Jugador)
El jugador consulta al Ministro mediante `ws.message.advisor_query`.

| Tipo de Query | Payload | Limitaciones |
| :--- | :--- | :--- |
| **Risk Assessment** | `{ type: 'risk_assessment' }` | Sin límite estricto, pero coste computacional bajo. |
| **Justification** | `{ type: 'justify_action', actionId: '...' }` | Sin límite. Explica heurística de Tarjetas de Política. |
| **Simulation** | `{ type: 'simulate', intent: Intent }` | **LIMITADO:** Máximo **3 usos por día real** (o por ciclo de reseteo diario). |

#### Mecanismo de Limitación de Simulación (`simulate`)
Para evitar que el jugador use la IA como un "oráculo infinito" que prueba todas las posibilidades sin riesgo:

1.  **Contador en Estado de Nación:** Se añade el campo `dailySimulationsUsed` al objeto `Nation` en `StateManager`.
2.  **Reset Diario:** En `TimeEngine`, cuando `tick % TICKS_PER_DAY === 0`, se resetea `dailySimulationsUsed = 0` para todas las naciones.
3.  **Validación en `AdvisorEngine.js`:**
    ```javascript
    function handleSimulateQuery(nationId, intent) {
      const nation = stateManager.getNation(nationId);
      if (nation.dailySimulationsUsed >= MAX_DAILY_SIMULATIONS) {
        return { error: 'Límite de simulaciones diarias alcanzado. Reset en próximo ciclo.' };
      }
      
      // Ejecutar simulación ligera (sin aplicar delta)
      const projection = simulateIntent(intent, nation.context);
      
      // Incrementar contador
      nation.dailySimulationsUsed++;
      stateManager.updateNationStat(nationId, 'dailySimulationsUsed', nation.dailySimulationsUsed);
      
      return { projection, remaining: MAX_DAILY_SIMULATIONS - nation.dailySimulationsUsed };
    }
    ```
4.  **Feedback UI:** El cliente muestra *"Simulaciones restantes hoy: 1/3"* junto al botón de consulta.

---

## 3. Modelo de Consumo de Datos (Input Context)

### `AdvisorContext` (Generado en Servidor)

El `AdvisorEngine` accede al estado crudo para tomar decisiones precisas, pero estructura la salida para ser útil al jugador.

```javascript
{
  nationId: "ARG",
  tick: 45,
  
  // 1. Estado Vital (Crudo, no filtrado)
  stats: {
    stability: 45,
    budget: 1200,
    // ... otras métricas
  },

  // 2. Amenazas Reales (Crudas)
  threats: [
    {
      type: "faction_plot",
      source: "Facción Militarista",
      stage: "planning",
      confidence: 0.85, // Confianza real del servidor
      estimatedImpact: "Golpe en 4-6 ticks",
      recommendedCounter: "increase_benefits"
    }
  ],

  // 3. Contexto Diplomático (Crudo)
  diplomaticStatus: {
    activeChannels: ["CHI"],
    pendingRequests: [
      {
        from: "BRA",
        type: "direct_channel",
        agenda: ["energy"],
        requestedAtTick: 40
      }
    ]
  },
  
  // 4. Contadores de Uso
  dailySimulationsUsed: 1
}
```

---

## 4. Contrato de Payload (Salida hacia el Cliente)

### Evento: `event.advisor_suggestion`

```json
{
  "tick": 45,
  "priority": "urgent",
  "category": "diplomatic",
  
  "headline": "Solicitud de Canal Directo: Brasil",
  "message": "Brasil solicita un canal directo para discutir 'Cooperación Energética'. Su relación actual es Neutral (0). Aceptar abre una ventana de negociación de 10 minutos.",
  
  "recommendation": {
    "actionType": "diplomatic_response",
    "targetId": "req_BRA_40",
    "options": [
      { "label": "Aceptar", "value": "accept" },
      { "label": "Rechazar", "value": "reject" },
      { "label": "Contraproponer Agenda", "value": "counter" }
    ]
  },
  
  // Datos temporales en TICKS
  "temporalData": {
    "expiresAtTick": 105, // Tick actual + duración máxima
    "maxDurationTicks": 600 // 10 minutos * 60 ticks/min (ejemplo)
  }
}
```

---

## 5. Diseño del Modal Diplomático V2 (Negociación Basada en Ticks)

### A. Gestión del Tiempo: Ticks vs. Segundos

1.  **Servidor:** Maneja todo el tiempo en **ticks**.
    *   `expiresAt`: Tick absoluto en el que cierra el canal.
    *   `maxDuration`: Cantidad de ticks permitidos (ej. 600 ticks para 10 min si `tickRate` es 1s/tick).
2.  **Cliente:** Convierte ticks a tiempo legible.
    *   Fórmula: `timeRemainingSeconds = (expiresAtTick - currentTick) * tickDurationInSeconds`.
    *   Renderizado: Formato `MM:SS` (ej. `09:45`).
    *   Countdown: Se actualiza cada vez que llega un `ws.broadcast.update` con el nuevo `currentTick` o mediante un timer local sincronizado con el heartbeat.

> **Ventaja:** Elimina problemas de latencia y desincronización. Si el servidor va lento, el countdown visual se ajusta porque depende del `tick` confirmado, no del reloj local.

### B. Regla de Extensión de Tiempo

**Restricción:** Solo el jugador que **aceptó la solicitud inicial** de conversación tiene el derecho prioritario de solicitar una extensión.

1.  **Inicio del Canal:**
    *   Nación A solicita canal.
    *   Nación B acepta.
    *   **Rol de "Anfitrión":** Se asigna a Nación B (el que aceptó). Nación A es "Invitado".

2.  **Solicitud de Extensión:**
    *   Cualquier parte puede *pedir* extender.
    *   Pero solo el **Anfitrión** puede *aprobar* unilateralmente o su aprobación tiene peso mayor.
    *   *Implementación Simplificada:* Solo el Anfitrión ve el botón activo "Extender (+2 min)". El Invitado ve "Solicitar Extensión" que envía un mensaje al Anfitrión. Si el Anfitrión hace clic en "Aceptar Extensión", el servidor suma ticks a `expiresAt`.

3.  **Payload de Extensión:**
    *   `ws.message.diplomatic_extension_request`: `{ channelId, requestingNation: 'A' }`
    *   `event.diplomatic_extension_granted`: `{ channelId, newExpiresAtTick: 1200, grantedBy: 'B' }`

4.  **Lógica en Servidor (`DiplomacyRule.js`):**
    ```javascript
    function requestExtension(channelId, requestingNationId) {
      const channel = activeChannels[channelId];
      if (!channel) return;

      // Si el solicitante es el Anfitrión (quien aceptó inicialmente)
      if (channel.hostNationId === requestingNationId) {
        // Permitir extensión directa hasta maxDuration total
        if (channel.currentDurationTicks + EXTENSION_TICKS <= channel.maxDurationTicks) {
          channel.expiresAtTick += EXTENSION_TICKS;
          channel.currentDurationTicks += EXTENSION_TICKS;
          emit('diplomatic_extension_granted', { channelId, newExpiresAtTick: channel.expiresAtTick });
        }
      } else {
        // Si es el Invitado, enviar notificación al Anfitrión
        emit('diplomatic_extension_proposal', { channelId, from: requestingNationId });
      }
    }
    ```

---

## 6. Integración Técnica y Archivos

### Archivos Modificados/Nuevos

1.  **`/ai/AdvisorEngine.js`**
    *   **Nuevo:** Módulo central que reemplaza la lógica dispersa.
    *   **Función:** `generateSuggestion(context)`, `handleSimulateQuery(nationId, intent)`.
    *   **Dependencia:** Importa `StateManager` para leer estado crudo.

2.  **`/modules/DiplomacyRule.js`**
    *   **Modificado:** Gestiona `activeChannels` con campos `hostNationId`, `expiresAtTick`, `maxDurationTicks`.
    *   **Nuevo Método:** `requestExtension(channelId, nationId)` con lógica de permisos.

3.  **`/core/StateManager.js`**
    *   **Modificado:** Schema de `Nation` incluye `dailySimulationsUsed: number`.
    *   **Nuevo Método:** `resetDailyCounters()` llamado por `TimeEngine` al inicio de cada día.

4.  **`/client/UI.js` (Componente `DiplomaticModal`)**
    *   **Modificado:** Recibe `expiresAtTick` y `currentTick`. Calcula `timeLeft` localmente para el countdown visual.
    *   **Nuevo:** Botón "Extender" habilitado/deshabilitado según `isHost` (rol determinado por el payload de apertura del canal).

5.  **`/client/UI.js` (Componente `MinisterPanel`)**
    *   **Nuevo:** Indicador de "Simulaciones Restantes: X/3". Deshabilita input de simulación si X=0.

---

## 7. Resumen de Cambios Clave

| Característica | Versión Anterior | Versión V2 (Actual) |
| :--- | :--- | :--- |
| **Fuente de Datos IA** | Estado Filtrado (`InformationLayer`) | **Estado Crudo** (`StateManager`) |
| **Unidad de Tiempo** | Segundos / Timestamps | **Ticks** (Cliente convierte a HH:MM:SS) |
| **Simulación** | Ilimitada | **Máx. 3/día** (Contador en `Nation`) |
| **Extensión Diplomática** | Cualquiera puede extender | **Solo el Anfitrión** (quien aceptó la solicitud inicial) tiene control directo |
| **Determinismo** | Depende de reloj local | **Totalmente Determinista** basado en `tick` global |

Este diseño asegura que el Ministro IA sea una herramienta poderosa pero limitada, integrada profundamente en la mecánica de ticks del juego, y que la diplomacia mantenga una jerarquía clara de control temporal.
------------------------------

# Diseño de UI: Modal Diplomático Compacto (Negociación Asíncrona/Overlay)

Este diseño refina el concepto anterior para cumplir con dos restricciones críticas de UX: **no interrumpir el flujo principal** (ventana flotante/overlay) y **agilizar la negociación** (ciclos cortos de 2 minutos con extensión mutua).

Transforma la diplomacia de un "evento de pantalla completa" a una **herramienta de gestión lateral**, permitiendo al jugador negociar mientras monitorea crisis globales o gestiona facciones en el mapa principal.

---

## 1. Concepto Visual: "La Ventana de Embajada"

El modal es una ventana flotante (**Glassmorphism oscuro**) anclada en una esquina del mapa (ej. superior derecha o inferior izquierda, configurable por el jugador para no tapar zonas de crisis activas).

*   **Tamaño:** Mediano-Pequeño (~400px ancho x ~500px alto). No cubre más del 20% de la pantalla.
*   **Comportamiento:**
    *   **No Bloqueante:** El jugador puede hacer clic fuera del modal para interactuar con el Mapa o el Dashboard. El modal permanece visible pero pierde el foco visual (opacidad reducida o borde menos brillante).
    *   **Siempre Visible:** Si se minimiza, queda como un icono pulsante en la barra inferior con el countdown restante.
    *   **Z-Index:** Superior al mapa, inferior a las alertas `critical`.

---

## 2. Estructura del Modal (Layout Vertical Compacto)

Dado el espacio reducido, la información se jerarquiza verticalmente.

### A. Header: Identidad y Tiempo (Top Bar)
*   **Izquierda:** Banderas pequeñas de **Nación Jugador** vs **Nación Rival** + Nombre del Líder Rival.
*   **Centro:** Título de la Agenda (ej. *"Tratado Hídrico"*).
*   **Derecha:** ⏱️ **Countdown Dinámico**.
    *   Muestra `01:45` (tiempo restante del bloque actual).
    *   Color Verde/Amarillo/Rojo según urgencia.
    *   **Botón de Extensión:** Icono de "Reloj +" o texto *"Extender (+2m)"*.
        *   Estado: *Gris* (si ya expiró tu turno de proponer extensión) o *Activo* (si ambos deben aceptar).
        *   Tooltip: *"Requiere aceptación mutua. Máx. 10 min."*

### B. Cuerpo Central: Área de Trabajo (Split View Vertical)
Para ahorrar espacio horizontal, se apilan los componentes:

#### 1. Panel de Propuesta Actual (Arriba - 40% altura)
Muestra la **última oferta sobre la mesa**.
*   **Texto Claro:** *"Chile ofrece: 500MW Energía/mes a cambio de 12% Arancel Gas."*
*   **Indicador de Tono:** Icono pequeño (🟢 Conciliador / 🔴 Agresivo) junto al nombre del rival.
*   **Estado:** Etiqueta *"Pendiente de tu respuesta"*.

#### 2. Pizarra de Contrapropuesta (Medio - 30% altura)
Sliders compactos para ajustar los términos antes de responder.
*   **Sliders Horizontales:**
    *   `Volumen Energía`: [Slider] (Min: 100, Max: 1000)
    *   `Arancel %`: [Slider] (Min: 0%, Max: 25%)
*   **Toggle Simple:**
    *   `[ ] Incluir Transferencia Tecnológica`
*   **Feedback Instantáneo:** Pequeños tooltips o colores en los sliders indican si el valor está dentro de lo "razonable" según tu IA (verde) o es riesgoso (rojo).

#### C. Footer: Acciones Rápidas (Bottom Bar)
Botones grandes y claros para acción inmediata.

1.  **[Aceptar Acuerdo]**: Cierra el canal, firma el tratado.
2.  **[Enviar Contrapropuesta]**: Envía los valores de los sliders + tu postura actual.
3.  **[Romper Negociaciones]**: Cierra el canal inmediatamente (penalización diplomática).
4.  **[Solicitar Extensión]**: Botón secundario (outline) que envía petición de +2 min.
    *   Si el rival acepta, el contador se reinicia a `02:00`.
    *   Si el rival rechaza o ignora, el contador sigue corriendo hasta 0.

---

## 3. Mecánica de Tiempo: Ciclos de 2 Minutos + Extensión Mutua

Esta mecánica cambia la dinámica de "presión constante" a "negociación por rondas".

### Flujo de Tiempo:
1.  **Inicio:** Canal abierto. Countdown inicia en `02:00`.
2.  **Durante los 2 minutos:**
    *   Ambas partes pueden enviar contrapropuestas libremente.
    *   Cada nueva propuesta **reinicia** el countdown a `02:00`? **NO**. El countdown corre continuo para evitar bucles infinitos de "solo para ganar tiempo".
    *   *Corrección:* El countdown corre continuo. La extensión es manual.
3.  **Solicitud de Extensión:**
    *   En cualquier momento, cualquiera de las partes puede hacer clic en *"Solicitar Extensión (+2m)"*.
    *   Aparece un prompt en el modal del rival: *"Argentina solicita extender la negociación 2 minutos más. ¿Aceptar?"*
    *   **Si Acepta:** El contador suma +2:00 al tiempo restante actual (tope máximo 10:00 desde el inicio).
    *   **Si Rechaza/Ignora:** El tiempo sigue corriendo. Si llega a 00:00, el canal se cierra automáticamente sin acuerdo (o aplica el último estado si hubo consenso parcial, según regla de negocio).
4.  **Límite Duro:** A los 10 minutos totales desde la apertura, el canal se cierra forzosamente.

> **Justificación de UX:** Los 2 minutos iniciales fuerzan decisiones rápidas para acuerdos simples. La extensión mutua permite profundizar en tratados complejos sin penalizar a quienes negocian rápido. Evita que un jugador "abandone" la ventana abierta indefinidamente.

---

## 4. Integración con la Pantalla Principal (No Intrusiva)

### Comportamiento Visual:
*   **Foco Activo:** Cuando el jugador hace clic en el modal, este se ilumina (borde brillante, opacidad 100%). El resto de la UI se oscurece ligeramente (overlay negro al 20%) para guiar la atención, pero **no bloquea clicks**.
*   **Foco Inactivo:** Si el jugador hace clic en el Mapa o Dashboard, el modal se atenúa (opacidad 70%, sin borde brillante). Permite ver el mapa detrás claramente.
*   **Alertas Críticas:** Si ocurre una alerta `critical` (ej. Golpe de Estado), el modal diplomático se **minimiza automáticamente** a un icono en la barra inferior para dar paso a la pantalla de crisis. Se muestra un toast: *"Negociación pausada debido a Crisis Interna"*.

### Posicionamiento:
*   Por defecto: Esquina Superior Derecha (lejos del Dashboard izquierdo y del Feed inferior derecho).
*   Arrastrable: El jugador puede mover la ventana a cualquier esquina libre del mapa.

---

## 5. Contrato de Payload Actualizado (`Bases Contractuales v2`)

Se ajusta el contrato `event.diplomatic_channel_open` y se añade lógica de extensión.

### Evento: `event.diplomatic_channel_open`
```json
{
  "channelId": "ARG_CHI_20260425_001",
  "nationA": "ARG",
  "nationB": "CHI",
  "agenda": ["water", "energy"],
  "openedAt": 1714000000,
  "expiresAt": 1714000120, // Timestamp inicial: +2 minutos
  "maxDuration": 600, // 10 minutos máximos en segundos
  "extensionsGranted": 0 // Contador de extensiones usadas
}
```

### Nuevo Mensaje: `ws.message.diplomatic_extension_request`
```json
{
  "channelId": "ARG_CHI_20260425_001",
  "requestingNation": "ARG",
  "requestedMinutes": 2
}
```

### Nuevo Evento: `event.diplomatic_extension_response`
```json
{
  "channelId": "ARG_CHI_20260425_001",
  "respondingNation": "CHI",
  "accepted": true, // o false
  "newExpiresAt": 1714000240 // Si aceptó, suma 2 min al expiresAt anterior
}
```

---

## 6. Principios de Diseño Aplicados

| Principio | Implementación en Modal Compacto |
| :--- | :--- |
| **Multitarea Estratégica** | Al no bloquear la pantalla, el jugador puede gestionar una crisis climática (Mapa) mientras negocia un tratado (Modal). Refleja la carga cognitiva real de un estadista. |
| **Presión Temporal Flexible** | Los 2 minutos iniciales evitan la parálisis. La extensión mutua premia la buena voluntad diplomática y permite profundidad sin obligar a todos los tratados a ser largos. |
| **Jerarquía Visual Clara** | El Header muestra el "qué" y "cuánto tiempo". El Cuerpo muestra el "cómo". El Footer muestra la "acción". Todo en un vistazo. |
| **Respeto al Espacio** | La ventana flotante pequeña respeta la inversión del jugador en diseñar su Mapa y Dashboard principales. |

---

## 7. Mockup Visual (Descripción para Generación de Imagen)

> **Prompt para Image Gen:**
> "UI design of a compact, floating diplomatic negotiation window in a geopolitical strategy game. Dark glassmorphism style, positioned in the top-right corner of a blurred world map background. The window is small (~400x500px). Top bar shows small flags of Argentina and Chile, title 'Water Treaty', and a green digital timer '01:45' with a small '+2m' button next to it. Middle section has two horizontal sliders labeled 'Energy Volume' and 'Tariff %', and a toggle switch for 'Tech Transfer'. Above the sliders, a text box shows the opponent's last offer: 'Chile offers: 500MW for 12% tariff'. Bottom bar has three large buttons: 'Accept', 'Counter-Offer', 'Break Talks'. The window is semi-transparent, allowing the map continents to be faintly visible behind it. High-tech, clean, non-intrusive aesthetic."

[Image ID: 5]

*(Nota: La imagen generada reflejará esta estructura compacta y flotante, diferenciándose claramente del modal de pantalla completa anterior).*

---

## 8. Conclusión

Este diseño resuelve la fricción de la interrupción total. Al convertir la diplomacia en una **ventana de herramienta** en lugar de un **modo de juego**, se alinea perfectamente con la visión de *Realpolitik* como simulador de gestión continua. La mecánica de tiempo de 2+2 minutos introduce una capa social interesante: la necesidad de cooperar incluso en el uso del tiempo de negociación.

--------------------------


### 🎴 Tarjeta de Política: "Crisis Response"

**Elementos Clave Visuales:**

1.  **⏱️ Countdown Urgente (Top Right):**
    *   Timer digital grande en rojo/naranja (`02:14`).
    *   Indica el tiempo real restante antes de que se aplique la opción conservadora por defecto.
    *   Genera presión inmediata sin bloquear la vista del mapa hasta los últimos segundos.

2.  **📋 Título de la Crisis (Top Left):**
    *   Texto claro y conciso: *"CRISIS RESPONSE: WATER SHORTAGE"*.
    *   Contextualiza inmediatamente la decisión dentro de una amenaza global o interna.

3.  **✅ Opciones de Acción (Stack Vertical):**
    *   **Opción A (Conservadora/Default):** Resaltada con borde verde o checkmark.
        *   *"Rationing"* | Cost: Low | Risk: Low | Impact: Stability -5%.
        *   Es la opción segura, pero con consecuencias negativas menores.
    *   **Opción B (Reformista):**
        *   *"Desalination Plants"* | Cost: $4.8B | Risk: Medium | Impact: GDP +2% long term.
        *   Inversión a medio plazo, requiere recursos actuales.
    *   **Opción C (Radical):**
        *   *"Import Water Rights"* | Cost: $7.5B | Risk: High | Impact: Diplomatic Tension with Chile.
        *   Solución rápida pero costosa políticamente.

4.  **💡 Sugerencia del Ministro IA (Bottom):**
    *   Texto pequeño: *"AI Advisor Suggestion: Option A recommended due to low budget reserves."*
    *   Justifica la recomendación basándose en el estado actual del jugador (presupuesto bajo), reforzando la idea de que la IA es un asesor contextual, no un jugador autónomo.

5.  ** Contexto de Fondo:**
    *   La tarjeta flota sobre un mapa geopolítico desenfocado.
    *   Se vislumbran métricas clave a la izquierda (GDP, Stability) y feeds de inteligencia a la derecha, manteniendo al jugador orientado en el estado global mientras decide.

### 🎯 Principios de Diseño Aplicados:

*   **Jerarquía Visual:** El timer y las opciones son lo más prominente. El resto es contexto.
*   **Transparencia de Consecuencias:** Cada opción muestra claramente Costo, Riesgo e Impacto estimado, permitiendo decisiones informadas bajo presión.
*   **Default Conservador:** La opción A está pre-seleccionada visualmente, cumpliendo con la regla de que "si no actúas, se aplica la opción segura".
*   **Asistencia Contextual:** La sugerencia de la IA no es una orden, sino una justificación basada en datos (presupuesto bajo), empoderando al jugador para ignorarla si tiene una estrategia diferente.

Esta interfaz encapsula la esencia de *Realpolitik*: tomar decisiones difíciles con información incompleta, bajo presión temporal, donde cada elección tiene un costo político, económico o diplomático medible.

-------------------------------------

# Diseño de UI: Feed de Inteligencia y Señales Veladas

Este diseño traduce la mecánica de **"Información como Recurso y Riesgo"** (*Descriptivo v5 §1.1.1*) y los contratos de `faction_signal` / `espionage_signal` (*Contractual v2 §2.2*) en una interfaz funcional que obliga al jugador a interpretar, no solo leer.

---

## 1. Estructura Visual del Feed

El Feed no es un chat simple; es un **panel de flujo de datos asimétricos**. Se ubica en el panel derecho inferior (o lateral colapsable) y se divide en dos niveles: **Canales** y **Señales**.

### A. Pestañas de Canales (Filtros de Fuente)
El jugador puede silenciar canales, pero con consecuencias diegéticas (*Contractual v2 §4.6*).

| Pestaña | Icono | Contenido | Consecuencia si se Silencia |
| :--- | :---: | :--- | :--- |
| **Interna** | 🏛️ | Señales de facciones (`faction_signal`). Complots, lealtad, rumores de cuartel. | **+2-3 ticks de delay** en detección de complots. La confianza percibida baja un 10%. |
| **Externa** | 🌍 | Movimientos de naciones vecinas, crisis globales (`global_crisis_phase`), espionaje detectado. | Las crisis alcanzan **Fase 2** antes de ser notificadas. Menor tiempo de reacción. |
| **Prensa** | 📰 | Noticias públicas, opinión internacional, impacto de tus políticas en la población. | Sin consecuencia operativa directa, pero pierdes "termómetro social" para anticipar revueltas. |
| **Diplomático** | ✉️ | Mensajes formales asincrónicos de otras naciones (propuestas, rechazos, notas). | N/A (Es histórico/negociación). |

> **Indicador de Estado del Canal:** Si un canal está silenciado, su icono aparece tachado o en gris oscuro, y al pasar el mouse muestra tooltip: *"⚠️ Silenciado: Detección retardada +2 ticks"*.

---

## 2. Anatomía de una "Señal Velada"

Una señal nunca dice "Hay un complot". Dice "Algo extraño está pasando". La UI debe reflejar esta ambigüedad mediante **gradación visual de confianza**.

### Componentes de la Tarjeta de Señal

```text
┌───────────────────────────────────────────────┐
│ [🔒] 14:02 TICK 45      [CONFIDENCE: 65%]     │ ← Header: Hora/Tick + Barra de Confianza
├───────────────────────────────────────────────┤
│ 🏛️ FUENTE: Inteligencia Interna (Facción)    │ ← Origen filtrado por InformationLayer
│                                               │
│ "Reuniones no registradas en cuarteles del    │ ← Texto Ambiguo (SignalText)
│  sur. Movimientos de fondos inusuales."       │
│                                               │
│ 🔍 ANÁLISIS IA:                               │ ← Contexto opcional (click para expandir)
│ Patrón compatible con etapa: RECLUTAMIENTO    │
│ Probabilidad de amenaza: MEDIA                │
│                                               │
│ [ ACCIÓN: Investigar ]  [ IGNORAR ]           │ ← Botones de respuesta contextual
└───────────────────────────────────────────────┘
```

### Gradación de Confianza (Visual Coding)

La confianza (`confidenceLevel` 0.0–1.0) determina el color y la solidez visual de la tarjeta. Esto ayuda al jugador a priorizar qué señales investigar primero.

| Rango de Confianza | Color UI | Estilo Visual | Interpretación del Jugador |
| :--- | :--- | :--- | :--- |
| **0% - 40%** | ⚪ Gris Claro | Borde discontinuo, opacidad 70%, texto itálica. | *"Ruido / Rumor infundado".* Bajo riesgo, alta probabilidad de ser falso positivo. |
| **41% - 65%** | 🟡 Amarillo | Borde sólido fino, opacidad 100%. | *"Señal Débil".* Algo ocurre, pero falta corroboración. Requiere inversión de recursos para verificar. |
| **66% - 85%** | 🟠 Naranja | Borde grueso, icono de alerta pequeño. | *"Amenaza Probable".* El patrón se repite. Recomendado actuar. |
| **86% - 100%** | 🔴 Rojo Intenso | Fondo sutil rojo, parpadeo suave (si es Urgent/Critical). | *"Confirmado / Inminente".* Acción requerida inmediata. |

> **Nota Técnica:** La confianza mostrada es **subjetiva**. Depende del `espionageLevel` del jugador y de si el canal está silenciado. Una señal real de confianza 90% podría mostrarse como 60% si el jugador tiene bajo nivel de espionaje interno.

---

## 3. Interacción y Mecánicas de Respuesta

El Feed no es pasivo. Cada señal ofrece acciones que consumen recursos (Presupuesto, Tiempo, Capital Político).

### Acciones Contextuales (Botones dinámicos según tipo de señal)

1.  **"Investigar / Verificar" (Costo: Presupuesto + Ticks)**
    *   *Efecto:* Aumenta la `confidenceLevel` de esa señal específica en un 15-20%.
    *   *Riesgo:* Si falla, la señal puede desaparecer (falso negativo) o alertar al conspirador (escalada temprana).
    *   *UI Feedback:* La tarjeta se actualiza en tiempo real: *"Confianza aumentada a 85%. Etapa confirmada: PLANIFICACIÓN"*.

2.  **"Ignorar / Archivar"**
    *   *Efecto:* Mueve la señal al historial.
    *   *Riesgo:* Si era real, la próxima señal aparecerá con menos tiempo de reacción (etapa más avanzada).

3.  **"Contra-medida Preventiva" (Solo si confianza > 60%)**
    *   *Ejemplo:* En una señal de espionaje, opción *"Expulsar Agente"* o *"Plantar Desinformación"*.
    *   *Ejemplo:* En señal de facción, opción *"Aumento de Beneficios"* o *"Reorganización de Mandos"*.

---

## 4. Integración con el Ministro IA (Asistencia Contextual)

Para evitar la parálisis por análisis, el **Ministro IA** (*propuesto anteriormente*) interviene en el Feed:

*   **Resumen de Prioridades:** Al abrir el juego, el Ministro puede destacar: *"Tengo 3 señales de confianza >80% en el canal Interno. Sugiero revisar la facción Militarista antes de tomar decisiones económicas."*
*   **Justificación de Confianza:** Al hacer hover sobre la barra de confianza, un tooltip explica: *"Confianza basada en: 2 informes de campo cruzados + Historial de fidelidad de la fuente (Alta)."*

---

## 5. Ejemplo de Flujo de Usuario (UX)

1.  **Tick 10:** Aparece señal en **Interna**.
    *   *Visual:* Tarjeta amarilla (65% confianza).
    *   *Texto:* "Oficiales retirados visitan instalaciones portuarias sin autorización."
    *   *Acción:* Jugador hace click en **"Investigar"** (Costo: $5M).

2.  **Tick 12:** Resultado de investigación.
    *   *Visual:* La misma tarjeta se actualiza a Naranja (85% confianza).
    *   *Nuevo Texto:* "Confirmado: Reunión con emisarios de nación vecina. Etapa: RECLUTAMIENTO."
    *   *Nueva Acción:* Aparece botón **"Sobornar Líder"** o **"Aumentar Vigilancia"**.

3.  **Decisión:** Jugador elige **"Aumentar Vigilancia"**.
    *   *Feedback:* La tarjeta se marca como "Gestionada". El sistema emite `faction_loyalty_change` (baja lealtad por desconfianza, pero se frena el complot).

---

## 6. Validación con Documentación

| Requisito | Documento | Implementación en UI |
| :--- | :--- | :--- |
| **Niebla de Guerra** | *Contractual v2 §4.5* | La confianza mostrada es filtrada por `InformationLayer`. El jugador nunca ve el valor "real" del servidor, solo su percepción. |
| **Consecuencias de Silenciar** | *Descriptivo v5 §1.1.1 Regla 1* | Tooltip y cambio de icono en pestaña silenciada indican el penalty de delay/confianza. |
| **Contratos de Payload** | *Contractual v2 §2.2.3/4* | La UI mapea `signalText`, `confidenceLevel` y `plotStage` directamente a los campos visuales. |
| **Jerarquía de Alertas** | *Contractual v2 §4.6* | Señales con confianza >90% y etapa "Execution" disparan prioridad `urgent` o `critical`, rompiendo el flujo del feed para exigir atención. |

Este diseño transforma el Feed de Inteligencia de un "log de eventos" a una **herramienta estratégica activa**, donde la gestión de la incertidumbre es tan importante como la decisión final.

---------------------------------

# Diseño de UI/UX: Stewardship / Mandato de Ausencia

Este diseño materializa el **Modo Mayordomía** (*Descriptivo v5 §1.1.1 Regla 5* y *Anexo A.1*) y el contrato `ws.message.stewardship_mandate` (*Contractual v2 §2.2.6*). Transforma la desconexión del jugador de un simple "pausar" a una **delegación estratégica con límites explícitos**, donde el jugador actúa como Jefe de Estado definiendo la doctrina, no como operador ejecutando acciones.

---

## 1. Concepto Visual: "El Despacho Oval"

Al hacer clic en **"Desconectar / Activar Mayordomía"** (ubicado en el Panel de Configuración o como acción global), la interfaz no cierra sesión inmediatamente. En su lugar, despliega un modal de alta jerarquía que simula firmar órdenes ejecutivas antes de salir.

*   **Estética:** Tonos más oscuros, tipografía serif para los títulos de mandato (sensación de documento oficial), bordes dorados o plateados según el nivel de legado actual.
*   **Filosofía:** *"No te vas. Dejas instrucciones."*

---

## 2. Flujo de Desconexión Consciente (Step-by-Step)

### Paso 1: Diagnóstico de Estado Actual (Resumen de Salida)
Antes de definir el mandato, el sistema muestra un **Snapshot de Riesgo** para contextualizar la decisión.

*   **Panel Izquierdo:** Estado actual de métricas críticas (Estabilidad, Presupuesto, Lealtad Militar).
*   **Panel Derecho:** Alertas Activas No Resueltas.
    *   Ejemplo: *"⚠️ Crisis Hídrica Fase 2 activa. Tratado pendiente de firma."*
    *   Ejemplo: *"⚠️ Facción Militarista en etapa 'Planificación' (Lealtad 35%)."*
*   **Objetivo:** El jugador sabe exactamente qué "fuegos" deja encendidos.

### Paso 2: Definición del Mandato (La Interfaz de Restricciones)

El núcleo del diseño es un sistema de **Sliders y Toggles Doctrinales**, no una lista de checkboxes técnicos. Se basa en el objeto `MandateRule` (*Contractual v2 §5.3*).

#### A. Prioridad Estratégica (Selector Principal)
Un selector grande que define el "alma" de la IA durante la ausencia.
*   **[Conservar Estabilidad]**: La IA priorizará evitar caídas de `stability` y `popularity`. Ignorará oportunidades de alto riesgo.
*   **[Expandir Influencia]**: La IA buscará firmar tratados y mejorar relaciones, incluso a costo de presupuesto.
*   **[Fortalecer Defensa]**: Prioriza `military` y contrainsurgencia interna.
*   **[Optimizar Economía]**: Prioriza `gdp` y `budget`, recortando gastos sociales/militares si es necesario.

> **Feedback Visual:** Al seleccionar una prioridad, se iluminan las restricciones automáticas asociadas (ver Paso 2B).

#### B. Límites Explícitos (Toggles de "Línea Roja")
Interruptores binarios que prohíben acciones específicas, independientemente de la prioridad.
*   🚫 **No Firmar Tratados Vinculantes**: La IA puede negociar, pero no cerrar acuerdos legales (`no_treaty`).
*   🚫 **No Iniciar Conflictos Militares**: Prohíbe operaciones ofensivas o escalada diplomática agresiva (`no_action` en dominio militar).
*   🚫 **No Gastar Reservas Críticas**: Bloquea el uso de recursos estratégicos por debajo del 20%.
*   ✅ **Permitir Contramedidas de Espionaje**: Autoriza a la IA a responder automáticamente a espionaje detectado (`expel_agent` o `plant_disinfo`).

#### C. Delegación de Crisis (Nivel de Autonomía)
Un slider de tres posiciones para eventos `critical` o `urgent`:
1.  **[Pausar Esperando Retorno]**: Si ocurre una crisis crítica, el tiempo se detiene (o se ralentiza al mínimo) hasta que el jugador vuelva. *(Costo: El mundo sigue avanzando para otros jugadores en multijugador, pero tu nación queda en "standby" visual).*
2.  **[Respuesta Conservadora Automática]**: La IA aplica siempre la opción por defecto de las Tarjetas de Política (ej. Racionamiento en vez de Desalinización).
3.  **[Plena Autonomía]**: La IA evalúa costos/beneficios y toma la decisión óptima según la Prioridad Estratégica definida. *(Riesgo: La IA puede tomar decisiones impopulares si la prioridad lo justifica).*

### Paso 3: Simulación de Impacto (Previsualización)

Al configurar el mandato, un panel lateral muestra una **proyección probabilística** basada en el estado actual.
*   *"Con este mandato, tu Estabilidad probablemente se mantenga (+/- 2%), pero tu PIB podría caer un 1.5% por falta de inversión."*
*   *"La Facción Militarista tiene un 40% de probabilidad de avanzar a etapa 'Ejecución' si no intervienes en 10 ticks."*

> **Nota Técnica:** Esta proyección es heurística, no determinista exacta, para evitar spoilers del futuro, pero sirve como guía de riesgo.

### Paso 4: Confirmación y "Firma Digital"

*   Botón grande: **"ACTIVAR MAYORDOMÍA Y DESCONECTAR"**.
*   Al hacer clic, se emite `ws.message.stewardship_mandate` con el payload `mandateRules[]`.
*   Animación de cierre: La interfaz se desvanece con un mensaje: *"Tu legado está protegido. La nación opera bajo tu mandato."*

---

## 3. Experiencia Durante la Ausencia (Lo que ve el jugador al volver)

Al reconectar, el jugador no entra directamente al mapa. Entra al **"Informe de Gestión"**.

### A. Resumen Ejecutivo (Timeline de Eventos)
Una línea de tiempo vertical mostrando solo los hitos relevantes ocurridos durante la ausencia.
*   `[Tick 45]` 🟢 **Economía:** Acuerdo comercial firmado con Brasil (Autonomía Plena).
*   `[Tick 48]` 🔴 **Crisis:** Sequía Fase 3. IA aplicó "Racionamiento" (Respuesta Conservadora). Estabilidad -5%.
*   `[Tick 52]` ⚠️ **Interna:** Facción Militarista intentó complot. IA ejecutó "Aumento de Beneficios" (Prioridad: Estabilidad). Lealtad +10%.

### B. Delta de Legado
*   *"Durante tu ausencia, tu Índice de Legado cambió en **+2 puntos**."*
*   Desglose: +5 por estabilidad mantenida, -3 por pérdida de oportunidad económica.

### C. Estado Actualizado
Solo después de revisar el informe, el jugador hace clic en **"Retomar Mando"** y vuelve a la Pantalla Principal en Estado Estable.

---

## 4. Integración Técnica y Contratos

### Payload de Envío (`ws.message.stewardship_mandate`)
```json
{
  "nationId": "ARG",
  "activatedAt": 1714000000, // Timestamp
  "tick": 45,
  "mandateRules": [
    { "domain": "diplomatic", "constraint": "no_treaty", "value": null },
    { "domain": "economic", "constraint": "prioritize", "value": "stability" },
    { "domain": "military", "constraint": "no_action", "value": "offensive" }
  ],
  "crisisAutonomy": "conservative" // 'pause', 'conservative', 'full'
}
```

### Lógica del Servidor (`StewardshipEngine.js`)
1.  **Interceptación:** En cada tick, si `playerId` está ausente y `stewardshipActive == true`:
2.  **Generación de Intención:** `IntentParser` genera intenciones normales.
3.  **Filtrado:** `StewardshipEngine.filter(intentions, mandateRules)`:
    *   Si `intent.type == 'sign_treaty'` y existe regla `no_treaty` → Descartar intención.
    *   Si `intent.domain == 'military'` y regla `no_action` → Descartar.
4.  **Ejecución:** Las intenciones restantes se envían a `PolicyRule`.
5.  **Tagging:** El `StateDelta` resultante lleva `source: 'ai_stewardship'`.
6.  **Log:** Se emite `event.stewardship_action` para construir el Informe de Gestión.

### Regla de Oro de Seguridad
*   Si la IA detecta una condición de **Colapso Inminente** (ej. Lealtad Militar < 10% y etapa Ejecución), ignora temporalmente la restricción `no_action` si la única salida es una acción drástica, pero marca la acción como *"Medida de Emergencia"* en el informe, penalizando ligeramente el Legado por "desviación del mandato". Esto evita que la nación colapse por burocracia.

---

## 5. Principios de Diseño Aplicados

| Principio | Implementación en Stewardship |
| :--- | :--- |
| **Agencia del Jugador** | El jugador no pierde el control; redefine los parámetros del control. Decide *qué* importa, no *cómo* se hace. |
| **Transparencia** | El Informe de Gestión al retorno explica exactamente qué hizo la IA y por qué (basado en el mandato). |
| **Consecuencia Diegética** | Silenciar la propia presencia tiene costo: la IA es menos creativa que el humano. Las oportunidades complejas se pierden si la autonomía es baja. |
| **Prevención de Abuso** | Los límites explícitos (`no_treaty`, `no_action`) evitan que la IA firme acuerdos tóxicos o inicie guerras no deseadas mientras el jugador duerme. |

---

## 6. Mockup Visual (Descripción para Generación de Imagen)

> **Prompt para Image Gen:**
> "UI design of a 'Stewardship Mandate' modal in a geopolitical strategy game. Dark, elegant aesthetic with gold accents. Title: 'Define Your Legacy'. Center panel has three sections: 1. 'Strategic Priority' with four large cards: Stability, Influence, Defense, Economy (Stability is selected/highlighted). 2. 'Red Lines' with toggle switches: 'No New Treaties', 'No Military Offensives', 'Protect Reserves'. 3. 'Crisis Autonomy' slider: Pause vs Conservative vs Full Autonomy. Left sidebar shows 'Current Risks': Warning icons for Water Crisis and Military Discontent. Right sidebar shows 'Projected Impact': Graphs predicting slight GDP drop but stable Loyalty. Bottom button: 'Activate Stewardship & Disconnect'. Background is a blurred oval office desk view."

Este diseño convierte la desconexión en una mecánica de juego profunda, alineada con la visión de *Realpolitik* donde la gestión del tiempo y la delegación son tan cruciales como la táctica inmediata.