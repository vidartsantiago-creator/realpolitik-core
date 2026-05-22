import { getCurrentTick } from '../../../core/TimeEngine.js';

/**
 * Registra efectos económicos persistentes que se calculan en cada tick.
 */
export function registerEconomicEffect(effectData, actorId, targetId, duration) {
  const currentTick = getCurrentTick();
  
  // Estructura extendida para sanciones económicas
  return {
    id: `econ_${actorId}_${targetId}_${currentTick}`,
    type: 'economic_sanction',
    actorId,
    targetId,
    expiresAt: currentTick + duration,
    effects: effectData, // { tradeIncomeMultiplier, budgetDecayPerTick }
    
    // Función específica de cálculo por tick
    calculateTickImpact: (state) => {
      const deltas = [];
      const targetNation = state.nations[targetId];
      
      if (!targetNation) return deltas;

      // 1. Penalización de ingresos por comercio
      if (effectData.tradeIncomeMultiplier !== undefined) {
        // Asumiendo que hay una lógica de ingreso base, aquí la reducimos
        // En una implementación real, interceptaríamos el evento de ingreso
        const penalty = (targetNation.stats?.economy || 0) * 0.05 * (1 - effectData.tradeIncomeMultiplier);
        if (penalty > 0) {
          deltas.push({
            type: 'resource_update',
            nationId: targetId,
            changes: { budget: -Math.floor(penalty) },
            reason: 'Sanciones Económicas (Pérdida comercial)'
          });
        }
      }

      // 2. Drenaje directo de presupuesto
      if (effectData.budgetDecayPerTick) {
        deltas.push({
          type: 'resource_update',
          nationId: targetId,
          changes: { budget: -effectData.budgetDecayPerTick },
          reason: 'Sanciones Financieras (Congelamiento de activos)'
        });
      }

      return deltas;
    }
  };
}
/**
 * Módulo puente para acciones económicas.
 * La lógica principal reside en DiplomacyEngine.executeEconomicAction.
 */

// Exportamos una función dummy para satisfacer el import del Engine.
export function registerEconomicEffect() {
  console.warn('[EconomicActions] Esta función debería ser llamada desde DiplomacyEngine directamente.');
  return null;
}