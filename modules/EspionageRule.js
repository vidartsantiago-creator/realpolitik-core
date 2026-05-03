/**
 * @file EspionageRule.js
 * @description Operaciones activas de espionaje, contraespionaje reactivo, robo de tecnología, sabotaje.
 *              Se integra con InformationLayer para ejecutar operaciones reales.
 * @version 2.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng, InformationLayer
 * @changelog
 * - v2.0.0: Implementación completa operaciones + contraespionaje.
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';

/**
 * Configuración por defecto del sistema de espionaje
 */
const DEFAULT_CONFIG = {
  operations: {
    techTheft: { baseSuccess: 0.45, cost: 20, duration: [8, 15], detectionBase: 0.25 },
    sabotage: { baseSuccess: 0.35, cost: 25, duration: [5, 10], detectionBase: 0.35 },
    infiltrate: { baseSuccess: 0.55, cost: 15, duration: [10, 20], detectionBase: 0.15 },
    intercept: { baseSuccess: 0.60, cost: 12, duration: [3, 6], detectionBase: 0.20 }
  },
  counterIntel: {
    baseDetection: 0.20,
    bonusPerLevel: 0.08,
    maxLevel: 5,
    captureChance: 0.15
  },
  agents: {
    maxActive: 10,
    trainingCost: 5,
    baseSkill: 0.50
  }
};

/**
 * Estado interno del módulo de espionaje
 */
let _state = {
  initialized: false,
  config: null,
  activeOperations: new Map(),
  agents: new Map(),
  counterIntelLevels: new Map(),
  completedOps: []
};

/**
 * Inicializa el módulo de espionaje.
 * @param {{ engine: Object, world: Object, modules: Object }} config
 * @returns {{ success: boolean, errors?: string[] }}
 */
export function init(config) {
  if (_state.initialized) {
    const error = '[EspionageRule] Ya inicializado.';
    console.error(error);
    return { success: false, errors: [error] };
  }

  try {
    _state.config = {
      operations: { ...DEFAULT_CONFIG.operations, ...(config?.operations || {}) },
      counterIntel: { ...DEFAULT_CONFIG.counterIntel, ...(config?.counterIntel || {}) },
      agents: { ...DEFAULT_CONFIG.agents, ...(config?.agents || {}) }
    };

    on('tick_start', handleTickStart);
    on('espionage_order', handleEspionageOrder);
    on('counterintel_upgrade', handleCounterIntelUpgrade);

    _state.initialized = true;
    _state.activeOperations.clear();
    _state.agents.clear();
    _state.counterIntelLevels.clear();
    _state.completedOps = [];

    console.log('[EspionageRule] Inicializado');

    return { success: true };
  } catch (error) {
    const errorMsg = `[EspionageRule] Error en inicialización: ${error.message}`;
    console.error(errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

/**
 * Maneja el inicio de cada tick.
 * @param {{ tick: number }} payload
 */
function handleTickStart(payload) {
  const currentTick = payload.tick;

  for (const [opId, operation] of _state.activeOperations.entries()) {
    operation.ticksRemaining--;

    if (operation.ticksRemaining <= 0) {
      completeOperation(opId, currentTick);
    }
  }
}

/**
 * Maneja órdenes de espionaje.
 * @param {{ operatingNationId: string, targetNationId: string, operationType: string, agentId?: string }} payload
 */
function handleEspionageOrder(payload) {
  const { operatingNationId, targetNationId, operationType, agentId } = payload;

  if (!_state.initialized || !_state.config?.operations) {
    console.error('[EspionageRule] Sistema no inicializado o config.operations undefined');
    return;
  }

  startOperation(operatingNationId, targetNationId, operationType, agentId);
}

/**
 * Maneja mejoras de contraespionaje.
 * @param {{ nationId: string, levels: number }} payload
 */
function handleCounterIntelUpgrade(payload) {
  const { nationId, levels } = payload;

  const currentState = getState();
  const currentTick = currentState.tick || 0;

  let currentLevel = _state.counterIntelLevels.get(nationId) || 0;
  const newLevel = Math.min(currentLevel + levels, _state.config.counterIntel.maxLevel);

  _state.counterIntelLevels.set(nationId, newLevel);

  const delta = {
    nations: {
      [nationId]: {
        resources: { treasury: -levels * 10 }
      }
    },
    espionage: {
      counterIntel: {
        [nationId]: newLevel
      }
    },
    tick: currentTick
  };

  applyDelta(delta, 'counterintel_upgrade');

  emit('counterintel_upgraded', {
    nationId,
    previousLevel: currentLevel,
    newLevel,
    tick: currentTick
  });
}

/**
 * Inicia una operación de espionaje.
 * @param {string} operatorId
 * @param {string} targetId
 * @param {string} operationType
 * @param {string} [agentId]
 * @returns {{ success: boolean, operationId?: string, errors?: string[] }}
 */
export function startOperation(operatorId, targetId, operationType, agentId = null) {
  const state = getState();
  const currentState = getState();
  const currentTick = currentState.tick || 0;

  if (!state.nations?.[operatorId] || !state.nations?.[targetId]) {
    return { success: false, errors: ['Nación no encontrada'] };
  }

  const opConfig = _state.config.operations[operationType];
  if (!opConfig) {
    return { success: false, errors: [`Tipo de operación desconocida: ${operationType}`] };
  }

  const operationId = `op_${Date.now()}_${rngInt(1000, 9999)}`;
  const duration = rngInt(opConfig.duration[0], opConfig.duration[1]);

  const operation = {
    id: operationId,
    operator: operatorId,
    target: targetId,
    type: operationType,
    agentId: agentId || `agent_${rngInt(1000, 9999)}`,
    startedTick: currentTick,
    ticksRemaining: duration,
    cost: opConfig.cost,
    detected: false,
    success: null
  };

  _state.activeOperations.set(operationId, operation);

  const delta = {
    nations: {
      [operatorId]: {
        resources: { treasury: -opConfig.cost }
      }
    },
    espionage: {
      operations: {
        [operationId]: {
          target: targetId,
          type: operationType,
          started: currentTick
        }
      }
    },
    tick: currentTick
  };

  applyDelta(delta, 'espionage_started');

  emit('espionage_operation_started', {
    operationId,
    operator: operatorId,
    target: targetId,
    type: operationType,
    estimatedDuration: duration,
    tick: currentTick
  });

  return { success: true, operationId };
}

/**
 * Completa una operación de espionaje.
 * @param {string} operationId
 * @param {number} currentTick
 */
function completeOperation(operationId, currentTick) {
  const operation = _state.activeOperations.get(operationId);

  if (!operation) return;

  const state = getState();
  const targetCounterIntel = _state.counterIntelLevels.get(operation.target) || 0;
  const opConfig = _state.config.operations[operation.type];

  const detectionChance = opConfig.detectionBase + (targetCounterIntel * _state.config.counterIntel.bonusPerLevel);
  const isDetected = rng() < detectionChance;

  operation.detected = isDetected;

  if (isDetected) {
    operation.success = false;

    const captureChance = _state.config.counterIntel.captureChance + (targetCounterIntel * 0.05);
    const isCaptured = rng() < captureChance;

    emit('espionage_detected', {
      operationId,
      operator: operation.operator,
      target: operation.target,
      type: operation.type,
      captured: isCaptured,
      tick: currentTick
    });

    if (isCaptured) {
      emit('agent_captured', {
        agentId: operation.agentId,
        operator: operation.operator,
        target: operation.target,
        tick: currentTick
      });

      damageRelations(operation.operator, operation.target, 30);
    }

  } else {
    const successChance = calculateSuccessChance(operation, targetCounterIntel);
    const isSuccess = rng() < successChance;
    operation.success = isSuccess;

    if (isSuccess) {
      executeOperationEffect(operation, currentTick);
    } else {
      emit('espionage_failed', {
        operationId,
        operator: operation.operator,
        target: operation.target,
        type: operation.type,
        reason: 'operation_failure',
        tick: currentTick
      });
    }
  }

  _state.activeOperations.delete(operationId);
  _state.completedOps.push({ ...operation, completedTick: currentTick });

  if (_state.completedOps.length > 100) {
    _state.completedOps.shift();
  }
}

/**
 * Calcula chance de éxito de una operación.
 * @param {Object} operation
 * @param {number} targetCounterIntel
 * @returns {number}
 */
function calculateSuccessChance(operation, targetCounterIntel) {
  const opConfig = _state.config.operations[operation.type];
  let baseChance = opConfig.baseSuccess;

  const counterPenalty = targetCounterIntel * 0.05;
  baseChance -= counterPenalty;

  return Math.max(baseChance, 0.10);
}

/**
 * Ejecuta el efecto de una operación exitosa.
 * @param {Object} operation
 * @param {number} currentTick
 */
function executeOperationEffect(operation, currentTick) {
  const { operator, target, type } = operation;

  switch (type) {
    case 'techTheft':
      executeTechTheft(operator, target, currentTick);
      break;
    case 'sabotage':
      executeSabotage(operator, target, currentTick);
      break;
    case 'infiltrate':
      executeInfiltration(operator, target, currentTick);
      break;
    case 'intercept':
      executeInterception(operator, target, currentTick);
      break;
  }
}

/**
 * Ejecuta robo de tecnología.
 * @param {string} operatorId
 * @param {string} targetId
 * @param {number} currentTick
 */
function executeTechTheft(operatorId, targetId, currentTick) {
  const techTypes = ['military', 'economic', 'industrial', 'cyber'];
  const stolenTech = techTypes[rngInt(0, techTypes.length - 1)];
  const techValue = rngInt(5, 15);

  const delta = {
    nations: {
      [operatorId]: {
        stats: { technology: techValue }
      },
      [targetId]: {
        stats: { technology: -Math.floor(techValue * 0.3) }
      }
    },
    tick: currentTick
  };

  const result = applyDelta(delta, 'espionage_tech_theft');

  if (result.success) {
    emit('tech_stolen', {
      operator: operatorId,
      target: targetId,
      techType: stolenTech,
      techValue,
      tick: currentTick
    });

    console.log(`[EspionageRule] Tecnología robada: ${stolenTech} (${techValue}) de ${targetId} a ${operatorId}`);
  }
}

/**
 * Ejecuta sabotaje.
 * @param {string} operatorId
 * @param {string} targetId
 * @param {number} currentTick
 */
function executeSabotage(operatorId, targetId, currentTick) {
  const facilityTypes = ['military_base', 'research_lab', 'factory', 'power_plant'];
  const targetedFacility = facilityTypes[rngInt(0, facilityTypes.length - 1)];
  const damageAmount = rngInt(10, 25);

  const delta = {
    nations: {
      [targetId]: {
        resources: {
          materials: -damageAmount,
          treasury: -Math.floor(damageAmount * 2)
        },
        stats: { stability: -rngInt(2, 5) }
      }
    },
    tick: currentTick
  };

  const result = applyDelta(delta, 'espionage_sabotage');

  if (result.success) {
    emit('facility_sabotaged', {
      operator: operatorId,
      target: targetId,
      facility: targetedFacility,
      damage: damageAmount,
      tick: currentTick
    });

    console.log(`[EspionageRule] Sabotaje en ${targetId}: ${targetedFacility} dañado (${damageAmount})`);
  }
}

/**
 * Ejecuta infiltración.
 * @param {string} operatorId
 * @param {string} targetId
 * @param {number} currentTick
 */
function executeInfiltration(operatorId, targetId, currentTick) {
  const intelGain = rngInt(15, 30);

  emit('intelligence_gained', {
    operator: operatorId,
    target: targetId,
    intelAmount: intelGain,
    tick: currentTick
  });
}

/**
 * Ejecuta intercepción.
 * @param {string} operatorId
 * @param {string} targetId
 * @param {number} currentTick
 */
function executeInterception(operatorId, targetId, currentTick) {
  const diplomaticBonus = rngInt(3, 8);

  emit('communications_intercepted', {
    operator: operatorId,
    target: targetId,
    diplomaticInsight: diplomaticBonus,
    tick: currentTick
  });
}

/**
 * Deteriora relaciones entre naciones.
 * @param {string} nationA
 * @param {string} nationB
 * @param {number} amount
 */
function damageRelations(nationA, nationB, amount) {
  const relationKey = [nationA, nationB].sort().join('_');

  const delta = {
    diplomacy: {
      relations: {
        [relationKey]: -amount
      }
    },
    tick: getState().tick || 0
  };

  applyDelta(delta, 'espionage_damage');
}

/**
 * Obtiene nivel de contraespionaje de una nación.
 * @param {string} nationId
 * @returns {number}
 */
export function getCounterIntelLevel(nationId) {
  return _state.counterIntelLevels.get(nationId) || 0;
}

/**
 * Obtiene operaciones activas de una nación.
 * @param {string} nationId
 * @returns {Array<Object>}
 */
export function getActiveOperations(nationId) {
  const ops = [];
  for (const op of _state.activeOperations.values()) {
    if (op.operator === nationId) {
      ops.push({ ...op });
    }
  }
  return ops;
}

/**
 * Obtiene estado del módulo.
 * @returns {Object}
 */
export function getEspionageState() {
  return Object.freeze({
    initialized: _state.initialized,
    activeOperationsCount: _state.activeOperations.size,
    completedOperationsCount: _state.completedOps.length,
    config: { ..._state.config }
  });
}

/**
 * Reinicia estado. SOLO para tests.
 * @package
 */
export function _resetForTests() {
  _state = {
    initialized: false,
    config: null,
    activeOperations: new Map(),
    agents: new Map(),
    counterIntelLevels: new Map(),
    completedOps: []
  };
}