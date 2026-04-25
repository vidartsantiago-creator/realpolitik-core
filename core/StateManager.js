/**
 * @file StateManager.js
 * @description Autoridad única del estado global del juego. Gestiona aplicación de deltas,
 *              validación de invariantes, snapshots y versionado determinista.
 * @version 1.0.0
 * @author Realpolitik Core Team
 * @dependencies EventDispatcher (opcional para eventos)
 * @changelog
 * - v1.0.0: Creación inicial. Implementa applyDelta, snapshot, validate con source tracking.
 */

import { emit } from './EventDispatcher.js';

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

/**
 * Obtiene el estado global actual (solo lectura).
 * @returns {Readonly<Object>} Estado global inmutable
 */
export function getState() {
  return Object.freeze(structuredClone(_state));
}

/**
 * Aplica un delta incremental al estado global.
 * Los deltas son RELATIVOS (sumables/restables), no absolutos.
 * @param {Object} delta - Parche relativo con estructura parcial del estado
 * @param {string} [source='system'] - Origen del delta: 'player', 'ai_stewardship', 'crisis_penalty', 'faction_effect', 'system'
 * @returns {{ success: boolean, version?: number, errors?: string[] }} Resultado de la aplicación
 * @throws {Error} Si delta no es un objeto válido
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
        if (!_state.nations[nationId]) {
          _state.nations[nationId] = { stats: {}, resources: {}, policies: [] };
        }
        
        if (nationDelta.stats) {
          if (!_state.nations[nationId].stats) {
            _state.nations[nationId].stats = {};
          }
          for (const [statKey, statValue] of Object.entries(nationDelta.stats)) {
            if (typeof statValue === 'number') {
              _state.nations[nationId].stats[statKey] = 
                (_state.nations[nationId].stats[statKey] || 0) + statValue;
            } else {
              _state.nations[nationId].stats[statKey] = statValue;
            }
          }
        }
        
        if (nationDelta.resources) {
          if (!_state.nations[nationId].resources) {
            _state.nations[nationId].resources = {};
          }
          for (const [resKey, resValue] of Object.entries(nationDelta.resources)) {
            if (typeof resValue === 'number') {
              _state.nations[nationId].resources[resKey] = 
                (_state.nations[nationId].resources[resKey] || 0) + resValue;
            } else {
              _state.nations[nationId].resources[resKey] = resValue;
            }
          }
        }
      }
    }

    // Aplicar delta a diplomacia
    if (delta.diplomacy) {
      if (!_state.diplomacy.relations) {
        _state.diplomacy.relations = {};
      }
      if (delta.diplomacy.relations) {
        for (const [relKey, relValue] of Object.entries(delta.diplomacy.relations)) {
          if (typeof relValue === 'number') {
            _state.diplomacy.relations[relKey] = 
              (_state.diplomacy.relations[relKey] || 0) + relValue;
          } else {
            _state.diplomacy.relations[relKey] = relValue;
          }
        }
      }
      if (delta.diplomacy.channels) {
        if (!_state.diplomacy.channels) {
          _state.diplomacy.channels = {};
        }
        Object.assign(_state.diplomacy.channels, delta.diplomacy.channels);
      }
    }

    // Aplicar delta a facciones
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

    // Incrementar versión y tick si corresponde
    _version++;
    _state.version = _version;
    
    if (delta.tick !== undefined) {
      _state.tick = delta.tick;
      // Limpiar historial antiguo (más de 120 ticks)
      const cutoffTick = _state.tick - MAX_HISTORY_TICKS;
      while (_deltaHistory.length > 0 && _deltaHistory[0].tick < cutoffTick) {
        _deltaHistory.shift();
      }
    }

    // Guardar en historial para replay
    _deltaHistory.push({
      version: _version,
      delta: structuredClone(delta),
      tick: _state.tick,
      source
    });

    // Emitir evento de estado actualizado
    emit('state_updated', {
      version: _version,
      tick: _state.tick,
      delta,
      source
    });

    return { success: true, version: _version };

  } catch (error) {
    // Revertir a estado anterior en caso de error
    _state = previousState;
    const errorMsg = `[StateManager] Error aplicando delta: ${error.message}`;
    console.error(errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

/**
 * Valida un delta antes de aplicarlo.
 * Verifica invariantes básicos y rangos de valores.
 * @param {Object} delta - Delta a validar
 * @returns {{ valid: boolean, errors: string[] }} Resultado de validación
 */
export function validate(delta) {
  const errors = [];

  if (typeof delta !== 'object' || delta === null) {
    errors.push('Delta debe ser un objeto no nulo');
    return { valid: false, errors };
  }

  // Validar naciones
  if (delta.nations) {
    for (const [nationId, nationDelta] of Object.entries(delta.nations)) {
      if (nationDelta.stats) {
        // Ejemplo: validar que budget no baje de -MAX_DEBT
        if (nationDelta.stats.budget !== undefined) {
          const currentBudget = _state.nations[nationId]?.stats?.budget || 0;
          const newBudget = currentBudget + nationDelta.stats.budget;
          const maxDebt = -1000; // Configurable desde engine.json
          if (newBudget < maxDebt) {
            errors.push(`Nación ${nationId}: budget ${newBudget} excede deuda máxima ${maxDebt}`);
          }
        }
        // Validar que stability esté en rango 0-100
        if (nationDelta.stats.stability !== undefined) {
          const currentStability = _state.nations[nationId]?.stats?.stability || 50;
          const newStability = currentStability + nationDelta.stats.stability;
          if (newStability < 0 || newStability > 100) {
            errors.push(`Nación ${nationId}: stability ${newStability} fuera de rango [0,100]`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Crea un snapshot serializable del estado actual.
 * Usado para sincronización de clientes nuevos o reconexiones.
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
 * Usado para replay en reconexiones de clientes.
 * @param {number} fromVersion - Versión desde la cual obtener deltas
 * @returns {Array<{version: number, delta: Object, tick: number, source: string}>}
 */
export function getDeltaHistory(fromVersion) {
  return _deltaHistory.filter(entry => entry.version >= fromVersion);
}

/**
 * Reinicia el estado a valores iniciales. SOLO para tests.
 * @param {Object} [initialState] - Estado inicial opcional
 * @package
 */
export function _resetForTests(initialState = null) {
  _state = initialState || {
    tick: 0,
    version: 0,
    nations: {},
    diplomacy: { relations: {}, channels: {} },
    factions: {},
    crisis: { active: false, phase: 0, type: null, treaties: {} },
    espionage: { operations: {}, signals: [] }
  };
  _version = 0;
  _deltaHistory.length = 0;
}

/**
 * Establece el estado completo directamente. SOLO para carga inicial desde world.json.
 * @param {Object} initialState - Estado inicial completo
 */
export function setInitialState(initialState) {
  _state = structuredClone(initialState);
  _version = initialState.version || 0;
  _state.version = _version;
  emit('state_initialized', { tick: _state.tick, version: _version });
}
