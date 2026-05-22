import { on, emit } from '../../../core/EventDispatcher.js';
import { getState } from '../../../core/StateManager.js';
import { getAllActions } from '../../../config/actions.registry.js';
import { rng } from '../../../core/Rng.js';

let aiInterval = null;
const DECISION_INTERVAL_MS = 10000; // Decidir cada 10 segundos

export function init() {
  console.log('[DiplomacyAI] 🧠 Inicializando IA Diplomática...');
  
  // Iniciar ciclo de decisión
  aiInterval = setInterval(makeDiplomaticDecisions, DECISION_INTERVAL_MS);
  
  console.log(`[DiplomacyAI] Ciclo iniciado (${DECISION_INTERVAL_MS/1000}s)`);
}

export function stop() {
  if (aiInterval) clearInterval(aiInterval);
}

function makeDiplomaticDecisions() {
  const state = getState();
  if (!state || !state.nations) return;

  const nations = Object.values(state.nations);
  const actions = getAllActions();

  // Iterar sobre cada nación controlada por la IA (todas excepto la del jugador, si se identifica)
  // Para MVP, asumimos que todas las naciones pueden actuar
  nations.forEach(actorNation => {
    
    // 1. Filtrar acciones posibles según requisitos actuales
    const viableActions = actions.filter(action => {
      return checkRequirements(action, actorNation, state);
    });

    if (viableActions.length === 0) return;

    // 2. Seleccionar objetivo aleatorio (que no sea uno mismo)
    const potentialTargets = nations.filter(n => n.id !== actorNation.id);
    if (potentialTargets.length === 0) return;

    const targetNation = potentialTargets[Math.floor(rng() * potentialTargets.length)];

    // 3. Evaluar puntuación de utilidad para cada acción posible contra ese objetivo
    let bestAction = null;
    let bestScore = -Infinity;

    viableActions.forEach(action => {
      const score = evaluateUtility(action, actorNation, targetNation, state);
      
      // Umbral de decisión (evitar acciones marginales)
      if (score > 0.5 && score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    });

    // 4. Ejecutar decisión si hay una acción válida
    if (bestAction) {
      console.log(`[DiplomacyAI] 🤖 ${actorNation.name} decide: ${bestAction.label} contra ${targetNation.name} (Score: ${bestScore.toFixed(2)})`);
      
      emit('ai_diplomacy_action', {
        actorNationId: actorNation.id,
        targetNationId: targetNation.id,
        actionId: bestAction.id,
        source: 'ai'
      });
    }
  });
}

function checkRequirements(action, actor, state) {
  // Verificación simplificada de requisitos para la IA
  const reqs = action.requirements;
  if (reqs.minBudget && (actor.stats?.budget || 0) < reqs.minBudget) return false;
  // La IA ignora algunas restricciones de relación para ser más impredecible, 
  // pero respeta el presupuesto.
  return true;
}

function evaluateUtility(action, actor, target, state) {
  let score = action.aiWeight || 0.5; // Peso base definido en el registry

  // Modificadores contextuales
  const relationKey = [actor.id, target.id].sort().join('_');
  const relation = state.diplomacy?.relations?.[relationKey]?.value || 0;

  // Si es acción hostil y ya son enemigos, aumenta probabilidad
  if (action.category === 'covert' || action.category === 'economic') {
    if (relation < -20) score += 0.3;
    if (relation < -50) score += 0.2; // Venganza
  }

  // Si es ayuda y el objetivo es inestable, aumenta probabilidad
  if (action.category === 'aid') {
    if ((target.stats?.stability || 100) < 40) score += 0.4;
    if (relation > 20) score += 0.2; // Ayudar amigos
  }

  // Si es inversión y el objetivo es estable y rico, aumenta probabilidad
  if (action.category === 'investment') {
    if ((target.stats?.stability || 0) > 60 && (target.stats?.economy || 0) > 50) score += 0.3;
  }

  // Factor aleatorio pequeño para variedad
  score += (rng() * 0.2) - 0.1;

  return score;
}