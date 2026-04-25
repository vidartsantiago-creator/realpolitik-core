/**
 * @file EconomyRule.js
 * @description Módulo de reglas económicas: flujos comerciales, impuestos, crecimiento PIB.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { applyDelta, getState } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';

/**
 * Inicializa el módulo de economía.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[EconomyRule] Inicializado.');

  // Suscribirse a tick_start para aplicar flujos económicos
  on('tick_start', (payload) => {
    processEconomicTick(payload.tick);
  });
}

/**
 * Procesa los flujos económicos por tick.
 * @param {number} tick - Número de tick actual
 */
function processEconomicTick(tick) {
  const state = getState();
  
  // Aplicar ingresos básicos por nación (stub MVP)
  for (const [nationId, nation] of Object.entries(state.nations || {})) {
    const income = Math.floor((nation.stats?.gdp || 100) * 0.01);
    
    applyDelta({
      nations: {
        [nationId]: {
          stats: { budget: income }
        }
      },
      tick
    }, 'system');
  }
}
