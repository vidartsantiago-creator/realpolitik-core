---

# REALPOLITIK: GLOBAL DYNAMICS
## Bases Contractuales de Implementación
Versión 2.0 — Compatible con Documento Descriptivo v5.0

✓ CONTRATO VINCULANTE PARA TODO EL CICLO DE DESARROLLO

> Este documento es la única fuente de verdad para estándares de código, convenciones de denominación, contratos de payload, arquitectura de módulos y reglas de ejecución. Los bloques marcados con ★ INALTERADO provienen de la v1 sin modificaciones. Los bloques marcados con ↑ EXTENDIDO amplían una base v1 existente. Los bloques marcados con ✦ NUEVO cubren sistemas introducidos en el Descriptivo v5.

---

## 0) Versión de JavaScript a Emplear

★ INALTERADO — Sección heredada íntegramente de la v1.

| Parámetro | Especificación |
|-----------|----------------|
| Estándar ECMAScript | ES2022 (ES13) como línea base. |
| Sistema de módulos | ESM nativo (import / export). Prohibido require() o CommonJS. |
| Entorno servidor | Node.js ≥ 18.11.0 (LTS). Compatibilidad con structuredClone, fs/promises, top-level await. |
| Entorno cliente | Navegadores modernos (Chrome/Edge/Firefox/Safari últimos 2 ciclos). Sin polyfills innecesarios. |
| Strict Mode | Implícito en ESM. Recomendado declarar 'use strict' en archivos heredados o scripts inyectados. |
| Características permitidas | Optional chaining (?.), nullish coalescing (??), clases ES6, private fields (#), template literals, Map / Set. |
| Prohibido | var · Math.random() sin semilla controlada · Date.now() en lógica de simulación · mutación directa de estado fuera de StateManager. |

### 0.1 Generador de Números Pseudoaleatorios Semillado ✦ NUEVO

↑ EXTENDIDO — La prohibición de Math.random() existía en v1 pero sin especificar el generador alternativo. La v5 amplía masivamente el uso de aleatoriedad controlada (espionaje, facciones, señales). Esta sección cierra ese gap.

Todo valor pseudoaleatorio en el sistema debe generarse a través del módulo centralizado `/core/Rng.js`, inicializado con el seed definido en `config/engine.json`. Está prohibido instanciar generadores propios fuera de Rng.js.

```js
// /core/Rng.js  — único generador autorizado
import { createSeededRng } from './rngImpl.js';  // Mulberry32 o equivalente determinista

let _rng = null;

export function initRng(seed) {
  _rng = createSeededRng(seed);   // seed proviene de config/engine.json
}

/** Retorna float en [0,1). Usar en lugar de Math.random(). */
export function rng() {
  if (!_rng) throw new Error('[Rng] No inicializado. Llamar initRng(seed) primero.');
  return _rng();
}

/** Retorna entero en [min, max]. */
export function rngInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
```

| Uso válido | Uso prohibido |
|------------|----------------|
| `import { rng } from '/core/Rng.js'; const p = rng();` | `Math.random()` |
| `import { rngInt } from '/core/Rng.js'; const n = rngInt(1,100);` | `new MersenneTwister()` // instancia propia |
| `initRng(config.seed) // en main.js, una sola vez` | `initRng() sin seed` // no determinista |

---

## 1) Criterios Documentales de Cada Archivo

★ INALTERADO — Sección heredada íntegramente de la v1.

### 1.1 Encabezado Obligatorio (JSDoc)

Todo archivo .js, .md o .json relevante debe incluir el siguiente encabezado:

```js
/**
 * @file NombreArchivo.js
 * @description Propósito único y acotado del módulo. Qué hace, qué NO hace.
 * @version X.Y.Z
 * @author Realpolitik Core Team
 * @dependencies EventDispatcher, StateManager (si aplica)
 * @changelog
 * - v1.0.0: Creación inicial
 * - v1.0.1: Corrección de contrato payload player_intent
 */
```

### 1.2 Notas y Comentarios

- Solo 'por qué', nunca 'qué'. El código se explica a sí mismo; los comentarios explican decisiones de diseño o límites del sistema.
- Longitud máxima: 80 caracteres por línea.
- Prohibido código comentado en rama main o dev. Usar @deprecated o eliminar.
- Bloques TODO o FIXME deben incluir ticket/issue si el proyecto usa tracker, o fecha límite estimada.

### 1.3 Documentación de Interfaces

Toda función exportada o método público debe tener firma JSDoc completa:

```js
/**
 * Aplica un delta incremental al estado.
 * @param {StateDelta} delta - Parche relativo (valores sumables/restables)
 * @returns {{ success: boolean, version?: number, errors?: string[] }}
 */
applyDelta(delta) { ... }
```

---

## 2) Criterios de Denominación y Contratos de Payload

### 2.1 Convenciones de Denominación ★ INALTERADO

| Categoría | Convención | Ejemplo válido | Ejemplo prohibido |
|-----------|------------|----------------|-------------------|
| Variables / Propiedades | camelCase descriptivo | nationId, budgetValue, currentTick | id, bud, t, nid |
| Funciones / Métodos | camelCase (Verbo+Sustantivo) | applyDelta(), parseObjective() | do(), run(), proc() |
| Clases / Constructores | PascalCase | StateManager, IntentParser | stateManager, sm, parser |
| Constantes / Config | UPPER_SNAKE_CASE | DEFAULT_TICK_RATE, MAX_STABILITY | tickRate, maxStab |
| Eventos (EventBus) | snake_case | player_intent, state_updated | playerIntent, updateState |
| Archivos | PascalCase.js / camelCase.js | StateManager.js, policyRule.js | state_mgr.js, SM.js |

### 2.2 Contratos de Payload — Mensajes WebSocket y Eventos ↑ EXTENDIDO

↑ EXTENDIDO — Los cinco contratos de la v1 se mantienen inalterados. Se añaden ocho contratos nuevos requeridos por los sistemas de Diplomacia, Espionaje, Facciones, Crisis Global y Mayordomía introducidos en el Descriptivo v5. Regla de Oro: ningún módulo puede inventar campos ad-hoc. Toda extensión requiere actualizar esta tabla y versionar el contrato.

#### 2.2.1 Contratos Heredados de v1 ★ INALTERADO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| ws.message.set_objective | id, objective | string, string | Petición cliente → servidor para fijar objetivo. |
| event.player_intent | nationId, objectiveKey, intentions, tick | string, string, Intent[], number | IA → Ejecutor tras parsear objetivo. |
| Intent (tipo atómico) | type, domain, action, magnitude, cost, priority | string×3, number, number, number | Unidad atómica de decisión ejecutable. |
| StateDelta (tipo parcial) | nations?.[id]?.stats, diplomacy?.relations, source | Object parcial | Valores RELATIVOS (sumables). source: 'player'\|'ai_stewardship'. |
| ws.broadcast.update | type, tick, version, state, priority | string, number, number, Object, string | Estado filtrado por InformationLayer. priority: critical\|urgent\|informational\|historical. |

> Nota: StateDelta ahora incluye el campo source (nuevo en v2) y ws.broadcast.update incluye priority (nuevo en v2). Ambas adiciones son retrocompatibles: receptores v1 pueden ignorar campos nuevos.

#### 2.2.2 Contratos Nuevos — Sistema Diplomático ✦ NUEVO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| ws.message.diplomatic_request | fromNationId, toNationId, requestType, agendaItems[], tick | string, string, string, string[], number | Solicitud de canal directo o propuesta mediada. requestType: 'direct_channel'\|'mediated_proposal'\|'sanction_coordination'. |
| event.diplomatic_response | fromNationId, toNationId, response, counterAgenda[], tick | string, string, string, string[], number | Respuesta al receptor. response: 'accept'\|'reject'\|'counter'. counterAgenda[] vacío si no es counter. |
| event.diplomatic_channel_open | channelId, nationA, nationB, agenda[], expiresAt, tick | string, string, string, string[], number, number | Canal directo habilitado. expiresAt: tick de cierre (máx. 10 min tiempo real convertido a ticks). |
| event.diplomatic_channel_close | channelId, agreements[], tick | string, PolicyCard[], number | Canal cerrado. agreements[]: Tarjetas de Política generadas por los acuerdos alcanzados. |
| event.sanction_vote | initiatorNationId, targetNationId, sanctionLevel, supportingNations[], tick | string, string, number, string[], number | Voto de sanción colectiva. sanctionLevel: 1–4. |
| ws.message.treaty_response | nationId, treatyId, response, tick | string, string, string, number | Adhesión o rechazo a Tratado de Emergencia. response: 'sign'\|'reject'. |

#### 2.2.3 Contratos Nuevos — Sistema de Espionaje ✦ NUEVO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| ws.message.espionage_order | operatingNationId, targetNationId, operationType, tick | string, string, string, number | Orden de espionaje. operationType: 'gather_intel'\|'plant_disinfo'\|'identify_source'\|'take_prisoner'\|'expel_agent'. |
| event.espionage_operation_result | operationId, operatingNationId, targetNationId, success, confidenceLevel, tick | string, string, string, boolean, number, number | Resultado interno (servidor). confidenceLevel: 0.0–1.0. |
| event.espionage_signal | targetNationId, signalText, confidenceLevel, signalType, tick | string, string, number, string, number | Señal velada enviada al jugador espiado. signalType: 'noise'\|'real'. El cliente no sabe cuál es cuál. |
| event.intel_shared | fromNationId, toNationId, intelPayload, sourceConfidence, tick | string, string, Object, number, number | Compartición de inteligencia entre aliados. sourceConfidence degrada si la fuente planta desinformación. |
| event.counterespionage_action | actingNationId, operationId, actionType, tick | string, string, string, number | Acción de contraespionaje. actionType: 'identify'\|'plant_disinfo'\|'take_prisoner'\|'expel'. |

#### 2.2.4 Contratos Nuevos — Sistema de Facciones ✦ NUEVO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| event.faction_signal | nationId, factionId, plotStage, signalText, confidenceLevel, tick | string, string, string, string, number, number | Señal velada de facción. plotStage: 'recruitment'\|'planning'\|'execution'. confidenceLevel: 0.0–1.0. |
| event.faction_loyalty_change | nationId, factionId, previousLoyalty, newLoyalty, trigger, tick | string, string, number, number, string, number | Cambio de lealtad. trigger: clave de la política o evento que lo causó. |
| event.faction_bonus_activated | nationId, factionId, bonusType, magnitude, tick | string, string, string, number, number | Bonificación activa cuando lealtad ≥ 80. bonusType: 'intel_boost'\|'exec_speed'\|'resource_bonus'. |
| event.coup_attempt | nationId, factionId, plotStage, tick | string, string, string, number | plotStage: 'execution' cuando lealtad ≤ 19. Dispara Decisión Temporizada Crítica. |

#### 2.2.5 Contratos Nuevos — Sistema de Crisis Global ✦ NUEVO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| event.global_crisis_phase | crisisId, crisisType, phase, affectedRegions[], severity, tick | string, string, number, string[], number, number | Escalada de crisis. phase: 1–4. crisisType: 'climate'\|'pandemic'\|'energy'\|'natural_disaster'. |
| event.treaty_emergency_issued | treatyId, crisisId, phase, signatories[], deadline, tick | string, string, number, string[], number, number | Tratado de Emergencia disponible. deadline: tick límite para adhesión. |
| event.treaty_breach | treatyId, breachingNationId, penaltyApplied, tick | string, string, StateDelta, number | Incumplimiento de tratado. penaltyApplied: delta de penalización aplicado automáticamente. |
| event.opportunity_window | opportunityId, type, deadline, requirementType, requirementValue, tick | string, string, number, string, number, number | Ventana de oportunidad. requirementType: 'tech'\|'financial'. Expira en deadline. |

#### 2.2.6 Contratos Nuevos — Sistema de Mayordomía y Jerarquía de Alertas ✦ NUEVO

| Evento / Mensaje | Campos obligatorios | Tipo | Descripción |
|------------------|---------------------|------|-------------|
| ws.message.stewardship_mandate | nationId, mandateRules[], activatedAt, tick | string, MandateRule[], number, number | Activación del Modo Mayordomía. mandateRules[]: lista de restricciones para la IA. |
| MandateRule (tipo atómico) | domain, constraint, value | string, string, any | Regla individual. domain: 'military'\|'diplomatic'\|'economic'. constraint: 'no_action'\|'max_spend'\|'no_treaty'. |
| event.stewardship_action | nationId, actionTaken, mandateRuleApplied, tick | string, Intent, string, number | Acción ejecutada por la IA en Modo Mayordomía. Tageada en StateDelta como source: 'ai_stewardship'. |
| event.alert_dispatched | nationId, alertId, priority, payload, tick | string, string, string, Object, number | Alerta emitida al cliente. priority: 'critical'\|'urgent'\|'informational'\|'historical'. Las críticas no son silenciables. |

⚠ **REGLA DE ORO** — Si un módulo necesita un campo adicional, se actualiza esta tabla y se versiona el contrato en `/docs/contracts/changelog.md`. Prohibido añadir propiedades ad-hoc en emisor o receptor.



---

## 3) Arquitectura con Propósito por Directorio / Archivo

↑ EXTENDIDO — El árbol de la v1 se mantiene inalterado en su estructura. Se añaden los archivos requeridos por los sistemas de Facciones, Crisis, Espionaje y Modo Asíncrono introducidos en el Descriptivo v5. Los archivos marcados con ✦ son nuevos en v2.

```
/realpolitik-core
├── /config                    # Parámetros estáticos y dinámicos. Read-only en runtime.
│   ├── engine.json            # tickRate, velocidad, seed, límites globales.
│   ├── modules.json           # Lista blanca de módulos activos. Carga automática.
│   ├── world.json             # Estado inicial: naciones, stats base, topología.
│   └── factions.json          # ✦ Config de facciones por nación: peso, lealtad inicial, demandas.
│
├── /core                      # Motor INMUTABLE. PROHIBIDO EDITAR tras Fase 0.
│   ├── EventDispatcher.js     # Bus Pub/Sub determinista, prioridad, aislamiento de errores.
│   ├── StateManager.js        # Autoridad de estado, validación, deltas, snapshots.
│   ├── TimeEngine.js          # Bucle de ticks, pausa, aceleración, modo batch, determinismo.
│   └── Rng.js                 # ✦ PRNG semillado centralizado. Único generador autorizado.
│
├── /modules                   # Plugins de reglas de negocio. Exportan init().
│   ├── EconomyRule.js         # Flujos comerciales, impuestos, crecimiento PIB.
│   ├── DiplomacyRule.js       # Matriz de relaciones, decaimiento, umbrales, canales directos.
│   ├── PolicyRule.js          # Ejecutor de intenciones: validación → delta → apply.
│   ├── InformationLayer.js    # Niebla de guerra, filtrado de broadcast, desinformación pasiva.
│   ├── GlobalState.js         # Índices macro (clima, energía, mercados), triggers de crisis.
│   ├── FactionRule.js         # ✦ Lealtad dinámica, escalada de complots, señales, bonificaciones.
│   ├── CrisisRule.js          # ✦ Escalada en 4 fases, Tratados de Emergencia, penalizaciones.
│   └── EspionageRule.js       # ✦ Operaciones activas, contraespionaje, compartición de intel.
│
├── /ai                        # Inteligencia estratégica y táctica.
│   ├── IntentParser.js        # Traduce objetivos abstractos → intenciones estructuradas.
│   ├── StewardshipEngine.js   # ✦ Ejecuta Mandatos de Ausencia dentro de límites configurados.
│   ├── ActionExecutor.js      # (V2) Planificador, colas, restricciones temporales.
│   └── NationAI.js            # (V2) Autonomía de NPCs, personalidad, memoria histórica.
│
├── /network                   # Capa de comunicación y resiliencia.
│   ├── WebSocketServer.js     # Handshake, autenticación, enrutamiento de mensajes.
│   ├── DeltaSync.js           # Compresión, ACK, buffer de replay.
│   └── Resilience.js          # Heartbeat, reconexión, fallback polling.
│
├── /server                    # Orquestación y punto de entrada.
│   ├── main.js                # Inicializa núcleo, monta HTTP/WS, escucha eventos críticos.
│   └── LobbyManager.js        # (V2) Sesiones, matchmaking, persistencia de partidas.
│
├── /client                    # Interfaz y renderizado.
│   ├── index.html             # Estructura base, estilos, contenedores UI.
│   ├── app.js                 # Cliente WS, bindings UI, applyDelta local, logs.
│   ├── MapRenderer.js         # Canvas/WebGL, render geográfico, nodos, colores.
│   ├── NetworkOverlay.js      # Grafo de relaciones, flujo, tensión, alertas.
│   ├── AlertRouter.js         # ✦ Enruta alertas por prioridad. Críticas no silenciables.
│   └── UI.js                  # Dashboard, Centro de Decisiones, Feeds, Paneles.
│
├── /tests
│   ├── unit/                  # Reglas aisladas, mocks de StateManager.
│   ├── integration/           # Flujos completos: intención → delta → broadcast.
│   └── fixtures/              # Seeds, estados iniciales, escenarios de prueba.
│
└── /docs
    ├── contracts/             # Esquemas JSON obligatorios.
    │   ├── Intent.schema.json
    │   ├── StateDelta.schema.json
    │   ├── FactionSignal.schema.json     # ✦
    │   ├── DiplomaticChannel.schema.json # ✦
    │   ├── EspionageOperation.schema.json# ✦
    │   ├── MandateRule.schema.json        # ✦
    │   └── changelog.md                  # Historial de versiones de contratos.
    ├── API.md                 # Firmas públicas, eventos expuestos.
    ├── DETERMINISM.md         # ✦ Especificación del PRNG y garantías de reproducibilidad.
    ├── NATION_SCHEMA.md       # ✦ Schema completo de objeto Nation y rangos de valores.
    ├── MODULE_GUIDE.md        # Plantilla y pasos para registrar un plugin.
    └── DEV_SETUP.md           # ✦ Guía de entorno de desarrollo local.
```

### 3.1 Propósito Detallado de Archivos Nuevos ✦ NUEVO

| Archivo | Propósito |
|---------|-----------|
| config/factions.json | Configuración estática de facciones por nación. Define qué facciones tiene cada país, su peso relativo, lealtad inicial y demandas base. Read-only en runtime. Es la fuente de verdad que FactionRule.js lee al inicializar el estado de cada nación. |
| core/Rng.js | Único generador de números pseudoaleatorios autorizado del sistema. Inicializado en main.js con el seed de engine.json. Exporta rng() y rngInt(). Ningún módulo puede instanciar generadores propios. |
| core/TimeEngine.js (extensión) | Añade modo 'batch' al bucle de ticks existente para el Modo Asíncrono. El modo batch acumula intenciones durante una ventana de turno y las ejecuta en bloque al cierre. Debe diseñarse en Fase 0; Zero-Edit Core impide modificaciones posteriores. |
| modules/FactionRule.js | Plugin de reglas de facciones internas. Gestiona lealtad dinámica, escalada de complots en tres etapas (Recruitment → Planning → Execution), emisión de señales veladas con confidenceLevel, bonificaciones activas para facciones con lealtad ≥ 80% y penalizaciones progresivas para lealtad decreciente. Exporta init(eventBus, stateManager, config). |
| modules/CrisisRule.js | Plugin de crisis globales. Gestiona la escalada en cuatro fases, emite event.global_crisis_phase en cada transición, crea y monitorea Tratados de Emergencia, aplica penalizaciones automáticas por incumplimiento (event.treaty_breach) y dispara Ventanas de Oportunidad asociadas a crisis. |
| modules/EspionageRule.js | Plugin de espionaje activo. Separa la lógica activa de operaciones del filtrado pasivo de InformationLayer. Gestiona operaciones salientes (gather_intel, plant_disinfo), calcula probabilidades de éxito usando Rng.js, emite espionage_signal al objetivo, procesa acciones de contraespionaje y gestiona la compartición de inteligencia con aliados incluyendo degradación de sourceConfidence por desinformación. |
| ai/StewardshipEngine.js | Motor de Modo Mayordomía. Recibe el MandateRule[] del jugador, valida que cada acción generada por IntentParser respete los límites del mandato, taggea los deltas resultantes como source: 'ai_stewardship' para el Registro Histórico y emite event.stewardship_action por cada decisión tomada en nombre del jugador ausente. |
| client/AlertRouter.js | Enrutador de alertas en cliente. Recibe event.alert_dispatched y aplica el comportamiento correspondiente a cada nivel de prioridad: critical pausa el flujo y renderiza pantalla completa; urgent muestra notificación central no bloqueante; informational acumula en columna lateral configurable; historical escribe en registro pasivo. Los canales Informational e Historical son configurables por el jugador con consecuencias diegéticas al silenciarlos. |
| docs/DETERMINISM.md | Especificación formal de las garantías de determinismo del sistema: cómo se inicializa Rng.js, qué módulos consumen valores aleatorios, cómo se garantiza la reproducibilidad en modo multijugador y cómo se valida en tests de integración con seeds fijos. |
| docs/NATION_SCHEMA.md | Schema completo del objeto Nation con todos sus campos, tipos, rangos válidos y valores por defecto. Fuente de verdad para world.json, StateManager.js y todos los módulos que leen o escriben datos de nación. |
| docs/DEV_SETUP.md | Guía de entorno de desarrollo local: versión exacta de Node, comandos para levantar el servidor WS en modo local, cómo correr la suite de tests, variables de entorno requeridas y cómo simular un seed fijo para tests deterministas. |

⚠ **REGLA ZERO-EDIT CORE** — main.js y /core no se modifican tras la Fase 0. Todo lo nuevo va en /modules, /ai o /client. La extensión de TimeEngine.js para modo batch DEBE diseñarse en Fase 0 o el Modo Asíncrono no podrá implementarse nunca sin violar este contrato.
---

3.2 Añadir "AdvisorEngine" a la lista de módulos activos en /config/modules.json.
{
  "modules": [
    "EconomyRule",
    "DiplomacyRule",
    // ... otros módulos ...
    "AdvisorEngine"
  ]
}

## 4) Esquema Operativo — Pipeline y Reglas de Ejecución

### 4.1 Flujo Principal: Intención → Ejecución → Estado ★ INALTERADO

```js
Cliente (app.js)  →  WebSocket (main.js)  →  IntentParser
     →  EventBus  →  PolicyRule  →  StateManager
     →  EventBus  →  InformationLayer.filterState()
     →  WebSocket  →  Cliente (renderUI())

Secuencia detallada:
  C ->> W : { type:'set_objective', id:'ARG', objective:'hegemony' }
  W ->> P : parse('ARG', 'hegemony')
  P -->> W: IntentPackage { intentions:[...], justification:'...' }
  W ->> C : { type:'ai_response', text: '...' }
  W ->> EB: emit('player_intent', { nationId:'ARG', intentions:[...], tick:15 })
  EB ->> PR: listener recibe payload
  PR ->> SM: applyDelta({ nations:{ ARG:{ stats:{ budget:-20 }}}, source:'player' })
  SM -->> PR: { success:true, version:16 }
  PR ->> EB: emit('force_sync', { tick:15 })
  W ->> IL: filterState('ARG', fullState)
  W ->> C : { type:'update', tick:15, state:filteredState, priority:'informational' }
```



### 4.2 Flujo Extendido — Sistemas Nuevos v5 ✦ NUEVO

#### 4.2.1 Flujo de Facciones

```js
TimeEngine.tick()  →  EB.emit('tick_start')
  →  FactionRule.onTick():
       - recalcula loyaltyLevel por nación y facción
       - si loyaltyLevel cambió → EB.emit('faction_loyalty_change', {...})
       - si plotStage avanza → EB.emit('faction_signal', { confidenceLevel, signalText })
       - InformationLayer añade señal al feed interno del jugador
       - si loyaltyLevel ≤ 19 → EB.emit('coup_attempt', { plotStage:'execution' })
         → PolicyRule genera Decisión Temporizada Crítica
         → EB.emit('alert_dispatched', { priority:'critical' })
         → AlertRouter pausa flujo cliente y renderiza pantalla completa
```

#### 4.2.2 Flujo de Espionaje

```js
Cliente: { type:'espionage_order', operationType:'gather_intel', targetNationId:'BRA' }
  →  WebSocket valida y encola orden
  →  EspionageRule.processOrder():
       - calcula successProbability con Rng.rng()
       - si éxito → modifica intelPayload del operatingNation en StateManager
       - genera espionage_signal para targetNationId con signalType aleatorio
       - EB.emit('espionage_signal', { targetNationId, confidenceLevel, signalType })
       - InformationLayer añade señal velada al feed del jugador espiado
  →  EB.emit('espionage_operation_result', { success, confidenceLevel }) // solo servidor

Contraespionaje (si el jugador espiado responde):
  Cliente: { type:'espionage_order', operationType:'identify_source' }
  →  EspionageRule.processCounterOp():
       - si identifica fuente → registra en estado como 'identified_spy'
       - habilita acciones: plant_disinfo | take_prisoner | expel
       - take_prisoner → EB.emit('global_crisis_phase') con crisisType:'diplomatic'
```

#### 4.2.3 Flujo Diplomático

```js
Cliente A: { type:'diplomatic_request', requestType:'direct_channel',
             toNationId:'CHI', agendaItems:['energy','water'], tick:28 }
  →  WebSocket enruta a Ministro IA de A
  →  DiplomacyRule.formulateRequest() → mensaje mediado hacia B
  →  WebSocket enruta a cliente B como alert_dispatched { priority:'urgent' }
  →  Cliente B responde: diplomatic_response { response:'accept', counterAgenda:['water'] }
  →  DiplomacyRule.openChannel():
       - acuerda agenda final (agendaItems + counterAgenda si compatible)
       - EB.emit('diplomatic_channel_open', { channelId, expiresAt })
       - TimeEngine programa cierre automático en expiresAt
  →  Al cierre: DiplomacyRule.closeChannel()
       - EB.emit('diplomatic_channel_close', { channelId, agreements[] })
       - PolicyRule convierte agreements[] en Tarjetas de Política ejecutables

Si B rechaza:
  →  DiplomacyRule.recordRejection() → delta en diplomacy.relations[A][B]
  →  StateDelta.source = 'diplomatic_rejection'  // trazable en Registro Histórico
```
#### 4.2.3.1 ws.message.diplomatic_extension_request ✦ AGREGAR
Mensaje enviado por cualquier participante para solicitar más tiempo.
{
  "type": "message",
  "name": "diplomatic_extension_request",
  "payload": {
    "channelId": "string",
    "requestingNationId": "string"  // Quien pide la extensión
  }
}
```
#### 4.2.3.2. Configuración (config/engine.json o advisor.json)
Se recomienda extraer los límites a configuración:
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

#### 4.2.3.3 Flujo Diplomático ✦ NUEVO
event.diplomatic_channel_open

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
#### 4.2.3.4 event.diplomatic_extension_response ✦ NUEVO

Evento emitido por el servidor tras validar la solicitud. Solo el hostNationId puede aprobar unilateralmente o su aprobación es requerida si lo pide el invitado.

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
Corrección v2.1: Campos expiresAt (Unix timestamp) y maxDuration (segundos) reemplazados por expiresAtTick y maxDurationTicks (número de tick). Aplica a todos los contratos del sistema diplomático. La conversión a tiempo de reloj (MM:SS) es responsabilidad del cliente usando la fórmula (expiresAtTick - currentTick) * tickDurationSeconds.
```

event.diplomatic_channel_open

{
  "type": "event",
  "name": "diplomatic_channel_open",
  "payload": {
    "channelId": "ARG_CHI_20260425_001",
    "nationA": "ARG",
    "nationB": "CHI",
    "hostNationId": "CHI",
    "agenda": ["water", "energy"],
    "openedAtTick": 45,
    "expiresAtTick": 165,
    "maxDurationTicks": 600,
    "extensionsUsed": 0
  }
}
```
ws.message.diplomatic_extension_request
json{
  "type": "message",
  "name": "diplomatic_extension_request",
  "payload": {
    "channelId": "ARG_CHI_20260425_001",
    "requestingNationId": "ARG"
  }
}
```
event.diplomatic_extension_response
json{
  "type": "event",
  "name": "diplomatic_extension_response",
  "payload": {
    "channelId": "ARG_CHI_20260425_001",
    "accepted": true,
    "newExpiresAtTick": 285,
    "grantedBy": "CHI",
    "reason": null
  }
}
```


#### 4.2.3.5 event.advisor_suggestion ✦ NUEVO contrato
Evento emitido automáticamente por el servidor cuando se cumplen condiciones de activación pasiva.
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
#### 4.2.3.6 ws.message.advisor_query ✦ NUEVO contrato
Mensaje enviado por el cliente para solicitar información activa (consultas).
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
#### 4.2.3.7 event.advisor_query_response ✦ NUEVO contrato
Respuesta del servidor a una consulta activa.

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
#### 4.2.3.8 ws.message.stewardship_mandate ✦ NUEVO con activatedAtTick (reemplazando timestamp).

{
  "type": "message",
  "name": "stewardship_mandate",
  "payload": {
    "nationId": "string",
    "activatedAtTick": "number",
    "mandateRules": [
      {
        "domain": "string",
        "constraint": "string",
        "value": "string | null"
      }
    ],
    "crisisAutonomy": "string"
  }
}
```


#### 4.2.4 Flujo de Crisis Global

```js
GlobalState.onTick():
  - evalúa índices macro (clima, energía, pandemia)
  - si umbral superado → CrisisRule.escalatePhase(crisisId)
    → EB.emit('global_crisis_phase', { crisisId, phase, affectedRegions })
    → InformationLayer filtra señal según nivel de intel de cada jugador
    → si phase >= 3 → CrisisRule.issueTreaty(crisisId)
      → EB.emit('treaty_emergency_issued', { treatyId, deadline })
      → AlertRouter: priority='urgent' para jugadores en affectedRegions

Al deadline:
  CrisisRule.evaluateCompliance():
    - jugadores que no firmaron → EB.emit('treaty_breach', { penaltyApplied })
    - StateManager.applyDelta(penaltyDelta, source:'crisis_penalty')
    - EB.emit('alert_dispatched', { priority:'critical' }) para infractores
```

#### 4.2.5 Flujo de Mayordomía

```js
Cliente desconecta:
  →  ws.message.stewardship_mandate { nationId, mandateRules[], activatedAt }
  →  StewardshipEngine.activate(mandateRules)

En cada tick mientras el jugador está ausente:
  →  StewardshipEngine.generateIntent():
       - llama IntentParser con contexto de nación
       - filtra intenciones contra mandateRules[]
       - descarta las que violan cualquier MandateRule
       - envía intenciones válidas a PolicyRule
       - taggea delta resultante: source:'ai_stewardship'
       - EB.emit('stewardship_action', { actionTaken, mandateRuleApplied })

Cliente reconecta:
  →  Solicita snapshot() + deltas desde lastAck
  →  Registro Histórico diferencia acciones 'player' vs 'ai_stewardship'
```

#### 4.2.6 Flujo del Modo Asíncrono ✦ NUEVO

```js
TimeEngine en modo 'batch' (activado por config/engine.json: mode:'async'):

  [Ventana de turno — 24h o 48h según config]
    →  Jugadores envían intenciones en cualquier momento de la ventana
    →  StateManager.enqueueDeferredIntent(nationId, intentPackage)
    →  TimeEngine.status = 'awaiting_turn_close'   // mundo pausado

  [Cierre de turno — todos confirmaron o venció el plazo]
    →  TimeEngine.executeBatch():
         - procesa intenciones encoladas en orden de arrival
         - ejecuta N ticks configurados por turno
         - FactionRule, CrisisRule, EspionageRule corren normalmente
         - StateManager genera delta consolidado del turno
    →  InformationLayer.filterState() por jugador
    →  WebSocket broadcast resultado a cada jugador
    →  TimeEngine.status = 'turn_open'   // nuevo turno comienza

Nota: StewardshipEngine no aplica en modo asíncrono.
Las facciones sí generan señales intra-turno aunque el jugador no haya actuado.
```

### 4.3 Reglas de Mutación de Estado ★ INALTERADO

- **Deltas Relativos:** StateManager.applyDelta() espera valores incrementales. Ej: budget: -20 (resta 20), NO budget: 80.
- **Validación Inmediata:** Si un delta viola invariantes (stability < 0, gdp < 0), se rechaza y se loguea error. El tick continúa.
- **Atomicidad:** Cada intención genera un delta independiente. Múltiples intenciones se aplican en secuencia dentro del mismo tick.
- **Inmutabilidad Externa:** getState() devuelve structuredClone(). Ningún módulo puede mutar la referencia retornada.

### 4.4 Campo source en StateDelta ↑ EXTENDIDO

| Valor de source | Origen | Impacto en Registro Histórico |
|----------------|--------|-------------------------------|
| 'player' | Decisión directa del jugador conectado. | Cuenta para el Índice de Legado con peso completo. |
| 'ai_stewardship' | Acción ejecutada por StewardshipEngine en ausencia del jugador. | Cuenta con peso reducido (0.5×). Trazable en historial. |
| 'crisis_penalty' | Penalización automática por incumplimiento de Tratado de Emergencia. | Delta negativo forzado. Visible en historial con etiqueta de causa. |
| 'faction_effect' | Efecto automático de bonificación o sabotaje de facción. | Trazable a factionId. No suma ni resta al Índice directamente. |
| 'system' | Eventos sistémicos del motor (decaimiento, inercia, eventos globales). | Informativo. No afecta Índice de Legado del jugador. |

### 4.5 Sincronización y Red ★ INALTERADO

- **Autoridad:** Solo el servidor modifica estado. El cliente envía intenciones, nunca estado.
- **Filtrado:** Todo broadcast pasa por InformationLayer.filterState(viewerId, fullState) antes de serializar.
- **Heartbeat** cada 5s. Timeout >15s → state: reconnecting.
- **Buffer** de últimos 120 ticks. Reconexión solicita snapshot() + deltas pendientes.
- **Reaplicación determinista** en cliente garantiza consistencia visual.

### 4.6 Jerarquía de Interrupciones del Cliente ✦ NUEVO

| Nivel (priority) | Comportamiento UI | Silenciable | Consecuencia diegética si silenciado |
|------------------|-------------------|-------------|--------------------------------------|
| critical | Pausa flujo automático. Pantalla completa bloqueante con countdown. | No | N/A — no puede silenciarse. |
| urgent | Notificación central no bloqueante. Sonido de alerta. Persiste hasta acción. | Solo sonido | N/A — visual siempre visible. |
| informational | Columna lateral. Acumulable. Puede filtrarse por fuente (Interna/Externa/Pública). | Sí | Delay +2-3 ticks en detección de señales. Menor confidenceLevel percibido. |
| historical | Tab secundario de registro. No interrumpe. Exportable. | Sí | Sin consecuencia diegética. Es información reflexiva. |

### 4.7 Manejo de Errores ★ INALTERADO

- **Eventos:** Cada handler envuelto en try/catch. Fallo aislado no detiene el motor.
- **Críticos:** Fallos en StateManager o TimeEngine detienen tick y emiten alerta FATAL.
- **Red:** Pérdida de paquetes → ACK timeout → reenvío delta. Desconexión → estado local pausado, no descartado.
- **Logs:** Prefijo [Módulo] en todo console.log/warn/error. Prohibido logs silenciosos o catch(e){} vacíos.

### 4.8 Determinismo y Testing ↑ EXTENDIDO

- **Seed Único:** config/engine.json define seed. Todo random() usa Rng.js inicializado con ese seed.
- **Reproducibilidad:** Mismo seed + misma secuencia de intenciones = mismo estado final en cualquier nodo.
- **PRNG documentado:** /docs/DETERMINISM.md especifica el generador, su inicialización y las garantías de reproducibilidad.
- **CI/CD:** Pipeline bloquea merge si cobertura <80% o tests de integración fallan.
- **Regla de Entrada:** Ningún módulo se registra en modules.json sin suite de tests unitarios y documentación en /docs.
- **Tests de Facciones:** FactionRule.js debe incluir fixtures de escenarios de complot completo (Recruitment → Execution) con seed fijo.
- **Tests de Espionaje:** EspionageRule.js debe incluir fixtures de operación exitosa y fallida con mismo seed para verificar determinismo.
- **Tests de Modo Asíncrono:** TimeEngine en modo batch debe producir el mismo resultado que el modo continuo con el mismo seed y secuencia de intenciones.

---

## 5) Schemas Críticos de Datos ✦ NUEVO

### 5.1 Objeto Nation (world.json)

```js
{
  "nationId":     string,        // ISO-3166 alpha-3. Ej: "ARG", "BRA"
  "name":         string,
  "stats": {
    "gdp":        number,         // valor absoluto en unidades del juego
    "budget":     number,         // valor absoluto
    "stability":  number,         // 0.0 – 100.0
    "popularity": number,         // 0.0 – 100.0
    "military":   number,         // 0.0 – 100.0
    "resources":  number,         // 0.0 – 100.0
    "legacyIndex":number          // 0.0 – 100.0. Calculado, no editable en config.
  },
  "diplomacy": {
    "relations":  { [nationId]: number },   // -100 (hostil) a +100 (aliado)
    "activeChannels": string[],             // channelIds abiertos
    "treatySigned": string[]                // treatyIds firmados
  },
  "intel": {
    "espionageLevel":    number,   // 0.0 – 1.0. Determina calidad de operaciones.
    "counterIntelLevel": number,   // 0.0 – 1.0. Determina calidad de detección.
    "activeOperations":  string[]  // operationIds en curso
  },
  "playerId":     string | null,   // null si NPC
  "isCollapsed":  boolean
}
```

### 5.2 Objeto Faction (factions.json)

```js
{
  "factionId":      string,         // Ej: "ARG_MILITARY", "ARG_TECHNOCRATS"
  "nationId":       string,
  "type":           string,         // "military"|"technocrats"|"populists"|"oligarchy"|"regionalists"
  "weight":         number,         // 0.0 – 1.0. Influencia relativa en la nación.
  "loyaltyLevel":   number,         // 0.0 – 100.0. Dinámico.
  "plotStage":      string | null,  // null | "recruitment" | "planning" | "execution"
  "demandType":     string,         // "military_budget"|"infrastructure"|"subsidies"|"low_tax"|"decentralization"
  "activeBonuses":  string[],       // bonusType activos si loyaltyLevel >= 80
  "threatLevel":    string          // "none"|"discontent"|"active"|"insurgent"
}
```

### 5.3 Objeto MandateRule (StewardshipEngine)

```js
{
  "domain":     string,   // "military"|"diplomatic"|"economic"|"intelligence"
  "constraint": string,   // "no_action"|"max_spend"|"no_treaty"|"no_channel"|"prioritize"
  "value":      any       // Para max_spend: número. Para prioritize: string de objetivo.
}

// Ejemplos de mandato válido:
{ domain:"diplomatic",  constraint:"no_treaty",    value:null }
{ domain:"economic",    constraint:"max_spend",    value:5000 }
{ domain:"military",    constraint:"no_action",    value:null }
{ domain:"economic",    constraint:"prioritize",   value:"hydric_reserves" }
```

### 5.4 Rangos de Valores Críticos

| Campo | Rango | Valor de alerta | Colapso |
|-------|-------|----------------|---------|
| stats.stability | 0.0 – 100.0 | < 20 | = 0 → Golpe de Estado |
| stats.budget | –∞ a +∞ | < 0 | < –MAX_DEBT_THRESHOLD → Quiebra |
| stats.gdp | 0.0 – ∞ | Caída >30% en 10 ticks | = 0 → Colapso económico |
| faction.loyaltyLevel | 0.0 – 100.0 | < 40 | < 20 → Insurgente / = 0 → Golpe |
| diplomacy.relations[X] | –100 – +100 | < –50 (Hostil) | No colapsa directamente |
| intel.espionageLevel | 0.0 – 1.0 | < 0.3 | No colapsa directamente |
| crisisPhase | 1 – 4 | ≥ 3 | = 4 sin preparación → Colapso climático |

---

## 6) Alcance de Implementación por Fase ✦ NUEVO

### 6.1 Fase 0 — Núcleo e Infraestructura

Duración estimada: 1 semana. Zero-Edit Core: tras el cierre de esta fase, /core y main.js son inmutables.

| Módulo / Archivo | Entregable mínimo | Tests requeridos |
|------------------|-------------------|------------------|
| core/EventDispatcher.js | Bus Pub/Sub con prioridad y aislamiento de errores. | Unit: emit, on, off, prioridad, error aislado. |
| core/StateManager.js | applyDelta(), getState(), snapshot(), validate(). | Unit: delta relativo, rechazo de invariante, inmutabilidad. |
| core/TimeEngine.js | Modo continuous y modo batch. tickRate configurable. Pausa y velocidad. | Integration: mismo seed produce mismo resultado en ambos modos. |
| core/Rng.js | rng() y rngInt() con seed de engine.json. Determinista. | Unit: misma seed → misma secuencia. Diferentes seeds → secuencias distintas. |
| config/engine.json | seed, tickRate, asyncTurnWindow, maxDebt definidos. | Validación de schema al arranque. |
| config/world.json | Estado inicial de todas las naciones con schema completo de Sección 5.1. | Validación contra NATION_SCHEMA.md. |
| config/factions.json | Facciones iniciales de todas las naciones con schema de Sección 5.2. | Validación contra FactionSignal.schema.json. |
| server/main.js | Inicialización de todos los módulos /core, carga de config, arranque WS. | Integration: arranque limpio con config de fixtures. |

### 6.2 Fase 1 — MVP Core

Duración estimada: 2–3 semanas. Los módulos de /core no se tocan.

| Módulo | Entregable mínimo | Tests requeridos |
|--------|-------------------|------------------|
| modules/PolicyRule.js | Validación de intenciones, cálculo de delta relativo, apply. | Unit: fondos insuficientes, invariante violado, atomicidad. |
| modules/EconomyRule.js | Flujos comerciales, impuestos, crecimiento PIB por tick. | Unit: crecimiento con relaciones aliadas, recesión con sanciones. |
| modules/DiplomacyRule.js | Canal mediado, solicitud de canal directo, cierre con acuerdos, registro de rechazos. | Integration: flujo completo diplomatic_request → channel_open → close. |
| modules/FactionRule.js | Lealtad dinámica, escalada en 3 etapas, señales veladas, bonificaciones. | Integration: complot completo Recruitment→Execution con seed fijo. |
| modules/CrisisRule.js | Escalada en 4 fases, Tratados de Emergencia, penalizaciones. | Integration: crisis phase 1→4, treaty, breach penalty. |
| modules/EspionageRule.js | Operaciones básicas, señales veladas, 4 acciones de contraespionaje. | Integration: operación exitosa y fallida con mismo seed. |
| modules/InformationLayer.js | filterState() pasivo, niebla de guerra, señales veladas de espionaje. | Unit: nación aliada ve más que nación hostil. |
| modules/GlobalState.js | Índices macro, triggers de crisis, Ventanas de Oportunidad. | Unit: umbral climático dispara event.global_crisis_phase. |
| ai/IntentParser.js | Traduce objetivo → IntentPackage con justification y confidence. | Unit: objetivo válido, objetivo inviable por fondos. |
| ai/StewardshipEngine.js | Activación de mandato, filtrado de intenciones, tag ai_stewardship. | Unit: acción prohibida por mandato es descartada. |
| network/WebSocketServer.js | Handshake, autenticación, enrutamiento de todos los contratos de Sección 2. | Integration: todos los ws.message.* producen el evento correcto. |
| client/AlertRouter.js | Enrutamiento por priority. Critical bloquea, Urgent notifica, resto configurable. | Unit: critical no puede silenciarse, informational sí. |

### 6.3 Fase 2 — Post-lanzamiento (Diseño Aprobado, Implementación Diferida)

| Sistema | Descripción |
|---------|-------------|
| LobbyManager.js | Sesiones, matchmaking, persistencia de partidas entre sesiones. |
| ai/ActionExecutor.js | Planificador avanzado con colas y restricciones temporales. |
| ai/NationAI.js | Autonomía de NPCs con personalidad y memoria histórica. |
| IntentParser V2 (LLM) | Objetivos en lenguaje natural vía LLM. Interfaz IntentParser sin cambios. |
| Modo Asíncrono (client) | UI específica para modo de turno: confirmación de turno, indicador de cierre. |
| Sanciones colectivas | Flujo completo de sanction_vote con coordinación mediada en 4 niveles. |
| API de modding | Permite módulos de reglas externos sin tocar /core. |

---

## Registro de Cambios v1 → v2

| Sección | Estado | Descripción del cambio |
|---------|--------|------------------------|
| 0 — JavaScript | ★ Inalterado + ✦ Ext. | Se añade Sección 0.1: especificación de Rng.js como PRNG centralizado. |
| 1 — Criterios documentales | ★ Inalterado | Sin cambios. |
| 2.1 — Denominación | ★ Inalterado | Sin cambios. |
| 2.2 — Contratos payload | ↑ Extendido | Se añaden 8 contratos nuevos (diplomacia, espionaje, facciones, crisis, mayordomía). StateDelta añade campo source. ws.broadcast.update añade campo priority. |
| 3 — Directorios | ↑ Extendido | Se añaden: factions.json, Rng.js, FactionRule.js, CrisisRule.js, EspionageRule.js, StewardshipEngine.js, AlertRouter.js y 5 schemas en /docs/contracts/. |
| 4.1 — Flujo principal | ★ Inalterado | Sin cambios. |
| 4.2 — Flujos nuevos | ✦ Nuevo | Se añaden flujos de Facciones, Espionaje, Diplomacia, Crisis, Mayordomía y Modo Asíncrono. |
| 4.3 — Mutación estado | ★ Inalterado | Sin cambios. |
| 4.4 — Campo source | ↑ Extendido | StateDelta ahora requiere source. Cinco valores definidos. |
| 4.5 — Sincronización | ★ Inalterado | Sin cambios. |
| 4.6 — Interrupciones | ✦ Nuevo | Jerarquía de 4 niveles con comportamiento de UI y consecuencias diegéticas. |
| 4.7 — Errores | ★ Inalterado | Sin cambios. |
| 4.8 — Determinismo | ↑ Extendido | Se añade DETERMINISM.md obligatorio y tests específicos para módulos nuevos. |
| 5 — Schemas | ✦ Nuevo | Sección nueva: schemas de Nation, Faction, MandateRule y rangos de valores críticos. |
| 6 — Alcance por fase | ✦ Nuevo | Sección nueva: entregables mínimos y tests requeridos por fase de implementación. |

---

**Leyenda:**  
★ INALTERADO — heredado de v1 sin modificaciones.  
↑ EXTENDIDO — base v1 ampliada para cubrir sistemas nuevos.  
✦ NUEVO — sección o contrato introducido en v2 para cubrir sistemas del Descriptivo v5.

✓ **CONTRATO VINCULANTE — Versión 2.0 | Compatible con Descriptivo v5.0**  
Cualquier desviación requiere actualización de este documento y registro en `/docs/contracts/changelog.md`

---

