```markdown
# Guía de Implementación Práctica – Realpolitik: Global Dynamics

> **Propósito:** Acelerar el desarrollo, reducir ambigüedades y estandarizar la creación de módulos, tests y configuraciones.  
> **Documentos complementarios:** Descriptivo v5 (reglas de negocio), Contractual v2 (contratos vinculantes), TECH_SPEC_V2 (arquitectura).  
> **Uso:** Mantener esta guía abierta durante la codificación. Seguir las plantillas y verificaciones.

---

## 1. Esquemas JSON Formales (Para validación automática)

Todos los contratos de payload deben validarse contra esquemas JSON. Ubicación: `/docs/contracts/*.schema.json`.  
Ejemplo de validación en tiempo de ejecución:

```javascript
import Ajv from 'ajv';
import intentSchema from '../docs/contracts/Intent.schema.json' assert { type: 'json' };
const ajv = new Ajv();
const validateIntent = ajv.compile(intentSchema);
if (!validateIntent(payload)) throw new Error(`Intent inválido: ${validateIntent.errors}`);
```

### 1.1 Intent.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Intent",
  "type": "object",
  "required": ["type", "domain", "action", "magnitude", "cost", "priority"],
  "properties": {
    "type": { "type": "string", "enum": ["set_policy", "diplomatic_move", "espionage_order", "crisis_response"] },
    "domain": { "type": "string", "enum": ["military", "economic", "diplomatic", "intelligence", "internal"] },
    "action": { "type": "string" },
    "magnitude": { "type": "number", "minimum": 0 },
    "cost": { "type": "number" },
    "priority": { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "additionalProperties": false
}
```

### 1.2 StateDelta.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["source"],
  "properties": {
    "nations": {
      "type": "object",
      "patternProperties": {
        "^[A-Z]{3}$": {
          "type": "object",
          "properties": {
            "stats": {
              "type": "object",
              "properties": {
                "gdp": { "type": "number" },
                "budget": { "type": "number" },
                "stability": { "type": "number" },
                "popularity": { "type": "number" },
                "military": { "type": "number" },
                "resources": { "type": "number" }
              },
              "additionalProperties": false
            }
          }
        }
      }
    },
    "diplomacy": {
      "type": "object",
      "properties": {
        "relations": { "type": "object" }
      }
    },
    "source": {
      "type": "string",
      "enum": ["player", "ai_stewardship", "crisis_penalty", "faction_effect", "system"]
    }
  },
  "additionalProperties": false
}
```

### 1.3 FactionSignal.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["nationId", "factionId", "plotStage", "signalText", "confidenceLevel", "tick"],
  "properties": {
    "nationId": { "type": "string", "pattern": "^[A-Z]{3}$" },
    "factionId": { "type": "string" },
    "plotStage": { "type": "string", "enum": ["recruitment", "planning", "execution"] },
    "signalText": { "type": "string", "maxLength": 200 },
    "confidenceLevel": { "type": "number", "minimum": 0, "maximum": 1 },
    "tick": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": false
}
```

*(Esquemas restantes: DiplomaticChannel.schema.json, EspionageOperation.schema.json, MandateRule.schema.json – seguir el mismo patrón).*

---

## 2. Plantillas de Código

### 2.1 Plantilla para un nuevo módulo (`/modules/NuevaRegla.js`)

```javascript
/**
 * @file NuevaRegla.js
 * @description [Propósito del módulo en una línea]
 * @version 1.0.0
 * @dependencies EventDispatcher, StateManager, Rng
 */
import { rng, rngInt } from '/core/Rng.js';

let eventBus, stateManager, config, rngModule;

export function init(eb, sm, cfg, rngInstance) {
  eventBus = eb;
  stateManager = sm;
  config = cfg;
  rngModule = rngInstance; // si se necesita aleatoriedad

  // Suscripciones obligatorias según necesidad
  eventBus.on('tick_start', onTick);
  eventBus.on('state_updated', onStateUpdate);
  // eventBus.on('player_intent', onPlayerIntent);
}

function onTick({ tick }) {
  // Lógica que debe ejecutarse cada tick
  try {
    // Ejemplo: recalcular algo, emitir eventos si es necesario
    // const delta = computeDelta(tick);
    // if (delta) stateManager.applyDelta(delta);
  } catch (err) {
    console.error(`[NuevaRegla] Error en tick ${tick}:`, err);
  }
}

function onStateUpdate({ delta, version }) {
  // Reaccionar a cambios de estado (opcional)
}

// Funciones auxiliares privadas
function computeDelta(tick) {
  // Generar un delta parcial con source: 'system'
  return { source: 'system', nations: { ARG: { stats: { stability: -0.5 } } } };
}
```

### 2.2 Plantilla para test unitario (`/tests/unit/NuevaRegla.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init } from '../../modules/NuevaRegla.js';
import { createMockEventBus, createMockStateManager, createMockRng } from '../helpers/mocks.js';

describe('NuevaRegla', () => {
  let eventBus, stateManager, rng;

  beforeEach(() => {
    eventBus = createMockEventBus();
    stateManager = createMockStateManager();
    rng = createMockRng(42); // seed fijo
    init(eventBus, stateManager, {}, rng);
  });

  it('debería emitir un evento personalizado cuando se cumple condición X', () => {
    // Arrange
    const emitSpy = vi.spyOn(eventBus, 'emit');
    // Act: simular tick_start con tick=10
    eventBus.emit('tick_start', { tick: 10 });
    // Assert
    expect(emitSpy).toHaveBeenCalledWith('mi_evento', expect.objectContaining({ tick: 10 }));
  });

  it('debería aplicar un delta correctamente', () => {
    const applySpy = vi.spyOn(stateManager, 'applyDelta');
    eventBus.emit('tick_start', { tick: 5 });
    expect(applySpy).toHaveBeenCalledWith(expect.objectContaining({ source: 'system' }));
  });
});
```

### 2.3 Plantilla para test de integración (flujo completo)

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { setupServer, sendClientMessage, waitForTicks } from '../helpers/integration.js';

describe('Flujo de facción - Complot completo', () => {
  let server, client;

  beforeAll(async () => {
    server = await setupServer({ seed: 12345, configOverride: { factions: 'test_fixture.json' } });
    client = await server.connectClient('ARG');
  });

  it('debería pasar por Reclutamiento → Planificación → Ejecución y disparar coup_attempt', async () => {
    // Enviar intenciones que reduzcan lealtad de facción militarista
    await client.sendMessage({ type: 'set_objective', objective: 'pacifist_turn' });
    await waitForTicks(30); // avanzar simulación
    const signals = client.getReceivedEvents('faction_signal');
    expect(signals).toContainEqual(expect.objectContaining({ plotStage: 'recruitment' }));
    expect(signals).toContainEqual(expect.objectContaining({ plotStage: 'planning' }));
    expect(signals).toContainEqual(expect.objectContaining({ plotStage: 'execution' }));
    const coup = client.getReceivedEvents('coup_attempt');
    expect(coup).toHaveLength(1);
  });
});
```

---

## 3. Matriz de Trazabilidad (Mecánica → Implementación)

| Mecánica (Descriptivo v5) | Evento(s) / Contrato | Módulo(s) | Test obligatorio | Estado |
|---------------------------|----------------------|-----------|------------------|--------|
| **Facciones**: lealtad dinámica, complots (3 etapas) | `faction_loyalty_change`, `faction_signal`, `coup_attempt` | `FactionRule.js` | Unit + Integration (seed fijo, fixture de complot) | 🟡 En desarrollo |
| **Espionaje**: operaciones (gather_intel, plant_disinfo, expel, take_prisoner) | `espionage_order`, `espionage_operation_result`, `espionage_signal` | `EspionageRule.js` | Unit (probabilidad con seed) + Integration (éxito/fracaso) | 🟡 |
| **Crisis global**: escalada 4 fases, tratados de emergencia | `global_crisis_phase`, `treaty_emergency_issued`, `treaty_breach` | `CrisisRule.js`, `GlobalState.js` | Integration (phase 1→4, breach penalty) | 🟡 |
| **Diplomacia**: canal directo con agenda, duración 10 min | `diplomatic_request`, `diplomatic_channel_open/close`, `diplomatic_response` | `DiplomacyRule.js` | Integration (request → accept → open → close → agreements) | 🟡 |
| **Mayordomía**: mandato de límites, acciones con source `ai_stewardship` | `stewardship_mandate`, `stewardship_action` | `StewardshipEngine.js` | Unit (filtrado de intenciones) + Integration (simular desconexión) | 🟡 |
| **Jerarquía de alertas**: critical, urgent, informational, historical | `alert_dispatched` (priority) | `AlertRouter.js`, `InformationLayer.js` | Unit (silenciabilidad, bloqueo de critical) | 🟡 |
| **Determinismo PRNG**: sin `Math.random()`, usar `Rng.js` | N/A (código) | Todos los módulos | Revisión estática + tests con seed fijo | ✅ Pendiente checklist |
| **Modo Asíncrono**: `mode:'batch'`, acumular intenciones | `TimeEngine.enqueueDeferredIntent`, `executeBatch` | `TimeEngine.js` | Integration (mismo resultado que modo continuo) | 🔴 No iniciado |

**Leyenda:** 🟢 Completado / 🟡 En progreso / 🔴 No iniciado – actualizar en cada sprint.

---

## 4. Scripts de Entorno y Configuración

### 4.1 `package.json` (scripts mínimos)

```json
{
  "name": "realpolitik-core",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env server/main.js",
    "start": "node server/main.js",
    "test:unit": "vitest run --config vitest.unit.config.js --seed 42",
    "test:integration": "vitest run --config vitest.integration.config.js --seed 42",
    "test:all": "npm run test:unit && npm run test:integration",
    "validate:schemas": "node scripts/validateSchemas.js",
    "lint": "eslint core modules ai network server client",
    "format": "prettier --write '**/*.js'"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "ajv": "^8.12.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "engines": { "node": ">=18.11.0" }
}
```

### 4.2 `scripts/validateSchemas.js` (ejemplo)

```javascript
import { readFileSync, readdirSync } from 'fs';
import Ajv from 'ajv';
const ajv = new Ajv();

// Cargar todos los schemas de /docs/contracts
const schemas = readdirSync('./docs/contracts').filter(f => f.endsWith('.schema.json'));
const validators = {};
for (const schemaFile of schemas) {
  const schema = JSON.parse(readFileSync(`./docs/contracts/${schemaFile}`, 'utf-8'));
  validators[schemaFile] = ajv.compile(schema);
}
// Ejemplo: validar un mensaje de prueba
// const testMessage = { ... };
// if (!validators['Intent.schema.json'](testMessage)) { console.error(validators['Intent.schema.json'].errors); }
console.log('✅ Esquemas cargados correctamente');
```

### 4.3 Archivo `.env` (variables de entorno)

```env
NODE_ENV=development
PORT=8080
SEED=123456789
TICK_RATE_MS=1000
ASYNC_MODE=false
LOG_LEVEL=info
```

### 4.4 `Makefile` (tareas comunes)

```makefile
.PHONY: dev test test-integration validate lint format

dev:
	npm run dev

test:
	npm run test:unit

test-integration:
	npm run test:integration

validate:
	node scripts/validateSchemas.js

lint:
	npm run lint

format:
	npm run format
```

---

## 5. Guía de Resolución de Problemas Comunes

### 5.1 “El estado no es determinista – dos ejecuciones con el mismo seed producen resultados diferentes”

**Causas probables:**
- Un módulo llama a `Math.random()` o a `Date.now()`.
- Se instancia un PRNG fuera de `/core/Rng.js`.
- El orden de iteración sobre objetos (`Object.keys()` sin orden fijo) varía.

**Solución:**
- Ejecutar en cada módulo: `grep -r "Math.random" modules/ ai/ network/`.
- Reemplazar por `import { rng } from '/core/Rng.js'`.
- Para iteraciones, usar `Object.keys(obj).sort()` si el orden afecta la lógica.
- Añadir test de determinismo en CI: ejecutar simulación dos veces y comparar estado final.

### 5.2 “La reconexión del cliente pierde deltas – el mundo se ve inconsistente”

**Causas probables:**
- El buffer de deltas del servidor está configurado en segundos en lugar de ticks.
- El `lastAck` del cliente no se envía correctamente.
- `structuredClone` falla con objetos circulares.

**Solución:**
- Verificar `engine.json`: `"deltaBufferTicks": 120` (no segundos).
- En `DeltaSync.js`, asegurar que cada delta tenga `seqNum` y que el cliente envíe `{ ack: seqNum }`.
- Usar `structuredClone` o `JSON.parse(JSON.stringify())` para el snapshot.

### 5.3 “Las señales de espionaje no aparecen en el Feed del cliente”

**Causas probables:**
- `EspionageRule.js` no emite el evento `espionage_signal`.
- `InformationLayer.filter()` no incluye señales cuando el nivel de espionaje es bajo.
- El cliente filtra por prioridad y la señal es `informational` pero el canal está silenciado.

**Solución:**
- Verificar logs del servidor: `[EspionageRule] Emitted signal for BRA`.
- Revisar `InformationLayer.addSignal()` y que `filter()` lo añada al `visibleState.feed`.
- En el cliente, comprobar que `AlertRouter` no descarta señales `informational` (solo silenciables por configuración del jugador).

### 5.4 “El modo asíncrono no ejecuta el batch – los jugadores no ven el resultado del turno”

**Causas probables:**
- `engine.json` no tiene `"mode": "batch"`.
- `TimeEngine.js` no implementa `executeBatch()` o no se llama al cierre del turno.
- Los eventos `turn_open` / `turn_close` no se emiten.

**Solución:**
- Asegurar que en `main.js` se inicialice `TimeEngine` con `mode: config.engine.mode`.
- En cada tick, verificar `if (mode === 'batch' && turnClosed) { await executeBatch(); }`.
- Emitir `event.turn_completed` después de `applyDelta` del batch.

### 5.5 “Los tests de facciones fallan intermitentemente – a veces el complot llega a ejecución, a veces no”

**Causas probables:**
- Se usa `Math.random()` en lugar de `rng()` dentro de `FactionRule`.
- El seed no es fijo en el test (cada ejecución genera una secuencia diferente).
- La fixture de estado inicial no garantiza la caída de lealtad necesaria.

**Solución:**
- En el test, llamar a `initRng(42)` antes de cada `it`.
- Usar `createMockRng(seed)` que devuelva siempre la misma secuencia determinista.
- Diseñar la fixture para que la lealtad de la facción Militarista comience en 45% y baje con cada acción específica.

---

## Checklist final antes del primer commit

- [ ] Todos los módulos existentes tienen plantilla con `init()`.
- [ ] Cada nuevo módulo tiene su test unitario y, si aplica, test de integración.
- [ ] Se ejecutó `npm run validate:schemas` y todos los contratos son válidos.
- [ ] No hay ninguna llamada a `Math.random()` ni `Date.now()` en lógica de simulación.
- [ ] `engine.json` incluye `seed`, `deltaBufferTicks`, `mode`.
- [ ] El cliente implementa `AlertRouter` con los 4 niveles de prioridad.
- [ ] La matriz de trazabilidad está actualizada en este mismo documento.

---

**Versión:** 1.0  
**Última revisión:** [fecha actual]  
**Mantenimiento:** Actualizar este documento cada vez que se añada un nuevo contrato o módulo.
```
