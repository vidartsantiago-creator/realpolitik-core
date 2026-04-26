/**
 * StabilityRule.js
 * Módulo de Estabilidad Política
 *
 * Calcula la estabilidad interna de cada nación basada en:
 * - Desigualdad económica (Gini)
 * - Satisfacción de necesidades básicas
 * - Represión estatal vs Libertad civil
 * - Eventos de crisis externos
 *
 * Contrato de Datos:
 * - Input: State (nations, economy, social)
 * - Output: Delta { nationId, stabilityChange, reasons[] }
 */

import { PolicyRule } from '../core/PolicyRule.js';

export class StabilityRule extends PolicyRule {
  constructor() {
    super('stability');
  }

  /**
   * Ejecuta el cálculo de estabilidad para todas las naciones
   * @param {Object} state - Estado global del juego
   * @param {number} tick - Tick actual
   * @returns {Array} Lista de deltas de estabilidad
   */
  execute(state, tick) {
    const deltas = [];

    if (!state.nations) return deltas;

    for (const [nationId, nation] of Object.entries(state.nations)) {
      const stabilityDelta = this.calculateNationStability(nation, state);

      if (stabilityDelta !== 0) {
        deltas.push({
          type: 'stability_update',
          nationId,
          tick,
          payload: {
            change: stabilityDelta,
            current: Math.max(0, Math.min(100, (nation.stability || 50) + stabilityDelta)),
            reasons: this.getReasons(nation, stabilityDelta)
          }
        });
      }
    }

    return deltas;
  }

  /**
   * Calcula el delta de estabilidad para una nación específica
   * @param {Object} nation - Datos de la nación
   * @param {Object} state - Estado global
   * @returns {number} Delta de estabilidad (-5 a +5 típico)
   */
  calculateNationStability(nation, state) {
    let delta = 0;

    // 1. Factor Económico (Desigualdad)
    const gini = nation.economy?.gini || 0.4;
    if (gini > 0.5) delta -= 2; // Alta desigualdad reduce estabilidad
    else if (gini < 0.3) delta += 1; // Baja desigualdad aumenta estabilidad

    // 2. Factor Social (Necesidades Básicas)
    const basicNeeds = nation.social?.basicNeedsMet || 0.5;
    if (basicNeeds < 0.4) delta -= 3; // Hambre/pobreza extrema
    else if (basicNeeds > 0.8) delta += 2; // Bienestar alto

    // 3. Factor Político (Represión vs Libertad)
    const repression = nation.politics?.repressionLevel || 0.5;
    const freedom = nation.politics?.civilLiberties || 0.5;

    // Curva en U: mucha libertad o mucha represión pueden ser "estables" a corto plazo
    // pero el punto medio inestable es peligroso. Simplificación para MVP:
    if (repression > 0.8 && freedom < 0.2) {
      delta -= 1; // Represión excesiva genera resentimiento oculto
    } else if (freedom > 0.7 && repression < 0.3) {
      delta += 1; // Sociedad libre y contenta
    }

    // 4. Factor Externo (Crisis Globales)
    if (state.global?.crisisPhase > 0) {
      delta -= 1; // Las crisis globales desestabilizan
    }

    // Ruido aleatorio controlado (simulación de eventos menores)
    // Usamos el tick para determinismo si fuera necesario, aquí simplificado
    const noise = (Math.sin(nation.id.length + state.tick) * 0.5);
    delta += noise;

    // Limitar delta máximo por tick
    return Math.max(-5, Math.min(5, delta));
  }

  /**
   * Genera razones legibles para el cambio de estabilidad (para UI/Logs)
   * @param {Object} nation
   * @param {number} delta
   * @returns {string[]}
   */
  getReasons(nation, delta) {
    const reasons = [];
    if (delta < 0) {
      if ((nation.economy?.gini || 0) > 0.5) reasons.push('Alta desigualdad económica');
      if ((nation.social?.basicNeedsMet || 0) < 0.4) reasons.push('Insatisfacción de necesidades básicas');
      if ((nation.politics?.repressionLevel || 0) > 0.8) reasons.push('Tensión por represión estatal');
      reasons.push('Inestabilidad general');
    } else if (delta > 0) {
      if ((nation.economy?.gini || 0) < 0.3) reasons.push('Baja desigualdad económica');
      if ((nation.social?.basicNeedsMet || 0) > 0.8) reasons.push('Altos niveles de bienestar');
      if ((nation.politics?.civilLiberties || 0) > 0.7) reasons.push('Fortaleza democrática');
      reasons.push('Estabilidad consolidada');
    }
    return reasons;
  }
}