/**
 * @file StewardshipEngine.js
 * @description Motor de Modo Mayordomía: ejecuta Mandatos de Ausencia y controla límites de expansión.
 *              Penaliza expansión agresiva sin estabilidad interna (Mandato de Límites).
 *              Gestiona decisiones automáticas cuando el jugador está inactivo > X ticks.
 * @version 2.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v2.0.0: Implementación completa Mandato de Límites + IA de ausencia.
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';

/**
 * Configuración por defecto del sistema de mayordomía
 */
const DEFAULT_CONFIG = {
  mandate: {
    maxExpansionRate: 0.15, // Máximo 15% de expansión por tick
    stabilityThreshold: 40, // Estabilidad mínima requerida para expandir
    warningThreshold: 0.10, // Umbral para advertencia (10%)
    violationPenalty: 0.25, // Penalización del 25% de recursos si viola mandato
    checkInterval: 5 // Verificar cada 5 ticks
  },
  absence: {
    inactivityTicks: 30, // Ticks de inactividad antes de activar modo ausente
    autoDecisionChance: 0.70, // 70% chance de tomar decisión automática
    conservativeBias: 0.60 // 60% de preferencia por decisiones conservadoras
  },
  limits: {
    maxTerritoryRatio: 3.0, // Máximo ratio territorio vs nación promedio
    maxInfluencePerTick: 20, // Máximo incremento de influencia por tick
    softCapWarning: 0.80 // Advertencia al 80% del límite
  }
};

/**
 * Estado interno del motor de mayordomía
 */
let _state = {
  initialized: false,
  config: null,
  lastCheckTick: 0,
  playerLastActionTick: 0,
  absenceMode: false,
  mandateWarnings: new Map(), // nationId -> { count, lastWarningTick }
  expansionHistory: new Map(), // nationId -> [expansionRates]
  pendingAutoDecisions: []
};

/**
 * Inicializa el motor de mayordomía.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 * @returns {{ success: boolean, errors?: string[] }} Resultado de inicialización
 */
export function init(config) {
  if (_state.initialized) {
    const error = '[StewardshipEngine] Ya inicializado.';
    console.error(error);
    return { success: false, errors: [error] };
  }

  try {
    // Fusionar configuración por defecto con la proporcionada
    _state.config = {
      mandate: { ...DEFAULT_CONFIG.mandate, ...(config?.mandate || {}) },
      absence: { ...DEFAULT_CONFIG.absence, ...(config?.absence || {}) },
      limits: { ...DEFAULT_CONFIG.limits, ...(config?.limits || {}) }
    };

    // Suscribirse a eventos del core
    on('tick_start', handleTickStart);
    on('player_action', handlePlayerAction);
    on('nation_expansion', handleNationExpansion);
    on('stability_changed', handleStabilityChanged);

    _state.initialized = true;
    _state.lastCheckTick = 0;
    _state.playerLastActionTick = 0;
    _state.absenceMode = false;
    _state.mandateWarnings.clear();
    _state.expansionHistory.clear();
    _state.pendingAutoDecisions = [];

    console.log('[StewardshipEngine] Inicializado con configuración:', JSON.stringify(_state.config, null, 2));

    return { success: true };
  } catch (error) {
    const errorMsg = `[StewardshipEngine] Error en inicialización: ${error.message}`;
    console.error(errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

/**
 * Maneja el inicio de cada tick.
 * @param {{ tick: number }} payload - Datos del tick
 */
function handleTickStart(payload) {
  const currentTick = payload.tick;

  // Verificar mandato de límites en intervalos configurados
  if (currentTick - _state.lastCheckTick >= _state.config.mandate.checkInterval) {
    checkMandateLimits(currentTick);
    _state.lastCheckTick = currentTick;
  }

  // Verificar modo ausencia
  checkAbsenceMode(currentTick);

  // Ejecutar decisiones automáticas pendientes
  executePendingAutoDecisions(currentTick);
}

/**
 * Registra la última acción del jugador.
 * @param {{ playerId: string, actionType: string, tick: number }} payload - Datos de la acción
 */
function handlePlayerAction(payload) {
  _state.playerLastActionTick = payload.tick;

  // Si el jugador vuelve a estar activo, salir del modo ausencia
  if (_state.absenceMode) {
    _state.absenceMode = false;
    emit('stewardship_absence_ended', {
      playerId: payload.playerId,
      tick: payload.tick,
      inactiveDuration: payload.tick - (_state.playerLastActionTick - _state.config.absence.inactivityTicks)
    });
  }
}

/**
 * Registra expansión de una nación para verificación de mandato.
 * @param {{ nationId: string, expansionAmount: number, previousSize: number, tick: number }} payload
 */
function handleNationExpansion(payload) {
  const { nationId, expansionAmount, previousSize, tick } = payload;

  if (previousSize <= 0) return;

  const expansionRate = expansionAmount / previousSize;

  // Guardar en historial de expansión
  if (!_state.expansionHistory.has(nationId)) {
    _state.expansionHistory.set(nationId, []);
  }
  const history = _state.expansionHistory.get(nationId);
  history.push({ rate: expansionRate, tick });

  // Mantener solo últimos 20 registros
  if (history.length > 20) {
    history.shift();
  }

  // Verificación inmediata si supera límite blando
  if (expansionRate > _state.config.limits.softCapWarning) {
    emit('mandate_soft_cap_warning', {
      nationId,
      expansionRate,
      threshold: _state.config.limits.softCapWarning,
      tick
    });
  }
}

/**
 * Maneja cambios de estabilidad que pueden afectar límites de expansión.
 * @param {{ nationId: string, stability: number, previousStability: number }} payload
 */
function handleStabilityChanged(payload) {
  const { nationId, stability } = payload;

  // Si la estabilidad cae bajo el umbral, emitir advertencia
  if (stability < _state.config.mandate.stabilityThreshold) {
    emit('stability_critical', {
      nationId,
      stability,
      threshold: _state.config.mandate.stabilityThreshold
    });
  }
}

/**
 * Verifica los límites del mandato para todas las naciones.
 * @param {number} currentTick - Tick actual
 */
function checkMandateLimits(currentTick) {
  const state = getState();
  const nations = state.nations || {};

  for (const [nationId, nation] of Object.entries(nations)) {
    const stability = nation.stats?.stability ?? 50;
    const expansionHistory = _state.expansionHistory.get(nationId) || [];

    if (expansionHistory.length === 0) continue;

    // Calcular tasa de expansión promedio reciente
    const recentExpansions = expansionHistory.slice(-5); // Últimos 5 eventos
    const avgExpansionRate = recentExpansions.reduce((sum, e) => sum + e.rate, 0) / recentExpansions.length;

    // Verificar violación del mandato
    const maxAllowedRate = calculateMaxAllowedRate(stability);

    if (avgExpansionRate > maxAllowedRate) {
      handleMandateViolation(nationId, avgExpansionRate, maxAllowedRate, currentTick, stability);
    } else if (avgExpansionRate > maxAllowedRate * _state.config.mandate.warningThreshold / _state.config.mandate.maxExpansionRate) {
      issueMandateWarning(nationId, avgExpansionRate, maxAllowedRate, currentTick);
    }
  }
}

/**
 * Calcula la tasa máxima de expansión permitida basada en estabilidad.
 * @param {number} stability - Nivel de estabilidad (0-100)
 * @returns {number} Tasa máxima permitida
 */
function calculateMaxAllowedRate(stability) {
  const baseRate = _state.config.mandate.maxExpansionRate;

  // Si estabilidad es menor al umbral, reducir tasa permitida
  if (stability < _state.config.mandate.stabilityThreshold) {
    const reductionFactor = stability / _state.config.mandate.stabilityThreshold;
    return baseRate * reductionFactor * 0.5; // Penalización adicional
  }

  // Bonificación por alta estabilidad
  if (stability > 75) {
    return Math.min(baseRate * 1.2, 0.25); // Máximo 25%
  }

  return baseRate;
}

/**
 * Maneja una violación del mandato de límites.
 * @param {string} nationId - ID de la nación
 * @param {number} actualRate - Tasa de expansión real
 * @param {number} allowedRate - Tasa permitida
 * @param {number} currentTick - Tick actual
 * @param {number} stability - Estabilidad actual
 */
function handleMandateViolation(nationId, actualRate, allowedRate, currentTick, stability) {
  const state = getState();
  const nation = state.nations?.[nationId];

  if (!nation) return;

  // Actualizar contador de violaciones
  let violationData = _state.mandateWarnings.get(nationId) || { count: 0, lastWarningTick: 0 };
  violationData.count++;
  violationData.lastWarningTick = currentTick;
  _state.mandateWarnings.set(nationId, violationData);

  // Calcular penalización
  const penaltySeverity = Math.min(violationData.count * 0.25, 1.0); // Escala hasta 100%
  const resources = nation.resources || {};
  const totalResources = Object.values(resources).reduce((sum, r) => sum + (typeof r === 'number' ? r : 0), 0);
  const penaltyAmount = Math.floor(totalResources * _state.config.mandate.violationPenalty * penaltySeverity);

  // Aplicar delta de penalización
  const resourceDelta = {};
  for (const [resKey] of Object.entries(resources)) {
    if (resources[resKey] && typeof resources[resKey] === 'number') {
      resourceDelta[resKey] = -Math.floor(penaltyAmount / Object.keys(resources).length);
    }
  }

  const delta = {
    nations: {
      [nationId]: {
        resources: resourceDelta,
        stats: {
          stability: -5 * violationData.count // Penalización adicional de estabilidad
        }
      }
    },
    tick: currentTick
  };

  const result = applyDelta(delta, 'mandate_violated');

  if (result.success) {
    emit('mandate_violated', {
      nationId,
      actualRate,
      allowedRate,
      violationCount: violationData.count,
      penaltyApplied: penaltyAmount,
      stabilityPenalty: 5 * violationData.count,
      tick: currentTick
    });

    console.log(`[StewardshipEngine] Mandato violado por ${nationId}: tasa ${actualRate.toFixed(3)} > ${allowedRate.toFixed(3)}. Penalización: ${penaltyAmount} recursos.`);
  }
}

/**
 * Emite una advertencia de mandato (primera violación o acercamiento al límite).
 * @param {string} nationId - ID de la nación
 * @param {number} actualRate - Tasa de expansión real
 * @param {number} allowedRate - Tasa permitida
 * @param {number} currentTick - Tick actual
 */
function issueMandateWarning(nationId, actualRate, allowedRate, currentTick) {
  let warningData = _state.mandateWarnings.get(nationId) || { count: 0, lastWarningTick: 0 };

  // Solo emitir si no hubo advertencia reciente (últimos 10 ticks)
  if (currentTick - warningData.lastWarningTick < 10) {
    return;
  }

  warningData.count++;
  warningData.lastWarningTick = currentTick;
  _state.mandateWarnings.set(nationId, warningData);

  emit('mandate_warning', {
    nationId,
    actualRate,
    allowedRate,
    warningCount: warningData.count,
    tick: currentTick,
    message: `Advertencia: Expansión (${(actualRate * 100).toFixed(1)}%) excede límite recomendado (${(allowedRate * 100).toFixed(1)}%)`
  });
}

/**
 * Verifica si el jugador está en modo ausencia.
 * @param {number} currentTick - Tick actual
 */
function checkAbsenceMode(currentTick) {
  const inactivityDuration = currentTick - _state.playerLastActionTick;

  if (inactivityDuration >= _state.config.absence.inactivityTicks && !_state.absenceMode) {
    _state.absenceMode = true;

    emit('stewardship_absence_started', {
      tick: currentTick,
      inactivityDuration,
      threshold: _state.config.absence.inactivityTicks
    });

    console.log(`[StewardshipEngine] Modo ausencia activado tras ${inactivityDuration} ticks de inactividad.`);
  }
}

/**
 * Ejecuta decisiones automáticas pendientes durante ausencia.
 * @param {number} currentTick - Tick actual
 */
function executePendingAutoDecisions(currentTick) {
  if (!_state.absenceMode || _state.pendingAutoDecisions.length === 0) {
    return;
  }

  const decisionsToExecute = [];
  const remainingDecisions = [];

  for (const decision of _state.pendingAutoDecisions) {
    if (decision.executeAtTick <= currentTick) {
      decisionsToExecute.push(decision);
    } else {
      remainingDecisions.push(decision);
    }
  }

  _state.pendingAutoDecisions = remainingDecisions;

  for (const decision of decisionsToExecute) {
    executeAutoDecision(decision, currentTick);
  }
}

/**
 * Ejecuta una decisión automática específica.
 * @param {{ type: string, nationId: string, data: Object }} decision - Decisión a ejecutar
 * @param {number} currentTick - Tick actual
 */
function executeAutoDecision(decision, currentTick) {
  const { type, nationId, data } = decision;
  const state = getState();
  const nation = state.nations?.[nationId];

  if (!nation) return;

  let delta = null;

  switch (type) {
    case 'consolidate_stability':
      delta = {
        nations: {
          [nationId]: {
            stats: { stability: rngInt(2, 5) },
            resources: { treasury: -rngInt(5, 15) }
          }
        },
        tick: currentTick
      };
      break;

    case 'halt_expansion':
      // Simplemente no hacer nada (ya se detiene la expansión)
      emit('auto_expansion_halted', { nationId, tick: currentTick });
      return;

    case 'diplomatic_repair':
      delta = {
        diplomacy: {
          relations: {
            [`${nationId}_neighbor`]: rngInt(3, 8)
          }
        },
        tick: currentTick
      };
      break;

    case 'resource_allocation':
      delta = {
        nations: {
          [nationId]: {
            resources: data.resourceDelta || {}
          }
        },
        tick: currentTick
      };
      break;

    default:
      console.warn(`[StewardshipEngine] Tipo de decisión automática desconocido: ${type}`);
      return;
  }

  if (delta) {
    const result = applyDelta(delta, 'ai_stewardship');

    if (result.success) {
      emit('auto_decision_made', {
        nationId,
        decisionType: type,
        tick: currentTick,
        wasAbsent: _state.absenceMode,
        result: 'applied'
      });

      console.log(`[StewardshipEngine] Decisión automática ejecutada: ${type} para ${nationId}`);
    }
  }
}

/**
 * Programa una decisión automática para ser ejecutada.
 * @param {string} nationId - ID de la nación
 * @param {string} decisionType - Tipo de decisión
 * @param {Object} data - Datos adicionales para la decisión
 * @param {number} executeAtTick - Tick de ejecución
 */
export function scheduleAutoDecision(nationId, decisionType, data = {}, executeAtTick = null) {
  if (!_state.absenceMode && !data.forceSchedule) {
    console.warn('[StewardshipEngine] Solo se pueden programar decisiones en modo ausencia.');
    return false;
  }

  const currentState = getState();
  const tick = currentState.tick || 0;

  const decision = {
    id: `auto_dec_${Date.now()}_${rngInt(1000, 9999)}`,
    nationId,
    type: decisionType,
    data,
    createdAtTick: tick,
    executeAtTick: executeAtTick ?? (tick + rngInt(2, 5))
  };

  _state.pendingAutoDecisions.push(decision);

  emit('auto_decision_scheduled', decision);

  return true;
}

/**
 * Genera decisiones automáticas basadas en el estado actual de la nación.
 * @param {string} nationId - ID de la nación
 * @returns {Array<Object>} Lista de decisiones generadas
 */
export function generateAutoDecisions(nationId) {
  const state = getState();
  const nation = state.nations?.[nationId];
  const decisions = [];

  if (!nation) return decisions;

  const stability = nation.stats?.stability ?? 50;
  const resources = nation.resources || {};
  const treasury = resources.treasury ?? 0;

  // Decisión basada en estabilidad baja
  if (stability < 40) {
    decisions.push({
      type: 'consolidate_stability',
      priority: 'high',
      reason: `Estabilidad crítica: ${stability}`
    });
  }

  // Decisión basada en tesorería alta (gastar excedente)
  if (treasury > 500) {
    const spendOptions = ['infrastructure', 'military', 'diplomacy'];
    const selectedOption = spendOptions[rngInt(0, spendOptions.length - 1)];

    decisions.push({
      type: 'resource_allocation',
      data: {
        target: selectedOption,
        amount: Math.floor(treasury * 0.2)
      },
      priority: 'medium',
      reason: `Excedente de tesorería: ${treasury}`
    });
  }

  // Decisión basada en relaciones diplomáticas bajas
  const diplomacy = state.diplomacy || {};
  const relations = diplomacy.relations || {};

  for (const [relKey, relValue] of Object.entries(relations)) {
    if (relKey.startsWith(nationId) && typeof relValue === 'number' && relValue < -20) {
      decisions.push({
        type: 'diplomatic_repair',
        priority: 'medium',
        reason: `Relación deteriorada: ${relKey} = ${relValue}`
      });
      break; // Solo una reparación a la vez
    }
  }

  // Aplicar sesgo conservador si está configurado
  if (_state.config.absence.conservativeBias > rng()) {
    // Priorizar decisiones defensivas/conservadoras
    decisions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  return decisions;
}

/**
 * Obtiene el estado actual del motor de mayordomía.
 * @returns {Object} Estado interno (solo lectura)
 */
export function getStewardshipState() {
  return Object.freeze({
    initialized: _state.initialized,
    absenceMode: _state.absenceMode,
    playerLastActionTick: _state.playerLastActionTick,
    lastCheckTick: _state.lastCheckTick,
    mandateWarnings: new Map(_state.mandateWarnings),
    pendingAutoDecisions: [..._state.pendingAutoDecisions],
    config: { ..._state.config }
  });
}

/**
 * Reinicia el estado del motor. SOLO para tests.
 * @package
 */
export function ResetForTests() {
  _state = {
    initialized: false,
    config: null,
    lastCheckTick: 0,
    playerLastActionTick: 0,
    absenceMode: false,
    mandateWarnings: new Map(),
    expansionHistory: new Map(),
    pendingAutoDecisions: []
  };
}

/**
 * Configura parámetros específicos. SOLO para tests o ajustes en caliente.
 * @param {Object} newConfig - Nueva configuración parcial
 */
export function configure(newConfig) {
  if (!_state.initialized) {
    throw new Error('[StewardshipEngine] Debe inicializarse antes de configurar.');
  }

  if (newConfig.mandate) {
    _state.config.mandate = { ..._state.config.mandate, ...newConfig.mandate };
  }
  if (newConfig.absence) {
    _state.config.absence = { ..._state.config.absence, ...newConfig.absence };
  }
  if (newConfig.limits) {
    _state.config.limits = { ..._state.config.limits, ...newConfig.limits };
  }

  emit('stewardship_config_updated', { config: _state.config });
}