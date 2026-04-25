---
# 📘 Realpolitik: Global Dynamics
## Documentación Técnica Fundacional v2.0
*Versión alineada con Bases Contractuales v2.0 y Descriptivo v5.0*

> **Nota:** Este documento ofrece una visión arquitectónica general. Para la especificación técnica vinculante (contratos de payload, esquemas de datos, reglas de implementación detalladas), consulte el documento **`Bases Contractuales de Implementación v2`**.

---

### 1. Principios Arquitectónicos

| Principio | Implementación |
|-----------|----------------|
| **Event-Driven + Plugin Registry** | Desacoplamiento total. El núcleo solo emite/consume eventos. Los módulos se registran dinámicamente. |
| **Server-Authoritative** | El servidor ejecuta la simulación, valida acciones y difunde deltas. El cliente nunca modifica estado. |
| **Estado Determinista** | Mismo seed + misma secuencia de intenciones = mismo resultado. **PRNG centralizado (`Rng.js`)** prohíbe `Math.random()`. |
| **Abstracción de IA** | `IntentParser` define interfaz única. V1: heurísticas/reglas. V2: LLM/prompts. El resto del sistema no cambia. |
| **Información Asimétrica** | `InformationLayer` filtra, sesga y oculta datos según espionaje, alianzas y fuentes. Niebla de guerra nativa. |
| **Resiliencia de Red** | WebSocket con heartbeat, buffer de deltas (120 **ticks**), reconexión automática y solicitud de snapshot. |
| **Test-First & Zero-Edit Core** | Cada módulo incluye tests aislados. Nuevas expansiones se añaden sin tocar `/core` ni `main.js`. |
| **Jerarquía de Interrupciones** | Alertas: `critical` (pausa flujo), `urgent` (notificación central), `informational` (columna lateral configurable), `historical` (registro pasivo). |

---

### 2. Estructura de Directorios (MVP – actualizada)

```text
/realpolitik-core
├── /config
│   ├── engine.json          # tickRate, seed, límites, modo (continuous/batch)
│   ├── modules.json         # lista de módulos activos
│   ├── world.json           # topología, stats iniciales, recursos (Nation schema)
│   └── factions.json        # ✦ Configuración de facciones por nación
├── /core                     # Núcleo INMUTABLE tras Fase 0
│   ├── EventDispatcher.js   # Bus central, pub/sub, prioridad de eventos
│   ├── StateManager.js      # Estado global, applyDelta(), snapshot(), validate()
│   ├── TimeEngine.js        # Bucle de ticks (continuous / batch), pausa, speed
│   └── Rng.js               # ✦ PRNG semillado centralizado. Prohibido Math.random()
├── /modules
│   ├── EconomyRule.js
│   ├── DiplomacyRule.js     # Incluye canales directos, sanciones colectivas (Fase 2)
│   ├── PolicyRule.js        # Ejecución de intenciones, validación, delta
│   ├── InformationLayer.js  # Niebla de guerra, filtrado, señales veladas
│   ├── GlobalState.js       # Índices macro, triggers de crisis
│   ├── FactionRule.js       # ✦ Lealtad dinámica, complots, señales de facción
│   ├── CrisisRule.js        # ✦ Escalada en 4 fases, Tratados de Emergencia
│   └── EspionageRule.js     # ✦ Operaciones activas, contraespionaje, compartición intel
├── /ai
│   ├── IntentParser.js      # Interfaz: objetivo → intenciones + justificación
│   ├── StewardshipEngine.js # ✦ Modo Mayordomía (mandato de límites)
│   ├── ActionExecutor.js    # Planificación, colas de acción (Fase 2)
│   └── NationAI.js          # Lógica interna de países no jugadores (Fase 2)
├── /network
│   ├── WebSocketServer.js   # Autoridad, validación, broadcast
│   ├── DeltaSync.js         # Compresión, secuencias, ACK, replay (buffer 120 ticks)
│   └── Resilience.js        # Heartbeat, reconexión, fallback polling
├── /server
│   ├── main.js              # Inicialización, carga de config, arranque
│   └── LobbyManager.js      # Sesiones, emparejamiento, persistencia (Fase 2)
├── /client
│   ├── MapRenderer.js       # Canvas/WebGL, geolocalización, nodos
│   ├── NetworkOverlay.js    # Grafo de relaciones, flujo comercial, tensión
│   ├── UI.js                # Dashboard, objetivos, políticas, logs
│   ├── AlertRouter.js       # ✦ Enrutamiento de alertas por prioridad
│   └── SyncClient.js        # WS client, delta apply, reconnection UI
├── /tests
│   ├── unit/                # Reglas aisladas, mocks de estado
│   ├── integration/         # Flujos de eventos, transiciones deterministas
│   └── fixtures/            # Seeds, estados iniciales, escenarios
└── /docs
    ├── API.md               # Firmas de interfaces
    ├── MODULE_GUIDE.md      # Cómo crear/registrar un plugin
    ├── SYNC_PROTOCOL.md     # Especificación de red y niebla de guerra
    ├── DETERMINISM.md       # ✦ Garantías del PRNG y reproducibilidad
    └── NATION_SCHEMA.md     # ✦ Schema completo del objeto Nation
```

> Los archivos marcados con ✦ son incorporaciones requeridas por el Descriptivo v5. El módulo `ConflictRule.js` (presente en v1) se ha movido a planeamiento de Fase 2 (operaciones militares detalladas).

---

### 3. Interfaces Clave (Firmas JS/TS-style) – actualizadas

```javascript
// EventDispatcher (sin cambios)
interface EventBus {
  emit(event: string, payload: any): void
  on(event: string, handler: (payload: any) => void, priority?: number): void
  off(event: string, handler?: Function): void
}

// StateManager – añadido source en delta
interface StateManager {
  getState(): Readonly<GlobalState>
  applyDelta(delta: StateDelta): { success: boolean, version?: number, errors?: string[] }
  snapshot(): SerializedState
  validate(delta: StateDelta): { valid: boolean, errors: string[] }
}

// StateDelta incluye source (player, ai_stewardship, crisis_penalty, faction_effect, system)
interface StateDelta {
  nations?: { [id: string]: { stats?: Partial<Stats> } }
  diplomacy?: { relations?: { [target: string]: number } }
  source: string
  // otros campos opcionales
}

// IntentParser (sin cambios)
interface IntentParser {
  parse(objective: Objective, context: NationContext): IntentPackage
}
interface IntentPackage {
  intentions: Intent[]
  priority: number // 0..1
  justification: string
  confidence: number // 0..1 (V2: probabilidad LLM)
}

// ActionExecutor (sin cambios, Fase 2)
interface ActionExecutor {
  enqueue(nationId: string, intentions: Intent[]): void
  executeTick(tick: number): ActionResult[]
}

// InformationLayer – extendido para manejar señales veladas
interface InformationLayer {
  filter(sourceNation: string, targetNation: string, rawState: any): VisibleState
  setEspionageLevel(level: number): void
  addDisinformation(payload: any): void
  addSignal(signal: Signal): void   // para señales de facción/espionaje
}

// Rng.js – nuevo PRNG centralizado
interface Rng {
  initRng(seed: number): void
  rng(): number        // float en [0,1)
  rngInt(min: number, max: number): number
}

// StewardshipEngine – nuevo para Modo Mayordomía
interface StewardshipEngine {
  activate(mandateRules: MandateRule[]): void
  deactivate(): void
  generateIntent(context: NationContext): IntentPackage | null
}
```

---

### 4. Flujo de Datos y Eventos (extendido)

```mermaid
sequenceDiagram
    participant Jugador
    participante Cliente
    participante WS as Servidor WS
    participante GameLoop as TimeEngine
    participante SM as StateManager
    participante EB as EventBus
    participante Módulos (Economía, Facciones, Espionaje, Crisis)
    participante IL as InformationLayer

    Jugador->>Cliente: Define objetivo / política / orden de espionaje / respuesta diplomática
    Cliente->>WS: Envía mensaje (set_objective, espionage_order, diplomatic_request, etc.)
    WS->>GameLoop: Valida y encola intención
    GameLoop->>SM: applyDelta(intención) → delta parcial
    SM->>EB: emit('player_intent', payload)
    EB->>Módulos: Ejecutan reglas (Economía, Diplomacia, Facciones, Espionaje, Crisis)
    Módulos->>SM: Generan deltas adicionales (con source correspondiente)
    SM->>EB: emit('state_updated', deltaTotal)
    EB->>IL: Filtra estado según viewerId (niebla de guerra, señales veladas)
    IL->>WS: Estado filtrado + alertas (con priority)
    WS->>Cliente: Broadcast delta comprimido + alerts
    Cliente->>Jugador: Render UI (AlertRouter aplica jerarquía)
```

---

### 5. Protocolo de Sincronización & Resiliencia (actualizado)

| Mecanismo | Implementación (v2) |
|-----------|----------------------|
| **Heartbeat** | `ping`/`pong` cada 5s. Si >15s sin respuesta → `state: reconnecting` |
| **Deltas** | JSON patch (RFC 6902) comprimido con LZ4. Secuencia monótona `seqNum`. |
| **ACK & Replay** | Cliente confirma `seqNum`. Servidor mantiene buffer de **120 ticks** (no segundos). Si ACK perdido → reenvío. |
| **Reconexión** | 1. Solicita `snapshot()` actual. 2. Pide deltas desde `lastAck`. 3. Reaplica localmente (determinista). 4. Reanuda render. |
| **Niebla de Guerra** | Servidor ejecuta `InformationLayer.filter()` antes de serializar delta. Cliente nunca recibe estado crudo de naciones no aliadas/espionadas. |
| **Determinismo** | Todo valor aleatorio proviene de `/core/Rng.js` inicializado con `seed` de `engine.json`. Prohibido `Math.random()` o PRNG propio. |

---

### 6. Estrategia de Testing & Validación (extendida)

| Tipo | Alcance | Herramienta | Criterio |
|------|---------|-------------|----------|
| **Unit** | Reglas aisladas (`EconomyRule`, `FactionRule`, `EspionageRule`, etc.) | `jest` / `vitest` | Mock de `StateManager` y `Rng` (seed fijo). 100% cobertura de ramas críticas. |
| **Integration** | Flujo completo: intención → tick → delta → render, incluyendo facciones, crisis, espionaje | `supertest` + mocks WS | Determinismo verificado: mismo seed produce mismo estado final. Fixtures para cada sistema. |
| **Network** | Pérdida de paquetes, reconexión, alta latencia | `toxiproxy` + scripts WS | <500ms de desincronización post-reconexión. |
| **CI/CD** | Pull requests automáticos | GitHub Actions | Bloqueo si cobertura `<80%` o tests deterministas fallan. |

> 🔑 **Regla de Oro:** Ningún módulo entra a `main` sin suite de tests y documentación en `/docs`. Para módulos que usan aleatoriedad (`FactionRule`, `EspionageRule`, `CrisisRule`), se requieren fixtures con semilla fija que cubran casos extremos (complot completo, operaciones exitosas/fallidas, escalada de crisis).

---

### 7. Plan de Implementación por Fases (alineado con Contractual v2)

| Fase | Entregable | Duración Est. | Hitos Clave |
|------|------------|---------------|-------------|
| **0** | Núcleo & Infraestructura | 1 semana | `EventDispatcher`, `StateManager`, `TimeEngine` (modos continuous y batch), `Rng.js`, carga de config (`engine.json`, `world.json`, `factions.json`), tests unitarios base. **Zero-Edit Core activo.** |
| **1** | MVP Completo (sistemas del Descriptivo v5) | 3-4 semanas | **Sistemas obligatorios:** Economía, Diplomacia (canal mediado + directo), Facciones (lealtad, complots), Espionaje (4 acciones), Crisis Global (4 fases + tratados), Mayordomía (mandato), PolicyRule, InformationLayer, AlertRouter, IntentParser heurístico, WebSocket básico, cliente con mapa y feeds. Todos los contratos de payload de la Sección 2.2 del Contractual implementados. Tests de integración con seed fijo. |
| **2** | Post-lanzamiento (diseño aprobado) | Continuo | Modo Asíncrono (cliente), sanciones colectivas, compartición de inteligencia con reputación, LobbyManager, ActionExecutor avanzado, NationAI, LLM IntentParser (V2), API de modding. |

> *Nota:* El módulo `ConflictRule` (operaciones militares detalladas) queda diferido a la Fase 2 o a una expansión posterior.

---

### 8. Estándares de Extensibilidad (Cómo añadir módulos sin tocar el core)

1. Crear archivo en `/modules/NuevaRegla.js`
2. Exportar función `init(eventBus, stateManager, config, rng)`
3. Suscribirse a eventos relevantes: `eventBus.on('tick_start', handler)`
4. Registrar en `/config/modules.json`: `"NuevaRegla"`
5. El `PluginRegistry` lo carga automáticamente en `main.js` sin modificaciones.

✅ **Resultado:** `core/` y `main.js` permanecen inmutables tras la Fase 0.

---

### 9. Referencias a Documentos Complementarios

| Documento | Propósito |
|-----------|-----------|
| **Bases Contractuales de Implementación v2** | Especificación vinculante: contratos de payload, esquemas de datos, reglas de ejecución detalladas. |
| **Documento Descriptivo v5** | Fuente de verdad para diseño de juego, dinámicas y experiencia de usuario. |
| **API.md** | Firmas públicas de todos los módulos. |
| **SYNC_PROTOCOL.md** | Especificación en profundidad del protocolo de red, formato de deltas y gestión de reconexión. |
| **DETERMINISM.md** | Garantías del PRNG, reproducibilidad y validación en tests. |
| **NATION_SCHEMA.md** | Schema completo del objeto `Nation` con rangos de valores y reglas de negocio asociadas. |

---

### Registro de Cambios (v1 → v2)

| Cambio | Justificación |
|--------|----------------|
| Buffer de red cambiado de 120 segundos a **120 ticks** | Garantiza determinismo y coherencia con el motor de ticks. |
| Añadida sección de **PRNG centralizado (`Rng.js`)** | Requisito del Descriptivo v5 para aleatoriedad determinista. |
| Incorporados **sistemas nuevos**: Facciones, Espionaje, Crisis Global, Mayordomía, Alertas por prioridad. | Alineación con el alcance del MVP según Contractual v2. |
| Actualizado **plan de fases** (Fase 0 → 1 → 2) | Coincide con el plan vinculante del Contractual. |
| Añadido campo **`source`** en `StateDelta` | Trazabilidad de acciones (player, ai_stewardship, crisis, facción, sistema). |
| Añadido **`AlertRouter`** en cliente y jerarquía de interrupciones. | Requisito de UX del Descriptivo v5. |
| Eliminado `ConflictRule.js` del directorio base (movido a Fase 2). | Refleja decisión de diseño: operaciones militares detalladas no son parte del MVP. |
| Actualizado diagrama de flujo para incluir facciones, espionaje y crisis. | Claridad sobre los nuevos flujos. |

---

**Documento aprobado para guía arquitectónica – versión 2.0**  
*En caso de discrepancia entre este documento y las Bases Contractuales v2, prevalecen las Bases Contractuales.*
```

---


# ADENDA A: Diplomacia Temporal y Gestión de Canales (v2.1)

> **Documento Vinculante:** Esta adenda extiende y modifica parcialmente las secciones 2.2.2, 4.2.3 y 5 de `TECH_SPEC_V2.md` y `Bases Contractuales v2`.
> **Objetivo:** Definir la mecánica de negociación diplomática basada en **ticks**, con ventanas de tiempo cortas renovables y gestión de roles (Anfitrión/Invitado).
> **Fecha de Aprobación:** 2026-04-25
> **Estado:** ACTIVA PARA IMPLEMENTACIÓN

---

## 1. Cambios en Contratos de Payload (`Bases Contractuales v2` §2.2.2)

Se actualiza el contrato `event.diplomatic_channel_open` y se añaden nuevos contratos para la gestión de extensiones de tiempo.

### 1.1 Modificación: `event.diplomatic_channel_open`
El campo `expiresAt` ahora es estrictamente un **tick absoluto**. Se añade `hostNationId` para determinar quién tiene privilegios de extensión.

```json
{
  "type": "event",
  "name": "diplomatic_channel_open",
  "payload": {
    "channelId": "string",          // ID único del canal
    "nationA": "string",            // ISO-3166 alpha-3 (Solicitante inicial)
    "nationB": "string",            // ISO-3166 alpha-3 (Receptor/Aceptante)
    "hostNationId": "string",       // ISO-3166 alpha-3 (Quien aceptó la solicitud inicial)
    "agenda": ["string"],           // Temas acordados
    "openedAtTick": "number",       // Tick de apertura
    "expiresAtTick": "number",      // Tick absoluto de cierre forzoso
    "maxDurationTicks": "number",   // Límite duro desde openedAtTick (ej. 600 ticks = 10 min)
    "extensionsUsed": "number"      // Contador de extensiones aplicadas
  }
}
```

### 1.2 Nuevo Contrato: `ws.message.diplomatic_extension_request`
Mensaje enviado por cualquier participante para solicitar más tiempo.

```json
{
  "type": "message",
  "name": "diplomatic_extension_request",
  "payload": {
    "channelId": "string",
    "requestingNationId": "string"  // Quien pide la extensión
  }
}
```

### 1.3 Nuevo Contrato: `event.diplomatic_extension_response`
Evento emitido por el servidor tras validar la solicitud. Solo el `hostNationId` puede aprobar unilateralmente o su aprobación es requerida si lo pide el invitado.

```json
{
  "type": "event",
  "name": "diplomatic_extension_response",
  "payload": {
    "channelId": "string",
    "accepted": "boolean",          // true si se concedió, false si se rechazó/expiró
    "newExpiresAtTick": "number",   // Nuevo tick de cierre si accepted=true
    "grantedBy": "string | null",   // nationId que aprobó (null si expiró)
    "reason": "string | null"       // "limit_reached", "host_declined", etc.
  }
}
```

---

## 2. Lógica de Negocio: Tiempo y Roles (`TECH_SPEC_V2` §4.2.3)

### 2.1 Definición de Roles
*   **Solicitante (Initiator):** Nación que envía `ws.message.diplomatic_request`.
*   **Receptor (Receiver):** Nación que recibe la alerta y responde.
*   **Anfitrión (Host):** La nación que **acepta** la apertura del canal.
    *   Si el Receptor acepta, el Receptor se convierte en `hostNationId`.
    *   Si el Solicitante retira la solicitud antes de respuesta, no hay canal.
    *   El `hostNationId` tiene privilegio administrativo sobre la duración del canal.

### 2.2 Mecánica de Tiempo (Ticks vs. Realidad)
1.  **Unidad Base:** Todo el tiempo diplomático se mide en **ticks**.
2.  **Conversión Cliente:** El cliente (`UI.js`) recibe `expiresAtTick` y `currentTick` (del heartbeat o broadcast).
    *   Fórmula visual: `timeRemainingSeconds = Math.max(0, (expiresAtTick - currentTick) * TICK_RATE_MS / 1000)`.
    *   Formato UI: `MM:SS`.
3.  **Duración Inicial:** Al abrirse el canal, `expiresAtTick = openedAtTick + INITIAL_DURATION_TICKS` (ej. 120 ticks para 2 minutos si `TICK_RATE=1s`).
4.  **Extensión Mutua:**
    *   Cualquier parte puede enviar `diplomatic_extension_request`.
    *   Si el solicitante es el `hostNationId`, la extensión se aprueba automáticamente si `currentDuration < maxDuration`.
    *   Si el solicitante es el invitado, el servidor emite una alerta `urgent` al `hostNationId` para aceptar/rechazar.
    *   Si se aprueba: `expiresAtTick += EXTENSION_TICKS` (ej. +120 ticks).
    *   Límite Duro: `expiresAtTick` nunca puede superar `openedAtTick + maxDurationTicks`.

### 2.3 Cierre Automático
Cuando `TimeEngine.tick() >= expiresAtTick`:
1.  El servidor fuerza el cierre del canal.
2.  Si hubo acuerdos parciales firmados, se procesan como `agreements[]`.
3.  Si no hubo acuerdo final, se emite `event.diplomatic_channel_close` con `status: 'timeout'` y sin acuerdos vinculantes (o con penalización leve por "tiempo agotado", según configuración de `DiplomacyRule`).

---

## 3. Implementación Técnica Sugerida

### 3.1 Módulo `DiplomacyRule.js`
Añadir métodos para gestionar el ciclo de vida temporal:

```javascript
// En DiplomacyRule.js

function openChannel(solicitantId, receiverId, agenda) {
  const hostId = receiverId; // Asumiendo aceptación inmediata para el ejemplo
  const now = TimeEngine.getCurrentTick();
  const initialDuration = CONFIG.DIPLOMACY.INITIAL_DURATION_TICKS; // ej. 120
  
  const channel = {
    id: generateChannelId(),
    nationA: solicitantId,
    nationB: receiverId,
    hostNationId: hostId,
    agenda: agenda,
    openedAtTick: now,
    expiresAtTick: now + initialDuration,
    maxDurationTicks: CONFIG.DIPLOMACY.MAX_DURATION_TICKS, // ej. 600
    extensionsUsed: 0,
    agreements: []
  };
  
  activeChannels[channel.id] = channel;
  EventBus.emit('diplomatic_channel_open', channel);
}

function requestExtension(channelId, requestingNationId) {
  const channel = activeChannels[channelId];
  if (!channel) return;

  // Verificar límite duro
  const currentDuration = TimeEngine.getCurrentTick() - channel.openedAtTick;
  if (currentDuration + CONFIG.DIPLOMACY.EXTENSION_TICKS > channel.maxDurationTicks) {
    EventBus.emit('diplomatic_extension_response', {
      channelId, accepted: false, reason: 'limit_reached'
    });
    return;
  }

  // Si es el Host, aprueba directo
  if (channel.hostNationId === requestingNationId) {
    applyExtension(channel);
  } else {
    // Si es invitado, notificar al Host (lógica de UI/Alerta pendiente de implementación en AlertRouter)
    EventBus.emit('diplomatic_extension_proposal', {
      channelId, from: requestingNationId, to: channel.hostNationId
    });
  }
}

function approveExtension(channelId, approvingNationId) {
  const channel = activeChannels[channelId];
  if (!channel || channel.hostNationId !== approvingNationId) return;
  
  applyExtension(channel);
}

function applyExtension(channel) {
  channel.expiresAtTick += CONFIG.DIPLOMACY.EXTENSION_TICKS;
  channel.extensionsUsed++;
  EventBus.emit('diplomatic_extension_response', {
    channelId: channel.id,
    accepted: true,
    newExpiresAtTick: channel.expiresAtTick,
    grantedBy: channel.hostNationId
  });
}
```

### 3.2 Cliente `UI.js` / `DiplomaticOverlay.js`
*   **Renderizado:** No usar `setInterval` local para el countdown. Usar el `currentTick` global recibido vía WebSocket.
*   **Botón Extender:** Habilitado solo si `isHost == true` O si se está esperando respuesta del host.
*   **Feedback Visual:** Mostrar *"Tiempo restante: 01:45"* y *"Extensión disponible: Sí/No"*.

---

## 4. Impacto en Otros Módulos

| Módulo | Cambio Requerido |
| :--- | :--- |
| `TimeEngine.js` | Ninguno. Solo provee `getCurrentTick()`. |
| `AlertRouter.js` | Debe manejar `diplomatic_extension_proposal` como alerta `urgent` no bloqueante para el Host. |
| `StateManager.js` | Ninguno. Los canales son estado efímero de sesión, no persisten en `Nation` schema. |
| `InformationLayer.js` | Ninguno. La existencia del canal es visible para los participantes independientemente del espionaje. |

---

## 5. Configuración (`config/engine.json` o `diplomacy.json`)

Se recomienda extraer estos valores a configuración para facilitar ajustes de balance:

```json
{
  "diplomacy": {
    "initialDurationTicks": 120,
    "extensionTicks": 120,
    "maxDurationTicks": 600,
    "tickRateMs": 1000
  }
}
```

*(Nota: Si `tickRateMs` cambia, la duración real en segundos cambiará proporcionalmente, pero la lógica de ticks se mantiene consistente).*

---

**Fin de la Adenda A.**

# ADENDA B: Motor de Asesoramiento Estratégico (AdvisorEngine) v2.1

> **Documento Vinculante:** Esta adenda extiende y modifica parcialmente las secciones 3, 4 y 5 de `TECH_SPEC_V2.md` y `Bases Contractuales v2`.
> **Objetivo:** Definir la arquitectura, lógica de activación, limitaciones de recursos y contratos del módulo `AdvisorEngine.js`, que actúa como el "Ministro IA" del jugador.
> **Fecha de Aprobación:** 2026-04-25
> **Estado:** ACTIVA PARA IMPLEMENTACIÓN

---

## 1. Arquitectura y Ubicación del Módulo

### 1.1 Nuevo Módulo: `/ai/AdvisorEngine.js`
Se introduce un nuevo módulo en el directorio `/ai/` dedicado exclusivamente a la generación proactiva de sugerencias estratégicas y la respuesta a consultas del jugador.

*   **Responsabilidad:** Analizar el estado global, identificar riesgos/oportunidades críticos y emitir eventos estructurados al cliente.
*   **Dependencias:** `StateManager` (lectura de estado crudo), `TimeEngine` (ticks), `Rng` (para variación de tono si aplica).
*   **Principio Clave:** El motor consume **estado crudo** (`StateManager.getState()`) para tomar decisiones precisas, pero emite sugerencias filtradas por relevancia estratégica para no saturar al jugador. No aplica la "Niebla de Guerra" interna; asume que el jugador *debería* saber lo que el sistema detecta como crítico, independientemente de su nivel de espionaje actual (aunque el texto puede ser ambiguo si la inteligencia es baja).

### 1.2 Registro en `modules.json`
Añadir `"AdvisorEngine"` a la lista de módulos activos en `/config/modules.json`.

```json
{
  "modules": [
    "EconomyRule",
    "DiplomacyRule",
    // ... otros módulos ...
    "AdvisorEngine"
  ]
}
```

---

## 2. Contratos de Payload Actualizados

### 2.1 Nuevo Contrato: `event.advisor_suggestion`
Evento emitido automáticamente por el servidor cuando se cumplen condiciones de activación pasiva.

```json
{
  "type": "event",
  "name": "advisor_suggestion",
  "payload": {
    "tick": "number",
    "priority": "string",          // 'critical', 'urgent', 'informational'
    "category": "string",          // 'internal_security', 'economic', 'diplomatic', 'military'
    "headline": "string",          // Título corto para UI
    "message": "string",           // Cuerpo del mensaje (lenguaje natural generado por template)
    "recommendation": {
      "actionType": "string",      // 'policy_card_focus', 'quick_action', 'diplomatic_response'
      "targetId": "string | null", // ID de la tarjeta, acción o canal diplomático relacionado
      "reasoning": "string"        // Justificación heurística breve
    },
    "visualData": {                // Datos opcionales para gráficos miniatura
      "trend": "string",           // 'up', 'down', 'stable'
      "metric": "string",          // Nombre de la métrica afectada (ej. 'loyalty_military')
      "projectionIfIgnored": {     // Proyección simple de riesgo
        "tick": "number",
        "value": "number",
        "outcome": "string"
      }
    },
    "expiresAtTick": "number | null" // Tick en el que esta sugerencia pierde vigencia (opcional)
  }
}
```

### 2.2 Nuevo Contrato: `ws.message.advisor_query`
Mensaje enviado por el cliente para solicitar información activa (consultas).

```json
{
  "type": "message",
  "name": "advisor_query",
  "payload": {
    "queryType": "string",         // 'risk_assessment', 'justify_action', 'simulate'
    "contextId": "string | null",  // ID de acción, facción o evento específico (si aplica)
    "simulationIntent": "object | null" // Solo si queryType === 'simulate'
  }
}
```

### 2.3 Nuevo Contrato: `event.advisor_query_response`
Respuesta del servidor a una consulta activa.

```json
{
  "type": "event",
  "name": "advisor_query_response",
  "payload": {
    "queryType": "string",
    "data": "any",                 // Estructura variable según queryType
    "remainingSimulations": "number" // Solo si queryType === 'simulate'. Muestra usos restantes hoy.
  }
}
```

---

## 3. Lógica de Negocio: Activación y Limitaciones

### 3.1 Activación Pasiva (Triggers Automáticos)
El `AdvisorEngine` escucha eventos clave y evalúa umbrales heurísticos. No emite sugerencias en cada tick, sino solo cuando el **Valor de Información** supera el ruido.

| Evento Escuchado | Condición de Activación | Acción del AdvisorEngine |
| :--- | :--- | :--- |
| `state_updated` | `stability < 30` OR `budget < 0` OR `loyalty_military < 40` | Emitir `advisor_suggestion` con prioridad `urgent`. |
| `faction_signal` | `plotStage == 'planning'` AND `confidence > 70%` | Emitir `advisor_suggestion` con prioridad `critical`/`urgent`. |
| `global_crisis_phase` | `phase` aumenta a 2 o 3 | Emitir `advisor_suggestion` estratégica sobre tratados. |
| `diplomatic_channel_close` | `agreements.length > 0` | Emitir `advisor_suggestion` informativa confirmando impacto. |
| `opportunity_window` | Nueva oportunidad disponible | Emitir `advisor_suggestion` informativa con deadline. |

> **Regla de Silencio:** Si no hay amenazas críticas ni oportunidades inmediatas, el motor no emite nada. El silencio indica estabilidad.

### 3.2 Activación Activa (Consultas del Jugador) y Límite de Simulación

Para evitar el abuso del sistema como un "oráculo infinito", se implementa un límite estricto en las consultas de tipo `simulate`.

#### Mecanismo de Conteo Diario
1.  **Schema de Nación (`NATION_SCHEMA.md` §5.1):** Se añade el campo `dailySimulationsUsed: number` al objeto `Nation`.
2.  **Reset Diario (`TimeEngine.js`):** En cada inicio de día lógico (cuando `tick % TICKS_PER_DAY === 0`), `TimeEngine` resetea `dailySimulationsUsed = 0` para todas las naciones activas.
3.  **Validación en `AdvisorEngine.js`:**

```javascript
// En /ai/AdvisorEngine.js

const MAX_DAILY_SIMULATIONS = 3;

function handleQuery(nationId, queryPayload) {
  const nation = stateManager.getNation(nationId);
  
  if (queryPayload.queryType === 'simulate') {
    // Verificar límite
    if (nation.dailySimulationsUsed >= MAX_DAILY_SIMULATIONS) {
      return {
        error: 'Límite de simulaciones diarias alcanzado.',
        remaining: 0
      };
    }

    // Ejecutar simulación ligera (sin aplicar delta al estado global)
    const projection = runLightSimulation(queryPayload.simulationIntent, nation.context);
    
    // Incrementar contador
    nation.dailySimulationsUsed++;
    stateManager.updateNationStat(nationId, 'dailySimulationsUsed', nation.dailySimulationsUsed);
    
    return {
      data: projection,
      remaining: MAX_DAILY_SIMULATIONS - nation.dailySimulationsUsed
    };
  }

  // Para otros tipos de query (risk_assessment, justify_action), no hay límite duro
  // pero se recomienda throttling si es necesario en el futuro.
  return { data: generateQueryResponse(queryPayload, nation.context) };
}
```

4.  **Feedback UI:** El cliente debe mostrar *"Simulaciones restantes hoy: X/3"* en el panel del Ministro IA. Si X=0, el input de simulación se deshabilita visualmente.

---

## 4. Implementación Técnica Sugerida

### 4.1 Estructura de `AdvisorEngine.js`

```javascript
/**
 * @file AdvisorEngine.js
 * @description Motor de asesoramiento estratégico proactivo y reactivo.
 * @version 1.0.0
 * @dependencies StateManager, TimeEngine, Rng
 */

import { rng } from '/core/Rng.js';

let eventBus, stateManager, config;

export function init(eb, sm, cfg) {
  eventBus = eb;
  stateManager = sm;
  config = cfg;

  // Suscripción a eventos clave para activación pasiva
  eventBus.on('state_updated', onStateUpdate);
  eventBus.on('faction_signal', onFactionSignal);
  eventBus.on('global_crisis_phase', onCrisisPhaseChange);
  
  // Suscripción a consultas activas del cliente
  eventBus.on('ws.message.advisor_query', onPlayerQuery);
}

function onStateUpdate({ delta }) {
  // Evaluar métricas críticas en delta o estado actual
  const nations = stateManager.getState().nations;
  for (const [id, nation] of Object.entries(nations)) {
    if (isPlayerNation(id)) { // Solo asesorar a jugadores humanos
      checkCriticalMetrics(id, nation);
    }
  }
}

function checkCriticalMetrics(nationId, nation) {
  if (nation.stats.stability < 30) {
    emitSuggestion(nationId, 'urgent', 'internal_security', 
      'Estabilidad Crítica', 
      'La estabilidad nacional ha caído por debajo del 30%. Riesgo inminente de revueltas.',
      { actionType: 'policy_card_focus', targetId: 'card_social_subsidies' }
    );
  }
  // ... otras reglas heurísticas ...
}

function onPlayerQuery({ nationId, payload }) {
  const response = handleQuery(nationId, payload);
  
  if (response.error) {
    // Emitir error al cliente
    eventBus.emit('ws.broadcast.error', { nationId, message: response.error });
  } else {
    // Emitir respuesta estructurada
    eventBus.emit('event.advisor_query_response', {
      nationId,
      queryType: payload.queryType,
      data: response.data,
      remainingSimulations: response.remaining
    });
  }
}

function emitSuggestion(nationId, priority, category, headline, message, recommendation) {
  eventBus.emit('event.advisor_suggestion', {
    tick: timeEngine.getCurrentTick(),
    priority,
    category,
    headline,
    message,
    recommendation,
    // visualData opcional...
  });
}

function isPlayerNation(nationId) {
  const nation = stateManager.getNation(nationId);
  return nation.playerId !== null;
}
```

### 4.2 Integración con `InformationLayer`
Aunque `AdvisorEngine` lee estado crudo, puede consultar a `InformationLayer` para ajustar el **tono** del mensaje.
*   Si `espionageLevel` es bajo, usar lenguaje más ambiguo: *"Se rumorean movimientos..."* en vez de *"Complot confirmado"*.
*   Esto se hace mediante una llamada auxiliar a `InformationLayer.getConfidenceModifier(nationId)` dentro de `generateMessageTemplate()`.

---

## 5. Impacto en Otros Módulos

| Módulo | Cambio Requerido |
| :--- | :--- |
| `StateManager.js` | Añadir campo `dailySimulationsUsed` al schema de `Nation`. Implementar método `updateNationStat()` seguro para contadores. |
| `TimeEngine.js` | Implementar hook de reset diario: `onDayStart()` que llama a `StateManager.resetDailyCounters()`. |
| `client/UI.js` | Crear componente `MinisterPanel.js` que escuche `event.advisor_suggestion` y `event.advisor_query_response`. Mostrar contador de simulaciones. |
| `Bases Contractuales v2` | Actualizar `NATION_SCHEMA.md` (§5.1) para incluir `dailySimulationsUsed`. |

---

## 6. Configuración (`config/engine.json` o `advisor.json`)

Se recomienda extraer los límites a configuración:

```json
{
  "advisor": {
    "maxDailySimulations": 3,
    "thresholds": {
      "stabilityCritical": 30,
      "loyaltyMilitaryWarning": 40,
      "budgetEmergency": 0
    }
  }
}
```

---

**Fin de la Adenda B.**
