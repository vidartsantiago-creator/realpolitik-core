import { rng } from '../../../core/Rng.js';
import { applyDelta } from '../../../core/StateManager.js';

/**
 * Ejecuta la lógica específica para un Golpe de Estado.
 * Reemplaza/aumenta la lógica estándar del DiplomacyEngine para esta acción.
 */
export function executeCoup(actionDef, actorNation, targetNation, state) {
  const deltas = [];
  
  // 1. Calcular Probabilidad Base
  // Factores: Estabilidad del objetivo (menor estabilidad = más fácil), Influencia del actor
  const stabilityFactor = (100 - (targetNation.stats?.stability || 50)) / 100;
  const influenceFactor = Math.min((actorNation.stats?.influence || 0) / 100, 1);
  
  // Fórmula: 30% base + 40% por inestabilidad + 30% por influencia
  let successChance = 0.3 + (stabilityFactor * 0.4) + (influenceFactor * 0.3);
  
  // Modificadores externos (ej. si hay sanciones activas, es más fácil)
  const hasSanctions = state.diplomacy?.active_sanctions?.some(s => s.target === targetNation.id);
  if (hasSanctions) successChance += 0.1;

  successChance = Math.max(0.05, Math.min(0.95, successChance));

  // 2. Resolver Intento
  const roll = rng();
  const isSuccess = roll < successChance;
  
  // 3. Generar Deltas y Consecuencias
  if (isSuccess) {
    // ÉXITO: Cambio de régimen, caos temporal, relación rota
    console.log(`[CovertOps] ✅ Golpe exitoso en ${targetNation.name}!`);
    
    deltas.push({
      type: 'stat_change',
      nationId: targetNation.id,
      changes: { stability: -40, economy: -10 }, // Caos post-golpe
      reason: 'Golpe de Estado Exitoso'
    });

    deltas.push({
      type: 'diplomacy_relation_change',
      key: [actorNation.id, targetNation.id].sort().join('_'),
      value: -50, // Odio inmediato del nuevo régimen o facciones leales
      reason: 'Golpe de Estado Orquestado'
    });

    // Evento especial: Cambio de gobierno (podría expandirse para cambiar nombre/facción)
    deltas.push({
      type: 'regime_change',
      nationId: targetNation.id,
      details: { previousStability: targetNation.stats.stability, coupLeader: actorNation.id }
    });

  } else {
    // FRACASO: Escándalo internacional, posible guerra
    console.log(`[CovertOps] ❌ Golpe fallido en ${targetNation.name}. Agentes expuestos.`);
    
    deltas.push({
      type: 'reputation_change',
      nationId: actorNation.id,
      value: -30,
      reason: 'Golpe de Estado Fallido (Expuesto)'
    });

    deltas.push({
      type: 'diplomacy_relation_change',
      key: [actorNation.id, targetNation.id].sort().join('_'),
      value: -80, // Casus Belli
      reason: 'Intento de Golpe Descubierto'
    });

    // Alta probabilidad de declaración de guerra automática
    if (rng() < 0.7) {
      deltas.push({
        type: 'war_declaration',
        aggressor: targetNation.id,
        defender: actorNation.id,
        reason: 'Represalia por intento de golpe'
      });
    }
  }

  return { 
    success: true, 
    deltas, 
    meta: { successChance, rolled: roll, result: isSuccess ? 'SUCCESS' : 'FAIL' } 
  };
}