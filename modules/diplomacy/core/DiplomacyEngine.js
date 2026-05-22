/**
 * DiplomacyEngine
 * @description Motor central de lógica diplomática.
 *              Despacha acciones basadas en el registro y emite eventos de resultado.
 */


import { on, emit } from '../../../core/EventDispatcher.js';
import { getState, applyDelta } from '../../../core/StateManager.js';
import { getCurrentTick } from '../../../core/TimeEngine.js';
import { rng } from '../../../core/Rng.js';

// Config (también 3 niveles)
import { ACTION_REGISTRY, getAction } from '../../../config/actions.registry.js';

// Acciones (hermanas, solo 1 nivel arriba)
import { executeCoup } from '../actions/CovertActions.js';

// Estado interno del motor (activos temporales)
let activeEffects = new Map(); // Trackea efectos con duración

/**
 * Inicializa el motor de diplomacia
 */
export function init() {
  console.log('[DiplomacyEngine] Inicializando motor diplomático...');
  
  // CAMBIO AQUÍ: Escuchar el evento genérico 'player_intent' 
  // en lugar de 'ws.message.player_intent' si UIMessageHandler lo transforma.
  // O mejor, asegurarnos de capturar TODO tipo de intención.
  
  on('player_intent', handleDirectIntent);

  // Escuchar intenciones del jugador (vía IntentProcessor o directo)
  on('player_intent', handlePlayerIntent);
  
  // Escuchar decisiones de la IA
  on('ai_diplomacy_action', handleAIDecision);
  
  // Escuchar ticks para procesar efectos duraderos (sanciones, inversiones)
  on('tick_completed', handleTick);

  console.log('[DiplomacyEngine] ✅ Listo. Registradas', Object.keys(ACTION_REGISTRY).length, 'acciones.');
}

function handleDirectIntent(payload) {
  // Verificar si es una acción diplomática registrada
  if (payload.type && ACTION_REGISTRY[payload.type]) {
    // Estructura esperada: { type: 'covert_coup', playerId, nationId, payload: { targetNation } }
    const actorId = payload.nationId || payload.actorNationId;
    const target = payload.payload?.targetNation;
    
    if (!actorId || !target) {
      console.warn('[DiplomacyEngine] Acción incompleta:', payload);
      return;
    }

    console.log(`[DiplomacyEngine] 🎯 Acción diplomática detectada: ${payload.type} de ${actorId} contra ${target}`);
    
    dispatchAction(payload.type, { targetNation: target, source: 'player' }, actorId);
  }
}


/**
 * Maneja intenciones del jugador
 */
function handlePlayerIntent(message) {
  // Filtrar solo mensajes de tipo diplomático registrado
  if (!message.type || !ACTION_REGISTRY[message.type]) return;
  
  // Validar que tenga payload con target
  const payload = message.payload || message;
  if (!payload.targetNation) {
    emit('command_response', {
      command: 'diplomacy_action',
      success: false,
      error: 'Nación objetivo no especificada'
    });
    return;
  }

  dispatchAction(message.type, payload, message.playerId || 'unknown');
}

/**
 * Maneja decisiones autónomas de la IA
 */
function handleAIDecision(payload) {
  // payload: { actionId, actorNationId, targetNationId }
  dispatchAction(payload.actionId, {
    targetNation: payload.targetNationId,
    source: 'ai'
  }, payload.actorNationId);
}

/**
 * Función central de despacho y validación
 */
function dispatchAction(actionId, payload, actorId) {
  const actionDef = getAction(actionId);
  if (!actionDef) {
    console.warn(`[DiplomacyEngine] Acción desconocida: ${actionId}`);
    emitResult(actionId, false, 'Definición no encontrada', payload);
    return;
  }

  const state = getState();
  const actorNation = state.nations[actorId];
  const targetNation = state.nations[payload.targetNation];

  if (!actorNation || !targetNation) {
    emitResult(actionId, false, 'Nación no encontrada', payload);
    return;
  }

  // 1. Validar Requisitos (Antes de gastar recursos)
  const validation = validateRequirements(actionDef, actorNation, targetNation, state);
  if (!validation.valid) {
    emitResult(actionId, false, validation.error, payload);
    return;
  }

  let result;

  // 2. DESPACHO A LÓGICA ESPECÍFICA O ESTÁNDAR
  // Se evita la doble ejecución eligiendo UN solo camino
  if (actionId === 'covert_coup') {
    // Lógica compleja: Probabilística, sin efectos duraderos estándar
    result = executeCoupLogic(actionDef, actorNation, targetNation, state);
  } 
  else if (actionDef.category === 'economic' && actionDef.effects.duration > 1) {
    // Lógica económica: Registra efecto por tick + efectos inmediatos
    result = executeEconomicAction(actionDef, actorNation, targetNation, state);
  }
  else {
    // Lógica estándar: Aid, Investment simple, acciones instantáneas
    result = executeStandardLogic(actionDef, actorNation, targetNation, state);
  }

  // 3. Aplicar Costos Inmediatos (Solo si la acción fue exitosa hasta aquí)
  // Nota: Las funciones específicas ya deberían haber manejado sus propios costos si son especiales,
  // pero para consistencia, aplicamos costos base del registry aquí si result.success es true.
  if (result.success) {
    applyCosts(actionDef, actorNation);
    
    // 4. Registrar Efectos Duraderos (Si la lógica específica no lo hizo ya)
    // executeEconomicAction ya registra, así que esto es solo fallback o para otras categorías
    if (actionId !== 'covert_coup' && actionDef.effects.duration && actionDef.effects.duration > 1) {
       // Solo registrar si no es económico (que ya lo hizo su handler) o si es otro tipo duradero
       if (actionDef.category !== 'economic') {
         registerActiveEffect(actionId, actorId, payload.targetNation, actionDef.effects);
       }
    }

    // 5. Emitir Resultado Exitoso
    emitResult(actionId, true, null, payload, result);
    
    // 6. Aplicar Deltas al Estado Global
    if (result.deltas && result.deltas.length > 0) {
      result.deltas.forEach(delta => applyDelta(delta, 'diplomacy'));
    }
  } else {
    // Si falló la lógica específica (ej. golpe fallido)
    emitResult(actionId, false, result.error, payload, result);
  }
}

/**
 * Valida requisitos de la acción
 */
function validateRequirements(actionDef, actor, target, state) {
  const reqs = actionDef.requirements;
  
  // Verificar Presupuesto (Gold)
  if (reqs.minBudget && (actor.stats?.budget || 0) < reqs.minBudget) {
    return { valid: false, error: 'Presupuesto insuficiente' };
  }

  // Verificar Relación (si aplica)
  if (reqs.minRelation !== undefined) {
    const relationKey = [actor.id, target.id].sort().join('_');
    const currentRel = state.diplomacy?.relations?.[relationKey]?.value || 0;
    if (currentRel < reqs.minRelation) {
      return { valid: false, error: 'Relación diplomática insuficiente' };
    }
  }

  // Verificar Estabilidad del objetivo (para golpes o ayuda)
  if (reqs.targetStabilityMax !== undefined) {
    if ((target.stats?.stability || 100) > reqs.targetStabilityMax) {
      return { valid: false, error: 'El objetivo es demasiado estable para esta acción' };
    }
  }

  return { valid: true };
}

/**
 * Aplica costos inmediatos al actor
 */
function applyCosts(actionDef, actor) {
  const deltas = [];
  const costs = actionDef.cost;

  if (costs.gold) {
    deltas.push({
      type: 'resource_update',
      nationId: actor.id,
      changes: { budget: -costs.gold }, // Asumiendo budget como gold fluido
      reason: `Costo ${actionDef.label}`
    });
  }
  
  if (costs.influence) {
     deltas.push({
      type: 'stat_change',
      nationId: actor.id,
      changes: { influence: -costs.influence },
      reason: `Costo influencia ${actionDef.label}`
    });
  }

  // Aplicar inmediatamente si hay deltas
  if (deltas.length > 0) {
    deltas.forEach(d => applyDelta(d, 'diplomacy_cost'));
  }
}

/**
 * Ejecuta lógica estándar de efectos
 */
function executeStandardLogic(actionDef, actor, target, state) {
  const deltas = [];
  const effects = actionDef.effects;

  // 1. Cambios de Relación Bilateral
  if (effects.relationDelta) {
    const relationKey = [actor.id, target.id].sort().join('_');
    deltas.push({
      type: 'diplomacy_relation_change',
      key: relationKey,
      value: effects.relationDelta,
      reason: actionDef.label
    });
  }

  // 2. Cambios de Reputación Global
  if (effects.reputationDelta) {
    deltas.push({
      type: 'reputation_change',
      nationId: actor.id,
      value: effects.reputationDelta,
      reason: actionDef.label
    });
  }

  // 3. Efectos Inmediatos en Stats del Objetivo
  if (effects.targetEffect) {
    if (effects.targetEffect.stabilityBoost) {
      deltas.push({
        type: 'stat_change',
        nationId: target.id,
        changes: { stability: effects.targetEffect.stabilityBoost },
        reason: `Efecto ${actionDef.label}`
      });
    }
    // Se pueden agregar más efectos directos aquí
  }

  return { success: true, deltas };
}

/**
 * Registra un efecto duradero para procesar en ticks futuros
 */
function registerActiveEffect(actionId, actorId, targetId, effects) {
  const tick = getCurrentTick();
  activeEffects.set(`${actionId}_${actorId}_${targetId}_${tick}`, {
    actionId,
    actorId,
    targetId,
    expiresAt: tick + effects.duration,
    effects
  });
}

/**
 * Procesa efectos duraderos cada tick
 */
function handleTick(payload) {
  const currentTick = payload.tick;
  const state = getState();
  const deltas = [];

  for (const [key, effectData] of activeEffects.entries()) {
    if (currentTick >= effectData.expiresAt) {
      // Expiró: remover y aplicar efectos finales si los hubiera
      activeEffects.delete(key);
      continue;
    }

    // Aplicar efectos por tick (ej: drenaje de presupuesto por sanciones)
    if (effectData.effects.targetEffect?.budgetDecayPerTick) {
      const decay = effectData.effects.targetEffect.budgetDecayPerTick;
      deltas.push({
        type: 'resource_update',
        nationId: effectData.targetId,
        changes: { budget: -decay },
        reason: `Sanción activa (${effectData.actionId})`
      });
    }
    
    if (effectData.effects.actorEffect?.passiveGoldIncome) {
      const income = effectData.effects.actorEffect.passiveGoldIncome;
      deltas.push({
        type: 'resource_update',
        nationId: effectData.actorId,
        changes: { budget: income },
        reason: `Retorno inversión (${effectData.actionId})`
      });
    }
  }

  if (deltas.length > 0) {
    deltas.forEach(d => applyDelta(d, 'diplomacy_tick'));
  }
}

/**
 * Emite evento de resultado para notificar a UI u otros sistemas
 */
function emitResult(actionId, success, error, payload, logicResult = null) {
  emit('diplomacy_action_result', {
    actionId,
    success,
    error,
    actor: payload.source === 'ai' ? 'IA' : 'Jugador',
    target: payload.targetNation,
    timestamp: Date.now(),
    details: logicResult
  });
}
// ==========================================
// LÓGICA ESPECÍFICA: GOLPE DE ESTADO (COVERT)
// ==========================================

/**
 * Ejecuta la lógica probabilística de un golpe de estado
 * @param {Object} actionDef - Definición de la acción desde el registry
 * @param {Object} actor - Nación que ejecuta el golpe
 * @param {Object} target - Nación objetivo del golpe
 * @param {Object} state - Estado global actual
 * @returns {Object} Resultado con deltas y éxito/fracaso
 */
function executeCoupLogic(actionDef, actor, target, state) {
  const effects = actionDef.effects;
  
  // 1. Calcular probabilidad de éxito
  // Fórmula: ChanceBase + (InfluenciaActor - EstabilidadObjetivo) * Factor
  // El factor escala la diferencia para que sea relevante (ej. 0.5% por punto de diferencia)
  const influenceDiff = (actor.stats?.influence || 0) - (target.stats?.stability || 0);
  const successChance = Math.max(0.05, Math.min(0.95, 
    (effects.successChanceBase || 0.3) + (influenceDiff * 0.005)
  ));

  // 2. Determinar resultado con RNG
  const roll = rng(); // Valor entre 0 y 1
  const isSuccess = roll < successChance;

  const deltas = [];
  let message = "";

  if (isSuccess) {
    // --- ESCENARIO: ÉXITO ---
    message = "Golpe de estado EXITOSO. Gobierno derrocado.";
    
    // Efectos: Inestabilidad masiva, cambio de régimen, relación rota
    deltas.push({
      type: 'stat_change',
      nationId: target.id,
      changes: { stability: -effects.onSuccess.stabilityDamage }, // ej: -50
      reason: 'Golpe de estado exitoso'
    });

    // Opcional: Marcar nación como "en transición" o cambiar ID de facción gobernante
    deltas.push({
      type: 'regime_change',
      nationId: target.id,
      details: { previousAlly: false, chaosLevel: 'high' },
      reason: 'Nuevo gobierno instalado'
    });

    // Penalización de reputación al actor por intervención encubierta revelada
    deltas.push({
      type: 'reputation_change',
      nationId: actor.id,
      value: -20, // Penalización fija por éxito (escándalo internacional)
      reason: 'Intervención encubierta exitosa'
    });

  } else {
    // --- ESCENARIO: FRACASO ---
    message = "Golpe de estado FALLIDO. Agentes capturados.";
    
    // Efectos: Escándalo diplomático, relación destruida, riesgo de guerra
    deltas.push({
      type: 'diplomacy_relation_change',
      key: [actor.id, target.id].sort().join('_'),
      value: -40, // Caída brutal de relación
      reason: 'Golpe de estado fallido descubierto'
    });

    deltas.push({
      type: 'reputation_change',
      nationId: actor.id,
      value: -15,
      reason: 'Intento de golpe fallido'
    });

    // Posible casus belli (guerra)
    if (rng() < (effects.onFail?.warRisk || 0.5)) {
      deltas.push({
        type: 'war_declaration',
        aggressor: target.id, // El objetivo declara la guerra al atacante
        target: actor.id,
        reason: 'Respuesta a intento de golpe de estado'
      });
      message += " ¡El objetivo ha declarado la guerra!";
    }
  }

  return {
    success: true, // La acción se procesó, el resultado está en los deltas
    deltas,
    metadata: {
      coupSuccessful: isSuccess,
      chance: successChance,
      roll: roll,
      message
    }
  };
}

// ==========================================
// LÓGICA ESPECÍFICA: ACCIONES ECONÓMICAS DURADERAS
// ==========================================

/**
 * Ejecuta acciones económicas que tienen efectos por tick (sanciones, inversiones)
 * @param {Object} actionDef - Definición de la acción
 * @param {Object} actor - Nación actor
 * @param {Object} target - Nación objetivo
 * @param {Object} state - Estado global
 * @returns {Object} Resultado con deltas iniciales
 */
function executeEconomicAction(actionDef, actor, target, state) {
  const effects = actionDef.effects;
  const deltas = [];

  // 1. Generar deltas inmediatos de relación y reputación
  if (effects.relationDelta) {
    const relationKey = [actor.id, target.id].sort().join('_');
    deltas.push({
      type: 'diplomacy_relation_change',
      key: relationKey,
      value: effects.relationDelta,
      reason: actionDef.label
    });
  }

  if (effects.reputationDelta) {
    deltas.push({
      type: 'reputation_change',
      nationId: actor.id,
      value: effects.reputationDelta,
      reason: actionDef.label
    });
  }

  // 2. Registrar efecto duradero para el game loop
  // Esto permite que handleTick aplique daños/beneficios cada turno
  const effectData = registerEconomicEffect(
    effects.targetEffect,
    effects.actorEffect,
    actor.id,
    target.id,
    effects.duration,
    actionDef.label
  );

  // Nota: activeEffects es una variable global en este módulo (asegúrate de que esté declarada arriba: let activeEffects = new Map();)
  if (typeof activeEffects !== 'undefined') {
    activeEffects.set(effectData.id, effectData);
    console.log(`[DiplomacyEngine] 🕒 Efecto económico registrado: ${effectData.id} por ${effects.duration} ticks.`);
  } else {
    console.error('[DiplomacyEngine] ERROR: activeEffects no está inicializado.');
  }

  return {
    success: true,
    deltas,
    metadata: {
      effectId: effectData.id,
      duration: effects.duration
    }
  };
}

// ==========================================
// UTILS: REGISTRO DE EFECTOS
// ==========================================

/**
 * Crea un objeto de efecto duradero para ser procesado en el game loop
 * @param {Object} targetEffects - Efectos sobre el objetivo
 * @param {Object} actorEffects - Efectos sobre el actor (retornos)
 * @param {string} actorId 
 * @param {string} targetId 
 * @param {number} duration - Duración en ticks
 * @param {string} sourceName - Nombre de la acción origen
 * @returns {Object} Objeto de efecto estructurado
 */
function registerEconomicEffect(targetEffects, actorEffects, actorId, targetId, duration, sourceName) {
  const id = `eff_${Date.now()}_${Math.floor(rng() * 1000)}`;
  const currentTick = getCurrentTick();

  return {
    id,
    type: 'economic_pressure',
    source: sourceName,
    actorId,
    targetId,
    createdAt: currentTick,
    expiresAt: currentTick + duration,
    effects: {
      target: targetEffects || {},
      actor: actorEffects || {}
    }
  };
}