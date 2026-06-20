/**
 * @file StateManager.js
 * @description Autoridad única del estado global del juego. Gestiona aplicación de deltas,
 *              validación de invariantes, snapshots y versionado determinista.
 * @version 1.0.1
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher (opcional para eventos)
 * @changelog
 * - v1.0.0: Creación inicial.
 * - v1.0.1: Corrección crítica: Agregada aplicación de 'units' en applyDelta y limpieza de validate.
 */

import { on, emit, off } from './EventDispatcher.js';

/**
 * Estado global inicial vacío
 * @type {Object}
 */
let _state = {
  tick: 0,
  version: 0,
  nations: {},
  diplomacy: {
    relations: {},
    channels: {}
  },
  factions: {},
  crisis: {
    active: false,
    phase: 0,
    type: null,
    treaties: {}
  },
  espionage: {
    operations: {},
    signals: []
  }
};

/**
 * Contador de versión monótona para sincronización
 * @type {number}
 */
let _version = 0;

/**
 * Historial de deltas para replay (buffer de 120 ticks)
 * @type {Array<{version: number, delta: Object, tick: number}>}
 */
const _deltaHistory = [];
const MAX_HISTORY_TICKS = 120;
// ---> INTEGRACIÓN DEL PARCHE: Declarar la cola de deltas del búfer de red
let _actionQueue = [];

/**
 * Obtiene el estado global actual (solo lectura).
 * @returns {Readonly<Object>} Estado global inmutable
 */
export function getState() {
  return Object.freeze(structuredClone(_state));
}

// ---> INTEGRACIÓN DEL PARCHE: Método seguro para recibir inputs concurrentes
/**
 * Encola un delta recibido por la red para ser procesado al inicio del siguiente tick.
 * @param {Object} delta - Parche parcial
 * @param {string} source - Identificador del jugador o socket
 */
export function queueDelta(delta, source = 'player') {
  if (typeof delta !== 'object' || delta === null || Array.isArray(delta)) {
    return { success: false, error: 'Delta inválido' };
  }
  _actionQueue.push({ delta: structuredClone(delta), source });
  return { success: true };
}

// ---> INTEGRACIÓN DEL PARCHE: Procesador atómico secuencial
/**
 * Procesa y aplica secuencialmente todos los deltas encolados durante el tick.
 * Diseñado para ser invocado de forma determinista por el TimeEngine.
 * @param {number} targetTick - El número de tick que se está procesando
 */
export function processPendingDeltas(targetTick) {
  const processedVersions = [];

  // Vaciamos la cola procesando los comandos acumulados
  while (_actionQueue.length > 0) {
    const { delta, source } = _actionQueue.shift();

    // Forzamos a que el delta se estampe con el número de tick exacto del motor
    delta.tick = targetTick;

    const result = applyDelta(delta, source);
    if (result.success) {
      processedVersions.push(result.version);
    }
  }

  return processedVersions;
}

/**
 * Aplica un delta incremental al estado global.
 * Los deltas son RELATIVOS (sumables/restables), no absolutos.
 * @param {Object} delta - Parche relativo con estructura parcial del estado
 * @param {string} [source='system'] - Origen del delta
 * @returns {{ success: boolean, version?: number, errors?: string[] }} Resultado de la aplicación
 */
export function applyDelta(delta, source = 'system') {
  if (typeof delta !== 'object' || delta === null || Array.isArray(delta)) {
    const error = '[StateManager] Delta debe ser un objeto no nulo.';
    console.error(error);
    return { success: false, errors: [error] };
  }

  if (typeof source !== 'string') {
    const error = '[StateManager] Source debe ser una cadena.';
    console.error(error);
    return { success: false, errors: [error] };
  }

  const errors = [];
  const previousState = structuredClone(_state);

  try {
    // Aplicar delta a naciones
    if (delta.nations) {
      for (const [nationId, nationDelta] of Object.entries(delta.nations)) {
        // Asegurar existencia de la nación con estructura completa
        if (!_state.nations[nationId]) {
          _state.nations[nationId] = {
            stats: {},
            resources: {},
            units: [],
            factions: {},
            policies: []
          };
        }

        const currentNation = _state.nations[nationId];

        // 1. Aplicar Stats
        if (nationDelta.stats) {
          if (!currentNation.stats) currentNation.stats = {};
          for (const [key, value] of Object.entries(nationDelta.stats)) {
            if (typeof value === 'number') {
              currentNation.stats[key] = (currentNation.stats[key] || 0) + value;
            } else {
              currentNation.stats[key] = value;
            }
          }
        }

        // 2. Aplicar Recursos
        if (nationDelta.resources) {
          if (!currentNation.resources) currentNation.resources = {};
          for (const [key, value] of Object.entries(nationDelta.resources)) {
            if (typeof value === 'number') {
              currentNation.resources[key] = (currentNation.resources[key] || 0) + value;
            } else {
              currentNation.resources[key] = value;
            }
          }
        }

        // 3. APLICAR UNIDADES (CORRECCIÓN CRÍTICA)
        if (nationDelta.units) {
          // Inicializar array si no existe
          if (!Array.isArray(currentNation.units)) {
            currentNation.units = [];
          }

          // Concatenar nuevas unidades
          if (Array.isArray(nationDelta.units)) {
            currentNation.units.push(...nationDelta.units);
          } else if (typeof nationDelta.units === 'object' && nationDelta.units !== null) {
            currentNation.units.push(nationDelta.units);
          }

          console.log(`[StateManager] ✅ Unidad añadida a ${nationId}. Total: ${currentNation.units.length}`);
        }

        // 4. Aplicar Facciones
        if (nationDelta.factions) {
          if (!currentNation.factions) currentNation.factions = {};
          for (const [factionId, factionDelta] of Object.entries(nationDelta.factions)) {
            if (!currentNation.factions[factionId]) {
              currentNation.factions[factionId] = {};
            }
            // Lógica específica para loyalty (reemplazo) vs otros (suma)
            for (const [factionKey, factionValue] of Object.entries(factionDelta)) {
              if (factionKey === 'loyalty') {
                currentNation.factions[factionId][factionKey] = factionValue;
              } else if (typeof factionValue === 'number') {
                currentNation.factions[factionId][factionKey] =
                  (currentNation.factions[factionId][factionKey] || 0) + factionValue;
              } else {
                currentNation.factions[factionId][factionKey] = factionValue;
              }
            }
          }
        }

        // 5. Objetivos estratégicos (reemplazo absoluto)
        if (Array.isArray(nationDelta.objectives)) {
          currentNation.objectives = structuredClone(nationDelta.objectives);
        }

        if (Array.isArray(nationDelta.activeStrategies)) {
          currentNation.activeStrategies = structuredClone(nationDelta.activeStrategies);
        }
      }
    }

    // Aplicar delta a diplomacia
    if (delta.diplomacy) {
      if (!_state.diplomacy.relations) _state.diplomacy.relations = {};
      if (delta.diplomacy.relations) {
        for (const [relKey, relValue] of Object.entries(delta.diplomacy.relations)) {
          if (typeof relValue === 'number') {
            _state.diplomacy.relations[relKey] = (_state.diplomacy.relations[relKey] || 0) + relValue;
          } else {
            _state.diplomacy.relations[relKey] = relValue;
          }
        }
      }
      if (delta.diplomacy.channels) {
        if (!_state.diplomacy.channels) _state.diplomacy.channels = {};
        Object.assign(_state.diplomacy.channels, delta.diplomacy.channels);
      }
    }

    // Aplicar delta a facciones globales
    if (delta.factions) {
      Object.assign(_state.factions, delta.factions);
    }

    // Aplicar delta a crisis
    if (delta.crisis) {
      Object.assign(_state.crisis, delta.crisis);
    }

    // Aplicar delta a espionaje
    if (delta.espionage) {
      Object.assign(_state.espionage, delta.espionage);
    }

    // Incrementar versión y tick
    _version++;
    _state.version = _version;

    if (delta.tick !== undefined) {
      _state.tick = delta.tick;
      // Limpieza de historial antiguo
      const cutoffTick = _state.tick - MAX_HISTORY_TICKS;
      while (_deltaHistory.length > 0 && _deltaHistory[0].tick < cutoffTick) {
        _deltaHistory.shift();
      }
    }

    // Guardar en historial
    _deltaHistory.push({
      version: _version,
      delta: structuredClone(delta),
      tick: _state.tick,
      source
    });

    // Emitir evento
    emit('state_updated', {
      version: _version,
      tick: _state.tick,
      delta,
      source
    });

    return { success: true, version: _version };

  } catch (error) {
    // Revertir en caso de error
    _state = previousState;
    const errorMsg = `[StateManager] Error aplicando delta: ${error.message}`;
    console.error(errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

/**
 * Valida un delta antes de aplicarlo.
 * SOLO verifica reglas, NO modifica el estado.
 * @param {Object} delta - Delta a validar
 * @returns {{ valid: boolean, errors: string[] }} Resultado de validación
 */
export function validate(delta) {
  const errors = [];

  if (typeof delta !== 'object' || delta === null) {
    errors.push('Delta debe ser un objeto no nulo');
    return { valid: false, errors };
  }

  // Validaciones de ejemplo (no modifican _state)
  if (delta.nations) {
    for (const [nationId, nationDelta] of Object.entries(delta.nations)) {
      if (nationDelta.stats && nationDelta.stats.budget !== undefined) {
        // Ejemplo: validar deuda máxima (lógica placeholder)
        // Aquí irían las reglas de negocio estrictas si se desea validar antes de aplicar
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Crea un snapshot serializable del estado actual.
 * @returns {Object} Snapshot completo del estado
 */
export function snapshot() {
  return {
    tick: _state.tick,
    version: _version,
    state: structuredClone(_state)
  };
}

/**
 * Obtiene el historial de deltas desde una versión específica.
 * @param {number} fromVersion - Versión desde la cual obtener deltas
 * @returns {Array}
 */
export function getDeltaHistory(fromVersion) {
  return _deltaHistory.filter(entry => entry.version >= fromVersion);
}

/**
 * Reinicia el estado a valores iniciales. SOLO para tests.
 * @param {Object} [initialState] - Estado inicial opcional
 * @package
 */
export function ResetForTests(initialState = null) {
  _state = initialState || {
    tick: 0,
    version: 0,
    nations: {},
    diplomacy: {
      relations: {}, // Clave: "USA_CHN", Valor: { value: 0, history: [], treaties: [] }
      reputation: {}, // Clave: "USA", Valor: { score: 0, trend: 'stable' }
      active_sanctions: [], // Array de { source, target, type, expiresAt }
      active_investments: [], // Array de { source, target, type, incomePerTick }
      covert_ops: {} // Clave: opId, Valor: { type, target, successChance, revealed: false }
    },
    factions: {},
    crisis: { active: false, phase: 0, type: null, treaties: {} },
    espionage: { operations: {}, signals: [] }
  };
  _version = 0;
  _deltaHistory.length = 0;
  _actionQueue = []; // ---> PARCHE: Resetear la cola de entrada de red
}

/**
 * Establece el estado completo directamente. SOLO para carga inicial.
 * @param {Object} initialState - Estado inicial completo
 */
export function setInitialState(initialState) {
  _state = structuredClone(initialState);
  _version = initialState.version || 0;
  _state.version = _version;
  emit('state_initialized', { tick: _state.tick, version: _version });
}