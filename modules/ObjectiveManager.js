/**
 * @file ObjectiveManager.js
 * @description Gestiona el ciclo de vida de Objetivos Estratégicos y Estrategias Activas.
 *              Evalúa progreso tick a tick, calcula riesgos internos (facciones),
 *              gestiona la IA de objetivos para naciones no jugadoras y actualiza el Legacy Index.
 * 
 * @version 1.0.0
 * @author RealPolitik Core Team
 * 
 * @dependencies
 * - EventDispatcher: Para suscribirse al bucle de tiempo ('tick_start', 'tick_end') y emitir eventos.
 * - StateManager: Para leer el estado global y aplicar deltas de recursos/facciones.
 * - Rng: Para evaluaciones probabilísticas deterministas (crisis, éxito de IA).
 * - FactionRule (Opcional): Para validar nombres de facciones si se requiere lógica compleja.
 * 
 * @integration
 * - Se registra en config/modules.json para inicialización automática.
 * - Escucha eventos 'player_set_objective' y 'player_activate_strategy' desde la UI.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';
import objectivesConfig from '../config/objectives.json' with { type: 'json' };
import strategiesConfig from '../config/strategies.json' with { type: 'json' };
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { StrategyMath } from '../server/utils/StrategyMath.js';

let clientConfigCache = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Estado Interno del Módulo ---
let _state = {
  initialized: false,
  config: null,                 // Carga de objectives.json y strategies.json
  playerObjectives: new Map(),  // Map<objectiveId, { progress, milestonesCompleted, active }>
  nationObjectives: new Map(),  // Map<nationId, [ { id, type, priority, progress, lastEvaluatedTick } ]>
  activeStrategies: new Map(),  // Map<nationId, [ { id, startTick, endTick, effectsApplied } ]>
  legacyIndex: new Map()        // Map<nationId, { score, history: [] }>
};

// --- Constantes de Configuración ---
const EVALUATION_INTERVAL_TICKS = 5; // Frecuencia de evaluación profunda de IA
const CRISIS_WARNING_THRESHOLD = 0.7; // Umbral de riesgo para alertar al jugador

/**
 * Inicializa el módulo, carga configuraciones y suscribe listeners al bucle de juego.
 * @param {Object} config - Objeto con las definiciones de objetivos y estrategias cargadas desde JSON.
 */
export function init(config) {
  if (_state.initialized) {
    console.warn('[ObjectiveManager] Ya inicializado.');
    return;
  }

  _state.config = config;

  // Inicializar Legacy Index vacío para todas las naciones existentes
  const initialState = getState();
  if (initialState && initialState.nations) {
    Object.keys(initialState.nations).forEach(nationId => {
      _state.legacyIndex.set(nationId, { score: 0, history: [] });
      _state.activeStrategies.set(nationId, []);

      // Si es IA, generar objetivos iniciales
      if (!initialState.nations[nationId].isHuman) {
        generateInitialAIObjectives(nationId);
      }
    });
  }

  // Suscripción al Bucle Determinista
  on('tick_start', onTickStart);
  on('tick_end', onTickEnd);

  // Listeners de Acciones del Jugador / Sistema
  on('player_set_objective', handlePlayerSetObjective);
  on('player_cancel_objective', handlePlayerCancelObjective);
  on('player_activate_strategy', handlePlayerActivateStrategy);
  on('game_load', resetModuleState); // Limpieza al cargar partida

  clientConfigCache = config; // Guardar en memoria
  console.log('[ObjectiveManager] Configuración cargada en memoria para el cliente.');
  _state.initialized = true;
  console.log('[ObjectiveManager] Inicializado correctamente.');
}

/**
 * Resetear estado interno al cargar una partida guardada para evitar duplicados.
 */
function resetModuleState(savedState) {
  if (savedState.objectiveManagerState) {
    _state.playerObjectives = new Map(savedState.objectiveManagerState.playerObjectives);
    _state.nationObjectives = new Map(savedState.objectiveManagerState.nationObjectives);
    _state.activeStrategies = new Map(savedState.objectiveManagerState.activeStrategies);
    _state.legacyIndex = new Map(savedState.objectiveManagerState.legacyIndex);
  } else {
    // Nueva partida: limpiar todo menos config
    _state.playerObjectives.clear();
    _state.nationObjectives.clear();
    _state.activeStrategies.clear();
  }
}

// ============================================================================
// BUCLE PRINCIPAL (TICK LOOP)
// ============================================================================

/**
 * Ejecutado al inicio de cada tick.
 * - Aplica costos continuos de estrategias activas.
 * - Evalúa progreso de objetivos del jugador.
 * - Verifica condiciones de fallo inmediato.
 */
function onTickStart({ tick }) {
  const state = getState();
  if (!state) return;

  // 1. Procesar Estrategias Activas (Costos y Efectos por Tick)
  processActiveStrategies(state, tick);

  // 2. Evaluar Objetivos del Jugador
  for (const [objId, objData] of _state.playerObjectives.entries()) {
    if (!objData.active) continue;

    evaluateObjectiveProgress('player', objId, objData, state, tick);
    checkInternalRisks('player', objId, objData, state, tick);
  }

  // 3. Evaluar Objetivos de IA (Cada N ticks para ahorrar CPU y simular "pensamiento")
  if (tick % EVALUATION_INTERVAL_TICKS === 0) {
    processAINationsLogic(state, tick);
  }
}

/**
 * Ejecutado al final de cada tick.
 * - Verifica completitud de hitos (milestones).
 * - Actualiza Legacy Index.
 * - Limpia estrategias expiradas.
 */
function onTickEnd({ tick }) {
  const state = getState();

  // 1. Verificar Hitos y Completitud
  for (const [objId, objData] of _state.playerObjectives.entries()) {
    if (!objData.active) continue;
    checkMilestones('player', objId, objData, state, tick);
  }

  // 2. Actualizar Legacy Index (Decaimiento natural + Logros)
  updateLegacyIndex(tick);

  // 3. Limpieza de estrategias expiradas
  cleanupExpiredStrategies(tick);
}

// ============================================================================
// LÓGICA DE ESTRATEGIAS
// ============================================================================

function processActiveStrategies(state, tick) {
  // Iterar sobre todas las naciones y sus estrategias activas
  for (const [nationId, strategies] of _state.activeStrategies.entries()) {
    // Filtramos estrategias canceladas o finalizadas al inicio del loop si fuera necesario,
    // pero aquí procesamos las que están activas en este tick.

    for (const strat of strategies) {
      if (tick > strat.endTick) continue;
      if (strat.cancelled) continue;

      // 1. Obtener configuración estática del JSON
      const configStrat = _state.config.strategies.find(s => s.id === strat.id);
      if (!configStrat) {
        console.warn(`[ObjectiveManager] Estrategia ${strat.id} sin configuración.`);
        continue;
      }

      // 2. OBTENER PRESUPUESTO ASIGNADO (Nuevo)
      // Si no existe (legacy), usar el default o min del rango
      const budgetRange = configStrat.budget_range || { default: 100, min: 0 };
      const assignedBudget = strat.assignedBudget ?? budgetRange.default;

      // 3. CALCULAR EFICIENCIA Y RIESGO DINÁMICO (Nuevo)
      const efficiencyMultiplier = StrategyMath.calculateEfficiency(
        assignedBudget,
        configStrat.efficiency_curve,
        budgetRange
      );

      const currentRiskProbability = StrategyMath.calculateRiskProbability(
        configStrat.risk_profile?.base_risk || 0,
        assignedBudget,
        configStrat.risk_profile?.risk_scaling
      );

      // Guardamos estos valores calculados en el estado de la estrategia para UI/Debug
      strat.currentEfficiency = efficiencyMultiplier;
      strat.currentRisk = currentRiskProbability;

      // 4. APLICAR COSTOS POR TICK (Escalados por presupuesto)
      if (configStrat.tick_effects?.base || configStrat.resource_cost_per_tick) {
        const costs = {};
        let canAfford = true;

        // A. Costos de Recursos (Tesorería, etc.)
        // Escalamos el costo base proporcionalmente al presupuesto asignado vs el default
        const costScaleFactor = assignedBudget / (budgetRange.default || assignedBudget);

        if (configStrat.resource_cost_per_tick) {
          for (const [res, baseAmount] of Object.entries(configStrat.resource_cost_per_tick)) {
            // Si es estabilidad/relaciones, son penalties directos (no requieren saldo)
            if (res === 'stability' || res === 'international_relations') continue;

            const scaledCost = baseAmount * costScaleFactor;
            const currentVal = getNationResource(state, nationId, res);

            if (currentVal < scaledCost) canAfford = false;
            costs[res] = -scaledCost;
          }
        }

        if (!canAfford) {
          emit('strategy_cancelled_no_resources', { nationId, strategyId: strat.id, tick, reason: 'insufficient_funds' });
          strat.cancelled = true;
          // Lógica de limpieza opcional aquí
          continue;
        }

        // Aplicar delta de recursos (Costos)
        if (Object.keys(costs).length > 0) {
          applyDelta({
            source: `strategy_cost_${strat.id}`,
            nations: { [nationId]: costs }
          });
        }

        // B. Efectos Base (Estabilidad, Popularidad, etc.)
        // Estos se multiplican por la EFICIENCIA calculada
        const effects = configStrat.tick_effects?.base || {};
        const effectDeltas = {};

        for (const [stat, baseValue] of Object.entries(effects)) {
          // Aplicar eficiencia: Un valor negativo (costo) también se ve afectado por la eficiencia?
          // Generalmente sí: mayor eficiencia = mayor impacto (positivo o negativo)
          effectDeltas[stat] = baseValue * efficiencyMultiplier;
        }

        // C. Efectos Escalados Directamente por Presupuesto (si existen en JSON)
        const scaledEffects = configStrat.tick_effects?.scaled_by_budget || {};
        for (const [stat, factor] of Object.entries(scaledEffects)) {
          // Ej: poverty_reduction = 1.2 * budget
          effectDeltas[stat] = (effectDeltas[stat] || 0) + (factor * assignedBudget);
        }

        if (Object.keys(effectDeltas).length > 0) {
          applyDelta({
            source: `strategy_effect_${strat.id}`,
            nations: { [nationId]: effectDeltas }
          });
        }
      }

      // 5. EVALUAR EVENTOS DE RIESGO (RNG)
      if (configStrat.risk_profile?.events && currentRiskProbability > 0) {
        const roll = Math.random();
        if (roll < currentRiskProbability) {
          // ¡El riesgo se activó! Elegir evento basado en pesos
          const events = configStrat.risk_profile.events;
          // Lógica simple: tomar el primero o uno aleatorio ponderado
          const triggeredEvent = events[Math.floor(Math.random() * events.length)];

          // Verificar umbrales específicos del evento (opcional)
          if (!triggeredEvent.trigger_threshold || currentRiskProbability >= triggeredEvent.trigger_threshold) {
            emit('strategy_risk_event', {
              nationId,
              strategyId: strat.id,
              eventId: triggeredEvent.id,
              impact: triggeredEvent.impact
            });

            // Aplicar impacto negativo inmediato
            if (triggeredEvent.impact) {
              applyDelta({
                source: `risk_event_${triggeredEvent.id}`,
                nations: { [nationId]: triggeredEvent.impact }
              });
            }
          }
        }
      }

      // 6. EMITIR PROGRESO (UI/Log)
      if (tick === strat.startTick || tick % 10 === 0) {
        emit('strategy_tick_progress', {
          nationId,
          strategyId: strat.id,
          remaining: strat.endTick - tick,
          efficiency: efficiencyMultiplier, // Nuevo dato para UI
          risk: currentRiskProbability      // Nuevo dato para UI
        });
      }
    }
  }
}

function cleanupExpiredStrategies(tick) {
  for (const [nationId, strategies] of _state.activeStrategies.entries()) {
    const active = strategies.filter(s => !s.cancelled && tick <= s.endTick);

    // Detectar las que acabaron justo ahora
    const completed = strategies.filter(s => !s.cancelled && tick > s.endTick);

    if (completed.length > 0) {
      completed.forEach(s => {
        const configStrat = _state.config.strategies.find(cs => cs.id === s.id);
        if (configStrat && configStrat.completion_rewards) {
          // Aplicar recompensas finales
          applyDelta({
            source: `strategy_reward_${s.id}`,
            nations: { [nationId]: configStrat.completion_rewards }
          });
          emit('strategy_completed', { nationId, strategyId: s.id, rewards: configStrat.completion_rewards });
        }
      });
    }

    _state.activeStrategies.set(nationId, active);
  }
}

// ============================================================================
// LÓGICA DE OBJETIVOS
// ============================================================================

function handlePlayerSetObjective({ objectiveId }) {
  const state = getState();
  const maxObj = _state.config?.global_settings?.max_active_objectives_per_nation || 3;
  const playerNationId = state.playerNationId;

  if (_state.playerObjectives.size >= maxObj) {
    emit('ui_error', { message: `Máximo de ${maxObj} objetivos activos alcanzado.` });
    return;
  }

  const configObj = findObjectiveConfig(objectiveId);
  if (!configObj) return;

  // Verificar prerrequisitos básicos
  if (!checkPrerequisites(configObj, state, playerNationId)) {
    emit('ui_error', { message: `No cumples los requisitos para: ${configObj.name}` });
    return;
  }

  const currentTick = state.meta?.tick ?? state.tick ?? 0;

  _state.playerObjectives.set(objectiveId, {
    active: true,
    progress: 0,
    milestonesCompleted: [],
    startTick: currentTick,
    configId: objectiveId
  });

  const objectivesList = Array.from(_state.playerObjectives.entries())
    .filter(([, data]) => data.active)
    .map(([id, data]) => ({
      id,
      configId: data.configId || id,
      progress: data.progress || 0,
      startTick: data.startTick || currentTick
    }));

  applyDelta({
    nations: {
      [playerNationId]: {
        objectives: objectivesList
      }
    }
  }, 'objective_set');

  emit('objective_accepted', { objectiveId, name: configObj.name });
}

function handlePlayerCancelObjective({ objectiveId }) {
  if (_state.playerObjectives.has(objectiveId)) {
    const obj = _state.playerObjectives.get(objectiveId);
    obj.active = false;
    // Penalty menor por abandonar
    applyDelta({
      source: 'objective_abandonment',
      nations: {
        [getState().playerNationId]: {
          prestige: -5,
          political_capital: -5
        }
      }
    });
    emit('objective_cancelled', { objectiveId });
  }
}

function handlePlayerActivateStrategy({ strategyId }) {
  const state = getState();
  const nationId = state.playerNationId;
  const configStrat = _state.config.strategies.find(s => s.id === strategyId);

  if (!configStrat) return;

  // Verificar límites
  const currentStrats = _state.activeStrategies.get(nationId) || [];
  const maxStrats = _state.config.global_settings.max_active_strategies_per_nation || 2;

  if (currentStrats.length >= maxStrats) {
    emit('ui_error', { message: `Límite de estrategias activas (${maxStrats}) alcanzado.` });
    return;
  }

  // Verificar conflictos
  for (const active of currentStrats) {
    const conflict = _state.config.global_settings.strategy_conflict_rules?.find(
      rule => rule.conflicting_strategies.includes(strategyId) && rule.conflicting_strategies.includes(active.id)
    );
    if (conflict) {
      emit('ui_error', { message: `Conflicto estratégico: ${configStrat.name} es incompatible con ${active.id}.` });
      return;
    }
  }

  // Prerrequisitos
  if (!checkPrerequisites(configStrat, state, nationId)) {
    emit('ui_error', { message: `Requisitos insuficientes para activar ${configStrat.name}` });
    return;
  }

  // Activar
  currentStrats.push({
    id: strategyId,
    startTick: state.tick,
    endTick: state.tick + configStrat.duration_ticks,
    cancelled: false
  });
  _state.activeStrategies.set(nationId, currentStrats);

  // Costo inicial de activación (si hubiera)
  if (configStrat.activation_cost) {
    applyDelta({
      source: `strategy_activation_${strategyId}`,
      nations: { [nationId]: configStrat.activation_cost } // Debe ser negativo en el JSON
    });
  }

  emit('strategy_activated', { strategyId, name: configStrat.name, duration: configStrat.duration_ticks });
}

// ============================================================================
// EVALUACIÓN Y PROGRESO
// ============================================================================

function evaluateObjectiveProgress(actorType, objId, objData, state, tick) {
  const configObj = findObjectiveConfig(objId);
  if (!configObj) return;

  const nationId = actorType === 'player' ? state.playerNationId : actorType; // En IA, actorType es el ID
  let newProgress = calculateProgressPercentage(configObj, state, nationId);

  if (newProgress !== objData.progress) {
    objData.progress = newProgress;
    emit('objective_progress_update', {
      objectiveId: objId,
      progress: newProgress,
      tick,
      actor: actorType
    });
  }
}

function checkMilestones(actorType, objId, objData, state, tick) {
  const configObj = findObjectiveConfig(objId);
  if (!configObj || !configObj.milestones) return;

  const nationId = actorType === 'player' ? state.playerNationId : actorType;

  for (const milestone of configObj.milestones) {
    if (objData.milestonesCompleted.includes(milestone.tick_range[0])) continue; // Ya procesado (usamos start como ID simple)

    if (tick >= milestone.tick_range[0] && tick <= milestone.tick_range[1]) {
      if (evaluateCondition(milestone.condition, state, nationId)) {
        // Hito logrado
        objData.milestonesCompleted.push(milestone.tick_range[0]);

        if (milestone.reward) {
          applyDelta({
            source: `objective_milestone_${objId}`,
            nations: { [nationId]: milestone.reward }
          });
        }

        emit('objective_milestone_reached', {
          objectiveId: objId,
          milestone: milestone,
          reward: milestone.reward,
          message: milestone.message,
          actor: actorType
        });
      }
    }
  }

  // Verificar condición de victoria final (último hito o condición especial)
  // Simplificación: si el progreso es 100% y pasó el tick máximo del último hito
  const lastMilestone = configObj.milestones[configObj.milestones.length - 1];
  if (objData.progress >= 100 && tick > lastMilestone.tick_range[1]) {
    completeObjective(actorType, objId, configObj);
  }
}

function completeObjective(actorType, objId, configObj) {
  const nationId = actorType === 'player' ? getState().playerNationId : actorType;

  // Recompensa base de legado
  applyDelta({
    source: `objective_complete_${objId}`,
    nations: { [nationId]: { legacy: configObj.base_legacy_reward || 10 } }
  });

  emit('objective_completed', {
    objectiveId: objId,
    name: configObj.name,
    legacyReward: configObj.base_legacy_reward,
    actor: actorType
  });

  if (actorType === 'player') {
    _state.playerObjectives.get(objId).active = false;
  } else {
    // Remover de objetivos de IA para que genere uno nuevo
    const nationObjs = _state.nationObjectives.get(nationId);
    if (nationObjs) {
      const idx = nationObjs.findIndex(o => o.id === objId);
      if (idx !== -1) nationObjs.splice(idx, 1);
    }
  }
}

function checkInternalRisks(actorType, objId, objData, state, tick) {
  if (actorType !== 'player') return; // La IA maneja sus riesgos internamente o no le afecta igual

  const configObj = findObjectiveConfig(objId);
  if (!configObj || !configObj.internal_risks) return;

  for (const risk of configObj.internal_risks) {
    if (evaluateCondition(risk.trigger, state, state.playerNationId)) {
      // Riesgo activado
      emit('internal_risk_warning', {
        objectiveId: objId,
        faction: risk.faction,
        severity: 'high',
        message: risk.message || `Tensión con ${risk.faction} aumentando`,
        tick
      });

      // Aplicar efecto negativo (delta)
      const effectKey = risk.effect.loyalty_delta ? `factions.${risk.faction}.loyalty` : null;
      // Nota: applyDelta espera estructura plana o anidada según implementación. 
      // Asumimos estructura anidada para facciones basada en docs previos.

      const deltaPayload = {};
      if (risk.effect.loyalty_delta) {
        if (!deltaPayload.factions) deltaPayload.factions = {};
        deltaPayload.factions[risk.faction] = { loyalty: risk.effect.loyalty_delta };
      }
      if (risk.effect.coup_risk_delta) {
        // Asumiendo campo global o de facción military_junta
        if (!deltaPayload.factions) deltaPayload.factions = {};
        // Mecánica específica de coup_risk dependerá de FactionRule, aquí aplicamos genérico
        deltaPayload.coup_risk_factor = (deltaPayload.coup_risk_factor || 0) + (risk.effect.coup_risk_delta / 100);
      }

      if (Object.keys(deltaPayload).length > 0) {
        applyDelta({
          source: `objective_risk_${objId}`,
          nations: { [state.playerNationId]: deltaPayload }
        });
      }
    }
  }
}

// ============================================================================
// INTELIGENCIA ARTIFICIAL (OBJETIVOS DINÁMICOS)
// ============================================================================

function generateInitialAIObjectives(nationId) {
  const state = getState();
  const nation = state.nations[nationId];
  if (!nation) return;

  // Personalidad básica aleatoria o definida
  const personalitySeed = rngInt(0, 2); // 0: Aggressive, 1: Defensive, 2: Economic
  const objectives = [];

  // Generar 1-2 objetivos iniciales
  const count = rngInt(1, 2);

  for (let i = 0; i < count; i++) {
    const category = pickAICategory(personalitySeed);
    const availableObjs = _state.config.categories[category]?.objectives || [];
    if (availableObjs.length > 0) {
      const chosen = availableObjs[rngInt(0, availableObjs.length - 1)];
      objectives.push({
        id: `${chosen.id}_${nationId}_${state.tick}`, // ID único
        configId: chosen.id,
        type: category,
        priority: rng(), // Prioridad aleatoria inicial
        progress: 0,
        createdTick: state.tick,
        lastEvaluatedTick: state.tick
      });
    }
  }

  _state.nationObjectives.set(nationId, objectives);
}

function processAINationsLogic(state, tick) {
  for (const [nationId, objectives] of _state.nationObjectives.entries()) {
    if (nationId === state.playerNationId) continue;

    // 1. Evaluar progreso de objetivos existentes
    objectives.forEach(obj => {
      evaluateObjectiveProgress(nationId, obj.configId, obj, state, tick);
      obj.lastEvaluatedTick = tick;

      // 2. Decisión de Estrategia basada en objetivo
      if (rng() < 0.3) { // 30% chance por tick de evaluar nueva estrategia
        attemptAIActivateStrategy(nationId, obj, state, tick);
      }
    });

    // 3. Reemplazar objetivos completados o fallidos
    if (objectives.length < 2 && rng() < 0.1) {
      generateInitialAIObjectives(nationId); // Añadir uno nuevo si tiene hueco
    }
  }
}

function attemptAIActivateStrategy(nationId, objective, state, tick) {
  // Lógica simplificada: Buscar estrategia compatible con la categoría del objetivo
  const category = objective.type;
  const compatibleStrategies = _state.config.strategies.filter(s => s.category === category);

  if (compatibleStrategies.length === 0) return;

  const currentStrats = _state.activeStrategies.get(nationId) || [];
  if (currentStrats.length >= 2) return; // Límite lleno

  // Elegir una al azar que cumga prerrequisitos
  const candidate = compatibleStrategies.find(s => checkPrerequisites(s, state, nationId));

  if (candidate) {
    // Activar directamente sin emitir evento UI, solo applyDelta y estado
    currentStrats.push({
      id: candidate.id,
      startTick: tick,
      endTick: tick + candidate.duration_ticks,
      cancelled: false
    });
    _state.activeStrategies.set(nationId, currentStrats);

    // Emitir evento de inteligencia para que el jugador pueda espiarlo
    emit('ai_strategy_detected', {
      nationId,
      strategyId: candidate.id,
      confidence: 0.8, // Alta confianza si lo acaba de activar
      tick
    });
  }
}

// ============================================================================
// UTILIDADES Y LEGACY INDEX
// ============================================================================

function updateLegacyIndex(tick) {
  for (const [nationId, data] of _state.legacyIndex.entries()) {
    // Decaimiento pequeño por inactividad o mantenimiento
    const decay = _state.config.global_settings.legacy_decay_per_tick || 0.01;
    data.score = Math.max(0, data.score - decay);

    // Guardar histórico cada 10 ticks
    if (tick % 10 === 0) {
      data.history.push({ tick, score: data.score });
      if (data.history.length > 50) data.history.shift(); // Mantener últimos 50 registros
    }
  }

  // Emitir actualización para UI (solo del jugador para no saturar red)
  const playerScore = _state.legacyIndex.get(getState().playerNationId)?.score || 0;
  emit('legacy_index_update', { score: playerScore, tick });
}

function getNationResource(state, nationId, resourcePath) {
  // Helper simple para navegar el estado: 'budget', 'stability', 'resources.energy'
  const nation = state.nations[nationId];
  if (!nation) return 0;

  if (resourcePath.includes('.')) {
    const parts = resourcePath.split('.');
    let current = nation;
    for (const part of parts) {
      if (current[part] === undefined) return 0;
      current = current[part];
    }
    return current;
  }
  return nation[resourcePath] || 0;
}

function findObjectiveConfig(id) {
  // Buscar en todas las categorías
  for (const cat of Object.values(_state.config.categories)) {
    const obj = cat.objectives.find(o => o.id === id);
    if (obj) return obj;
  }
  return null;
}

function checkPrerequisites(configItem, state, nationId) {
  if (!configItem.prerequisites) return true;

  const nation = state.nations[nationId];
  const prereq = configItem.prerequisites;

  // Checks simples
  if (prereq.min_stability && nation.stability < prereq.min_stability) return false;
  if (prereq.min_budget && nation.budget < prereq.min_budget) return false;
  if (prereq.min_influence && nation.influence < prereq.min_influence) return false;
  if (prereq.min_tech_level && nation.tech_level < prereq.min_tech_level) return false;

  // Check de tecnología específica (array)
  if (prereq.required_tech) {
    const hasAllTech = prereq.required_tech.every(t => nation.technologies?.includes(t));
    if (!hasAllTech) return false;
  }

  // Checks compuestos string (ej: "debt_to_gdp > 0.9") - Parser muy básico
  // En producción usaría un parser seguro, aquí hardcodeamos casos comunes si es necesario
  // o asumimos que la validación compleja se hace en evaluateCondition

  return true;
}

function calculateProgressPercentage(configObj, state, nationId) {
  // 1. Obtener la nación
  const nation = state.nations ? state.nations[nationId] : null;

  if (!nation) {
    console.warn(`[ObjectiveManager] Nación '${nationId}' no encontrada.`);
    return 0;
  }

  // 2. Construir un contexto PLANO para el eval()
  // Las condiciones esperan cosas como "resources.energy >= 150" o "stability > 50".
  // El eval() necesita que 'resources' sea un objeto accesible directamente en el scope.

  const evaluationContext = {
    // Propiedades directas de la nación
    stability: nation.stability || 0,
    economy: nation.economy || 0,
    influence: nation.influence || 0,
    budget: nation.budget || 0,

    // Objetos anidados (CRÍTICO: Deben existir como objetos en el contexto)
    resources: nation.resources || { gold: 0, food: 0, energy: 0 },
    diplomacy: nation.diplomacy || { trade_agreements: 0, trade_partners: 0 },
    stats: nation.stats || {},
    metrics: nation.metrics || {},
    state: nation.state || {}
  };

  // Opcional: Si tus condiciones usan variables sueltas como "gold" en vez de "resources.gold",
  // descomenta esto para exponerlas también:
  // if (evaluationContext.resources) {
  //   evaluationContext.gold = evaluationContext.resources.gold;
  //   evaluationContext.energy = evaluationContext.resources.energy;
  // }

  if (!configObj.milestones || configObj.milestones.length === 0) return 0;

  let totalConditions = 0;
  let metConditions = 0;

  configObj.milestones.forEach(ms => {
    totalConditions++;

    // Asegurar que tenemos la cadena de condición
    const conditionString = ms.condition || ms.targetCondition || "";

    if (!conditionString) {
      // Si no hay condición, asumimos que se cumple o se salta
      metConditions++;
      return;
    }

    try {
      // Pasar el contexto completo a evaluateCondition
      if (evaluateCondition(conditionString, evaluationContext)) {
        metConditions++;
      }
    } catch (err) {
      console.error(`Error evaluando condición "${conditionString}":`, err.message);
      // No sumar al contador si falla, o tratarlo como no cumplido
    }
  });

  return totalConditions === 0 ? 0 : Math.floor((metConditions / totalConditions) * 100);
}

/**
 * Evalúa una cadena de condición utilizando las métricas de la nación como variables.
 * @param {string} conditionStr - La cadena de condición (ej: "nuclear_program_progress >= 0.5")
 * @param {Object} nationState - El objeto de estado/métricas de la nación.
 */
function evaluateCondition(conditionStr, nationState) {
  if (!conditionStr || conditionStr.trim() === '') return true;

  try {
    // 1. Función auxiliar para aplanar objetos anidados
    // Convierte { stats: { tech: 5 } } en { tech: 5 } además de mantener { stats: { tech: 5 } }
    const flatten = (obj, prefix = '') => {
      let result = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;

          // Guardamos la referencia al objeto completo (ej: 'resources')
          result[key] = val;

          // Si es un objeto puro (no array, no null), lo aplanamos recursivamente
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            const flattenedNested = flatten(val, key);
            // Fusionamos las propiedades internas (ej: 'energy' de 'resources.energy')
            // Pero cuidado de no sobrescribir la clave padre si coincide. 
            // Aquí hacemos una fusión simple: las hojas suben.
            for (const nestedKey in flattenedNested) {
              if (!result.hasOwnProperty(nestedKey)) {
                result[nestedKey] = flattenedNested[nestedKey];
              }
            }
          }
        }
      }
      return result;
    };

    // 2. Construir el contexto completo
    const baseState = nationState.metrics || nationState.state || nationState;
    const flatContext = flatten(baseState);

    // Asegurar explícitamente objetos clave por si la condición usa "obj.prop"
    if (!flatContext.resources) flatContext.resources = baseState.resources || {};
    if (!flatContext.diplomacy) flatContext.diplomacy = baseState.diplomacy || {};
    if (!flatContext.stats) flatContext.stats = baseState.stats || {};
    if (!flatContext.military) flatContext.military = baseState.military || {};

    // 3. Extraer claves y valores
    const keys = Object.keys(flatContext);
    const values = Object.values(flatContext);

    // 4. Crear la función evaluadora
    // new Function('a', 'b', 'return a + b')
    const evaluator = new Function(...keys, `return ${conditionStr};`);

    return evaluator(...values);

  } catch (e) {
    // Si es ReferenceError, significa que la condición pide una variable que no existe en el estado.
    // En lógica de juegos, "variable no existente" suele equivaler a "condición no cumplida" (false).
    if (e instanceof ReferenceError) {
      // Opcional: loguear solo en modo debug para no spamear la consola
      // console.warn(`Condición no cumplida (variable faltante): ${conditionStr}`);
      return false;
    }

    console.error(`Error de sintaxis en condición "${conditionStr}":`, e);
    return false;
  }
}

function pickAICategory(personalitySeed) {
  const cats = ['economic', 'military', 'diplomatic', 'influence'];
  if (personalitySeed === 0) return 'military';
  if (personalitySeed === 1) return 'diplomatic';
  return 'economic';
}

/**
 * Devuelve el estado completo para el cliente (UI).
 * Incluye configuraciones estáticas para que el frontend pueda renderizar nombres/descripciones.
 */
let _staticConfigCache = null;

export function getClientState() {
  // 1. Cargar configuración estática solo una vez (Lazy Loading)
  if (!_staticConfigCache) {
    try {
      const objectivesPath = path.join(__dirname, '../config/objectives.json');
      const strategiesPath = path.join(__dirname, '../config/strategies.json');

      const objectivesData = JSON.parse(fs.readFileSync(objectivesPath, 'utf8'));
      const strategiesData = JSON.parse(fs.readFileSync(strategiesPath, 'utf8'));

      _staticConfigCache = {
        categories: objectivesData.categories || {},
        strategies: strategiesData.strategies || [],
        global_settings: {
          ...(objectivesData.global_settings || {}),
          ...(strategiesData.global_settings || {})
        }
      };
      console.log('[ObjectiveManager] Configuración estática cargada en caché.');
    } catch (e) {
      console.error('[ObjectiveManager] Error crítico cargando configs estáticas:', e.message);
      // Retornar estructura vacía segura si falla la lectura
      _staticConfigCache = { categories: {}, strategies: [], global_settings: {} };
    }
  }

  // 2. Construir el estado dinámico actual
  return {
    // Configuración Estática (Desde caché)
    categories: _staticConfigCache.categories,
    strategies: _staticConfigCache.strategies,
    global_settings: _staticConfigCache.global_settings,

    // Estado Dinámico (En tiempo real desde _state)
    playerObjectives: Array.from(_state.playerObjectives.entries()),
    nationObjectives: Array.from(_state.nationObjectives.entries()),
    activeStrategies: Array.from(_state.activeStrategies.entries()),
    legacyIndex: Array.from(_state.legacyIndex.entries())
  };
}

// Exportar estado para guardado (serialize)
export function getStateForSave() {
  return {
    playerObjectives: Array.from(_state.playerObjectives.entries()),
    nationObjectives: Array.from(_state.nationObjectives.entries()),
    activeStrategies: Array.from(_state.activeStrategies.entries()),
    legacyIndex: Array.from(_state.legacyIndex.entries())
  };
}